/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/primitives";
import { PendingIntegration } from "@/components/app/states";
import { createResource, listResource } from "@/lib/data.functions";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/clone-bot")({
  head: () => pageHead("Clonar Bot", "Duplique um bot existente junto com seus fluxos de atendimento."),
  component: CloneBotPage,
});

function CloneBotPage() {
  const navigate = useNavigate();
  const list = useServerFn(listResource);
  const create = useServerFn(createResource);
  const [sourceId, setSourceId] = useState("");
  const [newName, setNewName] = useState("");

  const bots = useQuery({
    queryKey: ["resource", "bots", "clone"],
    queryFn: () => list({ data: { table: "bots", limit: 50 } }),
  });
  const flows = useQuery({
    queryKey: ["resource", "bot_flows", "clone"],
    queryFn: () => list({ data: { table: "bot_flows", limit: 200 } }),
  });

  const clone = useMutation({
    mutationFn: async () => {
      if (!sourceId) throw new Error("Selecione o bot de origem.");
      if (!newName.trim()) throw new Error("Informe o nome do novo bot.");
      const source = (bots.data?.rows ?? []).find((row: any) => row.id === sourceId);
      const created: any = await create({
        data: {
          table: "bots",
          values: {
            name: newName,
            description: source?.description ?? null,
            cloned_from: sourceId,
          },
        },
      });
      const sourceFlows = (flows.data?.rows ?? []).filter((row: any) => row.bot_id === sourceId);
      for (const flow of sourceFlows) {
        await create({
          data: {
            table: "bot_flows",
            values: {
              bot_id: created.row.id,
              name: flow.name,
              trigger: flow.trigger,
              response: flow.response,
            },
          },
        });
      }
      return sourceFlows.length;
    },
    onSuccess: (count) => {
      toast.success(`Bot clonado com ${count} fluxo(s).`);
      navigate({ to: "/cloned-bots" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Bots"
        title="Clonar Bot"
        description="A clonagem copia configuração e fluxos. O novo bot precisa de um token próprio validado em Contas para operar."
      />

      <PendingIntegration
        title="O clone nasce sem token"
        detail="Um bot do Telegram não pode compartilhar token. Depois de clonar, conecte um token novo em Contas — o clone permanece inativo até essa validação real."
      />

      <div className="panel grid gap-4 p-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="source-bot">Bot de origem</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger id="source-bot">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {(bots.data?.rows ?? []).map((bot: any) => (
                <SelectItem key={bot.id} value={bot.id}>
                  {bot.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clone-name">Nome do novo bot</Label>
          <Input id="clone-name" value={newName} onChange={(event) => setNewName(event.target.value)} />
        </div>
        <div className="md:col-span-2">
          <Button disabled={clone.isPending} onClick={() => clone.mutate()}>
            {clone.isPending ? "Clonando..." : "Clonar bot"}
          </Button>
        </div>
      </div>
    </div>
  );
}
