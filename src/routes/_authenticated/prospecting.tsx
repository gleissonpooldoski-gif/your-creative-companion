/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "@/components/app/ResourcePage";
import { PendingIntegration } from "@/components/app/states";
import { StatusBadge } from "@/components/app/primitives";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/prospecting")({
  head: () => pageHead("Prospecção (DM)", "Filas de prospecção autorizada em DM com limites por conta e auditoria."),
  component: ProspectingPage,
});

function ProspectingPage() {
  return (
    <ResourcePage
      table="prospecting_campaigns"
      breadcrumb="Operação"
      title="Prospecção (DM)"
      description="Prospecção só é executada para contatos que iniciaram conversa com o bot ou autorizaram contato."
      searchColumn="name"
      createLabel="Nova prospecção"
      emptyTitle="Nenhuma prospecção configurada"
      emptyDescription="Crie uma fila de prospecção e vincule contatos autorizados para envio em DM."
      above={
        <PendingIntegration
          title="DM para desconhecidos exige sessão MTProto autorizada"
          detail="A Bot API do Telegram não permite iniciar conversa com quem nunca falou com o bot. Jobs para contatos não autorizados são marcados como pulados com motivo registrado — nunca como enviados."
        />
      }
      fields={[
        { name: "name", label: "Nome", required: true },
        { name: "message", label: "Mensagem", type: "textarea", required: true },
        { name: "daily_cap_per_account", label: "Limite diário por conta", type: "number" },
      ]}
      columns={[
        { key: "name", label: "Nome" },
        { key: "daily_cap_per_account", label: "Limite diário/conta" },
        { key: "messages_per_hour", label: "Msgs/hora" },
        { key: "status", label: "Status", render: (row: any) => <StatusBadge status={row.status} /> },
      ]}
    />
  );
}
