/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResourcePage } from "@/components/app/ResourcePage";
import { createResource } from "@/lib/data.functions";
import { generatePersona } from "@/lib/ai.functions";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/persona")({
  head: () => pageHead("Montador de Persona", "Gere personas de atendimento com tom de voz, objeções e regras."),
  component: PersonaPage,
});

function PersonaPage() {
  const [brief, setBrief] = useState("");
  const generate = useServerFn(generatePersona);
  const create = useServerFn(createResource);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const result: any = await generate({ data: { brief } });
      await create({
        data: {
          table: "personas",
          values: {
            name: result.name ?? brief.slice(0, 40),
            tone: result.tone ?? null,
            description: result.description ?? null,
            script: result.script ?? null,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Persona gerada e salva.");
      setBrief("");
      await queryClient.invalidateQueries({ queryKey: ["resource", "personas"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <ResourcePage
      table="personas"
      breadcrumb="Inteligência"
      title="Montador de Persona"
      description="A persona define tom de voz e roteiro usados pelos agentes de IA nas conversas."
      searchColumn="name"
      createLabel="Nova persona"
      emptyTitle="Nenhuma persona criada"
      emptyDescription="Descreva o público e o produto para a IA montar a persona, ou cadastre manualmente."
      above={
        <div className="panel flex flex-col gap-2 p-4 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <label htmlFor="brief" className="text-sm font-medium">
              Briefing para a IA
            </label>
            <Input
              id="brief"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              placeholder="ex.: consultor de tráfego pago para infoprodutores"
            />
          </div>
          <Button disabled={mutation.isPending || brief.trim().length < 5} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "Gerando..." : "Gerar persona"}
          </Button>
        </div>
      }
      fields={[
        { name: "name", label: "Nome", required: true },
        { name: "tone", label: "Tom de voz" },
        { name: "context", label: "Contexto", type: "textarea" },
        { name: "goals", label: "Objetivos", type: "textarea" },
      ]}
      columns={[
        { key: "name", label: "Nome" },
        { key: "tone", label: "Tom" },
        { key: "context", label: "Contexto" },
      ]}
    />
  );
}
