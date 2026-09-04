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
import { PageHeader, StatusBadge, formatNumber } from "@/components/app/primitives";
import { PendingIntegration } from "@/components/app/states";
import { createResource } from "@/lib/data.functions";
import { generateVariations } from "@/lib/ai.functions";
import { createCampaignFromGroups, listCampaignAccounts } from "@/lib/campaigns.functions";
import { listGroups } from "@/lib/mining.functions";
import { categoryLabel } from "@/lib/groups/normalize";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/campaigns/new")({
  head: () =>
    pageHead("Nova campanha", "Assistente de campanha com grupos minerados, contas reais e execução pela fila."),
  component: NewCampaign,
});

function NewCampaign() {
  const navigate = useNavigate();
  const accountsFn = useServerFn(listCampaignAccounts);
  const groupsFn = useServerFn(listGroups);
  const create = useServerFn(createCampaignFromGroups);
  const createRow = useServerFn(createResource);
  const variationsFn = useServerFn(generateVariations);

  const [name, setName] = useState("");
  const [network, setNetwork] = useState("group");
  const [baseMessage, setBaseMessage] = useState("");
  const [link, setLink] = useState("");
  const [variations, setVariations] = useState<string[]>([]);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [messagesPerHour, setMessagesPerHour] = useState("30");
  const [dailyCap, setDailyCap] = useState("50");

  const accounts = useQuery({ queryKey: ["campaign-accounts"], queryFn: () => accountsFn() });
  const groups = useQuery({
    queryKey: ["campaign-groups"],
    queryFn: () => groupsFn({ data: { onlyValid: true, limit: 100 } }),
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
      const result: any = await create({
        data: {
          name: name.trim(),
          message: baseMessage.trim(),
          network,
          ...(link.trim() ? { link: link.trim() } : {}),
          messagesPerHour: Number(messagesPerHour) || 30,
          dailyCapPerAccount: Number(dailyCap) || 50,
          groupIds: selectedGroups,
          accountIds: selectedAccounts,
        },
      });
      for (const [index, content] of variations.entries()) {
        await createRow({
          data: {
            table: "campaign_variations",
            values: { campaign_id: result.campaignId, content, generated_by: "ai", approved: index === 0 },
          },
        });
      }
      return result;
    },
    onSuccess: (result: any) => {
      toast.success(`Campanha criada como rascunho com ${result.destinations} destino(s).`);
      navigate({ to: "/campaigns" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const accountRows: any[] = accounts.data?.accounts ?? [];
  const groupRows: any[] = groups.data?.rows ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Campanhas"
        title="Nova campanha"
        description="Selecione grupos minerados e validados, escolha contas online e defina o ritmo. A execução ocorre pela fila com confirmação do provedor."
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
            <Label htmlFor="campaign-network">Canal</Label>
            <Input
              id="campaign-network"
              value={network}
              onChange={(event) => setNetwork(event.target.value)}
              placeholder="group | dm | mixed"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-pace">Mensagens por hora</Label>
            <Input
              id="campaign-pace"
              type="number"
              min={1}
              value={messagesPerHour}
              onChange={(event) => setMessagesPerHour(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-cap">Limite diário por conta</Label>
            <Input
              id="campaign-cap"
              type="number"
              min={1}
              value={dailyCap}
              onChange={(event) => setDailyCap(event.target.value)}
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
          <Input placeholder="Link (opcional)" value={link} onChange={(event) => setLink(event.target.value)} />
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
          {accountRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conta conectada. Conecte um bot em Contas.</p>
          ) : (
            accountRows.map((account) => (
              <label key={account.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selectedAccounts.includes(account.id)}
                  onCheckedChange={(checked) =>
                    setSelectedAccounts((prev) =>
                      checked ? [...prev, account.id] : prev.filter((id) => id !== account.id),
                    )
                  }
                />
                {account.name} <StatusBadge status={account.status} />
              </label>
            ))
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">Grupos minerados validados ({groupRows.length})</p>
          {groupRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum grupo validado. Rode a Mineração de Grupos para popular a base.
            </p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {groupRows.map((group) => (
                <label key={group.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={selectedGroups.includes(group.id)}
                    onCheckedChange={(checked) =>
                      setSelectedGroups((prev) =>
                        checked ? [...prev, group.id] : prev.filter((id) => id !== group.id),
                      )
                    }
                  />
                  <span className="font-medium">{group.title ?? group.canonical_identifier}</span>
                  <span className="text-xs text-muted-foreground">
                    {categoryLabel(group.category)} · {formatNumber(group.member_count)} membros · score {group.score}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <Button disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Salvando..." : "Criar campanha"}
        </Button>
      </div>
    </div>
  );
}
