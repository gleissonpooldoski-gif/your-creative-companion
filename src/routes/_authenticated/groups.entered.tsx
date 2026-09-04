/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "@/components/app/ResourcePage";
import { StatusBadge, formatDateTime, formatNumber } from "@/components/app/primitives";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/groups/entered")({
  head: () => pageHead("Grupos Entrados", "Grupos em que as contas do workspace realmente entraram, com métricas reais."),
  component: EnteredGroupsPage,
});

function EnteredGroupsPage() {
  return (
    <ResourcePage
      table="group_memberships"
      breadcrumb="Grupos"
      title="Grupos Entrados"
      description="Somente adesões confirmadas aparecem aqui. Contagem de membros vem da API quando disponível."
      searchColumn="group_name"
      createLabel="Registrar grupo"
      emptyTitle="Nenhum grupo entrado"
      emptyDescription="Após a mineração e a adesão das contas, os grupos confirmados aparecem nesta lista."
      fields={[
        { name: "group_name", label: "Nome do grupo", required: true },
        { name: "origin", label: "Origem" },
      ]}
      columns={[
        { key: "group_name", label: "Grupo" },
        { key: "origin", label: "Origem" },
        { key: "known_members", label: "Membros", render: (row: any) => formatNumber(row.known_members) },
        { key: "status", label: "Status", render: (row: any) => <StatusBadge status={row.status} /> },
        { key: "created_at", label: "Entrou em", render: (row: any) => formatDateTime(row.created_at) },
      ]}
    />
  );
}
