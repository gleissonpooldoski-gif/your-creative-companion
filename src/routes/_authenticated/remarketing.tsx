/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "@/components/app/ResourcePage";
import { PendingIntegration } from "@/components/app/states";
import { StatusBadge, formatDateTime } from "@/components/app/primitives";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/remarketing")({
  head: () => pageHead("Remarketing Ligação", "Agende ligações de remarketing e acompanhe o resultado real de cada tentativa."),
  component: RemarketingPage,
});

function RemarketingPage() {
  return (
    <ResourcePage
      table="remarketing_calls"
      breadcrumb="Operação"
      title="Remarketing Ligação"
      description="Cada ligação registra tentativa, resultado e observações para auditoria."
      searchColumn="phone"
      createLabel="Nova ligação"
      emptyTitle="Nenhuma ligação agendada"
      emptyDescription="Agende a primeira ligação de remarketing para leads que não converteram."
      above={
        <PendingIntegration
          title="Discagem automática requer provedor de voz"
          detail="Sem credenciais de um provedor de telefonia configuradas, as ligações ficam como agendadas para execução manual. O sistema não marca chamadas como realizadas sem retorno do provedor."
        />
      }
      fields={[
        { name: "phone", label: "Telefone", required: true },
        { name: "scheduled_at", label: "Agendar para", type: "datetime" },
        { name: "observation", label: "Roteiro / observações", type: "textarea" },
      ]}
      columns={[
        { key: "phone", label: "Telefone" },
        { key: "status", label: "Status", render: (row: any) => <StatusBadge status={row.status} /> },
        { key: "scheduled_at", label: "Agendada", render: (row: any) => formatDateTime(row.scheduled_at) },
        { key: "result", label: "Resultado" },
      ]}
    />
  );
}
