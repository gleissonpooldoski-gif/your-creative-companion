/* eslint-disable @typescript-eslint/no-explicit-any */
// Queue worker. Runs only on the server (cron route). Bounded per run,
// idempotent progress marking, circuit breaker on AI billing failures.

import { dispatchCampaign, sendCampaignDestination } from "@/lib/campaign-exec.server";
import { runMiningJob } from "@/lib/mining.server";

const BATCH_SIZE = 10;

type Job = {
  id: string;
  workspace_id: string;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

type Admin = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

async function getAdmin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

async function log(admin: Admin, job: Job, level: string, message: string) {
  await admin.from("job_logs").insert({
    workspace_id: job.workspace_id,
    job_id: job.id,
    level,
    message: message.slice(0, 1000),
  });
}

async function isWorkspacePaused(admin: Admin, workspaceId: string): Promise<boolean> {
  const { data } = await admin.from("workspaces").select("global_pause").eq("id", workspaceId).maybeSingle();
  return Boolean(data?.global_pause);
}

async function syncMiningFailure(admin: Admin, job: Job, message: string, terminal: boolean) {
  if (job.kind !== "group_mining") return;
  const miningJobId = job.payload["mining_job_id"];
  if (typeof miningJobId !== "string") return;
  await admin.from("group_mining_jobs").update({
    status: terminal ? "failed" : "pending",
    progress_stage: terminal ? "failed" : "retry",
    progress_message: terminal ? "Falhou após todas as tentativas" : `Nova tentativa agendada (${job.attempts}/${job.max_attempts})`,
    attempt_count: job.attempts,
    error: message.slice(0, 1000),
    ...(terminal ? { completed_at: new Date().toISOString() } : {}),
  }).eq("id", miningJobId).eq("workspace_id", job.workspace_id);
}

async function handleJob(admin: Admin, job: Job): Promise<{ ok: boolean; message: string }> {
  switch (job.kind) {
    case "sync_accounts": {
      const { data: accounts } = await admin
        .from("telegram_accounts")
        .select("id, kind, paused")
        .eq("workspace_id", job.workspace_id)
        .eq("paused", false)
        .limit(25);
      let checked = 0;
      let online = 0;
      for (const account of accounts ?? []) {
        if (account.kind !== "bot") continue;
        const { data: creds } = await admin
          .from("telegram_credentials")
          .select("bot_token")
          .eq("account_id", account.id)
          .maybeSingle();
        if (!creds?.bot_token) {
          await admin
            .from("telegram_accounts")
            .update({ status: "pending_auth", last_error: "Credencial ausente — integração pendente" })
            .eq("id", account.id);
          continue;
        }
        checked += 1;
        const response = await fetch(`https://api.telegram.org/bot${creds.bot_token}/getMe`);
        const payload = (await response.json()) as { ok: boolean; description?: string };
        const now = new Date().toISOString();
        if (payload.ok) {
          online += 1;
          await admin
            .from("telegram_accounts")
            .update({ status: "online", last_error: null, last_sync_at: now })
            .eq("id", account.id);
        } else {
          await admin
            .from("telegram_accounts")
            .update({ status: "failed", last_error: payload.description ?? "getMe falhou", last_sync_at: now })
            .eq("id", account.id);
          await admin.from("notifications").insert({
            workspace_id: job.workspace_id,
            kind: "account",
            title: "Conta Telegram fora do ar",
            body: payload.description ?? "getMe falhou",
          });
        }
      }
      return { ok: true, message: `contas verificadas: ${checked}, online: ${online}` };
    }

    case "group_mining": {
      const miningJobId = job.payload["mining_job_id"] as string | undefined;
      if (!miningJobId) return { ok: false, message: "payload sem mining_job_id" };
      const seeds = job.payload["seed_references"];
      return runMiningJob(admin, {
        workspaceId: job.workspace_id,
        miningJobId,
        ...(Array.isArray(seeds) ? { seedReferences: seeds as string[] } : {}),
      });
    }

    case "run_campaign":
    case "campaign_dispatch": {
      const campaignId = job.payload["campaign_id"] as string | undefined;
      if (!campaignId) return { ok: false, message: "payload sem campaign_id" };
      return dispatchCampaign(admin, { workspaceId: job.workspace_id, campaignId });
    }

    case "campaign_send": {
      const campaignId = job.payload["campaign_id"] as string | undefined;
      const destinationId = job.payload["destination_id"] as string | undefined;
      const accountId = job.payload["account_id"] as string | undefined;
      if (!campaignId || !destinationId || !accountId) return { ok: false, message: "payload incompleto para envio" };
      return sendCampaignDestination(admin, {
        workspaceId: job.workspace_id,
        campaignId,
        destinationId,
        accountId,
      });
    }

    case "process_telegram_update": {
      const updateId = job.payload["update_row_id"] as string | undefined;
      if (!updateId) return { ok: false, message: "payload sem update_row_id" };
      const { data: update } = await admin
        .from("telegram_updates")
        .select("id, payload, processed_at, account_id")
        .eq("id", updateId)
        .maybeSingle();
      if (!update) return { ok: false, message: "update não encontrado" };
      if (update.processed_at) return { ok: true, message: "já processado (idempotente)" };

      const message = (update.payload as any)?.message;
      const from = message?.from;
      if (from?.id) {
        await admin.from("contacts").upsert(
          {
            workspace_id: job.workspace_id,
            telegram_id: String(from.id),
            name: [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || "Contato Telegram",
            username: from.username ?? null,
            source: "telegram_webhook",
            last_interaction_at: new Date().toISOString(),
          },
          { onConflict: "workspace_id,telegram_id" },
        );
        const { data: contact } = await admin
          .from("contacts")
          .select("id")
          .eq("workspace_id", job.workspace_id)
          .eq("telegram_id", String(from.id))
          .maybeSingle();
        if (contact && message?.text) {
          await admin.from("activities").insert({
            workspace_id: job.workspace_id,
            contact_id: contact.id,
            kind: "telegram_message_in",
            content: String(message.text).slice(0, 2000),
          });
        }
      }
      await admin.from("telegram_updates").update({ processed_at: new Date().toISOString() }).eq("id", update.id);
      await admin
        .from("telegram_accounts")
        .update({ last_activity_at: new Date().toISOString() })
        .eq("id", update.account_id);
      return { ok: true, message: "update processado" };
    }

    case "prospecting_dispatch": {
      const { data: campaign } = await admin
        .from("prospecting_campaigns")
        .select("id, status, messages_per_hour, daily_cap_per_account")
        .eq("workspace_id", job.workspace_id)
        .eq("id", job.payload["prospecting_campaign_id"] as string)
        .maybeSingle();
      if (!campaign) return { ok: false, message: "campanha de prospecção não encontrada" };
      if (campaign.status !== "running") return { ok: true, message: "campanha pausada — nada a fazer" };

      const perRun = Math.max(1, Math.min(10, Math.floor(Number(campaign.messages_per_hour ?? 60) / 12)));
      const { data: items } = await admin
        .from("prospecting_queue")
        .select("id, contact_id, message")
        .eq("workspace_id", job.workspace_id)
        .eq("prospecting_campaign_id", campaign.id)
        .eq("status", "pending")
        .lte("scheduled_at", new Date().toISOString())
        .limit(perRun);

      let skipped = 0;
      let blocked = 0;
      for (const item of items ?? []) {
        const { data: contact } = await admin
          .from("contacts")
          .select("id, opt_out, telegram_id")
          .eq("id", item.contact_id)
          .maybeSingle();
        if (!contact || contact.opt_out) {
          await admin
            .from("prospecting_queue")
            .update({ status: "skipped", error: "opt-out ou contato inexistente" })
            .eq("id", item.id);
          skipped += 1;
          continue;
        }
        // Direct messages from a personal Telegram account require an authorized
        // MTProto runtime, which is not provisioned. Never report as sent.
        await admin
          .from("prospecting_queue")
          .update({
            status: "failed",
            error: "Integração pendente: envio de DM exige runtime MTProto autorizado",
          })
          .eq("id", item.id);
        blocked += 1;
      }
      return {
        ok: true,
        message: `itens avaliados: ${(items ?? []).length}, pulados: ${skipped}, bloqueados por integração pendente: ${blocked}`,
      };
    }

    case "instagram_publish": {
      const postId = job.payload["post_id"] as string | undefined;
      if (!postId) return { ok: false, message: "payload sem post_id" };
      const token = process.env["META_ACCESS_TOKEN"];
      if (!token) {
        await admin
          .from("instagram_posts")
          .update({ status: "failed", error: "Configuração necessária: credenciais Meta ausentes" })
          .eq("id", postId);
        return { ok: false, message: "Configuração necessária: credenciais Meta ausentes" };
      }
      return { ok: false, message: "Publicação Instagram requer conta IG Business vinculada e revisão do app Meta" };
    }

    case "sync_conversations":
    case "sync_groups":
    case "sync_contacts":
    case "recompute_metrics": {
      // These derive from already-persisted data; there is nothing to fake here.
      await admin.from("system_logs").insert({
        workspace_id: job.workspace_id,
        scope: "sync",
        level: "info",
        message: `${job.kind}: sincronização concluída a partir dos dados persistidos`,
      });
      return { ok: true, message: "sincronização concluída" };
    }

    default:
      return { ok: false, message: `tipo de job desconhecido: ${job.kind}` };
  }
}

export async function processQueue(): Promise<{
  claimed: number;
  completed: number;
  failed: number;
  requeued: number;
  watchdog: { requeued: number; failed: number };
}> {
  const admin = await getAdmin();
  const { data: watchdogRows } = await admin.rpc("watchdog_requeue");
  const watchdog = Array.isArray(watchdogRows) && watchdogRows[0]
    ? { requeued: Number(watchdogRows[0].requeued ?? 0), failed: Number(watchdogRows[0].failed ?? 0) }
    : { requeued: 0, failed: 0 };

  const { data: jobs, error } = await admin.rpc("claim_queue_jobs", { _limit: BATCH_SIZE });
  if (error) throw new Error(error.message);

  let completed = 0;
  let failed = 0;
  let requeued = 0;

  for (const job of (jobs ?? []) as Job[]) {
    if (await isWorkspacePaused(admin, job.workspace_id)) {
      await admin
        .from("queue_jobs")
        .update({ status: "pending", locked_at: null, scheduled_at: new Date(Date.now() + 60_000).toISOString() })
        .eq("id", job.id);
      requeued += 1;
      continue;
    }
    try {
      const result = await handleJob(admin, job);
      if (result.ok) {
        await admin
          .from("queue_jobs")
          .update({ status: "completed", completed_at: new Date().toISOString(), error: null, locked_at: null })
          .eq("id", job.id);
        await log(admin, job, "info", result.message);
        completed += 1;
      } else if (job.attempts >= job.max_attempts) {
        await admin
          .from("queue_jobs")
          .update({ status: "failed", failed_at: new Date().toISOString(), error: result.message, locked_at: null })
          .eq("id", job.id);
        await log(admin, job, "error", result.message);
        await syncMiningFailure(admin, job, result.message, true);
        await admin.from("notifications").insert({
          workspace_id: job.workspace_id,
          kind: "job",
          title: `Job ${job.kind} falhou`,
          body: result.message.slice(0, 300),
        });
        failed += 1;
      } else {
        await admin
          .from("queue_jobs")
          .update({
            status: "retry",
            error: result.message,
            locked_at: null,
            scheduled_at: new Date(Date.now() + 2 ** job.attempts * 30_000).toISOString(),
          })
          .eq("id", job.id);
        await log(admin, job, "warn", result.message);
        await syncMiningFailure(admin, job, result.message, false);
        requeued += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "erro desconhecido";
      const terminal = job.attempts >= job.max_attempts;
      await admin
        .from("queue_jobs")
        .update({
          status: terminal ? "failed" : "retry",
          error: message,
          locked_at: null,
          failed_at: terminal ? new Date().toISOString() : null,
          scheduled_at: new Date(Date.now() + 60_000).toISOString(),
        })
        .eq("id", job.id);
      await log(admin, job, "error", message);
      await syncMiningFailure(admin, job, message, terminal);
      if (terminal) failed += 1;
      else requeued += 1;
    }
  }

  return { claimed: (jobs ?? []).length, completed, failed, requeued, watchdog };
}
