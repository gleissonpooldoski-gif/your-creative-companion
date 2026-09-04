/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "@/components/app/ResourcePage";
import { PendingIntegration } from "@/components/app/states";
import { StatusBadge } from "@/components/app/primitives";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/mini-app")({
  head: () => pageHead("Mini App", "Mini apps do Telegram vinculados aos seus bots, com submissões reais."),
  component: MiniAppPage,
});

function MiniAppPage() {
  return (
    <ResourcePage
      table="mini_apps"
      breadcrumb="Produtos"
      title="Mini App"
      description="Cada mini app tem uma URL pública e coleta submissões dos usuários dentro do Telegram."
      searchColumn="name"
      createLabel="Novo mini app"
      emptyTitle="Nenhum mini app criado"
      emptyDescription="Crie um mini app para captar leads, vender ou entregar conteúdo dentro do Telegram."
      above={
        <PendingIntegration
          title="Publicação exige vínculo com bot"
          detail="O mini app só abre no Telegram depois de vinculado a um bot com token validado e URL HTTPS registrada no BotFather. Até então o status permanece como configuração necessária."
        />
      }
      fields={[
        { name: "name", label: "Nome", required: true },
        { name: "url", label: "URL HTTPS", required: true },
        { name: "description", label: "Descrição", type: "textarea" },
      ]}
      columns={[
        { key: "name", label: "Nome" },
        { key: "url", label: "URL" },
        { key: "status", label: "Status", render: (row: any) => <StatusBadge status={row.status} /> },
      ]}
    />
  );
}
