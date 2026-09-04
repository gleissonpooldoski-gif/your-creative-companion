/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, LoadingSkeleton, PendingIntegration } from "@/components/app/states";
import { PageHeader, StatusBadge, formatDateTime } from "@/components/app/primitives";
import { listResource } from "@/lib/data.functions";
import {
  connectBotAccount,
  importTdata,
  reconnectAccount,
  setAccountPaused,
  verifyAccount,
} from "@/lib/telegram.functions";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Contas — Reelyx v2" },
      { name: "description", content: "Conecte bots do Telegram com validação real de token e webhook registrado." },
      { property: "og:title", content: "Contas — Reelyx v2" },
      { property: "og:description", content: "Contas de Telegram, status real e webhooks." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const queryClient = useQueryClient();
  const list = useServerFn(listResource);
  const connect = useServerFn(connectBotAccount);
  const verify = useServerFn(verifyAccount);
  const reconnect = useServerFn(reconnectAccount);
  const pause = useServerFn(setAccountPaused);
  const tdata = useServerFn(importTdata);

  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [tdataLabel, setTdataLabel] = useState("");

  const query = useQuery({
    queryKey: ["resource", "telegram_accounts"],
    queryFn: () => list({ data: { table: "telegram_accounts", limit: 50 } }),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["resource", "telegram_accounts"] });

  const connectMutation = useMutation({
    mutationFn: () => connect({ data: { name, token } }),
    onSuccess: async (result: any) => {
      toast.success(
        result.webhookRegistered
          ? `Bot @${result.username} conectado e webhook registrado.`
          : `Bot @${result.username} validado. Webhook: ${result.webhookMessage ?? "não registrado"}.`,
      );
      setName("");
      setToken("");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const tdataMutation = useMutation({
    mutationFn: () => tdata({ data: { label: tdataLabel } }),
    onSuccess: async (result: any) => {
      toast.warning(result.message);
      setTdataLabel("");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const verifyMutation = useMutation({
    mutationFn: (accountId: string) => verify({ data: { accountId } }),
    onSuccess: async (result: any) => {
      if (result.status === "online") toast.success("Conta verificada e online.");
      else toast.warning(result.message ?? `Status: ${result.status}`);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const reconnectMutation = useMutation({
    mutationFn: (accountId: string) => reconnect({ data: { accountId } }),
    onSuccess: async (result: any) => {
      toast[result.webhookRegistered ? "success" : "warning"](result.message);
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const pauseMutation = useMutation({
    mutationFn: (input: { accountId: string; paused: boolean }) => pause({ data: input }),
    onSuccess: async () => {
      toast.success("Status atualizado.");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Operação"
        title="Contas"
        description="Bots do Telegram são validados via API oficial (getMe) antes de serem salvos. Nenhuma conta fica online sem validação real."
      />

      <Tabs defaultValue="bot">
        <TabsList>
          <TabsTrigger value="bot">Bot (token)</TabsTrigger>
          <TabsTrigger value="tdata">TData / sessão</TabsTrigger>
        </TabsList>

        <TabsContent value="bot">
          <form
            className="panel grid gap-4 p-4 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              connectMutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="account-name">Nome interno</Label>
              <Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} required />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="account-token">Token do bot</Label>
              <Input
                id="account-token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="123456:ABC-DEF..."
                required
              />
              <p className="text-xs text-muted-foreground">
                O token é validado no Telegram e armazenado apenas no servidor, isolado por workspace.
              </p>
            </div>
            <div className="md:col-span-3">
              <Button type="submit" disabled={connectMutation.isPending}>
                {connectMutation.isPending ? "Validando no Telegram..." : "Conectar bot"}
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="tdata" className="space-y-4">
          <PendingIntegration
            title="Sessões de usuário exigem runtime MTProto"
            detail="Importar TData cria a conta com status 'aguardando autenticação'. Ela só ficará online após configurar API ID, API hash e um worker MTProto autorizado. O sistema nunca marca a sessão como conectada sem essa validação."
          />
          <form
            className="panel grid gap-4 p-4 md:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              tdataMutation.mutate();
            }}
          >
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="tdata-label">Identificação da sessão</Label>
              <Input
                id="tdata-label"
                value={tdataLabel}
                onChange={(event) => setTdataLabel(event.target.value)}
                required
              />
            </div>
            <div className="md:col-span-3">
              <Button type="submit" variant="secondary" disabled={tdataMutation.isPending}>
                {tdataMutation.isPending ? "Registrando..." : "Registrar sessão"}
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>

      {query.isPending ? (
        <LoadingSkeleton />
      ) : query.isError ? (
        <ErrorState message={(query.error as Error).message} onRetry={() => query.refetch()} />
      ) : (query.data?.rows.length ?? 0) === 0 ? (
        <EmptyState
          title="Nenhuma conta conectada"
          description="Conecte um bot do Telegram acima para começar a operar campanhas, grupos e fluxos de DM."
        />
      ) : (
        <div className="panel overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Username</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Webhook</TableHead>
                <TableHead>Última verificação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data?.rows.map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.name}</TableCell>
                  <TableCell className="text-muted-foreground">{row.kind}</TableCell>
                  <TableCell>{row.username ? `@${row.username}` : "—"}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.paused ? "paused" : row.status} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.webhook_url ? "active" : "pending_config"} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDateTime(row.last_checked_at)}</TableCell>
                  <TableCell className="space-x-1 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={verifyMutation.isPending}
                      onClick={() => verifyMutation.mutate(row.id)}
                    >
                      Verificar
                    </Button>
                    {row.kind === "bot" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={reconnectMutation.isPending}
                        onClick={() => reconnectMutation.mutate(row.id)}
                      >
                        Reconectar
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pauseMutation.isPending}
                      onClick={() => pauseMutation.mutate({ accountId: row.id, paused: !row.paused })}
                    >
                      {row.paused ? "Retomar" : "Pausar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
