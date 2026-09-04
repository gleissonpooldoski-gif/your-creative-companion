// MTProto service client. Server-only.
//
// Real Telegram MTProto needs a persistent socket connection to Telegram's data
// centers, which this app's serverless runtime cannot open. So the MTProto work
// runs in a small self-hosted companion service (reference implementation and
// deployment guide live in services/mtproto-worker/) and this module talks to it
// over HTTPS. Nothing here fabricates groups, sessions or successes: every call
// either returns the service's real answer or a sanitized error.

import { decryptProviderKey, encryptProviderKey } from "@/lib/provider-config.server";

export type MtprotoErrorCode =
  | "NOT_CONFIGURED"
  | "INVALID_URL"
  | "UNAUTHORIZED"
  | "AUTH_REQUIRED"
  | "INVALID_CODE"
  | "PASSWORD_REQUIRED"
  | "INVALID_PASSWORD"
  | "FLOOD_WAIT"
  | "RATE_LIMITED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "SERVICE_ERROR";

export class MtprotoError extends Error {
  constructor(
    readonly code: MtprotoErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "MtprotoError";
  }
}

export const MTPROTO_NOT_CONFIGURED =
  "Serviço MTProto do Telegram não configurado. Informe a URL e o token do serviço em Configurações.";

const TIMEOUT_MS = 45_000;

export type MtprotoServiceConfig = { serviceUrl: string; token: string };

type AdminLike = { from: (table: string) => any };

export function validateServiceUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new MtprotoError("INVALID_URL", "URL do serviço MTProto inválida.");
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !local) {
    throw new MtprotoError("INVALID_URL", "A URL do serviço MTProto precisa usar HTTPS.");
  }
  return url.toString().replace(/\/+$/, "");
}

export async function loadMtprotoConfig(workspaceId: string): Promise<MtprotoServiceConfig | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await (supabaseAdmin as unknown as AdminLike)
    .from("mtproto_service_configs")
    .select("service_url, service_token_ciphertext")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (data?.service_url && data.service_token_ciphertext) {
    return { serviceUrl: data.service_url, token: await decryptProviderKey(data.service_token_ciphertext) };
  }

  const serviceUrl = process.env["MTPROTO_SERVICE_URL"];
  const token = process.env["MTPROTO_SERVICE_TOKEN"];
  return serviceUrl && token ? { serviceUrl: serviceUrl.replace(/\/+$/, ""), token } : null;
}

export async function saveMtprotoConfig(input: {
  workspaceId: string;
  serviceUrl: string;
  token: string;
  createdBy: string;
}): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await (supabaseAdmin as unknown as AdminLike).from("mtproto_service_configs").upsert({
    workspace_id: input.workspaceId,
    service_url: validateServiceUrl(input.serviceUrl),
    service_token_ciphertext: await encryptProviderKey(input.token),
    status: "not_tested",
    last_tested_at: null,
    last_test_message: null,
    created_by: input.createdBy,
  });
  if (error) throw new Error(error.message);
}

function mapErrorCode(raw: string | undefined, status: number): MtprotoErrorCode {
  switch ((raw ?? "").toUpperCase()) {
    case "FLOOD_WAIT":
      return "FLOOD_WAIT";
    case "AUTH_REQUIRED":
      return "AUTH_REQUIRED";
    case "INVALID_CODE":
      return "INVALID_CODE";
    case "PASSWORD_REQUIRED":
      return "PASSWORD_REQUIRED";
    case "INVALID_PASSWORD":
      return "INVALID_PASSWORD";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    default:
      if (status === 401 || status === 403) return "UNAUTHORIZED";
      if (status === 429) return "RATE_LIMITED";
      return "SERVICE_ERROR";
  }
}

/** Sanitized request to the companion service. Secrets stay in headers/body, never in logs. */
export async function callMtprotoService<T>(
  config: MtprotoServiceConfig,
  path: string,
  init: { method: "GET" | "POST" | "DELETE"; body?: unknown },
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${config.serviceUrl}${path}`, {
      method: init.method,
      headers: {
        authorization: `Bearer ${config.token}`,
        ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: controller.signal,
    });

    const text = await response.text();
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const code = mapErrorCode(payload?.error?.code, response.status);
      const message = String(payload?.error?.message ?? `Serviço MTProto respondeu HTTP ${response.status}.`).slice(0, 400);
      const retryAfter = Number(payload?.error?.retry_after_seconds ?? 0);
      throw new MtprotoError(code, message, retryAfter > 0 ? retryAfter : undefined);
    }
    return (payload ?? {}) as T;
  } catch (error) {
    if (error instanceof MtprotoError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new MtprotoError("TIMEOUT", "O serviço MTProto não respondeu dentro do tempo esperado.");
    }
    throw new MtprotoError("NETWORK_ERROR", "Não foi possível alcançar o serviço MTProto.");
  } finally {
    clearTimeout(timer);
  }
}

export type MtprotoHealth = { ok: boolean; api_configured?: boolean; version?: string };

export async function testMtprotoService(workspaceId: string): Promise<{ ok: boolean; code: MtprotoErrorCode | "CONNECTED"; message: string }> {
  const config = await loadMtprotoConfig(workspaceId);
  if (!config) return { ok: false, code: "NOT_CONFIGURED", message: MTPROTO_NOT_CONFIGURED };
  try {
    const health = await callMtprotoService<MtprotoHealth>(config, "/v1/health", { method: "GET" });
    if (!health.ok) return { ok: false, code: "SERVICE_ERROR", message: "Serviço MTProto respondeu, mas não está saudável." };
    if (health.api_configured === false) {
      return { ok: false, code: "SERVICE_ERROR", message: "Serviço MTProto sem API ID/HASH do Telegram configurados." };
    }
    return { ok: true, code: "CONNECTED", message: "Serviço MTProto conectado e pronto." };
  } catch (error) {
    const mtproto = error instanceof MtprotoError ? error : new MtprotoError("SERVICE_ERROR", "Falha inesperada.");
    return { ok: false, code: mtproto.code, message: mtproto.message };
  }
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 5) return "•••••";
  return `${digits.slice(0, 3)}•••••${digits.slice(-2)}`;
}
