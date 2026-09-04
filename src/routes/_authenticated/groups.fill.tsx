/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "@/components/app/ResourcePage";
import { PendingIntegration } from "@/components/app/states";
import { StatusBadge } from "@/components/app/primitives";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/groups/fill")({
  head: () => pageHead("Lotar Grupos", "Planeje o crescimento de grupos com convites autorizados e limites por conta."),
  component: FillGroupsPage,
});

function FillGroupsPage() {
  return (
    <ResourcePage
      table="group_mirrors"
      breadcrumb="Grupos"
      title="Lotar Grupos"
      description="Registre o grupo de destino e a origem do público. A execução usa apenas convites permitidos pelas regras do Telegram."
      searchColumn="destination_group"
      createLabel="Novo plano"
      emptyTitle="Nenhum plano de lotação"
      emptyDescription="Cadastre o grupo de destino e a origem para montar um plano de crescimento auditável."
      above={
        <PendingIntegration
          title="Adição em massa não é executada por padrão"
          detail="Adicionar membros sem consentimento viola os termos do Telegram e resulta em banimento. O sistema executa apenas convites e espelhamento de conteúdo, e exige contas com sessão autorizada — jobs sem essa condição ficam pendentes de configuração, nunca marcados como concluídos."
        />
      }
      fields={[
        { name: "destination_group", label: "Grupo de destino", required: true },
        { name: "source_group", label: "Origem do público", required: true },
      ]}
      columns={[
        { key: "destination_group", label: "Destino" },
        { key: "source_group", label: "Origem" },
        { key: "status", label: "Status", render: (row: any) => <StatusBadge status={row.status} /> },
      ]}
    />
  );
}
