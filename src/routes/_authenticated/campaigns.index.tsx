/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ResourcePage } from "@/components/app/ResourcePage";
import { StatusBadge, formatDateTime } from "@/components/app/primitives";
import { enqueueJob, updateResource } from "@/lib/data.functions";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/campaigns/")({
  head: () => pageHead("Campanhas", "Campanhas de disparo com variações, destinos, fila persistida e retentativas."),
  component: CampaignsPage,
});

function CampaignsPage() {
  const update = useServerFn(updateResource);
  const enqueue = useServerFn(enqueueJob);
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["resource", "campaigns"] });

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: string }) =>
      update({ data: { table: "campaigns", id: input.id, values: { status: input.status } } }),
    onSuccess: async () => {
      toast.success("Status da campanha atualizado.");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => enqueue({ data: { kind: "run_campaign", payload: { campaign_id: id } } }),
    onSuccess: async () => {
      toast.success("Campanha enfileirada para execução.");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <ResourcePage
      table="campaigns"
      breadcrumb="Operação"
      title="Campanhas"
      description="A execução acontece pela fila persistida com retentativas e watchdog. Nada é marcado como enviado sem confirmação do provedor."
      searchColumn="name"
      createLabel="Nova campanha"
      emptyTitle="Nenhuma campanha criada"
      emptyDescription="Crie sua primeira campanha, adicione variações de mensagem e destinos autorizados."
      extraActions={
        <Button size="sm" variant="secondary" asChild>
          <Link to="/campaigns/new">Assistente completo</Link>
        </Button>
      }
      fields={[
        { name: "name", label: "Nome", required: true },
        {
          name: "network",
          label: "Canal",
          type: "select",
          options: [
            { value: "dm", label: "Disparo em DM" },
            { value: "group", label: "Disparo em grupos" },
            { value: "mixed", label: "Misto" },
          ],
        },
        { name: "scheduled_at", label: "Agendar para", type: "datetime" },
        { name: "message", label: "Mensagem", type: "textarea" },
        { name: "link", label: "Link (opcional)" },
      ]}
      columns={[
        { key: "name", label: "Nome" },
        { key: "network", label: "Canal" },
        { key: "status", label: "Status", render: (row: any) => <StatusBadge status={row.status} /> },
        { key: "posted_count", label: "Enviados" },
        { key: "failed_count", label: "Falhas" },
        { key: "scheduled_at", label: "Agendada", render: (row: any) => formatDateTime(row.scheduled_at) },
      ]}

      rowActions={(row: any) => (
        <>
          <Button size="sm" variant="ghost" disabled={runMutation.isPending} onClick={() => runMutation.mutate(row.id)}>
            Executar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={statusMutation.isPending}
            onClick={() =>
              statusMutation.mutate({ id: row.id, status: row.status === "paused" ? "scheduled" : "paused" })
            }
          >
            {row.status === "paused" ? "Retomar" : "Pausar"}
          </Button>
        </>
      )}
    />
  );
}
