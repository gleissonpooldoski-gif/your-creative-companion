// E2E: mineração real -> persistência -> campanha -> fila -> worker -> provedor -> métricas -> RLS.
// Requer dev server em http://localhost:8080 e as variáveis SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY e LOVABLE_CRON_SECRET. Execute com: bun tests/e2e/mining-campaign.ts
import { createClient } from "@supabase/supabase-js";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const WS = "ff9ea3bb-9391-4a33-a677-9de4d4197016";
const CRON = process.env.LOVABLE_CRON_SECRET!;
const results: string[] = [];
const ok = (n: string, c: boolean, extra = "") => { results.push(`${c ? "PASS" : "FAIL"} ${n} ${extra}`); if(!c) process.exitCode = 1; };

async function cron(path: string) {
  const r = await fetch(`http://localhost:8080${path}`, { method: "POST", headers: { Authorization: `Bearer ${CRON}` } });
  return { status: r.status, body: await r.json().catch(() => null) };
}

// 0. cron auth
const unauth = await fetch("http://localhost:8080/api/public/cron/process-queue", { method: "POST" });
ok("cron rejeita sem bearer", unauth.status === 401, String(unauth.status));

// 1. mining job with real public seed references (deduplicated forms of the same group)
const { data: job, error: jobErr } = await admin.from("group_mining_jobs")
  .insert({ workspace_id: WS, keywords: ["telegram", "novidades"], categories: [], status: "pending" })
  .select("id").single();
ok("job de mineração persistido", !!job && !jobErr, jobErr?.message ?? "");
await admin.from("queue_jobs").insert({
  workspace_id: WS, kind: "group_mining", payload: { mining_job_id: job!.id, seed_references: ["https://t.me/telegram", "@telegram", "t.me/durov"] },
  idempotency_key: `e2e:${job!.id}`,
});

// 2. worker processes it
const run1 = await cron("/api/public/cron/process-queue");
ok("worker executou", run1.status === 200 && run1.body?.claimed >= 1, JSON.stringify(run1.body));

const { data: doneJob } = await admin.from("group_mining_jobs").select("*").eq("id", job!.id).single();
ok("job concluído com totais", doneJob?.status === "completed", JSON.stringify({s: doneJob?.status, e: doneJob?.error, f: doneJob?.total_found, n: doneJob?.total_new, d: doneJob?.total_duplicate, i: doneJob?.total_invalid}));

const { data: groups } = await admin.from("groups").select("*").eq("workspace_id", WS).eq("mining_job_id", job!.id);
ok("grupos persistidos no PostgreSQL", (groups ?? []).length >= 1, `${groups?.length} grupos`);
ok("dedup: 3 referências -> 2 grupos", (groups ?? []).length === 2, JSON.stringify(groups?.map(g => g.canonical_identifier)));
ok("validação real gravada", (groups ?? []).some(g => g.is_valid === true && g.last_validated_at), JSON.stringify(groups?.map(g => [g.canonical_identifier, g.is_valid, g.status])));
ok("classificação/score aplicados", (groups ?? []).every(g => typeof g.score === "number"), JSON.stringify(groups?.map(g => [g.title, g.category, g.score])));

// 3. dedup across runs
const { data: job2 } = await admin.from("group_mining_jobs").insert({ workspace_id: WS, keywords: ["telegram"], status: "pending" }).select("id").single();
await admin.from("queue_jobs").insert({ workspace_id: WS, kind: "group_mining", payload: { mining_job_id: job2!.id, seed_references: ["@telegram"] }, idempotency_key: `e2e2:${job2!.id}` });
await cron("/api/public/cron/process-queue");
const { data: doneJob2 } = await admin.from("group_mining_jobs").select("*").eq("id", job2!.id).single();
ok("dedup entre execuções", doneJob2?.total_duplicate >= 1, JSON.stringify({d: doneJob2?.total_duplicate, n: doneJob2?.total_new}));
const { count: totalGroups } = await admin.from("groups").select("id", { count: "exact", head: true }).eq("workspace_id", WS);
ok("nenhum grupo duplicado no banco", totalGroups === 2, `total ${totalGroups}`);

// 4. campaign from mined groups
const validGroup = (groups ?? []).find(g => g.is_valid) ?? groups![0];
const { data: campaign } = await admin.from("campaigns")
  .insert({ workspace_id: WS, name: "E2E campanha", message: "mensagem e2e", network: "group", status: "draft", messages_per_hour: 60 })
  .select("id").single();
const { data: dest } = await admin.from("campaign_destinations")
  .insert({ workspace_id: WS, campaign_id: campaign!.id, group_id: validGroup.id, destination: `@${validGroup.username}`, authorized: true, status: "pending" })
  .select("id").single();
ok("destino criado a partir do grupo minerado", !!dest);
const dup = await admin.from("campaign_destinations").insert({ workspace_id: WS, campaign_id: campaign!.id, group_id: validGroup.id, destination: "x", authorized: true });
ok("destino duplicado rejeitado pelo banco", !!dup.error, dup.error?.code ?? "");

