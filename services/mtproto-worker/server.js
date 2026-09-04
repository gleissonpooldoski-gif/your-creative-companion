// Reelyx MTProto worker — self-hosted companion service.
//
// Why it exists: real Telegram MTProto requires a persistent socket connection to
// Telegram's data centers, which the app's serverless runtime cannot open. This
// small service holds the authorized sessions and performs the real searches; the
// app talks to it over HTTPS with a bearer token.
//
// It never returns or logs session strings, auth keys, codes, passwords or api_hash.

import express from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

import {
  ERROR_CODES,
  dedupeResults,
  errorBody,
  floodSeconds,
  isEligibleGroup,
  maskPhone,
  toResult,
} from "./lib.js";

const PORT = Number(process.env.PORT || 8081);
const API_ID = Number(process.env.TELEGRAM_API_ID || 0);
const API_HASH = process.env.TELEGRAM_API_HASH || "";
// MT_PROTO_WORKER_TOKEN is the documented name; MTPROTO_SERVICE_TOKEN kept for compatibility.
const SERVICE_TOKEN = process.env.MT_PROTO_WORKER_TOKEN || process.env.MTPROTO_SERVICE_TOKEN || "";
const SESSION_DIR = process.env.SESSION_DIR || "./sessions";

if (!SERVICE_TOKEN) {
  console.error("MT_PROTO_WORKER_TOKEN is required");
  process.exit(1);
}
fs.mkdirSync(SESSION_DIR, { recursive: true });

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));

// Request log without credentials or personal data.
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

app.use((req, res, next) => {
  const isHealth = req.method === "GET" && (req.path === "/v1/health" || req.path === "/health");
  if (isHealth) return next();
  const header = req.headers.authorization || "";
  const expected = `Bearer ${SERVICE_TOKEN}`;
  const ok =
    header.length === expected.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  if (!ok) return res.status(ERROR_CODES.UNAUTHORIZED).json(errorBody("UNAUTHORIZED", "Token do serviço inválido."));
  next();
});

/** In-memory login state (phone_code_hash, client) keyed by session id. */
const pending = new Map();
/** Connected clients keyed by session id. */
const clients = new Map();

const sessionFile = (id) => path.join(SESSION_DIR, `${id}.session`);
const metaFile = (id) => path.join(SESSION_DIR, `${id}.json`);
const readSession = (id) => (fs.existsSync(sessionFile(id)) ? fs.readFileSync(sessionFile(id), "utf8") : "");
const writeSession = (id, value) => fs.writeFileSync(sessionFile(id), value, { mode: 0o600 });

function readMeta(id) {
  try {
    return JSON.parse(fs.readFileSync(metaFile(id), "utf8"));
  } catch {
    return {};
  }
}
function writeMeta(id, patch) {
  const meta = { ...readMeta(id), ...patch };
  fs.writeFileSync(metaFile(id), JSON.stringify(meta), { mode: 0o600 });
  return meta;
}

function fail(res, code, message, retryAfterSeconds) {
  const status = ERROR_CODES[code] ?? 500;
  return res.status(status).json(errorBody(code, message, retryAfterSeconds));
}

async function newClient(id) {
  const client = new TelegramClient(new StringSession(readSession(id)), API_ID, API_HASH, { connectionRetries: 3 });
  await client.connect();
  return client;
}

async function getConnected(id) {
  if (clients.has(id)) return clients.get(id);
  if (!readSession(id)) return null;
  const client = await newClient(id);
  if (!(await client.isUserAuthorized())) return null;
  clients.set(id, client);
  return client;
}

function publicState(id) {
  const meta = readMeta(id);
  const connected = clients.has(id) || Boolean(readSession(id));
  return {
    connection_id: id,
    status: connected ? "connected" : pending.has(id) ? "awaiting_code" : "not_connected",
    phone_masked: meta.phone_masked ?? null,
    last_connected_at: meta.last_connected_at ?? null,
    flood_wait_until: meta.flood_wait_until ?? null,
  };
}

const health = (_req, res) =>
  res.json({ ok: true, api_configured: Boolean(API_ID && API_HASH), sessions: fs.readdirSync(SESSION_DIR).filter((f) => f.endsWith(".session")).length, version: "1.1.0" });

app.get("/v1/health", health);
app.get("/health", health);

