/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/app/states";
import { PageHeader, StatusBadge, formatDateTime } from "@/components/app/primitives";
import { listResource } from "@/lib/data.functions";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/cloned-bots")({
  head: () => pageHead("Bots Clonados", "Todos os bots criados por clonagem e o status real de cada um."),
  component: ClonedBotsPage,
});

function ClonedBotsPage() {
  const list = useServerFn(listResource);
  const query = useQuery({
    queryKey: ["resource", "bots", "cloned"],
    queryFn: () => list({ data: { table: "bots", limit: 100 } }),
  });

  const rows = (query.data?.rows ?? []).filter((row: any) => row.cloned_from);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Bots"
        title="Bots Clonados"
        description="Clones herdam fluxos, mas só operam após conectar um token próprio em Contas."
      />
      {query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nenhum bot clonado" description="Use a página Clonar Bot para duplicar um bot e seus fluxos." />
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Criado em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
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
