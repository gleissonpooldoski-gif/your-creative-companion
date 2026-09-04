/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeGroupReference } from "@/lib/groups/normalize";

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
    throw new Error("Permissão insuficiente para operar mineração.");
  }
  return { workspaceId: data.workspace_id as string, role };
}

const startInput = z.object({
  keywords: z.array(z.string().min(2).max(60)).min(1).max(50),
  categories: z.array(z.string().min(2).max(40)).max(20).optional(),
  seedReferences: z.array(z.string().min(2).max(200)).max(100).optional(),
});

export const startMining = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => startInput.parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { workspaceId } = await requireWorkspace(supabase, context.userId);

    const keywords = Array.from(new Set(data.keywords.map((k) => k.trim().toLowerCase()).filter(Boolean)));
    if (keywords.length === 0) throw new Error("Informe ao menos uma palavra-chave.");

    const { data: job, error } = await supabase
      .from("group_mining_jobs")
      .insert({ workspace_id: workspaceId, keywords, categories: data.categories ?? [], status: "pending" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    const { error: queueError } = await supabase.from("queue_jobs").insert({
      workspace_id: workspaceId,
      kind: "group_mining",
      priority: 1,
      payload: {
        mining_job_id: job.id,
        ...(data.seedReferences?.length ? { seed_references: data.seedReferences } : {}),
      },
      idempotency_key: `group_mining:${job.id}`,
    });
    if (queueError) throw new Error(queueError.message);

    await supabase.from("audit_logs").insert({
      workspace_id: workspaceId,
      user_id: context.userId,
      action: "mining_started",
      resource: `group_mining_jobs:${job.id}`,
      result: "queued",
    });

    return { ok: true as const, jobId: job.id as string };
  });

export const getMiningStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { workspaceId } = await requireWorkspace(supabase, context.userId);
    const [{ data: jobs }, totals, available, keywordCount] = await Promise.all([
      supabase
        .from("group_mining_jobs")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase.from("groups").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      supabase
        .from("groups")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("status", "validated"),
      supabase.from("group_keywords").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
    ]);
    return {
      jobs: (jobs ?? []) as any[],
      totalGroups: (totals as any).count ?? 0,
      availableGroups: (available as any).count ?? 0,
      keywords: (keywordCount as any).count ?? 0,
      providerConfigured: Boolean(process.env["GROUP_DIRECTORY_API_URL"] && process.env["GROUP_DIRECTORY_API_KEY"]),
      missingProviderEnv: [
        process.env["GROUP_DIRECTORY_API_URL"] ? null : "GROUP_DIRECTORY_API_URL",
        process.env["GROUP_DIRECTORY_API_KEY"] ? null : "GROUP_DIRECTORY_API_KEY",
      ].filter(Boolean) as string[],
    };
  });

const filterInput = z.object({
  search: z.string().max(120).optional(),
  category: z.string().max(40).optional(),
  keyword: z.string().max(60).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
  status: z.string().max(20).optional(),
  source: z.string().max(40).optional(),
  since: z.string().max(40).optional(),
  onlyValid: z.boolean().optional(),
  onlyNew: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export const listGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => filterInput.parse(raw ?? {}))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { workspaceId } = await requireWorkspace(supabase, context.userId);
    let query = supabase
      .from("groups")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("score", { ascending: false })
      .range(data.offset ?? 0, (data.offset ?? 0) + (data.limit ?? 50) - 1);

    if (data.search) query = query.or(`title.ilike.%${data.search}%,username.ilike.%${data.search}%`);
    if (data.category) query = query.eq("category", data.category);
    if (data.keyword) query = query.contains("keywords", [data.keyword.toLowerCase()]);
    if (typeof data.minScore === "number") query = query.gte("score", data.minScore);
    if (data.status) query = query.eq("status", data.status);
    if (data.source) query = query.eq("source", data.source);
    if (data.since) query = query.gte("first_seen_at", data.since);
    if (data.onlyValid) query = query.eq("is_valid", true);
    if (data.onlyNew) query = query.eq("status", "new");

    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as any[], count: count ?? 0 };
  });

