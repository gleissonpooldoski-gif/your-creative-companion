/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

import { ResourcePage } from "@/components/app/ResourcePage";
import { PendingIntegration } from "@/components/app/states";
import { StatusBadge, formatMoney } from "@/components/app/primitives";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/smm")({
  head: () => pageHead("SMM", "Catálogo de serviços SMM e pedidos com status real do provedor."),
  component: SmmPage,
});

function SmmPage() {
  return (
    <ResourcePage
      table="smm_orders"
      breadcrumb="Financeiro"
      title="SMM"
      description="Pedidos são enviados ao provedor pela fila. O status espelha exatamente o retorno da API do provedor."
      searchColumn="customer"
      createLabel="Novo pedido"
      emptyTitle="Nenhum pedido SMM"
      emptyDescription="Cadastre serviços e crie pedidos após configurar as credenciais do provedor."
      above={
        <PendingIntegration
          title="Provedor SMM pendente de configuração"
          detail="Sem a URL da API e a chave do provedor, os pedidos permanecem como configuração necessária. O sistema não simula entrega nem debita saldo por pedidos não confirmados."
        />
      }
      fields={[
        { name: "customer", label: "Cliente / link alvo", required: true },
        { name: "quantity", label: "Quantidade", type: "number", required: true },
      ]}
      columns={[
        { key: "customer", label: "Cliente / alvo" },
        { key: "quantity", label: "Quantidade" },
        { key: "cost", label: "Custo", render: (row: any) => formatMoney(row.cost) },
        { key: "status", label: "Status", render: (row: any) => <StatusBadge status={row.status} /> },
      ]}
    />
  );
}
