/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingSkeleton, PendingIntegration } from "@/components/app/states";
import { MetricCard, PageHeader, StatusBadge, formatDateTime, formatMoney } from "@/components/app/primitives";
import { getOverview, listResource } from "@/lib/data.functions";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/wallet")({
  head: () => pageHead("Carteira", "Saldo, extrato e cobranças Pix do workspace com confirmação real."),
  component: WalletPage,
});

function WalletPage() {
  const list = useServerFn(listResource);
  const overviewFn = useServerFn(getOverview);

  const overview = useQuery({ queryKey: ["overview"], queryFn: () => overviewFn() });
  const ledger = useQuery({
    queryKey: ["resource", "wallet_ledger"],
    queryFn: () => list({ data: { table: "wallet_ledger", limit: 50 } }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Financeiro"
        title="Carteira"
        description="O saldo é calculado a partir do extrato persistido. Recargas dependem de confirmação do provedor Pix."
      />

      <PendingIntegration
        title="Provedor Pix pendente de configuração"
        detail="Para gerar cobranças Pix reais é necessário configurar as credenciais do provedor (chave, client id/secret e webhook). Sem isso, nenhuma cobrança é criada e nenhum saldo é creditado."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Saldo atual" value={formatMoney((overview.data as any)?.wallet?.balance ?? 0)} />
        <MetricCard label="Transações" value={(overview.data as any)?.wallet?.transactions ?? 0} />
        <MetricCard label="Lançamentos no extrato" value={ledger.data?.count ?? 0} />
      </div>

      {ledger.isPending ? (
        <LoadingSkeleton />
      ) : ledger.isError ? (
        <ErrorState message={(ledger.error as Error).message} onRetry={() => ledger.refetch()} />
      ) : (ledger.data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          title="Extrato vazio"
          description="Créditos e débitos aparecem aqui conforme cobranças, pedidos e consumos forem confirmados."
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.data?.rows.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell>{row.description ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.direction ?? row.kind}</TableCell>
                  <TableCell className="tabular-nums">{formatMoney(row.amount)}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status ?? "completed"} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(row.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