// Registers (or reuses) a session slot. external_id keeps app and service aligned.
function createSession(req, res) {
  const id = String(req.body?.external_id || req.body?.connection_id || "").trim() || crypto.randomUUID();
  if (!/^[\w-]{6,64}$/.test(id)) return fail(res, "SERVICE_ERROR", "Identificador de sessão inválido.");
  if (!fs.existsSync(sessionFile(id))) writeSession(id, "");
  res.json({ session_id: id, connection_id: id, ...publicState(id) });
}

async function sendCode(req, res, id) {
  const phone = String(req.body?.phone || req.body?.phone_number || "").trim();
  if (!API_ID || !API_HASH) return fail(res, "SERVICE_ERROR", "TELEGRAM_API_ID/HASH não configurados no serviço.");
  if (!phone) return fail(res, "SERVICE_ERROR", "Telefone obrigatório.");
  try {
    const existing = await getConnected(id);
    if (existing) return res.json({ status: "connected", ...publicState(id) });

    const client = await newClient(id);
    const sent = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber: phone,
        apiId: API_ID,
        apiHash: API_HASH,
        settings: new Api.CodeSettings({}),
      }),
    );
    pending.set(id, { client, phone, phoneCodeHash: sent.phoneCodeHash });
    writeMeta(id, { phone_masked: maskPhone(phone) });
    res.json({ status: "awaiting_code", ...publicState(id) });
  } catch (error) {
    const wait = floodSeconds(error);
    if (wait) {
      writeMeta(id, { flood_wait_until: new Date(Date.now() + wait * 1000).toISOString() });
      return fail(res, "FLOOD_WAIT", `Telegram pediu espera de ${wait}s.`, wait);
    }
    fail(res, "TELEGRAM_ERROR", "Telegram recusou o envio do código.");
  }
}

async function signIn(req, res, id) {
  const code = String(req.body?.code || "").trim();
  const state = pending.get(id);
  if (!state) return fail(res, "AUTH_REQUIRED", "Login não iniciado. Solicite o código novamente.");
  try {
    await state.client.invoke(
      new Api.auth.SignIn({ phoneNumber: state.phone, phoneCodeHash: state.phoneCodeHash, phoneCode: code }),
    );
    writeSession(id, state.client.session.save());
    writeMeta(id, { last_connected_at: new Date().toISOString(), flood_wait_until: null });
    clients.set(id, state.client);
    pending.delete(id);
    res.json({ status: "connected", ...publicState(id) });
  } catch (error) {
    const message = String(error?.errorMessage || error?.message || "");
    if (message.includes("SESSION_PASSWORD_NEEDED")) {
      return fail(res, "PASSWORD_REQUIRED", "Conta protegida por senha de duas etapas.");
    }
    if (message.includes("PHONE_CODE_INVALID") || message.includes("PHONE_CODE_EXPIRED")) {
      return fail(res, "INVALID_CODE", "Código inválido ou expirado.");
    }
    const wait = floodSeconds(error);
    if (wait) return fail(res, "FLOOD_WAIT", `Telegram pediu espera de ${wait}s.`, wait);
    fail(res, "TELEGRAM_ERROR", "Telegram recusou o login.");
  }
}

async function submitPassword(req, res, id) {
  const password = String(req.body?.password || "");
  const state = pending.get(id);
  if (!state) return fail(res, "AUTH_REQUIRED", "Login não iniciado. Solicite o código novamente.");
  try {
    await state.client.signInWithPassword(
      { apiId: API_ID, apiHash: API_HASH },
      { password: async () => password, onError: (error) => { throw error; } },
    );
    writeSession(id, state.client.session.save());
    writeMeta(id, { last_connected_at: new Date().toISOString(), flood_wait_until: null });
    clients.set(id, state.client);
    pending.delete(id);
    res.json({ status: "connected", ...publicState(id) });
  } catch (error) {
    const message = String(error?.errorMessage || error?.message || "");
    if (message.includes("PASSWORD_HASH_INVALID")) return fail(res, "INVALID_PASSWORD", "Senha de duas etapas incorreta.");
    fail(res, "TELEGRAM_ERROR", "Telegram recusou a senha.");
  }
}

// Canonical /v1 contract used by the app.
app.post("/v1/sessions", createSession);
app.post("/v1/sessions/:id/send-code", (req, res) => sendCode(req, res, req.params.id));
app.post("/v1/sessions/:id/sign-in", (req, res) => signIn(req, res, req.params.id));
app.post("/v1/sessions/:id/password", (req, res) => submitPassword(req, res, req.params.id));

