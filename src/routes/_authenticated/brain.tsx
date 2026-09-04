/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "@/components/app/ResourcePage";
import { StatusBadge } from "@/components/app/primitives";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/brain")({
  head: () => pageHead("Cérebro", "Base de conhecimento que alimenta os agentes de IA do workspace."),
  component: BrainPage,
});

function BrainPage() {
  return (
    <ResourcePage
      table="ai_knowledge"
      breadcrumb="Inteligência"
      title="Cérebro"
      description="Conteúdos aqui são usados como contexto pelos agentes de IA em respostas e geração de campanhas."
      searchColumn="title"
      createLabel="Novo conhecimento"
      emptyTitle="Base de conhecimento vazia"
      emptyDescription="Adicione produtos, objeções, preços e regras de atendimento para orientar a IA."
      fields={[
        { name: "title", label: "Título", required: true },
        { name: "content", label: "Conteúdo", type: "textarea", required: true },
      ]}
      columns={[
        { key: "title", label: "Título" },
        { key: "content", label: "Conteúdo" },
        { key: "active", label: "Status", render: (row: any) => <StatusBadge status={row.active ? "active" : "paused"} /> },
      ]}
    />
  );
}
