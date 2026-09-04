/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app/primitives";
import { PendingIntegration } from "@/components/app/states";
import { createResource, listResource } from "@/lib/data.functions";
import { generateVariations } from "@/lib/ai.functions";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/campaigns/new")({
  head: () =>
    pageHead("Nova campanha", "Assistente de criação de campanha com variações geradas por IA e contas reais."),
  component: NewCampaign,
});

function NewCampaign() {
  const navigate = useNavigate();
  const list = useServerFn(listResource);
  const create = useServerFn(createResource);
  const variationsFn = useServerFn(generateVariations);

  const [name, setName] = useState("");
  const [objective, setObjective] = useState("dm");
  const [baseMessage, setBaseMessage] = useState("");
  const [variations, setVariations] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [destinations, setDestinations] = useState("");

  const accounts = useQuery({
    queryKey: ["resource", "telegram_accounts", "campaign-wizard"],
    queryFn: () => list({ data: { table: "telegram_accounts", limit: 50 } }),
  });

  const generate = useMutation({
    mutationFn: () => variationsFn({ data: { message: baseMessage, count: 5 } }),
    onSuccess: (result: any) => {
      setVariations(result.variations ?? []);
      toast.success("Variações geradas pela IA.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe o nome da campanha.");
      if (!baseMessage.trim()) throw new Error("Informe a mensagem base.");
      const campaign: any = await create({
        data: { table: "campaigns", values: { name, objective, status: "draft", notes: baseMessage } },
      });
      const campaignId = campaign.row.id;

      const allVariations = [baseMessage, ...variations];
      for (const [index, content] of allVariations.entries()) {
        await create({
          data: { table: "campaign_variations", values: { campaign_id: campaignId, content, position: index } },
        });
      }
      for (const accountId of selectedAccounts) {
        await create({ data: { table: "campaign_accounts", values: { campaign_id: campaignId, account_id: accountId } } });
      }
      const targets = destinations
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean);
      for (const target of targets) {
        await create({ data: { table: "campaign_destinations", values: { campaign_id: campaignId, target } } });
      }
      return campaignId as string;
    },
    onSuccess: () => {
      toast.success("Campanha criada como rascunho.");
      navigate({ to: "/campaigns" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Campanhas"
        title="Nova campanha"
        description="Monte a campanha com mensagem base, variações reais geradas por IA, contas conectadas e destinos autorizados."
      />

      <PendingIntegration
        title="Envio depende de contas válidas"
        detail="A campanha nasce como rascunho. O disparo só ocorre pela fila, usando contas com status online e destinos autorizados — nada é marcado como enviado sem retorno do provedor."
      />

      <div className="panel space-y-4 p-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="campaign-name">Nome</Label>
            <Input id="campaign-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-objective">Objetivo</Label>
            <Input
              id="campaign-objective"
              value={objective}
              onChange={(event) => setObjective(event.target.value)}
              placeholder="dm | group | mixed"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="campaign-message">Mensagem base</Label>
          <Textarea
            id="campaign-message"
            rows={4}
            value={baseMessage}
            onChange={(event) => setBaseMessage(event.target.value)}
          />
          <Button
            size="sm"
            variant="secondary"
            disabled={generate.isPending || baseMessage.trim().length < 5}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? "Gerando com IA..." : "Gerar variações com IA"}
          </Button>
        </div>

        {variations.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold">Variações geradas</p>
            {variations.map((variation, index) => (
              <Textarea
                key={index}
                rows={2}
                value={variation}
                onChange={(event) =>
                  setVariations((prev) => prev.map((item, position) => (position === index ? event.target.value : item)))
                }
              />
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-sm font-semibold">Contas de envio</p>
          {(accounts.data?.rows ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta conectada. Conecte um bot em Contas.</p>
          ) : (
            (accounts.data?.rows ?? []).map((account: any) => (
              <label key={account.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selectedAccounts.includes(account.id)}
                  onCheckedChange={(checked) =>
                    setSelectedAccounts((prev) =>
                      checked ? [...prev, account.id] : prev.filter((id) => id !== account.id),
                    )
                  }
                />
                {account.name} — {account.status}
              </label>
            ))
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="campaign-destinations">Destinos autorizados (um por linha)</Label>
          <Textarea
            id="campaign-destinations"
            rows={4}
            value={destinations}
            onChange={(event) => setDestinations(event.target.value)}
            placeholder={"@grupo_publico\n-1001234567890"}
          />
        </div>

        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando..." : "Criar campanha"}
        </Button>
      </div>
    </div>
  );
}
