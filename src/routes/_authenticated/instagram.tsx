/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "@/components/app/ResourcePage";
import { PendingIntegration } from "@/components/app/states";
import { StatusBadge, formatDateTime } from "@/components/app/primitives";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/instagram")({
  head: () => pageHead("Instagram", "Contas e publicações do Instagram com status real de publicação."),
  component: InstagramPage,
});

function InstagramPage() {
  return (
    <ResourcePage
      table="instagram_posts"
      breadcrumb="Canais"
      title="Instagram"
      description="Publicações são agendadas na fila e só marcadas como publicadas quando a API do Meta confirmar."
      searchColumn="caption"
      createLabel="Nova publicação"
      emptyTitle="Nenhuma publicação"
      emptyDescription="Agende uma publicação para o Instagram após conectar uma conta profissional."
      above={
        <PendingIntegration
          title="Integração com Meta/Instagram pendente de configuração"
          detail="Publicar exige um app Meta com Instagram Graph API, conta profissional vinculada e token de longa duração. Sem essas credenciais, os jobs ficam com status de configuração necessária — nunca como publicados."
        />
      }
      fields={[
        { name: "caption", label: "Legenda", type: "textarea", required: true },
        { name: "media_url", label: "URL da mídia (HTTPS)", required: true },
        { name: "scheduled_at", label: "Agendar para", type: "datetime" },
      ]}
      columns={[
        { key: "caption", label: "Legenda" },
        { key: "status", label: "Status", render: (row: any) => <StatusBadge status={row.status} /> },
        { key: "scheduled_at", label: "Agendada", render: (row: any) => formatDateTime(row.scheduled_at) },
        { key: "published_at", label: "Publicada", render: (row: any) => formatDateTime(row.published_at) },
      ]}
    />
  );
}
