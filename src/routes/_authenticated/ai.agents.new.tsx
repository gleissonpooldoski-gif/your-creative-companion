/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/primitives";
import { createResource, listResource } from "@/lib/data.functions";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/ai/agents/new")({
  head: () => pageHead("Novo agente de IA", "Crie um agente de IA com persona, instruções e base de conhecimento."),
  component: NewAgentPage,
});

function NewAgentPage() {
  const navigate = useNavigate();
  const list = useServerFn(listResource);
  const create = useServerFn(createResource);
  const [name, setName] = useState("");
  const [instructions, setInstructions] = useState("");
  const [personaId, setPersonaId] = useState("");

  const personas = useQuery({
    queryKey: ["resource", "personas", "agent-wizard"],
    queryFn: () => list({ data: { table: "personas", limit: 50 } }),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe o nome do agente.");
      if (instructions.trim().length < 10) throw new Error("Descreva as instruções do agente.");
      return create({
        data: {
          table: "ai_agents",
          values: { name, instructions, ...(personaId ? { persona_id: personaId } : {}) },
        },
      });
    },
    onSuccess: () => {
      toast.success("Agente criado.");
      navigate({ to: "/ai" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Cérebro / IA"
        title="Novo agente de IA"
        description="O agente responde usando a persona escolhida e a base de conhecimento do workspace."
      />
      <div className="panel grid gap-4 p-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="agent-name">Nome</Label>
          <Input id="agent-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agent-persona">Persona</Label>
          <Select value={personaId} onValueChange={setPersonaId}>
            <SelectTrigger id="agent-persona">
              <SelectValue placeholder="Opcional" />
            </SelectTrigger>
            <SelectContent>
              {(personas.data?.rows ?? []).map((persona: any) => (
                <SelectItem key={persona.id} value={persona.id}>
                  {persona.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="agent-instructions">Instruções</Label>
          <Textarea
            id="agent-instructions"
            rows={5}
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
          />
        </div>
        <div className="md:col-span-2">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Salvando..." : "Criar agente"}
          </Button>
        </div>
      </div>
    </div>
  );
}
