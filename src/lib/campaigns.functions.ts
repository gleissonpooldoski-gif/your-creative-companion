/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LooseClient = { from: (table: string) => any };

async function requireWorkspace(supabase: LooseClient, userId: string) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Workspace não encontrado.");
  const role = String(data.role);
  if (!["owner", "admin", "manager", "operator"].includes(role)) {
    throw new Error("Permissão insuficiente para operar campanhas.");
  }
  return { workspaceId: data.workspace_id as string, role };
}

async function audit(supabase: LooseClient, workspaceId: string, userId: string, action: string, resource: string, result: string) {
  await supabase.from("audit_logs").insert({ workspace_id: workspaceId, user_id: userId, action, resource, result });
}

/** Attaches mined groups to a campaign as destinations. Never duplicates a group. */
export const attachGroupsToCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ campaignId: z.string().uuid(), groupIds: z.array(z.string().uuid()).min(1).max(500) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { workspaceId } = await requireWorkspace(supabase, context.userId);

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id")
      .eq("id", data.campaignId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!campaign) throw new Error("Campanha não encontrada neste workspace.");

    const { data: groups } = await supabase
      .from("groups")
      .select("id, username, canonical_identifier, status")
      .eq("workspace_id", workspaceId)
      .in("id", data.groupIds);

    let added = 0;
    let skipped = 0;
    for (const group of groups ?? []) {
      if (group.status === "blocked" || group.status === "invalid") {
        skipped += 1;
        continue;
      }
      const { error } = await supabase.from("campaign_destinations").insert({
        workspace_id: workspaceId,
        campaign_id: data.campaignId,
        group_id: group.id,
        destination: group.username ? `@${group.username}` : group.canonical_identifier,
        authorized: true,
        status: "pending",
      });
      if (error) skipped += 1;
      else {
        added += 1;
        await audit(supabase, workspaceId, context.userId, "destination_added", `campaign_destinations:${group.id}`, "ok");
      }
    }
    return { ok: true as const, added, skipped };
  });

export const createCampaignFromGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        name: z.string().min(2).max(120),
        message: z.string().min(2).max(4000),
        link: z.string().max(400).optional(),
        network: z.string().max(20).optional(),
        scheduledAt: z.string().max(40).nullable().optional(),
        messagesPerHour: z.number().int().min(1).max(600).optional(),
        dailyCapPerAccount: z.number().int().min(1).max(2000).optional(),
        groupIds: z.array(z.string().uuid()).max(500).optional(),
        accountIds: z.array(z.string().uuid()).max(100).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { workspaceId } = await requireWorkspace(supabase, context.userId);

    const { data: campaign, error } = await supabase
      .from("campaigns")
      .insert({
        workspace_id: workspaceId,
        name: data.name,
        message: data.message,
        link: data.link ?? null,
        network: data.network ?? "group",
        status: "draft",
        scheduled_at: data.scheduledAt ?? null,
        messages_per_hour: data.messagesPerHour ?? 30,
        daily_cap_per_account: data.dailyCapPerAccount ?? 50,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    for (const accountId of data.accountIds ?? []) {
      const { data: account } = await supabase
        .from("telegram_accounts")
        .select("id")
        .eq("id", accountId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (!account) continue;
      await supabase
        .from("campaign_accounts")
        .insert({ workspace_id: workspaceId, campaign_id: campaign.id, account_id: accountId });
    }

    let added = 0;
    for (const groupId of data.groupIds ?? []) {
      const { data: group } = await supabase
        .from("groups")
        .select("id, username, canonical_identifier, status")
        .eq("id", groupId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (!group || group.status === "blocked" || group.status === "invalid") continue;
      const { error: destError } = await supabase.from("campaign_destinations").insert({
        workspace_id: workspaceId,
        campaign_id: campaign.id,
        group_id: group.id,
        destination: group.username ? `@${group.username}` : group.canonical_identifier,
        authorized: true,
        status: "pending",
      });
      if (!destError) added += 1;
    }

    await audit(supabase, workspaceId, context.userId, "campaign_created", `campaigns:${campaign.id}`, `destinos:${added}`);
    return { ok: true as const, campaignId: campaign.id as string, destinations: added };
  });

export const startCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ campaignId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { workspaceId } = await requireWorkspace(supabase, context.userId);

    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, status, message")
      .eq("id", data.campaignId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!campaign) throw new Error("Campanha não encontrada neste workspace.");
    if (!campaign.message) throw new Error("Defina a mensagem da campanha antes de iniciar.");

    const { count: destinations } = await supabase
      .from("campaign_destinations")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("campaign_id", campaign.id);
    if (!destinations) throw new Error("A campanha não possui destinos vinculados.");

    const { data: accounts } = await supabase
      .from("campaign_accounts")
      .select("account_id, telegram_accounts(id, status, paused)")
      .eq("workspace_id", workspaceId)
      .eq("campaign_id", campaign.id);
    const usable = (accounts ?? []).filter(
      (link: any) => link.telegram_accounts && link.telegram_accounts.status === "online" && !link.telegram_accounts.paused,
    );
    if (usable.length === 0) throw new Error("Nenhuma conta Telegram autorizada e online vinculada à campanha.");

    await supabase.from("campaigns").update({ status: "running" }).eq("id", campaign.id).eq("workspace_id", workspaceId);
    const { error } = await supabase.from("queue_jobs").insert({
      workspace_id: workspaceId,
      kind: "campaign_dispatch",
      campaign_id: campaign.id,
      priority: 1,
      payload: { campaign_id: campaign.id },
    });
    if (error) throw new Error(error.message);

    await audit(supabase, workspaceId, context.userId, "campaign_resumed", `campaigns:${campaign.id}`, "running");
    return { ok: true as const, destinations, accounts: usable.length };
  });

