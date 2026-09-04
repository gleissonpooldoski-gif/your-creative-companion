/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "@/components/app/ResourcePage";
import { StatusBadge } from "@/components/app/primitives";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/dm-flow")({
  head: () => pageHead("Fluxo DM", "Fluxos de atendimento automático em DM com gatilhos e respostas."),
  component: DmFlowPage,
});

function DmFlowPage() {
  return (
    <ResourcePage
      table="bot_flows"
      breadcrumb="Operação"
      title="Fluxo DM"
      description="Gatilhos e respostas são aplicados às mensagens recebidas via webhook do Telegram."
      searchColumn="name"
      createLabel="Novo fluxo"
      emptyTitle="Nenhum fluxo criado"
      emptyDescription="Crie um fluxo com gatilho e resposta para atender automaticamente quem chama seu bot."
      fields={[
        { name: "name", label: "Nome", required: true },
        { name: "trigger_keyword", label: "Gatilho (palavra ou comando)", required: true, placeholder: "/start" },
        { name: "response", label: "Resposta", type: "textarea", required: true },
      ]}
      columns={[
        { key: "name", label: "Nome" },
        { key: "trigger_keyword", label: "Gatilho" },
        { key: "response", label: "Resposta" },
        { key: "status", label: "Status", render: (row: any) => <StatusBadge status={row.status} /> },
      ]}
    />
  );
}
