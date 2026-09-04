/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LooseClient = { from: (table: string) => any };

async function resolveWorkspaceId(supabase: LooseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Workspace não encontrado.");
  return data.workspace_id as string;
}

type TelegramMe = { id: number; username?: string; first_name?: string };

async function telegramGetMe(token: string): Promise<{ ok: true; me: TelegramMe } | { ok: false; error: string }> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const payload = (await response.json()) as { ok: boolean; result?: TelegramMe; description?: string };
    if (!response.ok || !payload.ok || !payload.result) {
      return { ok: false, error: payload.description ?? `HTTP ${response.status}` };
    }
    return { ok: true, me: payload.result };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Falha de rede" };
  }
}

function appOrigin(): string {
  const configured = process.env["APP_PUBLIC_URL"];
  if (configured) return configured.replace(/\/$/, "");
  try {
    return new URL(getRequest().url).origin;
  } catch {
    return "";
  }
}

async function setWebhook(token: string, url: string, secret: string) {
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, secret_token: secret, allowed_updates: ["message", "callback_query"] }),
  });
  const payload = (await response.json()) as { ok: boolean; description?: string };
  return payload.ok ? { ok: true as const } : { ok: false as const, error: payload.description ?? "setWebhook falhou" };
}

/**
 * Connects a real Telegram bot account. The account is only marked as `online`
 * after the official Telegram API confirms the token with getMe.
 */
export const connectBotAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ name: z.string().min(1).max(80), token: z.string().min(20).max(200) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await resolveWorkspaceId(supabase, context.userId);
    const verification = await telegramGetMe(data.token);

    const logFailure = async (message: string) => {
      await supabase.from("integration_logs").insert({
        workspace_id: workspaceId,
        provider: "telegram",
        action: "connect_bot",
        success: false,
        message,
      });
    };

    if (!verification.ok) {
      await logFailure(verification.error);
      return { ok: false as const, error: `Telegram rejeitou o token: ${verification.error}` };
    }

    const secret = crypto.randomUUID().replace(/-/g, "");
    const { data: account, error } = await supabase
      .from("telegram_accounts")
      .upsert(
        {
          workspace_id: workspaceId,
          name: data.name,
          kind: "bot",
          username: verification.me.username ?? null,
          telegram_id: String(verification.me.id),
          status: "online",
          worker: "edge-runtime",
          webhook_secret: secret,
          last_sync_at: new Date().toISOString(),
          last_error: null,
        },
        { onConflict: "workspace_id,name" },
      )
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as LooseClient;
    await admin.from("telegram_credentials").upsert({
      account_id: account.id,
      workspace_id: workspaceId,
      bot_token: data.token,
    });

    const origin = appOrigin();
    let webhook: { ok: boolean; error?: string } = { ok: false, error: "URL pública indisponível" };
    if (origin) {
      webhook = await setWebhook(data.token, `${origin}/api/public/telegram/webhook/${account.id}`, secret);
    }

    await supabase.from("integration_logs").insert({
      workspace_id: workspaceId,
      provider: "telegram",
      action: "connect_bot",
      success: true,
      message: webhook.ok ? "Bot validado e webhook registrado" : `Bot validado; webhook pendente: ${webhook.error}`,
    });
    await supabase.from("notifications").insert({
      workspace_id: workspaceId,
      kind: "account",
      title: `Conta ${data.name} conectada`,
      body: webhook.ok ? "Webhook registrado com sucesso." : "Webhook não registrado — verifique a URL pública.",
    });

    return {
      ok: true as const,
      account: account as any,
      username: verification.me.username ?? null,
      webhookRegistered: webhook.ok,
      webhookError: webhook.ok ? null : (webhook.error ?? null),
    };
  });

/** Re-validates a stored bot token against the Telegram API and persists the real status. */
export const verifyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ accountId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await resolveWorkspaceId(supabase, context.userId);
    const { data: account, error } = await supabase
      .from("telegram_accounts")
      .select("id, kind, name")
      .eq("id", data.accountId)
      .eq("workspace_id", workspaceId)
      .single();
    if (error) throw new Error(error.message);

    await supabase.from("telegram_accounts").update({ status: "checking" }).eq("id", account.id);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as LooseClient;
    const { data: creds } = await admin
      .from("telegram_credentials")
      .select("bot_token")
      .eq("account_id", account.id)
      .maybeSingle();

    if (!creds?.bot_token) {
      await supabase
        .from("telegram_accounts")
        .update({ status: "pending_auth", last_error: "Credencial ausente — integração pendente" })
        .eq("id", account.id);
      return { ok: false as const, status: "pending_auth", error: "Credencial ausente. Configuração necessária." };
    }

    const verification = await telegramGetMe(creds.bot_token as string);
    const now = new Date().toISOString();
    if (!verification.ok) {
      await supabase
        .from("telegram_accounts")
        .update({ status: "failed", last_error: verification.error, last_sync_at: now })
        .eq("id", account.id);
      await supabase.from("notifications").insert({
        workspace_id: workspaceId,
        kind: "account",
        title: `Conta ${account.name} fora do ar`,
        body: verification.error,
      });
      return { ok: false as const, status: "failed", error: verification.error };
    }
    await supabase
      .from("telegram_accounts")
      .update({
        status: "online",
        last_error: null,
        last_sync_at: now,
        last_activity_at: now,
        username: verification.me.username ?? null,
        telegram_id: String(verification.me.id),
      })
      .eq("id", account.id);
    return { ok: true as const, status: "online" };
  });