export const updateGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        category: z.string().max(40).nullable().optional(),
        status: z.enum(["new", "validated", "invalid", "archived", "blocked"]).optional(),
        keywords: z.array(z.string().max(60)).max(50).optional(),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { workspaceId } = await requireWorkspace(supabase, context.userId);
    const values: Record<string, unknown> = {};
    if (data.category !== undefined) values["category"] = data.category;
    if (data.status !== undefined) values["status"] = data.status;
    if (data.keywords !== undefined) values["keywords"] = data.keywords.map((k) => k.toLowerCase());
    const { data: row, error } = await supabase
      .from("groups")
      .update(values)
      .eq("id", data.id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      workspace_id: workspaceId,
      user_id: context.userId,
      action: "group_updated",
      resource: `groups:${data.id}`,
      result: "ok",
    });
    return row as any;
  });

/** Revalidates a single group against the public Telegram preview page, right away. */
export const revalidateGroup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ id: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { workspaceId } = await requireWorkspace(supabase, context.userId);
    const { data: group } = await supabase
      .from("groups")
      .select("id, canonical_identifier, username, invite_link, keywords, category, member_count")
      .eq("id", data.id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (!group) throw new Error("Grupo não encontrado neste workspace.");

    const { validatePublicTelegramGroup } = await import("@/lib/providers/group-discovery.server");
    const { computeGroupScore } = await import("@/lib/groups/normalize");
    const reference = group.username ?? group.invite_link ?? group.canonical_identifier;
    const validation = await validatePublicTelegramGroup(String(reference));
    const now = new Date().toISOString();
    const { score } = computeGroupScore({
      title: validation.title ?? null,
      description: validation.description ?? null,
      keywords: group.keywords ?? [],
      category: group.category,
      requestedCategories: group.category ? [group.category] : [],
      memberCount: validation.memberCount ?? group.member_count,
      isValid: validation.valid,
      lastSeenAt: now,
    });

    const { data: row, error } = await supabase
      .from("groups")
      .update({
        is_valid: validation.valid,
        status: validation.valid ? "validated" : "invalid",
        title: validation.title ?? undefined,
        description: validation.description ?? undefined,
        member_count: validation.memberCount ?? group.member_count,
        score,
        last_validated_at: now,
        last_seen_at: now,
      })
      .eq("id", group.id)
      .eq("workspace_id", workspaceId)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await supabase.from("audit_logs").insert({
      workspace_id: workspaceId,
      user_id: context.userId,
      action: "group_validated",
      resource: `groups:${group.id}`,
      result: validation.valid ? "valid" : validation.code ?? "invalid",
    });
    return { ok: true as const, group: row as any, validation };
  });

/** Radar: enable/disable continuous mining and run it right now. */
export const configureRadar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        enabled: z.boolean(),
        intervalMinutes: z.number().int().min(30).max(10_080),
        keywords: z.array(z.string().min(2).max(60)).max(50),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase as unknown as LooseClient;
    const { workspaceId } = await requireWorkspace(supabase, context.userId);
    const { error } = await supabase
      .from("workspace_settings")
      .update({
        radar_enabled: data.enabled,
        radar_interval_minutes: data.intervalMinutes,
        radar_keywords: data.keywords.map((k) => k.toLowerCase()),
      })
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** Accepts pasted references (links/@usernames) and normalizes them before mining. */
export const normalizeReferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ raw: z.string().max(20_000) }).parse(raw))
  .handler(async ({ data }) => {
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const line of data.raw.split(/[\s,]+/)) {
      if (!line.trim()) continue;
      const normalized = normalizeGroupReference(line);
      if (normalized) valid.push(normalized.canonicalIdentifier);
      else invalid.push(line.trim());
    }
    return { valid: Array.from(new Set(valid)), invalid };
  });
