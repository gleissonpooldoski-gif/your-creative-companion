// Reelyx MTProto worker — self-hosted companion service.
//
// Why it exists: real Telegram MTProto requires a persistent socket connection to
// Telegram's data centers, which the app's serverless runtime cannot open. This
// small service holds the authorized sessions and performs the real searches; the
// app talks to it over HTTPS with a bearer token.
//
// It never returns session strings, auth keys, codes or passwords.

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const PORT = Number(process.env.PORT || 8081);
const API_ID = Number(process.env.TELEGRAM_API_ID || 0);
const API_HASH = process.env.TELEGRAM_API_HASH || "";
const SERVICE_TOKEN = process.env.MTPROTO_SERVICE_TOKEN || "";
const SESSION_DIR = process.env.SESSION_DIR || "./sessions";

if (!SERVICE_TOKEN) {
  console.error("MTPROTO_SERVICE_TOKEN is required");
  process.exit(1);
}
fs.mkdirSync(SESSION_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: "256kb" }));

app.use((req, res, next) => {
  if (req.path === "/v1/health" && req.method === "GET") return next();
  const header = req.headers.authorization || "";
  if (header !== `Bearer ${SERVICE_TOKEN}`) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Token do serviço inválido." } });
  }
  next();
});

/** In-memory login state (phone_code_hash, client) keyed by session id. */
const pending = new Map();
/** Connected clients keyed by session id. */
const clients = new Map();

const sessionFile = (id) => path.join(SESSION_DIR, `${id}.session`);
const readSession = (id) => (fs.existsSync(sessionFile(id)) ? fs.readFileSync(sessionFile(id), "utf8") : "");
const writeSession = (id, value) => fs.writeFileSync(sessionFile(id), value, { mode: 0o600 });

function fail(res, status, code, message, retryAfterSeconds) {
  return res.status(status).json({ error: { code, message, ...(retryAfterSeconds ? { retry_after_seconds: retryAfterSeconds } : {}) } });
}

