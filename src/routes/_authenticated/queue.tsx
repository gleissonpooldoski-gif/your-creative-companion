/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/app/states";
import { MetricCard, PageHeader, StatusBadge, formatDateTime } from "@/components/app/primitives";
import { getQueueStats, listResource, updateResource } from "@/lib/data.functions";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/queue")({
  head: () => pageHead("Central de Filas", "Jobs pendentes, em processamento, com falha e watchdog de travamento."),
  component: QueuePage,
});

function QueuePage() {
  const statsFn = useServerFn(getQueueStats);
  const list = useServerFn(listResource);
  const update = useServerFn(updateResource);
  const queryClient = useQueryClient();

  const stats = useQuery({ queryKey: ["queue-stats"], queryFn: () => statsFn(), refetchInterval: 15_000 });
  const jobs = useQuery({
    queryKey: ["resource", "queue_jobs"],
    queryFn: () => list({ data: { table: "queue_jobs", limit: 50 } }),
    refetchInterval: 15_000,
  });

  const retry = useMutation({
    mutationFn: (id: string) =>
      update({
        data: {
          table: "queue_jobs",
          id,
          values: { status: "pending", attempts: 0, locked_at: null, run_at: new Date().toISOString() },
        },
      }),
    onSuccess: async () => {
      toast.success("Job reenfileirado.");
      await queryClient.invalidateQueries({ queryKey: ["resource", "queue_jobs"] });
      await queryClient.invalidateQueries({ queryKey: ["queue-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const data = stats.data as any;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Operação"
        title="Central de Filas"
        description="A fila é persistida no banco, com retentativas exponenciais, watchdog para jobs travados e idempotência por chave."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Pendentes" value={data?.pending ?? 0} tone="warning" />
        <MetricCard label="Processando" value={data?.processing ?? 0} />
        <MetricCard label="Retry" value={data?.retry ?? 0} tone="warning" />
        <MetricCard label="Concluídos" value={data?.completed ?? 0} tone="success" />
        <MetricCard label="Falhas" value={data?.failed ?? 0} tone="danger" />
      </div>

      {jobs.isPending ? (
        <LoadingSkeleton />
      ) : jobs.isError ? (
        <ErrorState message={(jobs.error as Error).message} onRetry={() => jobs.refetch()} />
      ) : (jobs.data?.rows.length ?? 0) === 0 ? (
        <EmptyState title="Fila vazia" description="Nenhum job na fila. Enfileire trabalhos pelas páginas de operação." />
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tentativas</TableHead>
                <TableHead>Executar em</TableHead>
                <TableHead>Erro</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.data?.rows.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.kind}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>
                    {row.attempts}/{row.max_attempts}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(row.run_at)}</TableCell>
                  <TableCell className="max-w-[18rem] truncate text-destructive">{row.last_error ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" disabled={retry.isPending} onClick={() => retry.mutate(row.id)}>
                      Reprocessar
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
