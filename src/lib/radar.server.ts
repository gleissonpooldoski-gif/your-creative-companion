/* eslint-disable @typescript-eslint/no-explicit-any */
// Radar: continuous mining scheduler. Creates one mining job per workspace whose
// radar interval has elapsed. Never fabricates groups — it only enqueues work.

type Admin = { from: (t: string) => any };

export async function scheduleRadar(): Promise<{ scheduled: number; skipped: number }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const admin = supabaseAdmin as unknown as Admin;

  const { data: settings } = await admin
    .from("workspace_settings")
    .select("workspace_id, radar_enabled, radar_interval_minutes, radar_keywords, radar_last_run_at")
    .eq("radar_enabled", true)
    .limit(200);

  let scheduled = 0;
  let skipped = 0;

  for (const row of settings ?? []) {
    const keywords: string[] = row.radar_keywords ?? [];
    if (keywords.length === 0) {
      skipped += 1;
      continue;
    }
    const interval = Math.max(30, Number(row.radar_interval_minutes ?? 720));
    const last = row.radar_last_run_at ? new Date(row.radar_last_run_at).getTime() : 0;
    if (Date.now() - last < interval * 60_000) {
      skipped += 1;
      continue;
    }

    const { data: paused } = await admin
      .from("workspaces")
      .select("global_pause")
      .eq("id", row.workspace_id)
      .maybeSingle();
    if (paused?.global_pause) {
      skipped += 1;
      continue;
    }

    const { data: job, error } = await admin
      .from("group_mining_jobs")
      .insert({ workspace_id: row.workspace_id, keywords, categories: [], status: "pending" })
      .select("id")
      .single();
    if (error || !job) {
      skipped += 1;
      continue;
    }

    await admin.from("queue_jobs").insert({
      workspace_id: row.workspace_id,
      kind: "group_mining",
      priority: 5,
      payload: { mining_job_id: job.id },
      idempotency_key: `group_mining:${job.id}`,
    });
    await admin
      .from("workspace_settings")
      .update({ radar_last_run_at: new Date().toISOString() })
      .eq("workspace_id", row.workspace_id);
    await admin.from("audit_logs").insert({
      workspace_id: row.workspace_id,
      action: "radar_scheduled",
      resource: `group_mining_jobs:${job.id}`,
      result: "queued",
    });
    scheduled += 1;
  }

  return { scheduled, skipped };
}
