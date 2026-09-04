/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "@/components/app/ResourcePage";
import { StatusBadge } from "@/components/app/primitives";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/groups/mirrored")({
  head: () => pageHead("Grupos Espelhados", "Espelhamento de conteúdo entre grupos de origem e destino."),
  component: MirroredGroupsPage,
});

function MirroredGroupsPage() {
  return (
    <ResourcePage
      table="group_mirrors"
      breadcrumb="Grupos"
      title="Grupos Espelhados"
      description="Cada espelho replica conteúdo de um grupo de origem para um destino, com histórico e auditoria."
      searchColumn="source_group"
      createLabel="Novo espelho"
      emptyTitle="Nenhum espelho configurado"
      emptyDescription="Configure origem e destino para replicar conteúdo automaticamente pela fila."
      fields={[
        { name: "source_group", label: "Grupo de origem", required: true },
        { name: "destination_group", label: "Grupo de destino", required: true },
      ]}
      columns={[
        { key: "source_group", label: "Origem" },
        { key: "destination_group", label: "Destino" },
        { key: "authorized", label: "Autorizado", render: (row: any) => (row.authorized ? "Sim" : "Não") },
        { key: "status", label: "Status", render: (row: any) => <StatusBadge status={row.status} /> },
      ]}
    />
  );
}
