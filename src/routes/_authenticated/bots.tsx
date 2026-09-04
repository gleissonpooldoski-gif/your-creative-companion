/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "@/components/app/ResourcePage";
import { StatusBadge } from "@/components/app/primitives";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/bots")({
  head: () => pageHead("Bots", "Bots do workspace, status real e vínculo com fluxos de atendimento."),
  component: BotsPage,
});

function BotsPage() {
  return (
    <ResourcePage
      table="bots"
      breadcrumb="Operação"
      title="Bots"
      description="Cada bot é vinculado a uma conta validada. Fluxos e respostas são configurados em Fluxo DM."
      searchColumn="name"
      createLabel="Novo bot"
      emptyTitle="Nenhum bot cadastrado"
      emptyDescription="Cadastre um bot para vincular fluxos de atendimento, mini apps e remarketing."
      fields={[
        { name: "name", label: "Nome", required: true },
        { name: "username", label: "Username do bot" },
      ]}
      columns={[
        { key: "name", label: "Nome" },
        { key: "username", label: "Username" },
        { key: "status", label: "Status", render: (row: any) => <StatusBadge status={row.status} /> },
      ]}
    />
  );
}
