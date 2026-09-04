/* eslint-disable @typescript-eslint/no-explicit-any */
// Campaign execution: dispatch scheduler + per-destination send through TelegramProvider.
// Server-only. A destination is only "completed" after the provider confirms.

import { createTelegramProvider } from "@/lib/providers/telegram-provider.server";

type Admin = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };

async function audit(admin: Admin, workspaceId: string, action: string, resource: string, result: string) {
  await admin.from("audit_logs").insert({ workspace_id: workspaceId, action, resource, result });
}

async function refreshCounters(admin: Admin, workspaceId: string, campaignId: string) {
  const count = async (status: string) => {
    const { count: value } = await admin
      .from("campaign_destinations")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("campaign_id", campaignId)
      .eq("status", status);
    return value ?? 0;
  };
  const [posted, failed, pending, processing] = await Promise.all([
    count("completed"),
    count("failed"),
    count("pending"),
    count("processing"),
  ]);
  await admin
    .from("campaigns")
    .update({
      posted_count: posted,
      failed_count: failed,
      status: pending + processing === 0 ? "finished" : undefined,
    })
    .eq("id", campaignId)
    .eq("workspace_id", workspaceId);
  return { posted, failed, pending, processing };
}

/** Creates one send job per pending destination, respecting pace and account availability. */
export async function dispatchCampaign(
  admin: Admin,
  input: { workspaceId: string; campaignId: string },
): Promise<{ ok: boolean; message: string }> {
  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, status, message, link, messages_per_hour, daily_cap_per_account")
    .eq("id", input.campaignId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();
  if (!campaign) return { ok: false, message: "campanha não encontrada" };
  if (campaign.status !== "running") return { ok: true, message: `campanha em status ${campaign.status} — nada despachado` };
  if (!campaign.message) return { ok: false, message: "campanha sem mensagem definida" };

  const { data: accountLinks } = await admin
    .from("campaign_accounts")
    .select("account_id, telegram_accounts(id, name, status, paused)")
    .eq("workspace_id", input.workspaceId)
    .eq("campaign_id", campaign.id);

  const accounts = (accountLinks ?? [])
    .map((link: any) => link.telegram_accounts)
    .filter((account: any) => account && account.status === "online" && !account.paused);

  if (accounts.length === 0) {
    return { ok: false, message: "Nenhuma conta autorizada online para executar a campanha." };
  }

  const perRun = Math.max(1, Math.min(20, Math.floor(Number(campaign.messages_per_hour ?? 30) / 6)));
  const { data: destinations } = await admin
    .from("campaign_destinations")
    .select("id, group_id, destination, authorized")
    .eq("workspace_id", input.workspaceId)
    .eq("campaign_id", campaign.id)
    .eq("status", "pending")
    .limit(perRun);

  let queued = 0;
  let index = 0;
  for (const destination of destinations ?? []) {
    const account = accounts[index % accounts.length];
    index += 1;
    const { error } = await admin.from("queue_jobs").insert({
      workspace_id: input.workspaceId,
      kind: "campaign_send",
      campaign_id: campaign.id,
      destination_id: destination.id,
      account_id: account.id,
      payload: { campaign_id: campaign.id, destination_id: destination.id, account_id: account.id },
      idempotency_key: `campaign_send:${destination.id}`,
      scheduled_at: new Date(Date.now() + queued * Math.floor(3_600_000 / Math.max(1, Number(campaign.messages_per_hour ?? 30)))).toISOString(),
    });
    if (error) continue; // idempotency conflict: job already exists
    await admin.from("campaign_destinations").update({ status: "processing" }).eq("id", destination.id);
    await audit(admin, input.workspaceId, "job_created", `campaign_destinations:${destination.id}`, "queued");
    queued += 1;
  }

  const counters = await refreshCounters(admin, input.workspaceId, campaign.id);
  if (counters.pending > 0) {
    await admin.from("queue_jobs").insert({
      workspace_id: input.workspaceId,
      kind: "campaign_dispatch",
      campaign_id: campaign.id,
      payload: { campaign_id: campaign.id },
      scheduled_at: new Date(Date.now() + 5 * 60_000).toISOString(),
    });
  }

  return { ok: true, message: `destinos enfileirados: ${queued}; pendentes restantes: ${counters.pending}` };
}

export async function sendCampaignDestination(
  admin: Admin,
  input: { workspaceId: string; campaignId: string; destinationId: string; accountId: string },
): Promise<{ ok: boolean; message: string }> {
  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, status, message, link")
    .eq("id", input.campaignId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();
  if (!campaign) return { ok: false, message: "campanha não encontrada" };
  if (campaign.status === "paused" || campaign.status === "cancelled") {
    await admin.from("campaign_destinations").update({ status: "pending" }).eq("id", input.destinationId);
    return { ok: true, message: "campanha pausada — destino devolvido à fila" };
  }

  const { data: destination } = await admin
    .from("campaign_destinations")
    .select("id, status, destination, group_id, groups(username, telegram_id, status, is_valid)")
    .eq("id", input.destinationId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();
  if (!destination) return { ok: false, message: "destino não encontrado" };
  if (destination.status === "completed") return { ok: true, message: "destino já processado (idempotente)" };

  const group = (destination as any).groups;
  if (group && (group.status === "blocked" || group.status === "invalid")) {
    await admin
      .from("campaign_destinations")
      .update({ status: "failed", last_result: `grupo ${group.status}`, last_attempt_at: new Date().toISOString() })
      .eq("id", destination.id);
    await refreshCounters(admin, input.workspaceId, campaign.id);
    return { ok: true, message: `destino ignorado: grupo ${group.status}` };
  }

  const chatId = group?.telegram_id ?? (group?.username ? `@${group.username}` : destination.destination);
  if (!chatId) return { ok: false, message: "destino sem identificador de chat" };

  const { data: account } = await admin
    .from("telegram_accounts")
    .select("id, name, status, paused")
    .eq("id", input.accountId)
    .eq("workspace_id", input.workspaceId)
    .maybeSingle();
  if (!account || account.paused || account.status !== "online") {
    await admin.from("campaign_destinations").update({ status: "pending" }).eq("id", destination.id);
    return { ok: false, message: "conta indisponível — destino devolvido à fila" };
  }

  const { data: creds } = await admin
    .from("telegram_credentials")
    .select("bot_token")
    .eq("account_id", account.id)
    .maybeSingle();
  const provider = createTelegramProvider(creds?.bot_token);
  if (!provider) {
    await admin
      .from("campaign_destinations")
      .update({ status: "failed", last_result: "Integração pendente: conta sem credencial de execução", last_attempt_at: new Date().toISOString() })
      .eq("id", destination.id);
    await refreshCounters(admin, input.workspaceId, campaign.id);
    return { ok: true, message: "Integração pendente: conta sem credencial de execução" };
  }

  const text = campaign.link ? `${campaign.message}\n\n${campaign.link}` : String(campaign.message);
  const result = await provider.sendMessage({ chatId: String(chatId), text });
  const now = new Date().toISOString();

  if (result.ok) {
    await admin
      .from("campaign_destinations")
      .update({ status: "completed", last_result: `ok:${result.messageId}`, last_attempt_at: now })
      .eq("id", destination.id);
    await admin.from("telegram_accounts").update({ last_activity_at: now }).eq("id", account.id);
    await audit(admin, input.workspaceId, "job_processed", `campaign_destinations:${destination.id}`, "completed");
    await refreshCounters(admin, input.workspaceId, campaign.id);
    return { ok: true, message: `enviado para ${chatId} (message_id ${result.messageId})` };
  }

  const structured = JSON.stringify({ code: result.error.code, message: result.error.message, retryable: result.error.retryable });
  await admin
    .from("campaign_destinations")
    .update({ status: result.error.retryable ? "pending" : "failed", last_result: structured, last_attempt_at: now })
    .eq("id", destination.id);
  await audit(admin, input.workspaceId, "job_failed", `campaign_destinations:${destination.id}`, result.error.code);
  await refreshCounters(admin, input.workspaceId, campaign.id);

  if (result.error.retryable) return { ok: false, message: structured };
  return { ok: true, message: `destino falhou definitivamente: ${structured}` };
}
