/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isResourceTable } from "./tables";

type LooseClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

export type WorkspaceContext = {
  workspaceId: string;
  workspaceName: string;
  role: string;
  globalPause: boolean;
  demoMode: boolean;
  profileName: string;
  email: string;
  onboardingDone: boolean;
  settings: {
    messages_per_hour: number;
    daily_cap_per_account: number;
    niche: string | null;
    telegram_configured: boolean;
    instagram_configured: boolean;
    payments_configured: boolean;
  } | null;
};

async function resolveWorkspace(supabase: LooseClient, userId: string) {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("workspace_id, role, workspaces(id, name, global_pause, demo_mode)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Nenhum workspace encontrado para este usuário.");
  return data as any;
}

export const getWorkspaceContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WorkspaceContext> => {
    const supabase = context.supabase as unknown as LooseClient;
    const member = await resolveWorkspace(supabase, context.userId);
    const [{ data: profile }, { data: settings }] = await Promise.all([
      supabase.from("profiles").select("full_name, email, onboarding_done").eq("id", context.userId).maybeSingle(),
      supabase.from("workspace_settings").select("*").eq("workspace_id", member.workspace_id).maybeSingle(),
    ]);
    return {
      workspaceId: member.workspace_id,
      workspaceName: member.workspaces?.name ?? "Workspace",
      role: member.role,
      globalPause: Boolean(member.workspaces?.global_pause),
      demoMode: Boolean(member.workspaces?.demo_mode),
      profileName: profile?.full_name ?? profile?.email ?? "Operador",
      email: profile?.email ?? "",
      onboardingDone: Boolean(profile?.onboarding_done),
      settings: settings ?? null,
    };
  });

const listInput = z.object({
  table: z.string(),
  select: z.string().optional(),
  orderBy: z.string().optional(),
  ascending: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
  eq: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  search: z.object({ column: z.string(), value: z.string() }).optional(),
});

export const listResource = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => listInput.parse(raw))
  .handler(async ({ data, context }) => {
    if (!isResourceTable(data.table)) throw new Error(`Tabela não permitida: ${data.table}`);
    const supabase = context.supabase as unknown as LooseClient;
    const member = await resolveWorkspace(supabase, context.userId);
    let query = supabase
      .from(data.table)
      .select(data.select ?? "*", { count: "exact" })
      .eq("workspace_id", member.workspace_id)
      .order(data.orderBy ?? "created_at", { ascending: data.ascending ?? false })
      .range(data.offset ?? 0, (data.offset ?? 0) + (data.limit ?? 50) - 1);
    for (const [column, value] of Object.entries(data.eq ?? {})) {
      query = query.eq(column, value);
    }
    if (data.search?.value) {
      query = query.ilike(data.search.column, `%${data.search.value}%`);
    }
    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as any[], count: count ?? 0 };
  });

export const createResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ table: z.string(), values: z.record(z.string(), z.any()) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    if (!isResourceTable(data.table)) throw new Error(`Tabela não permitida: ${data.table}`);
    const supabase = context.supabase as unknown as LooseClient;
    const member = await resolveWorkspace(supabase, context.userId);
    const { data: row, error } = await supabase
      .from(data.table)
      .insert({ ...data.values, workspace_id: member.workspace_id })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      workspace_id: member.workspace_id,
      user_id: context.userId,
      action: "create",
      resource: data.table,
      result: "ok",
    });
    return row as any;
  });

export const updateResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ table: z.string(), id: z.string().uuid(), values: z.record(z.string(), z.any()) }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    if (!isResourceTable(data.table)) throw new Error(`Tabela não permitida: ${data.table}`);
    const supabase = context.supabase as unknown as LooseClient;
    const member = await resolveWorkspace(supabase, context.userId);
    const values = { ...data.values };
    delete values["workspace_id"];
    delete values["id"];
    const { data: row, error } = await supabase
      .from(data.table)
      .update(values)
      .eq("id", data.id)
      .eq("workspace_id", member.workspace_id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      workspace_id: member.workspace_id,
      user_id: context.userId,
      action: "update",
      resource: `${data.table}:${data.id}`,
      result: "ok",
    });
    return row as any;
  });

export const deleteResource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ table: z.string(), id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    if (!isResourceTable(data.table)) throw new Error(`Tabela não permitida: ${data.table}`);
    const supabase = context.supabase as unknown as LooseClient;
    const member = await resolveWorkspace(supabase, context.userId);
    const { error } = await supabase
      .from(data.table)
      .delete()
      .eq("id", data.id)
      .eq("workspace_id", member.workspace_id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      workspace_id: member.workspace_id,
      user_id: context.userId,
      action: "delete",
      resource: `${data.table}:${data.id}`,
      result: "ok",
    });
    return { ok: true };
  });