/** Re-registers the Telegram webhook for a stored bot token. */
export const reconnectAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ accountId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await resolveWorkspaceId(supabase, context.userId);
    const { data: account, error } = await supabase
      .from("telegram_accounts")
      .select("id, webhook_secret")
      .eq("id", data.accountId)
      .eq("workspace_id", workspaceId)
      .single();
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as LooseClient;
    const { data: creds } = await admin
      .from("telegram_credentials")
      .select("bot_token")
      .eq("account_id", account.id)
      .maybeSingle();
    if (!creds?.bot_token) return { ok: false as const, error: "Credencial ausente. Configuração necessária." };

    const origin = appOrigin();
    if (!origin) return { ok: false as const, error: "URL pública indisponível para webhook." };
    const secret = (account.webhook_secret as string) ?? crypto.randomUUID().replace(/-/g, "");
    const result = await setWebhook(
      creds.bot_token as string,
      `${origin}/api/public/telegram/webhook/${account.id}`,
      secret,
    );
    await supabase
      .from("telegram_accounts")
      .update({ webhook_secret: secret, last_error: result.ok ? null : result.error })
      .eq("id", account.id);
    await supabase.from("integration_logs").insert({
      workspace_id: workspaceId,
      provider: "telegram",
      action: "set_webhook",
      success: result.ok,
      message: result.ok ? "Webhook registrado" : (result.error ?? ""),
    });
    return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
  });

export const setAccountPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ accountId: z.string().uuid(), paused: z.boolean() }).parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await resolveWorkspaceId(supabase, context.userId);
    const { error } = await supabase
      .from("telegram_accounts")
      .update({ paused: data.paused })
      .eq("id", data.accountId)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    if (data.paused) {
      // Jobs already claimed for this account go back to the queue.
      await supabase
        .from("prospecting_queue")
        .update({ status: "pending", account_id: null })
        .eq("workspace_id", workspaceId)
        .eq("account_id", data.accountId)
        .eq("status", "processing");
    }
    return { ok: true };
  });

/**
 * TData import. The upload, validation, storage and per-session status pipeline is
 * real, but opening an MTProto TData session requires a Telegram client runtime
 * (api_id/api_hash + MTProto worker) that this environment does not provide, so
 * accounts are created as `pending_auth` and never reported as online.
 */
export const importTdata = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        fileName: z.string().min(3).max(255),
        sizeBytes: z.number().int().min(1),
        sessionNames: z.array(z.string().min(1).max(80)).min(1).max(200),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const workspaceId = await resolveWorkspaceId(supabase, context.userId);
    const extension = data.fileName.toLowerCase().split(".").pop();
    if (extension !== "zip" && extension !== "rar") {
      return { ok: false as const, error: "Formato inválido. Envie .zip ou .rar com estrutura TData." };
    }

    const created: Array<{ name: string; status: string; reason: string }> = [];
    for (const sessionName of data.sessionNames) {
      const { error } = await supabase.from("telegram_accounts").upsert(
        {
          workspace_id: workspaceId,
          name: sessionName,
          kind: "client",
          status: "pending_auth",
          worker: "mtproto-worker",
          last_error: "Runtime MTProto não provisionado — integração pendente",
        },
        { onConflict: "workspace_id,name", ignoreDuplicates: false },
      );
      created.push({
        name: sessionName,
        status: error ? "failed" : "pending_auth",
        reason: error ? error.message : "Sessão registrada; validação MTProto pendente",
      });
    }

    await supabase.from("integration_logs").insert({
      workspace_id: workspaceId,
      provider: "telegram",
      action: "import_tdata",
      success: true,
      message: `${created.length} sessão(ões) registradas a partir de ${data.fileName} (${data.sizeBytes} bytes)`,
    });

    return {
      ok: true as const,
      report: created,
      dependency:
        "Validação real de sessões TData exige runtime MTProto autorizado (api_id/api_hash + worker dedicado). Nenhuma conta é marcada como online sem validação.",
    };
  });
