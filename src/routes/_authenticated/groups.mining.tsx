/* eslint-disable @typescript-eslint/no-explicit-any */
import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MetricCard, PageHeader, StatusBadge, formatDateTime, formatNumber } from "@/components/app/primitives";
import { EmptyState, ErrorState, LoadingSkeleton, PendingIntegration } from "@/components/app/states";
import { GROUP_CATEGORIES, categoryLabel, parseKeywords, scoreBand } from "@/lib/groups/normalize";
import {
  getMiningStatus,
  listGroups,
  normalizeReferences,
  revalidateGroup,
  startMining,
  updateGroup,
} from "@/lib/mining.functions";
import { createCampaignFromGroups } from "@/lib/campaigns.functions";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/groups/mining")({
  head: () =>
    pageHead(
      "Mineração de Grupos",
      "Descubra, valide, classifique e selecione grupos reais para alimentar campanhas.",
    ),
  component: MiningPage,
});

function MiningPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const start = useServerFn(startMining);
  const status = useServerFn(getMiningStatus);
  const list = useServerFn(listGroups);
  const update = useServerFn(updateGroup);
  const revalidate = useServerFn(revalidateGroup);
  const normalize = useServerFn(normalizeReferences);
  const createCampaign = useServerFn(createCampaignFromGroups);

  const [keywords, setKeywords] = useState("");
  const [providerChoice, setProviderChoice] = useState("auto");
  const [sessionChoice, setSessionChoice] = useState("auto");

  const [category, setCategory] = useState<string>("todas");
  const [seeds, setSeeds] = useState("");
  const [importName, setImportName] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [campaignName, setCampaignName] = useState("");
  const [campaignMessage, setCampaignMessage] = useState("");

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("todas");
  const [filterStatus, setFilterStatus] = useState("todos");
  const [minScore, setMinScore] = useState("0");

  const statusQuery = useQuery({ queryKey: ["mining", "status"], queryFn: () => status(), refetchInterval: 8000 });

  const groupsQuery = useQuery({
    queryKey: ["mining", "groups", search, filterCategory, filterStatus, minScore],
    queryFn: () =>
      list({
        data: {
          ...(search.trim() ? { search: search.trim() } : {}),
          ...(filterCategory !== "todas" ? { category: filterCategory } : {}),
          ...(filterStatus !== "todos" ? { status: filterStatus } : {}),
          ...(Number(minScore) > 0 ? { minScore: Number(minScore) } : {}),
          limit: 100,
        },
      }),
    refetchInterval: 10_000,
  });

  const mine = useMutation({
    mutationFn: async () => {
      const parsed = parseKeywords(keywords);
      if (parsed.length === 0) throw new Error("Informe ao menos uma palavra-chave.");
      let seedReferences: string[] = [];
      if (seeds.trim()) {
        const result: any = await normalize({ data: { raw: seeds } });
        if (result.invalid.length > 0) {
          toast.warning(`${result.invalid.length} referência(s) inválida(s) ignorada(s).`);
        }
        seedReferences = result.valid;
      }
      return start({
        data: {
          keywords: parsed,
          ...(category !== "todas" ? { categories: [category] } : {}),
          ...(seedReferences.length ? { seedReferences } : {}),
          provider: providerChoice as "auto" | "telegram_mtproto" | "directory_api",
          ...(sessionChoice !== "auto" ? { mtprotoSessionId: sessionChoice } : {}),
        },
      });

    },
    onSuccess: async () => {
      toast.success("Job de mineração criado. A fila vai processá-lo e persistir os resultados.");
      await queryClient.invalidateQueries({ queryKey: ["mining"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const validateOne = useMutation({
    mutationFn: (id: string) => revalidate({ data: { id } }),
    onSuccess: async (result: any) => {
      toast[result.validation.valid ? "success" : "error"](
        result.validation.valid ? "Grupo validado no Telegram." : `Validação falhou: ${result.validation.message}`,
      );
      await queryClient.invalidateQueries({ queryKey: ["mining"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changeStatus = useMutation({
    mutationFn: (input: { id: string; status: "archived" | "blocked" | "validated" }) =>
      update({ data: { id: input.id, status: input.status } }),
    onSuccess: async () => {
      toast.success("Grupo atualizado.");
      await queryClient.invalidateQueries({ queryKey: ["mining"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toCampaign = useMutation({
    mutationFn: async () => {
      if (selected.length === 0) throw new Error("Selecione ao menos um grupo.");
      if (campaignName.trim().length < 2) throw new Error("Informe o nome da campanha.");
      if (campaignMessage.trim().length < 2) throw new Error("Informe a mensagem da campanha.");
      return createCampaign({
        data: { name: campaignName.trim(), message: campaignMessage.trim(), groupIds: selected },
      });
    },
    onSuccess: (result: any) => {
      toast.success(`Campanha criada com ${result.destinations} destino(s).`);
      setSelected([]);
      navigate({ to: "/campaigns" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows: any[] = groupsQuery.data?.rows ?? [];
  const runningJob = useMemo(
    () => (statusQuery.data?.jobs ?? []).find((job: any) => job.status === "pending" || job.status === "processing"),
    [statusQuery.data],
  );

  const readImportFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.(txt|csv)$/i.test(file.name)) {
      toast.error("Selecione um arquivo TXT ou CSV.");
      return;
    }
    if (file.size > 1_000_000) {
      toast.error("O arquivo deve ter no máximo 1 MB.");
      return;
    }
    const text = await file.text();
    const references = text
      .split(/[\r\n,;]+/)
      .map((value) => value.trim().replace(/^['"]|['"]$/g, ""))
      .filter(Boolean);
    setSeeds(references.join("\n"));
    setImportName(file.name);
    toast.success(`${references.length} linha(s) carregada(s) para validação.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Grupos"
        title="Mineração de Grupos"
        description="A mineração roda na fila: descobre referências reais, valida no Telegram, deduplica, classifica e grava no banco. Nada é inventado."
      />

      {statusQuery.data && !statusQuery.data.providerConfigured ? (
        <PendingIntegration
          title="Provider de descoberta não configurado"
          detail="Sem provider a descoberta automática não roda. Configure a integração ou importe referências públicas por TXT/CSV."
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Grupos no banco" value={formatNumber(statusQuery.data?.totalGroups ?? 0)} />
        <MetricCard label="Grupos validados" value={formatNumber(statusQuery.data?.availableGroups ?? 0)} />
        <MetricCard label="Palavras-chave" value={formatNumber(statusQuery.data?.keywords ?? 0)} />
        <MetricCard label="Job em execução" value={runningJob ? "sim" : "não"} />
      </div>

      <div className="panel space-y-4 p-4">
        <p className="text-sm font-semibold">Nova mineração</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mining-keywords">Palavras-chave (vírgula ou linha)</Label>
            <Textarea
              id="mining-keywords"
              rows={3}
              value={keywords}
              onChange={(event) => setKeywords(event.target.value)}
              placeholder={"marketing digital\ndropshipping"}
            />
            <Label htmlFor="mining-provider" className="pt-2">
              Origem da busca
            </Label>
            <Select value={providerChoice} onValueChange={setProviderChoice}>
              <SelectTrigger id="mining-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automático (conta do Telegram, depois API)</SelectItem>
                <SelectItem value="telegram_mtproto" disabled={!statusQuery.data?.mtprotoConfigured}>
                  Conta real do Telegram{statusQuery.data?.mtprotoConfigured ? "" : " (nenhuma conectada)"}
                </SelectItem>
                <SelectItem value="directory_api">API de diretório</SelectItem>
              </SelectContent>
            </Select>
            {(statusQuery.data?.mtprotoSessions ?? []).length > 0 && providerChoice !== "directory_api" ? (
              <>
                <Label htmlFor="mining-session" className="pt-2">
                  Conta do Telegram
                </Label>
                <Select value={sessionChoice} onValueChange={setSessionChoice}>
                  <SelectTrigger id="mining-session">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Escolher automaticamente</SelectItem>
                    {(statusQuery.data?.mtprotoSessions ?? []).map((session: any) => (
                      <SelectItem key={session.id} value={session.id}>
                        {session.label} — {session.phone_masked}
                        {session.flood_wait_until ? " (em espera)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mining-category">Categoria alvo</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="mining-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {GROUP_CATEGORIES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Label htmlFor="mining-seeds" className="pt-2">
              Importar referências públicas (opcional)
            </Label>
            <Textarea
              id="mining-seeds"
              rows={3}
              value={seeds}
              onChange={(event) => setSeeds(event.target.value)}
              placeholder={"https://t.me/grupo_publico\n@outro_grupo"}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="max-w-sm"
                type="file"
                accept=".txt,.csv,text/plain,text/csv"
                aria-label="Importar arquivo TXT ou CSV"
                onChange={(event) => void readImportFile(event.target.files?.[0])}
              />
              {importName ? <span className="text-xs text-muted-foreground">{importName}</span> : null}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
        <Button disabled={mine.isPending} onClick={() => mine.mutate()}>
          {mine.isPending ? "Enfileirando..." : "Minerar agora"}
        </Button>
        {!statusQuery.data?.providerConfigured ? <Button variant="secondary" asChild><Link to="/settings">Configurar provider</Link></Button> : null}
        </div>
      </div>

      <div className="panel space-y-2 p-4">
        <p className="text-sm font-semibold">Jobs recentes</p>
        {(statusQuery.data?.jobs ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum job de mineração ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Status</th>
                  <th className="py-2">Palavras-chave</th>
                  <th className="py-2">Encontrados</th>
                  <th className="py-2">Novos</th>
                  <th className="py-2">Duplicados</th>
                  <th className="py-2">Inválidos</th>
                  <th className="py-2">Provider</th>
                  <th className="py-2">Tentativas</th>
                  <th className="py-2">Criado</th>
                  <th className="py-2">Diagnóstico</th>
                </tr>
              </thead>
              <tbody>
                {(statusQuery.data?.jobs ?? []).map((job: any) => (
                  <tr key={job.id} className="border-t border-border/60">
                    <td className="py-2">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="py-2">{(job.keywords ?? []).join(", ")}</td>
                    <td className="py-2">{job.total_found ?? 0}</td>
                    <td className="py-2">{job.total_new ?? 0}</td>
                    <td className="py-2">{job.total_duplicate ?? 0}</td>
                    <td className="py-2">{job.total_invalid ?? 0}</td>
                    <td className="py-2">{job.provider ?? "—"}</td>
                    <td className="py-2">{job.attempt_count ?? 0}</td>
                    <td className="py-2">{formatDateTime(job.created_at)}</td>
                    <td className={job.error ? "py-2 text-destructive" : "py-2 text-muted-foreground"}>
                      {job.error ?? job.progress_message ?? job.progress_stage ?? "—"}
                      {job.status === "processing" && job.total_found > 0 ? ` (${job.processed_count ?? 0}/${job.total_found})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Input placeholder="Buscar título ou @username" value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as categorias</SelectItem>
              {GROUP_CATEGORIES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {["todos", "new", "validated", "invalid", "archived", "blocked"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min={0}
            max={100}
            value={minScore}
            onChange={(e) => setMinScore(e.target.value)}
            placeholder="Score mínimo"
          />
        </div>

        {groupsQuery.isLoading ? (
          <LoadingSkeleton />
        ) : groupsQuery.isError ? (
          <ErrorState message={(groupsQuery.error as Error).message} onRetry={() => groupsQuery.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nenhum grupo persistido"
            description="Rode uma mineração. Grupos só aparecem aqui depois de descoberta, validação e gravação reais."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">
                    <Checkbox
                      checked={selected.length > 0 && selected.length === rows.length}
                      onCheckedChange={(checked) => setSelected(checked ? rows.map((row) => row.id) : [])}
                    />
                  </th>
                  <th className="py-2">Grupo</th>
                  <th className="py-2">Categoria</th>
                  <th className="py-2">Membros</th>
                  <th className="py-2">Score</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Origem</th>
                  <th className="py-2">Validado</th>
                  <th className="py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border/60">
                    <td className="py-2">
                      <Checkbox
                        checked={selected.includes(row.id)}
                        onCheckedChange={(checked) =>
                          setSelected((prev) => (checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)))
                        }
                      />
                    </td>
                    <td className="py-2">
                      <span className="font-medium">{row.title ?? row.canonical_identifier}</span>
                      <span className="block text-xs text-muted-foreground">
                        {row.username ? `@${row.username}` : row.canonical_identifier}
                      </span>
                    </td>
                    <td className="py-2">{categoryLabel(row.category)}</td>
                    <td className="py-2">{formatNumber(row.member_count)}</td>
                    <td className="py-2">
                      {row.score} <span className="text-xs text-muted-foreground">({scoreBand(row.score ?? 0)})</span>
                    </td>
                    <td className="py-2">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="py-2 text-xs text-muted-foreground">{row.source ?? "—"}</td>
                    <td className="py-2 text-xs text-muted-foreground">{formatDateTime(row.last_validated_at)}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-1">
                        <Button size="sm" variant="secondary" onClick={() => validateOne.mutate(row.id)}>
                          Validar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => changeStatus.mutate({ id: row.id, status: "archived" })}
                        >
                          Arquivar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => changeStatus.mutate({ id: row.id, status: "blocked" })}
                        >
                          Bloquear
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel space-y-3 p-4">
        <p className="text-sm font-semibold">Criar campanha com {selected.length} grupo(s) selecionado(s)</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="camp-name">Nome da campanha</Label>
            <Input id="camp-name" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="camp-message">Mensagem</Label>
            <Textarea
              id="camp-message"
              rows={3}
              value={campaignMessage}
              onChange={(e) => setCampaignMessage(e.target.value)}
            />
          </div>
        </div>
        <Button disabled={toCampaign.isPending || selected.length === 0} onClick={() => toCampaign.mutate()}>
          {toCampaign.isPending ? "Criando..." : "Criar campanha com selecionados"}
        </Button>
        <p className="text-xs text-muted-foreground">
          A campanha nasce como rascunho. Vincule contas online em Campanhas e inicie para que a fila execute o envio real.
        </p>
      </div>
    </div>
  );
}
