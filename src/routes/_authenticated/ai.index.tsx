/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ResourcePage } from "@/components/app/ResourcePage";
import { StatusBadge } from "@/components/app/primitives";
import { generateContent } from "@/lib/ai.functions";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/ai/")({
  head: () => pageHead("Cérebro / IA", "Agentes de IA, geração de conteúdo e histórico real de jobs de IA."),
  component: AiPage,
});

function AiPage() {
  const [prompt, setPrompt] = useState("");
  const [output, setOutput] = useState("");
  const generate = useServerFn(generateContent);

  const mutation = useMutation({
    mutationFn: () => generate({ data: { prompt } }),
    onSuccess: (result: any) => {
      setOutput(result.content ?? "");
      toast.success("Conteúdo gerado.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <ResourcePage
      table="ai_agents"
      breadcrumb="Inteligência"
      title="Cérebro / IA"
      description="Agentes usam a base de conhecimento e a persona para responder. Todas as chamadas de IA são registradas."
      searchColumn="name"
      createLabel="Novo agente"
      emptyTitle="Nenhum agente de IA"
      emptyDescription="Crie um agente com instruções para responder conversas e gerar conteúdo."
      extraActions={
        <Button size="sm" variant="secondary" asChild>
          <Link to="/ai/agents/new">Assistente de agente</Link>
        </Button>
      }
      fields={[
        { name: "name", label: "Nome", required: true },
        { name: "instructions", label: "Instruções", type: "textarea", required: true },
      ]}
      columns={[
        { key: "name", label: "Nome" },
        { key: "instructions", label: "Instruções" },
        { key: "status", label: "Status", render: (row: any) => <StatusBadge status={row.status} /> },
      ]}
      below={
        <div className="panel space-y-3 p-4">
          <h2 className="text-sm font-semibold">Geração de conteúdo</h2>
          <Textarea
            rows={3}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="ex.: escreva 3 anúncios curtos para grupo de ofertas"
          />
          <Button
            size="sm"
            disabled={mutation.isPending || prompt.trim().length < 5}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Gerando..." : "Gerar"}
          </Button>
          {output ? (
            <pre className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{output}</pre>
          ) : null}
        </div>
      }
    />
  );
}