// Friendly aliases (same behaviour, connection_id in the body).
app.post("/telegram/connect/start", async (req, res) => {
  const id = String(req.body?.connection_id || "").trim();
  if (!/^[\w-]{6,64}$/.test(id)) return fail(res, "SERVICE_ERROR", "connection_id inválido.");
  if (!fs.existsSync(sessionFile(id))) writeSession(id, "");
  await sendCode(req, res, id);
});
app.post("/telegram/connect/verify", (req, res) => signIn(req, res, String(req.body?.connection_id || "")));
app.post("/telegram/connect/2fa", (req, res) => submitPassword(req, res, String(req.body?.connection_id || "")));

app.get("/v1/sessions/:id", async (req, res) => {
  const client = await getConnected(req.params.id).catch(() => null);
  const state = publicState(req.params.id);
  if (!client && state.status === "connected") {
    return res.status(ERROR_CODES.INVALID_SESSION).json(errorBody("INVALID_SESSION", "Sessão do Telegram inválida. Reconecte a conta."));
  }
  res.json(state);
});

app.get("/telegram/connections/:id", (req, res) => res.json(publicState(req.params.id)));

async function removeSession(id, res) {
  const client = clients.get(id);
  if (client) await client.disconnect().catch(() => {});
  clients.delete(id);
  pending.delete(id);
  for (const file of [sessionFile(id), metaFile(id)]) if (fs.existsSync(file)) fs.rmSync(file);
  res.json({ ok: true });
}
app.delete("/v1/sessions/:id", (req, res) => removeSession(req.params.id, res));
app.delete("/telegram/connections/:id", (req, res) => removeSession(req.params.id, res));

/**
 * Real Telegram search. Only public supergroups are returned; users, bots and
 * broadcast channels are filtered out here and again in the app.
 */
async function search(req, res) {
  const sessionId = String(req.body?.session_id || req.body?.connection_id || "");
  const keywords = Array.isArray(req.body?.keywords) ? req.body.keywords.map(String).slice(0, 20) : [];
  const limit = Math.min(Math.max(Number(req.body?.limit || 40), 1), 100);
  const jobId = req.body?.job_id ? String(req.body.job_id) : null;
  if (keywords.length === 0) return fail(res, "DISCOVERY_ERROR", "Informe ao menos uma palavra-chave.");

  let client;
  try {
    client = await getConnected(sessionId);
  } catch {
    client = null;
  }
  if (!client) return fail(res, "AUTH_REQUIRED", "Sessão do Telegram não autorizada.");

  const results = [];
  try {
    for (const keyword of keywords) {
      if (results.length >= limit) break;
      const found = await client.invoke(new Api.contacts.Search({ q: keyword, limit: 50 }));
      for (const chat of found.chats ?? []) {
        if (!isEligibleGroup(chat)) continue;

        let about = null;
        let participants = chat.participantsCount ?? null;
        try {
          const full = await client.invoke(new Api.channels.GetFullChannel({ channel: chat }));
          about = full.fullChat?.about ?? null;
          participants = full.fullChat?.participantsCount ?? participants;
        } catch {
          // metadata is optional; never invent it
        }

        results.push(toResult(chat, { about, participants_count: participants, keyword }));
        if (results.length >= limit) break;
      }
    }
    const unique = dedupeResults(results).slice(0, limit);
    console.log(`search done job=${jobId ?? "-"} keywords=${keywords.length} results=${unique.length}`);
    res.json({ job_id: jobId, results: unique });
  } catch (error) {
    const wait = floodSeconds(error);
    if (wait) {
      writeMeta(sessionId, { flood_wait_until: new Date(Date.now() + wait * 1000).toISOString() });
      return fail(res, "FLOOD_WAIT", `Telegram pediu espera de ${wait}s.`, wait);
    }
    fail(res, "DISCOVERY_ERROR", "Busca no Telegram falhou.");
  }
}

app.post("/v1/search", search);
app.post("/telegram/discover", search);

app.use((_req, res) => fail(res, "SERVICE_ERROR", "Rota inexistente."));

const server = app.listen(PORT, () => console.log(`mtproto worker listening on ${PORT}`));

for (const signal of ["SIGTERM", "SIGINT"]) {
  process.on(signal, async () => {
    console.log(`${signal} received, shutting down`);
    server.close();
    for (const client of clients.values()) await client.disconnect().catch(() => {});
    process.exit(0);
  });
}