export const setCampaignPaused = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ campaignId: z.string().uuid(), paused: z.boolean() }).parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { workspaceId } = await requireWorkspace(supabase, context.userId);

    if (data.paused) {
      await supabase
        .from("campaigns")
        .update({ status: "paused" })
        .eq("id", data.campaignId)
        .eq("workspace_id", workspaceId);
      // Pending jobs stay in the queue but are cancelled for this run; destinations are preserved.
      await supabase
        .from("queue_jobs")
        .update({ status: "cancelled", error: "campanha pausada pelo operador" })
        .eq("workspace_id", workspaceId)
        .eq("campaign_id", data.campaignId)
        .in("status", ["pending", "retry"]);
      await audit(supabase, workspaceId, context.userId, "campaign_paused", `campaigns:${data.campaignId}`, "paused");
      return { ok: true as const, status: "paused" };
    }

    await supabase.from("campaigns").update({ status: "running" }).eq("id", data.campaignId).eq("workspace_id", workspaceId);
    await supabase.from("queue_jobs").insert({
      workspace_id: workspaceId,
      kind: "campaign_dispatch",
      campaign_id: data.campaignId,
      priority: 1,
      payload: { campaign_id: data.campaignId },
    });
    await audit(supabase, workspaceId, context.userId, "campaign_resumed", `campaigns:${data.campaignId}`, "running");
    return { ok: true as const, status: "running" };
  });

export const getCampaignMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ campaignId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { workspaceId } = await requireWorkspace(supabase, context.userId);

    const countDestinations = async (status?: string) => {
      let query = supabase
        .from("campaign_destinations")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("campaign_id", data.campaignId);
      if (status) query = query.eq("status", status);
      const { count } = await query;
      return count ?? 0;
    };

    const [total, completed, failed, pending, processing] = await Promise.all([
      countDestinations(),
      countDestinations("completed"),
      countDestinations("failed"),
      countDestinations("pending"),
      countDestinations("processing"),
    ]);

    const [{ data: lastJob }, { data: nextJob }] = await Promise.all([
      supabase
        .from("queue_jobs")
        .select("completed_at, failed_at")
        .eq("workspace_id", workspaceId)
        .eq("campaign_id", data.campaignId)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("queue_jobs")
        .select("scheduled_at")
        .eq("workspace_id", workspaceId)
        .eq("campaign_id", data.campaignId)
        .in("status", ["pending", "retry"])
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    const processed = completed + failed;
    return {
      total,
      processed,
      completed,
      failed,
      pending,
      processing,
      successRate: processed > 0 ? Math.round((completed / processed) * 1000) / 10 : 0,
      lastProcessedAt: lastJob?.completed_at ?? null,
      nextProcessingAt: nextJob?.scheduled_at ?? null,
    };
  });

export const listCampaignAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { workspaceId } = await requireWorkspace(supabase, context.userId);
    const { data, error } = await supabase
      .from("telegram_accounts")
      .select("id, name, username, kind, status, paused")
      .eq("workspace_id", workspaceId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { accounts: (data ?? []) as any[] };
  });