function floodSeconds(error) {
  const value = Number(error?.seconds ?? 0);
  if (value > 0) return value;
  const match = String(error?.errorMessage || error?.message || "").match(/FLOOD_WAIT_(\d+)/);
  return match ? Number(match[1]) : 0;
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

app.get("/v1/health", (_req, res) => {
  res.json({ ok: true, api_configured: Boolean(API_ID && API_HASH), version: "1.0.0" });
});

// Registers (or reuses) a session slot. external_id keeps app and service aligned.
app.post("/v1/sessions", (req, res) => {
  const id = String(req.body?.external_id || "").trim() || crypto.randomUUID();
  if (!/^[\w-]{6,64}$/.test(id)) return fail(res, 400, "SERVICE_ERROR", "Identificador de sessão inválido.");
  if (!fs.existsSync(sessionFile(id))) writeSession(id, "");
  res.json({ session_id: id });
});

app.post("/v1/sessions/:id/send-code", async (req, res) => {
  const id = req.params.id;
  const phone = String(req.body?.phone || "").trim();
  if (!API_ID || !API_HASH) return fail(res, 500, "SERVICE_ERROR", "TELEGRAM_API_ID/HASH não configurados no serviço.");
  if (!phone) return fail(res, 400, "SERVICE_ERROR", "Telefone obrigatório.");
  try {
    const existing = await getConnected(id);
    if (existing) return res.json({ status: "connected" });

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
    res.json({ status: "awaiting_code" });
  } catch (error) {
    const wait = floodSeconds(error);
    if (wait) return fail(res, 429, "FLOOD_WAIT", `Telegram pediu espera de ${wait}s.`, wait);
    fail(res, 502, "SERVICE_ERROR", "Telegram recusou o envio do código.");
  }
});

app.post("/v1/sessions/:id/sign-in", async (req, res) => {
  const id = req.params.id;
  const code = String(req.body?.code || "").trim();
  const state = pending.get(id);
  if (!state) return fail(res, 409, "AUTH_REQUIRED", "Login não iniciado. Solicite o código novamente.");
  try {
    await state.client.invoke(
      new Api.auth.SignIn({ phoneNumber: state.phone, phoneCodeHash: state.phoneCodeHash, phoneCode: code }),
    );
    writeSession(id, state.client.session.save());
    clients.set(id, state.client);
    pending.delete(id);
    res.json({ status: "connected" });
  } catch (error) {
    const message = String(error?.errorMessage || error?.message || "");
    if (message.includes("SESSION_PASSWORD_NEEDED")) return fail(res, 401, "PASSWORD_REQUIRED", "Conta protegida por senha de duas etapas.");
    if (message.includes("PHONE_CODE_INVALID") || message.includes("PHONE_CODE_EXPIRED")) {
      return fail(res, 400, "INVALID_CODE", "Código inválido ou expirado.");
    }
    const wait = floodSeconds(error);
    if (wait) return fail(res, 429, "FLOOD_WAIT", `Telegram pediu espera de ${wait}s.`, wait);
    fail(res, 502, "SERVICE_ERROR", "Telegram recusou o login.");
  }
});

app.post("/v1/sessions/:id/password", async (req, res) => {
  const id = req.params.id;
  const password = String(req.body?.password || "");
  const state = pending.get(id);
  if (!state) return fail(res, 409, "AUTH_REQUIRED", "Login não iniciado. Solicite o código novamente.");
  try {
    await state.client.signInWithPassword(
      { apiId: API_ID, apiHash: API_HASH },
      { password: async () => password, onError: (error) => { throw error; } },
    );
    writeSession(id, state.client.session.save());
    clients.set(id, state.client);
    pending.delete(id);
    res.json({ status: "connected" });
  } catch (error) {
    const message = String(error?.errorMessage || error?.message || "");
    if (message.includes("PASSWORD_HASH_INVALID")) return fail(res, 400, "INVALID_PASSWORD", "Senha de duas etapas incorreta.");
    fail(res, 502, "SERVICE_ERROR", "Telegram recusou a senha.");
  }
});

app.get("/v1/sessions/:id", async (req, res) => {
  const client = await getConnected(req.params.id).catch(() => null);
  res.json({ status: client ? "connected" : pending.has(req.params.id) ? "awaiting_code" : "not_connected" });
});

app.delete("/v1/sessions/:id", async (req, res) => {
  const id = req.params.id;
  const client = clients.get(id);
  if (client) await client.disconnect().catch(() => {});
  clients.delete(id);
  pending.delete(id);
  if (fs.existsSync(sessionFile(id))) fs.rmSync(sessionFile(id));
  res.json({ ok: true });
});

/**
 * Real Telegram search. Only public supergroups are returned; users, bots and
 * broadcast channels are filtered out here and again in the app.
 */
app.post("/v1/search", async (req, res) => {
  const sessionId = String(req.body?.session_id || "");
  const keywords = Array.isArray(req.body?.keywords) ? req.body.keywords.map(String).slice(0, 20) : [];
  const limit = Math.min(Math.max(Number(req.body?.limit || 40), 1), 100);
  if (keywords.length === 0) return fail(res, 400, "SERVICE_ERROR", "Informe ao menos uma palavra-chave.");

  let client;
  try {
    client = await getConnected(sessionId);
  } catch {
    client = null;
  }
  if (!client) return fail(res, 409, "AUTH_REQUIRED", "Sessão do Telegram não autorizada.");

  const results = [];
  const seen = new Set();
  try {
    for (const keyword of keywords) {
      if (results.length >= limit) break;
      const found = await client.invoke(new Api.contacts.Search({ q: keyword, limit: 50 }));
      for (const chat of found.chats ?? []) {
        const username = chat.username || (chat.usernames?.[0]?.username ?? null);
        const isMegagroup = chat.className === "Channel" && chat.megagroup === true;
        if (!isMegagroup || !username || seen.has(username.toLowerCase())) continue;
        seen.add(username.toLowerCase());

        let about = null;
        let participants = chat.participantsCount ?? null;
        try {
          const full = await client.invoke(new Api.channels.GetFullChannel({ channel: chat }));
          about = full.fullChat?.about ?? null;
          participants = full.fullChat?.participantsCount ?? participants;
        } catch {
          // metadata is optional; never invent it
        }

        results.push({
          entity_type: "megagroup",
          telegram_id: String(chat.id),
          username,
          title: chat.title ?? null,
          about,
          participants_count: participants,
          is_public: true,
          is_megagroup: true,
          is_broadcast: false,
          keyword,
        });
        if (results.length >= limit) break;
      }
    }
    res.json({ results });
  } catch (error) {
    const wait = floodSeconds(error);
    if (wait) return fail(res, 429, "FLOOD_WAIT", `Telegram pediu espera de ${wait}s.`, wait);
    fail(res, 502, "SERVICE_ERROR", "Busca no Telegram falhou.");
  }
});

app.listen(PORT, () => console.log(`mtproto worker listening on ${PORT}`));