// 5. account required to run
const { data: account } = await admin.from("telegram_accounts")
  .insert({ workspace_id: WS, name: "E2E bot", kind: "bot", status: "online", paused: false })
  .select("id").single();
await admin.from("campaign_accounts").insert({ workspace_id: WS, campaign_id: campaign!.id, account_id: account!.id });
await admin.from("campaigns").update({ status: "running" }).eq("id", campaign!.id);
await admin.from("queue_jobs").insert({ workspace_id: WS, kind: "campaign_dispatch", campaign_id: campaign!.id, payload: { campaign_id: campaign!.id } });
await cron("/api/public/cron/process-queue");
const { data: sendJobs } = await admin.from("queue_jobs").select("*").eq("campaign_id", campaign!.id).eq("kind", "campaign_send");
ok("dispatch criou queue job de envio por destino", (sendJobs ?? []).length === 1, JSON.stringify(sendJobs?.map(j => [j.status, j.account_id === account!.id])));
ok("conta selecionada foi atribuída ao job", sendJobs?.[0]?.account_id === account!.id);

// 6. send without credentials -> pending integration, never "sent"
await admin.from("queue_jobs").update({ scheduled_at: new Date().toISOString() }).eq("id", sendJobs![0].id);
await cron("/api/public/cron/process-queue");
const { data: destAfter } = await admin.from("campaign_destinations").select("*").eq("id", dest!.id).single();
ok("envio sem credencial não é marcado como enviado", destAfter?.status !== "completed", JSON.stringify([destAfter?.status, destAfter?.last_result]));
ok("resultado do provedor persistido", !!destAfter?.last_result && !!destAfter?.last_attempt_at);
const { data: campAfter } = await admin.from("campaigns").select("posted_count, failed_count, status").eq("id", campaign!.id).single();
ok("métricas da campanha atualizadas", campAfter?.failed_count === 1 && campAfter?.posted_count === 0, JSON.stringify(campAfter));

// 7. pause blocks dispatch
await admin.from("campaigns").update({ status: "paused" }).eq("id", campaign!.id);
await admin.from("campaign_destinations").update({ status: "pending", last_result: null }).eq("id", dest!.id);
await admin.from("queue_jobs").insert({ workspace_id: WS, kind: "campaign_dispatch", campaign_id: campaign!.id, payload: { campaign_id: campaign!.id } });
await cron("/api/public/cron/process-queue");
const { count: afterPause } = await admin.from("queue_jobs").select("id", { count: "exact", head: true }).eq("campaign_id", campaign!.id).eq("kind", "campaign_send");
ok("pausa impede novos envios", afterPause === 1, `send jobs ${afterPause}`);

// 8. retry + watchdog
const { data: retryJob } = await admin.from("queue_jobs").insert({
  workspace_id: WS, kind: "campaign_send", campaign_id: campaign!.id, destination_id: dest!.id, account_id: account!.id,
  payload: { campaign_id: campaign!.id, destination_id: dest!.id }, status: "processing", locked_at: new Date(Date.now() - 10*60_000).toISOString(), attempts: 1,
}).select("id, status, locked_at, attempts, max_attempts").single();
console.log("stuck job inserted:", JSON.stringify(retryJob));
const wd = await cron("/api/public/cron/process-queue");
const { data: wdJob } = await admin.from("queue_jobs").select("status, attempts").eq("id", retryJob!.id).single();
ok("watchdog requeue de job travado", ["retry","processing","failed","pending"].includes(wdJob!.status) && (wd.body?.watchdog?.requeued ?? 0) >= 1, JSON.stringify({wd: wd.body?.watchdog, job: wdJob}));
const { data: retried } = await admin.from("queue_jobs").select("status, attempts, error").eq("id", retryJob!.id).single();
ok("retry incrementa tentativas", (retried?.attempts ?? 0) >= 1, JSON.stringify(retried));

// 9. audit + RLS isolation
const { count: auditCount } = await admin.from("audit_logs").select("id", { count: "exact", head: true }).eq("workspace_id", WS);
ok("auditoria registrada", (auditCount ?? 0) >= 1, `${auditCount} registros`);
const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const anonGroups = await anon.from("groups").select("id").limit(1);
ok("RLS: anônimo não lê grupos", (anonGroups.data ?? []).length === 0, JSON.stringify(anonGroups.error?.message ?? anonGroups.data));
const anonJobs = await anon.from("group_mining_jobs").select("id").limit(1);
ok("RLS: anônimo não lê jobs de mineração", (anonJobs.data ?? []).length === 0);

// cleanup
await admin.from("queue_jobs").delete().eq("workspace_id", WS).in("kind", ["campaign_send","campaign_dispatch","group_mining"]);
await admin.from("campaign_destinations").delete().eq("campaign_id", campaign!.id);
await admin.from("campaign_accounts").delete().eq("campaign_id", campaign!.id);
await admin.from("campaigns").delete().eq("id", campaign!.id);
await admin.from("telegram_accounts").delete().eq("id", account!.id);
await admin.from("groups").delete().eq("workspace_id", WS);
await admin.from("group_mining_jobs").delete().eq("workspace_id", WS);

console.log(results.join("\n"));
