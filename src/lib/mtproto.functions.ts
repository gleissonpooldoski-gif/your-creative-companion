/* eslint-disable @typescript-eslint/no-explicit-any */
// Authenticated server functions for the real Telegram (MTProto) mining accounts.
// Phone numbers, login codes, 2FA passwords, tokens and session data never leave
// the server: only masked, sanitized state is returned to the browser.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LooseClient = { from: (table: string) => any };

async function requireAdmin(supabase: LooseClient, userId: string) {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data || !["owner", "admin"].includes(String(data.role))) {
    throw new Error("Somente proprietários e administradores podem gerenciar contas de mineração.");
  }
  return data.workspace_id as string;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as LooseClient;
}

function sanitize(error: unknown): { code: string; message: string } {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    return { code: String((error as any).code), message: String((error as any).message).slice(0, 400) };
  }
  return { code: "SERVICE_ERROR", message: "Falha ao falar com o serviço de Telegram." };
}

export const getMtprotoStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await requireAdmin(supabase, context.userId);
    const db = await admin();

    const [{ data: config }, { data: sessions }] = await Promise.all([
      db
        .from("mtproto_service_configs")
        .select("service_url, status, last_tested_at, last_test_message, updated_at")
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      db
        .from("telegram_mtproto_sessions")
        .select("id, label, phone_masked, status, last_error, last_connected_at, flood_wait_until, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true }),
    ]);

    const envConfigured = Boolean(process.env["MTPROTO_SERVICE_URL"] && process.env["MTPROTO_SERVICE_TOKEN"]);
    return {
      configured: Boolean(config) || envConfigured,
      source: config ? ("workspace" as const) : envConfigured ? ("environment" as const) : ("none" as const),
      service_url: config?.service_url ?? process.env["MTPROTO_SERVICE_URL"] ?? null,
      status: config?.status ?? (envConfigured ? "not_tested" : "not_configured"),
      last_tested_at: config?.last_tested_at ?? null,
      last_test_message: config?.last_test_message ?? null,
      sessions: (sessions ?? []) as any[],
      connectedSessions: (sessions ?? []).filter((s: any) => s.status === "connected").length,
    };
  });

const serviceInput = z.object({ serviceUrl: z.string().min(8).max(500), token: z.string().min(8).max(2000) });

export const saveMtprotoService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => serviceInput.parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await requireAdmin(supabase, context.userId);
    const { saveMtprotoConfig } = await import("@/lib/mtproto/service.server");
    await saveMtprotoConfig({ workspaceId, serviceUrl: data.serviceUrl, token: data.token, createdBy: context.userId });
    return { ok: true as const };
  });

export const testMtprotoConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await requireAdmin(supabase, context.userId);
    const { testMtprotoService } = await import("@/lib/mtproto/service.server");
    const result = await testMtprotoService(workspaceId);
    const db = await admin();
    await db
      .from("mtproto_service_configs")
      .update({
        status: result.ok ? "connected" : "error",
        last_tested_at: new Date().toISOString(),
        last_test_message: result.message.slice(0, 500),
      })
      .eq("workspace_id", workspaceId);
    return result;
  });

const startSessionInput = z.object({
  label: z.string().min(2).max(60),
  phone: z.string().min(8).max(20),
});

/** Step 1: registers the account and asks Telegram to send the login code. */
export const startMtprotoLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => startSessionInput.parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await requireAdmin(supabase, context.userId);
    const { loadMtprotoConfig, callMtprotoService, maskPhone, MTPROTO_NOT_CONFIGURED } = await import("@/lib/mtproto/service.server");
    const config = await loadMtprotoConfig(workspaceId);
    if (!config) throw new Error(MTPROTO_NOT_CONFIGURED);

    const db = await admin();
    const { data: session, error } = await db
      .from("telegram_mtproto_sessions")
      .upsert(
        {
          workspace_id: workspaceId,
          label: data.label.trim(),
          phone_masked: maskPhone(data.phone),
          status: "connecting",
          last_error: null,
          created_by: context.userId,
        },
        { onConflict: "workspace_id,label" },
      )
      .select("id, remote_session_id")
      .maybeSingle();
    if (error || !session) throw new Error(error?.message ?? "Não foi possível registrar a conta.");

    try {
      const created = await callMtprotoService<{ session_id: string }>(config, "/v1/sessions", {
        method: "POST",
        body: { label: data.label.trim(), external_id: session.id },
      });
      const remoteId = session.remote_session_id ?? created.session_id;
      const result = await callMtprotoService<{ status: string }>(config, `/v1/sessions/${remoteId}/send-code`, {
        method: "POST",
        body: { phone: data.phone },
      });
      await db
        .from("telegram_mtproto_sessions")
        .update({ remote_session_id: remoteId, status: result.status === "connected" ? "connected" : "awaiting_code", last_error: null })
        .eq("id", session.id);
      await supabase.from("audit_logs").insert({
        workspace_id: workspaceId,
        user_id: context.userId,
        action: "mtproto_login_started",
        resource: `telegram_mtproto_sessions:${session.id}`,
        result: result.status,
      });
      return { ok: true as const, sessionId: session.id as string, status: result.status };
    } catch (error) {
      const sanitized = sanitize(error);
      await db
        .from("telegram_mtproto_sessions")
        .update({ status: "failed", last_error: sanitized.message })
        .eq("id", session.id);
      throw new Error(sanitized.message);
    }
  });

