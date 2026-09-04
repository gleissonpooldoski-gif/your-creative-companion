/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ErrorState, LoadingSkeleton } from "@/components/app/states";
import { MetricCard, PageHeader, StatusBadge, formatMoney, formatNumber } from "@/components/app/primitives";
import { getOverview, syncEverything } from "@/lib/data.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Visão geral — Reelyx v2" },
      { name: "description", content: "Métricas reais de contas, campanhas, filas e carteira do workspace." },
      { property: "og:title", content: "Visão geral — Reelyx v2" },
      { property: "og:description", content: "Métricas reais de contas, campanhas, filas e carteira." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const overviewFn = useServerFn(getOverview);
  const syncFn = useServerFn(syncEverything);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["overview"],
    queryFn: () => overviewFn(),
    refetchInterval: 60_000,
  });

  const sync = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: async (result: any) => {
      toast.success(`${result.enqueued} job(s) de sincronização enfileirados.`);
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isPending) return <LoadingSkeleton rows={6} />;
  if (query.isError) return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />;

  const data = query.data as any;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Reelyx v2"
        title="Visão geral"
        description="Todos os números abaixo vêm do banco de dados do workspace — nada é simulado."
        actions={
          <Button size="sm" disabled={sync.isPending} onClick={() => sync.mutate()}>
            {sync.isPending ? "Enfileirando..." : "Sincronizar tudo"}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Contas conectadas" value={formatNumber(data.accounts.online)} hint={`${formatNumber(data.accounts.total)} no total`} tone="success" />
        <MetricCard label="Aguardando autenticação" value={formatNumber(data.accounts.pending)} tone="warning" hint="Sessões TData exigem runtime MTProto" />
        <MetricCard label="Campanhas ativas" value={formatNumber(data.campaigns.running)} hint={`${formatNumber(data.campaigns.total)} criadas`} />
        <MetricCard label="Contatos no CRM" value={formatNumber(data.crm.contacts)} hint={`${formatNumber(data.crm.leads)} leads`} />
        <MetricCard label="Fila pendente" value={formatNumber(data.queue.pending)} tone={data.queue.pending > 0 ? "warning" : "default"} hint={`${formatNumber(data.queue.processing)} processando`} />
        <MetricCard label="Jobs com falha" value={formatNumber(data.queue.failed)} tone={data.queue.failed > 0 ? "danger" : "default"} />
        <MetricCard label="Grupos entrados" value={formatNumber(data.groups.joined)} hint={`${formatNumber(data.groups.mirrors)} espelhos`} />
        <MetricCard label="Saldo da carteira" value={formatMoney(data.wallet.balance)} hint={`${formatNumber(data.wallet.transactions)} transações`} />
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Últimas atividades</h2>
            <Link to="/inbox" className="text-xs text-primary hover:underline">
              Ver inbox
            </Link>
          </div>
          <div className="mt-3 space-y-2">
            {(data.recentActivities ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
            ) : (
              data.recentActivities.map((activity: any) => (
                <div key={activity.id} className="flex items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                  <span className="truncate text-sm">{activity.summary ?? activity.kind}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{activity.direction ?? ""}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Integrações</h2>
            <Link to="/settings" className="text-xs text-primary hover:underline">
              Configurar
            </Link>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="flex items-center justify-between">
              Telegram <StatusBadge status={data.integrations.telegram ? "active" : "pending_config"} />
            </li>
            <li className="flex items-center justify-between">
              Instagram / Meta <StatusBadge status={data.integrations.instagram ? "active" : "pending_config"} />
            </li>
            <li className="flex items-center justify-between">
              Pagamentos (Pix) <StatusBadge status={data.integrations.payments ? "active" : "pending_config"} />
            </li>
            <li className="flex items-center justify-between">
              IA (gateway) <StatusBadge status={data.integrations.ai ? "active" : "pending_config"} />
            </li>
          </ul>
        </div>
      </section>
    </div>
  );
}