async function countRows(
  supabase: LooseClient,
  table: string,
  workspaceId: string,
  filters: Record<string, unknown> = {},
  since?: string,
) {
  let query = supabase.from(table).select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
  for (const [column, value] of Object.entries(filters)) query = query.eq(column, value);
  if (since) query = query.gte("created_at", since);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export const getOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const member = await resolveWorkspace(supabase, context.userId);
    const ws = member.workspace_id as string;
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const today = startOfDay.toISOString();

    const [
      accountsTotal,
      accountsOnline,
      accountsFailed,
      accountsChecking,
      accountsPending,
      campaignsActive,
      campaignsTotal,
      botsActive,
      contacts,
      leads,
      igAccounts,
      igPublishedToday,
      queuePending,
      queueProcessing,
      queueFailed,
      prospectQueue,
      prospectSentToday,
      groupsJoined,
      groupMirrors,
      transactionsTotal,
    ] = await Promise.all([
      countRows(supabase, "telegram_accounts", ws),
      countRows(supabase, "telegram_accounts", ws, { status: "online" }),
      countRows(supabase, "telegram_accounts", ws, { status: "failed" }),
      countRows(supabase, "telegram_accounts", ws, { status: "checking" }),
      countRows(supabase, "telegram_accounts", ws, { status: "pending_auth" }),
      countRows(supabase, "campaigns", ws, { status: "running" }),
      countRows(supabase, "campaigns", ws),
      countRows(supabase, "bots", ws, { status: "active" }),
      countRows(supabase, "contacts", ws),
      countRows(supabase, "leads", ws),
      countRows(supabase, "instagram_accounts", ws),
      countRows(supabase, "instagram_posts", ws, { status: "published" }, today),
      countRows(supabase, "queue_jobs", ws, { status: "pending" }),
      countRows(supabase, "queue_jobs", ws, { status: "processing" }),
      countRows(supabase, "queue_jobs", ws, { status: "failed" }),
      countRows(supabase, "prospecting_queue", ws, { status: "pending" }),
      countRows(supabase, "prospecting_queue", ws, { status: "sent" }, today),
      countRows(supabase, "group_memberships", ws, { status: "joined" }),
      countRows(supabase, "group_mirrors", ws),
      countRows(supabase, "transactions", ws),
    ]);

    const { data: wallet } = await supabase
      .from("wallets")
      .select("balance, total_in, total_out, pending")
      .eq("workspace_id", ws)
      .maybeSingle();

    const { data: settings } = await supabase
      .from("workspace_settings")
      .select("telegram_configured, instagram_configured, payments_configured")
      .eq("workspace_id", ws)
      .maybeSingle();

    const { data: creditedToday } = await supabase
      .from("transactions")
      .select("amount")
      .eq("workspace_id", ws)
      .eq("status", "paid")
      .gte("created_at", today);

    const { data: campaigns } = await supabase
      .from("campaigns")
      .select("id, name, network, posted_count, next_run_at, status")
      .eq("workspace_id", ws)
      .order("created_at", { ascending: false })
      .limit(8);

    const { data: activities } = await supabase
      .from("activities")
      .select("id, kind, content, created_at")
      .eq("workspace_id", ws)
      .order("created_at", { ascending: false })
      .limit(8);

    return {
      accounts: {
        total: accountsTotal,
        online: accountsOnline,
        failed: accountsFailed,
        checking: accountsChecking,
        pending: accountsPending,
      },
      campaigns: { total: campaignsTotal, running: campaignsActive },
      campaignsActive,
      botsActive,
      crm: { contacts, leads },
      contacts,
      leads,
      groups: { joined: groupsJoined, mirrors: groupMirrors },
      instagram: { accounts: igAccounts, publishedToday: igPublishedToday },
      queue: { pending: queuePending, processing: queueProcessing, failed: queueFailed },
      prospecting: { queued: prospectQueue, sentToday: prospectSentToday },
      wallet: {
        ...(wallet ?? { balance: 0, total_in: 0, total_out: 0, pending: 0 }),
        transactions: transactionsTotal,
      },
      integrations: {
        telegram: Boolean((settings as any)?.telegram_configured),
        instagram: Boolean((settings as any)?.instagram_configured),
        payments: Boolean((settings as any)?.payments_configured),
        ai: true,
      },
      creditedToday: (creditedToday ?? []).reduce((sum: number, t: any) => sum + Number(t.amount ?? 0), 0),
      recentCampaigns: (campaigns ?? []) as any[],
      recentActivities: ((activities ?? []) as any[]).map((a) => ({
        id: a.id,
        kind: a.kind,
        summary: a.content ?? a.kind,
      })),
    };
  });


