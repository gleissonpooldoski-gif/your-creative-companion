/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/app/states";
import { PageHeader, StatusBadge, formatDateTime } from "@/components/app/primitives";
import { listResource } from "@/lib/data.functions";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/observability")({
  head: () => pageHead("Observabilidade", "Logs de sistema, logs de integração e trilha de auditoria do workspace."),
  component: ObservabilityPage,
});

function LogTable({ table, columns }: { table: string; columns: Array<{ key: string; label: string }> }) {
  const list = useServerFn(listResource);
  const query = useQuery({
    queryKey: ["resource", table, "observability"],
    queryFn: () => list({ data: { table, limit: 50 } }),
    refetchInterval: 30_000,
  });

  if (query.isPending) return <LoadingSkeleton />;
  if (query.isError) return <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />;
  if ((query.data?.rows.length ?? 0) === 0)
    return <EmptyState title="Nenhum registro" description="Os eventos aparecem aqui conforme a operação acontece." />;

  return (
    <div className="panel overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column.key}>{column.label}</TableHead>
            ))}
            <TableHead>Quando</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.data?.rows.map((row: any) => (
            <TableRow key={row.id}>
              {columns.map((column) => (
                <TableCell key={column.key} className="max-w-[22rem] truncate">
                  {column.key === "success" ? (
                    <StatusBadge status={row.success ? "completed" : "failed"} />
                  ) : (
                    (row[column.key] ?? "—")
                  )}
                </TableCell>
              ))}
              <TableCell className="text-muted-foreground">{formatDateTime(row.created_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ObservabilityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Operação"
        title="Observabilidade"
        description="Toda ação sensível gera log e trilha de auditoria com usuário, workspace e payload."
      />
      <Tabs defaultValue="system">
        <TabsList>
          <TabsTrigger value="system">Sistema</TabsTrigger>
          <TabsTrigger value="integrations">Integrações</TabsTrigger>
          <TabsTrigger value="audit">Auditoria</TabsTrigger>
        </TabsList>
        <TabsContent value="system">
          <LogTable
            table="system_logs"
            columns={[
              { key: "level", label: "Nível" },
              { key: "scope", label: "Escopo" },
              { key: "message", label: "Mensagem" },
            ]}
          />
        </TabsContent>
        <TabsContent value="integrations">
          <LogTable
            table="integration_logs"
            columns={[
              { key: "provider", label: "Provedor" },
              { key: "action", label: "Ação" },
              { key: "success", label: "Resultado" },
              { key: "message", label: "Mensagem" },
            ]}
          />
        </TabsContent>
        <TabsContent value="audit">
          <LogTable
            table="audit_logs"
            columns={[
              { key: "action", label: "Ação" },
              { key: "resource", label: "Recurso" },
              { key: "result", label: "Resultado" },
            ]}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
