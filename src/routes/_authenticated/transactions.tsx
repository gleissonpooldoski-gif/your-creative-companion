/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/app/states";
import { PageHeader, StatusBadge, formatDateTime, formatMoney } from "@/components/app/primitives";
import { listResource } from "@/lib/data.functions";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => pageHead("Transações", "Histórico completo de transações do workspace com status real de pagamento."),
  component: TransactionsPage,
});

function TransactionsPage() {
  const list = useServerFn(listResource);
  const query = useQuery({
    queryKey: ["resource", "transactions"],
    queryFn: () => list({ data: { table: "transactions", limit: 50 } }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Financeiro"
        title="Transações"
        description="Somente transações confirmadas pelo provedor aparecem como pagas. Nada é confirmado localmente."
      />
      {query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          title="Nenhuma transação"
          description="Transações aparecem aqui quando cobranças, recargas ou pedidos SMM forem processados."
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
              {query.data?.rows.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.description ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{row.kind}</TableCell>
                  <TableCell className="tabular-nums">{formatMoney(row.amount)}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
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