export const setGlobalPause = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ paused: z.boolean() }).parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const member = await resolveWorkspace(supabase, context.userId);
    const { error } = await supabase
      .from("workspaces")
      .update({ global_pause: data.paused })
      .eq("id", member.workspace_id);
    if (error) throw new Error(error.message);
    await supabase.from("system_logs").insert({
      workspace_id: member.workspace_id,
      scope: "operations",
      level: "warn",
      message: data.paused ? "Pausa global ativada" : "Pausa global desativada",
    });
    return { paused: data.paused };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        messages_per_hour: z.number().int().min(1).max(10000).optional(),
        daily_cap_per_account: z.number().int().min(1).max(10000).optional(),
        niche: z.string().max(500).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const member = await resolveWorkspace(supabase, context.userId);
    const { error } = await supabase
      .from("workspace_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("workspace_id", member.workspace_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const completeOnboarding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { error } = await supabase
      .from("profiles")
      .update({ onboarding_done: true })
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const enqueueJob = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        kind: z.string().min(2).max(64),
        payload: z.record(z.string(), z.any()).optional(),
        idempotencyKey: z.string().max(200).optional(),
        priority: z.number().int().min(1).max(1000).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const member = await resolveWorkspace(supabase, context.userId);
    const { data: row, error } = await supabase
      .from("queue_jobs")
      .upsert(
        {
          workspace_id: member.workspace_id,
          kind: data.kind,
          payload: data.payload ?? {},
          priority: data.priority ?? 100,
          idempotency_key: data.idempotencyKey ?? `${data.kind}:${Date.now()}`,
        },
        { onConflict: "workspace_id,idempotency_key", ignoreDuplicates: true },
      )
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { job: row as any };
  });

export const syncEverything = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const member = await resolveWorkspace(supabase, context.userId);
    const stamp = Date.now();
    const kinds = ["sync_accounts", "sync_conversations", "sync_groups", "sync_contacts", "recompute_metrics"];
    const rows = kinds.map((kind) => ({
      workspace_id: member.workspace_id,
      kind,
      payload: {},
      idempotency_key: `${kind}:${stamp}`,
    }));
    const { error } = await supabase.from("queue_jobs").insert(rows);
    if (error) throw new Error(error.message);
    return { enqueued: rows.length };
  });

export const getQueueStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const member = await resolveWorkspace(supabase, context.userId);
    const ws = member.workspace_id as string;
    const statuses = ["pending", "processing", "completed", "failed", "retry", "cancelled"];
    const counts: Record<string, number> = {};
    await Promise.all(
      statuses.map(async (status) => {
        counts[status] = await countRows(supabase, "queue_jobs", ws, { status });
      }),
    );
    const { data: stuck } = await supabase
      .from("queue_jobs")
      .select("id")
      .eq("workspace_id", ws)
      .eq("status", "processing")
      .lt("locked_at", new Date(Date.now() - 5 * 60_000).toISOString());
    return { counts, stuck: (stuck ?? []).length };
  });

export const globalSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ term: z.string().min(1).max(120) }).parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const member = await resolveWorkspace(supabase, context.userId);
    const ws = member.workspace_id as string;
    const term = `%${data.term}%`;
    const targets: Array<{ table: string; column: string; label: string; path: string }> = [
      { table: "campaigns", column: "name", label: "Campanha", path: "/campaigns" },
      { table: "telegram_accounts", column: "name", label: "Conta", path: "/accounts" },
      { table: "contacts", column: "name", label: "Contato", path: "/crm" },
      { table: "group_sources", column: "name", label: "Grupo", path: "/groups/mining" },
      { table: "bots", column: "name", label: "Bot", path: "/bots" },
      { table: "ai_agents", column: "name", label: "Agente IA", path: "/ai" },
      { table: "personas", column: "name", label: "Persona", path: "/persona" },
    ];
    const results = await Promise.all(
      targets.map(async (t) => {
        const { data: rows } = await supabase
          .from(t.table)
          .select(`id, ${t.column}`)
          .eq("workspace_id", ws)
          .ilike(t.column, term)
          .limit(5);
        return (rows ?? []).map((row: any) => ({
          id: row.id as string,
          title: (row[t.column] as string) ?? "(sem nome)",
          label: t.label,
          path: t.path,
        }));
      }),
    );
    return { results: results.flat() };
  });
