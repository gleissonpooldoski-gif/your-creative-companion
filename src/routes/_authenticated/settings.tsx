/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ErrorState, LoadingSkeleton } from "@/components/app/states";
import { PageHeader, StatusBadge } from "@/components/app/primitives";
import { MtprotoAccountsSection } from "@/components/app/mtproto-accounts";

import { useWorkspace } from "@/hooks/use-workspace";
import { completeOnboarding, saveSettings, setGlobalPause } from "@/lib/data.functions";
import { getDirectoryProviderStatus, saveDirectoryProvider, testDirectoryProvider } from "@/lib/provider-config.functions";
import { pageHead } from "@/lib/head";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => pageHead("Configurações", "Limites de envio, nicho, pausa global e status das integrações."),
  component: SettingsPage,
});

function SettingsPage() {
  const workspace = useWorkspace();
  const queryClient = useQueryClient();
  const save = useServerFn(saveSettings);
  const pause = useServerFn(setGlobalPause);
  const finishOnboarding = useServerFn(completeOnboarding);
  const getProviderStatus = useServerFn(getDirectoryProviderStatus);
  const saveProvider = useServerFn(saveDirectoryProvider);
  const testProvider = useServerFn(testDirectoryProvider);

  const [messagesPerHour, setMessagesPerHour] = useState("");
  const [dailyCap, setDailyCap] = useState("");
  const [niche, setNiche] = useState("");
  const [providerUrl, setProviderUrl] = useState("");
  const [providerKey, setProviderKey] = useState("");

  const canConfigureProvider = ["owner", "admin"].includes(workspace.data?.role ?? "");
  const providerQuery = useQuery({
    queryKey: ["directory-provider-status"],
    queryFn: () => getProviderStatus(),
    enabled: canConfigureProvider,
  });

  useEffect(() => {
    if (providerQuery.data?.api_url) setProviderUrl(providerQuery.data.api_url);
  }, [providerQuery.data?.api_url]);

  useEffect(() => {
    const settings = workspace.data?.settings;
    if (!settings) return;
    setMessagesPerHour(String(settings.messages_per_hour ?? ""));
    setDailyCap(String(settings.daily_cap_per_account ?? ""));
    setNiche(settings.niche ?? "");
  }, [workspace.data?.settings]);

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          messages_per_hour: Number(messagesPerHour || 0),
          daily_cap_per_account: Number(dailyCap || 0),
          niche,
        },
      }),
    onSuccess: async () => {
      toast.success("Configurações salvas.");
      await queryClient.invalidateQueries({ queryKey: ["workspace-context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pauseMutation = useMutation({
    mutationFn: (paused: boolean) => pause({ data: { paused } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspace-context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const onboardingMutation = useMutation({
    mutationFn: () => finishOnboarding(),
    onSuccess: async () => {
      toast.success("Onboarding concluído.");
      await queryClient.invalidateQueries({ queryKey: ["workspace-context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const providerSaveMutation = useMutation({
    mutationFn: () => saveProvider({ data: { apiUrl: providerUrl.trim(), apiKey: providerKey } }),
    onSuccess: async () => {
      setProviderKey("");
      toast.success("Provider salvo com a credencial protegida.");
      await providerQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const providerTestMutation = useMutation({
    mutationFn: () => testProvider(),
    onSuccess: async (result) => {
      toast[result.ok ? "success" : "error"](result.message);
      await providerQuery.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (workspace.isPending) return <LoadingSkeleton rows={4} />;
  if (workspace.isError)
    return <ErrorState message={(workspace.error as Error).message} onRetry={() => workspace.refetch()} />;

  const settings = workspace.data?.settings;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Workspace"
        title="Configurações"
        description={`Workspace ${workspace.data?.workspaceName} — seu papel: ${workspace.data?.role}.`}
      />

      <section className="panel space-y-4 p-4">
        <h2 className="text-sm font-semibold">Limites operacionais</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="mph">Mensagens por hora</Label>
            <Input id="mph" type="number" value={messagesPerHour} onChange={(event) => setMessagesPerHour(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cap">Limite diário por conta</Label>
            <Input id="cap" type="number" value={dailyCap} onChange={(event) => setDailyCap(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="niche">Nicho</Label>
            <Input id="niche" value={niche} onChange={(event) => setNiche(event.target.value)} />
          </div>
        </div>
        <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? "Salvando..." : "Salvar configurações"}
        </Button>
      </section>

      <section className="panel space-y-3 p-4">
        <h2 className="text-sm font-semibold">Pausa global</h2>
        <div className="flex items-center gap-3">
          <Switch
            checked={Boolean(workspace.data?.globalPause)}
            disabled={pauseMutation.isPending}
            onCheckedChange={(checked) => pauseMutation.mutate(checked)}
          />
          <span className="text-sm text-muted-foreground">
            Com a pausa ativa, nenhum job é processado; a fila é preservada e retomada ao desativar.
          </span>
        </div>
      </section>

      <section className="panel space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Provider de descoberta de grupos</h2>
            <p className="mt-1 text-xs text-muted-foreground">A credencial fica protegida e nunca é exibida novamente.</p>
          </div>
          <StatusBadge status={providerQuery.data?.status ?? "not_configured"} />
        </div>
        {canConfigureProvider ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="provider-url">URL HTTPS</Label>
                <Input id="provider-url" type="url" value={providerUrl} onChange={(event) => setProviderUrl(event.target.value)} placeholder="https://api.exemplo.com/groups/search" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="provider-key">API Key</Label>
                <Input id="provider-key" type="password" autoComplete="new-password" value={providerKey} onChange={(event) => setProviderKey(event.target.value)} placeholder={providerQuery.data?.configured ? "Informe para substituir" : "Credencial do provider"} />
              </div>
            </div>
            {providerQuery.data?.last_test_message ? (
              <p className="text-xs text-muted-foreground">Último teste: {providerQuery.data.last_test_message}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button disabled={providerSaveMutation.isPending || !providerUrl.trim() || !providerKey} onClick={() => providerSaveMutation.mutate()}>
                {providerSaveMutation.isPending ? "Salvando..." : "Salvar provider"}
              </Button>
              <Button variant="secondary" disabled={providerTestMutation.isPending || !providerQuery.data?.configured} onClick={() => providerTestMutation.mutate()}>
                {providerTestMutation.isPending ? "Testando..." : "Testar conexão"}
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Somente proprietários e administradores podem alterar esta integração.</p>
        )}
      </section>

      <MtprotoAccountsSection canManage={canConfigureProvider} />


      <section className="panel space-y-3 p-4">
        <h2 className="text-sm font-semibold">Integrações</h2>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center justify-between">
            Telegram <StatusBadge status={settings?.telegram_configured ? "active" : "pending_config"} />
          </li>
          <li className="flex items-center justify-between">
            Instagram / Meta <StatusBadge status={settings?.instagram_configured ? "active" : "pending_config"} />
          </li>
          <li className="flex items-center justify-between">
            Pagamentos (Pix) <StatusBadge status={settings?.payments_configured ? "active" : "pending_config"} />
          </li>
        </ul>
        <p className="text-xs text-muted-foreground">
          Integrações marcadas como “configuração necessária” não executam ações externas e nunca reportam sucesso falso.
        </p>
      </section>

      {!workspace.data?.onboardingDone ? (
        <section className="panel space-y-3 p-4">
          <h2 className="text-sm font-semibold">Onboarding</h2>
          <p className="text-sm text-muted-foreground">
            Conecte uma conta, defina limites e crie sua primeira campanha. Depois marque o onboarding como concluído.
          </p>
          <Button variant="secondary" disabled={onboardingMutation.isPending} onClick={() => onboardingMutation.mutate()}>
            Concluir onboarding
          </Button>
        </section>
      ) : null}
    </div>
  );
}
