/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ResourcePage } from "@/components/app/ResourcePage";
import { StatusBadge, formatMoney } from "@/components/app/primitives";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/crm")({
  head: () => pageHead("CRM", "Contatos, leads e tags do workspace alimentados pelas conversas reais dos bots."),
  component: CrmPage,
});

function CrmPage() {
  return (
    <Tabs defaultValue="contacts" className="space-y-4">
      <TabsList>
        <TabsTrigger value="contacts">Contatos</TabsTrigger>
        <TabsTrigger value="leads">Leads</TabsTrigger>
        <TabsTrigger value="tags">Tags</TabsTrigger>
      </TabsList>

      <TabsContent value="contacts">
        <ResourcePage
          table="contacts"
          breadcrumb="CRM"
          title="Contatos"
          description="Contatos são criados automaticamente quando alguém fala com um bot conectado."
          searchColumn="name"
          createLabel="Novo contato"
          emptyTitle="Nenhum contato"
          emptyDescription="Contatos aparecem aqui automaticamente a partir das conversas recebidas."
          fields={[
            { name: "name", label: "Nome" },
            { name: "username", label: "Username" },
            { name: "phone", label: "Telefone" },
          ]}
          columns={[
            { key: "name", label: "Nome" },
            { key: "username", label: "Username" },
            { key: "phone", label: "Telefone" },
            { key: "status", label: "Status", render: (row: any) => <StatusBadge status={row.status} /> },
          ]}
        />
      </TabsContent>

      <TabsContent value="leads">
        <ResourcePage
          table="leads"
          breadcrumb="CRM"
          title="Leads"
          description="Pipeline de leads com estágio, valor e origem."
          searchColumn="stage"
          createLabel="Novo lead"
          emptyTitle="Nenhum lead"
          emptyDescription="Crie leads a partir de contatos qualificados nas conversas."
          fields={[
            { name: "value", label: "Valor", type: "number" },
            {
              name: "stage",
              label: "Estágio",
              type: "select",
              options: [
                { value: "new", label: "Novo" },
                { value: "qualified", label: "Qualificado" },
                { value: "negotiation", label: "Negociação" },
                { value: "won", label: "Ganho" },
                { value: "lost", label: "Perdido" },
              ],
            },
          ]}
          columns={[
            { key: "stage", label: "Estágio" },
            { key: "value", label: "Valor", render: (row: any) => formatMoney(row.value) },
          ]}
        />
      </TabsContent>

      <TabsContent value="tags">
        <ResourcePage
          table="tags"
          breadcrumb="CRM"
          title="Tags"
          description="Use tags para segmentar contatos em campanhas e remarketing."
          searchColumn="name"
          createLabel="Nova tag"
          emptyTitle="Nenhuma tag"
          emptyDescription="Crie tags para segmentar seu público."
          fields={[{ name: "name", label: "Nome", required: true }]}
          columns={[{ key: "name", label: "Nome" }]}
        />
      </TabsContent>
    </Tabs>
  );
}