const codeInput = z.object({ sessionId: z.string().uuid(), code: z.string().min(4).max(10) });

/** Step 2: confirms the login code. May require the 2FA password afterwards. */
export const confirmMtprotoCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => codeInput.parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await requireAdmin(supabase, context.userId);
    const { loadMtprotoConfig, callMtprotoService, MTPROTO_NOT_CONFIGURED } = await import("@/lib/mtproto/service.server");
    const config = await loadMtprotoConfig(workspaceId);
    if (!config) throw new Error(MTPROTO_NOT_CONFIGURED);

    const db = await admin();
    const { data: session } = await db
      .from("telegram_mtproto_sessions")
      .select("id, remote_session_id")
      .eq("id", data.sessionId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!session?.remote_session_id) throw new Error("Conta não encontrada ou sem login iniciado.");

    try {
      const result = await callMtprotoService<{ status: string }>(config, `/v1/sessions/${session.remote_session_id}/sign-in`, {
        method: "POST",
        body: { code: data.code },
      });
      const status = result.status === "connected" ? "connected" : result.status === "awaiting_password" ? "awaiting_password" : "awaiting_code";
      await db
        .from("telegram_mtproto_sessions")
        .update({
          status,
          last_error: null,
          ...(status === "connected" ? { last_connected_at: new Date().toISOString(), flood_wait_until: null } : {}),
        })
        .eq("id", session.id);
      return { ok: true as const, status };
    } catch (error) {
      const sanitized = sanitize(error);
      const status = sanitized.code === "PASSWORD_REQUIRED" ? "awaiting_password" : sanitized.code === "INVALID_CODE" ? "awaiting_code" : "failed";
      await db.from("telegram_mtproto_sessions").update({ status, last_error: sanitized.message }).eq("id", session.id);
      if (status === "awaiting_password") return { ok: true as const, status };
      throw new Error(sanitized.message);
    }
  });

const passwordInput = z.object({ sessionId: z.string().uuid(), password: z.string().min(1).max(500) });

/** Step 3: confirms the 2FA password when Telegram requires it. */
export const confirmMtprotoPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => passwordInput.parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await requireAdmin(supabase, context.userId);
    const { loadMtprotoConfig, callMtprotoService, MTPROTO_NOT_CONFIGURED } = await import("@/lib/mtproto/service.server");
    const config = await loadMtprotoConfig(workspaceId);
    if (!config) throw new Error(MTPROTO_NOT_CONFIGURED);

    const db = await admin();
    const { data: session } = await db
      .from("telegram_mtproto_sessions")
      .select("id, remote_session_id")
      .eq("id", data.sessionId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!session?.remote_session_id) throw new Error("Conta não encontrada ou sem login iniciado.");

    try {
      const result = await callMtprotoService<{ status: string }>(config, `/v1/sessions/${session.remote_session_id}/password`, {
        method: "POST",
        body: { password: data.password },
      });
      const connected = result.status === "connected";
      await db
        .from("telegram_mtproto_sessions")
        .update({
          status: connected ? "connected" : "awaiting_password",
          last_error: null,
          ...(connected ? { last_connected_at: new Date().toISOString(), flood_wait_until: null } : {}),
        })
        .eq("id", session.id);
      return { ok: true as const, status: result.status };
    } catch (error) {
      const sanitized = sanitize(error);
      await db
        .from("telegram_mtproto_sessions")
        .update({ status: sanitized.code === "INVALID_PASSWORD" ? "awaiting_password" : "failed", last_error: sanitized.message })
        .eq("id", session.id);
      throw new Error(sanitized.message);
    }
  });

export const removeMtprotoSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ sessionId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await requireAdmin(supabase, context.userId);
    const db = await admin();
    const { data: session } = await db
      .from("telegram_mtproto_sessions")
      .select("id, remote_session_id")
      .eq("id", data.sessionId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!session) throw new Error("Conta não encontrada.");

    const { loadMtprotoConfig, callMtprotoService } = await import("@/lib/mtproto/service.server");
    const config = await loadMtprotoConfig(workspaceId);
    if (config && session.remote_session_id) {
      try {
        await callMtprotoService(config, `/v1/sessions/${session.remote_session_id}`, { method: "DELETE" });
      } catch {
        // the local record is removed regardless; the remote service can be cleaned up later
      }
    }
    await db.from("telegram_mtproto_sessions").delete().eq("id", session.id);
    await supabase.from("audit_logs").insert({
      workspace_id: workspaceId,
      user_id: context.userId,
      action: "mtproto_session_removed",
      resource: `telegram_mtproto_sessions:${session.id}`,
      result: "removed",
    });
    return { ok: true as const };
  });
