/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge, formatDateTime } from "@/components/app/primitives";
import {
  confirmMtprotoCode,
  confirmMtprotoPassword,
  getMtprotoStatus,
  removeMtprotoSession,
  saveMtprotoService,
  startMtprotoLogin,
  testMtprotoConnection,
} from "@/lib/mtproto.functions";

/**
 * Real Telegram accounts used for mining. The phone number, login code and 2FA
 * password are sent straight to the server and never stored in the browser.
 */
export function MtprotoAccountsSection({ canManage }: { canManage: boolean }) {
  const status = useServerFn(getMtprotoStatus);
  const saveService = useServerFn(saveMtprotoService);
  const testService = useServerFn(testMtprotoConnection);
  const startLogin = useServerFn(startMtprotoLogin);
  const confirmCode = useServerFn(confirmMtprotoCode);
  const confirmPassword = useServerFn(confirmMtprotoPassword);
  const removeSession = useServerFn(removeMtprotoSession);

  const [serviceUrl, setServiceUrl] = useState("");
  const [serviceToken, setServiceToken] = useState("");
  const [label, setLabel] = useState("");
  const [phone, setPhone] = useState("");
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "code" | "password">("idle");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  const query = useQuery({ queryKey: ["mtproto", "status"], queryFn: () => status(), enabled: canManage, refetchInterval: 15_000 });

  useEffect(() => {
    if (query.data?.service_url) setServiceUrl(query.data.service_url);
  }, [query.data?.service_url]);

  const saveMutation = useMutation({
    mutationFn: () => saveService({ data: { serviceUrl: serviceUrl.trim(), token: serviceToken } }),
    onSuccess: async () => {
      setServiceToken("");
      toast.success("Serviço de Telegram salvo com o token protegido.");
      await query.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const testMutation = useMutation({
    mutationFn: () => testService(),
    onSuccess: async (result: any) => {
      toast[result.ok ? "success" : "error"](result.message);
      await query.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const loginMutation = useMutation({
    mutationFn: () => startLogin({ data: { label: label.trim(), phone: phone.trim() } }),
    onSuccess: async (result: any) => {
      setPendingSessionId(result.sessionId);
      setStep(result.status === "connected" ? "idle" : "code");
      toast.success(result.status === "connected" ? "Conta já autorizada." : "Código enviado pelo Telegram. Informe-o abaixo.");
      await query.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const codeMutation = useMutation({
    mutationFn: () => confirmCode({ data: { sessionId: pendingSessionId as string, code: code.trim() } }),
    onSuccess: async (result: any) => {
      setCode("");
      if (result.status === "awaiting_password") {
        setStep("password");
        toast.info("Esta conta usa verificação em duas etapas. Informe a senha.");
      } else {
        setStep("idle");
        setPendingSessionId(null);
        setPhone("");
        setLabel("");
        toast.success("Conta do Telegram conectada.");
      }
      await query.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const passwordMutation = useMutation({
    mutationFn: () => confirmPassword({ data: { sessionId: pendingSessionId as string, password } }),
    onSuccess: async (result: any) => {
      setPassword("");
      if (result.status === "connected") {
        setStep("idle");
        setPendingSessionId(null);
        setPhone("");
        setLabel("");
        toast.success("Conta do Telegram conectada.");
      }
      await query.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeSession({ data: { sessionId: id } }),
    onSuccess: async () => {
      toast.success("Conta removida.");
      await query.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!canManage) {
    return (
      <section className="panel space-y-2 p-4">
        <h2 className="text-sm font-semibold">Contas do Telegram para mineração</h2>
        <p className="text-sm text-muted-foreground">Somente proprietários e administradores podem gerenciar estas contas.</p>
      </section>
    );
  }

  const sessions = (query.data?.sessions ?? []) as any[];

  return (
    <section className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Contas do Telegram para mineração</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            A busca real no Telegram roda no serviço próprio que você hospeda. Telefone, código e senha nunca são guardados aqui.
          </p>
        </div>
        <StatusBadge status={query.data?.status ?? "not_configured"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mtproto-url">URL do serviço</Label>
          <Input
            id="mtproto-url"
            type="url"
            value={serviceUrl}
            onChange={(event) => setServiceUrl(event.target.value)}
            placeholder="https://meu-servico-telegram.exemplo.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mtproto-token">Token do serviço</Label>
          <Input
            id="mtproto-token"
            type="password"
            autoComplete="new-password"
            value={serviceToken}
            onChange={(event) => setServiceToken(event.target.value)}
            placeholder={query.data?.configured ? "Informe para substituir" : "Token definido no serviço"}
          />
        </div>
      </div>
      {query.data?.last_test_message ? (
        <p className="text-xs text-muted-foreground">
          Último teste: {query.data.last_test_message}
          {query.data.last_tested_at ? ` — ${formatDateTime(query.data.last_tested_at)}` : ""}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={saveMutation.isPending || !serviceUrl.trim() || !serviceToken} onClick={() => saveMutation.mutate()}>
          {saveMutation.isPending ? "Salvando..." : "Salvar serviço"}
        </Button>
        <Button variant="secondary" disabled={testMutation.isPending || !query.data?.configured} onClick={() => testMutation.mutate()}>
          {testMutation.isPending ? "Testando..." : "Testar conexão"}
        </Button>
      </div>

      <div className="space-y-3 border-t border-border/60 pt-4">
        <p className="text-sm font-semibold">Conectar uma conta</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mtproto-label">Apelido da conta</Label>
            <Input id="mtproto-label" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Conta principal" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mtproto-phone">Telefone (com código do país)</Label>
            <Input id="mtproto-phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+5511999999999" />
          </div>
        </div>
        <Button
          disabled={loginMutation.isPending || !query.data?.configured || !label.trim() || !phone.trim()}
          onClick={() => loginMutation.mutate()}
        >
          {loginMutation.isPending ? "Enviando código..." : "Enviar código do Telegram"}
        </Button>

        {step === "code" && pendingSessionId ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="mtproto-code">Código recebido</Label>
              <Input id="mtproto-code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" />
            </div>
            <Button disabled={codeMutation.isPending || code.trim().length < 4} onClick={() => codeMutation.mutate()}>
              {codeMutation.isPending ? "Confirmando..." : "Confirmar código"}
            </Button>
          </div>
        ) : null}

        {step === "password" && pendingSessionId ? (
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="mtproto-password">Senha da verificação em duas etapas</Label>
              <Input
                id="mtproto-password"
                type="password"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            <Button disabled={passwordMutation.isPending || !password} onClick={() => passwordMutation.mutate()}>
              {passwordMutation.isPending ? "Confirmando..." : "Confirmar senha"}
            </Button>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-border/60 pt-4">
        <p className="text-sm font-semibold">Contas cadastradas</p>
        {sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada. Sem conta conectada, a mineração pelo Telegram não roda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-2">Apelido</th>
                  <th className="py-2">Telefone</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Última conexão</th>
                  <th className="py-2">Diagnóstico</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-t border-border/60">
                    <td className="py-2">{session.label}</td>
                    <td className="py-2">{session.phone_masked}</td>
                    <td className="py-2">
                      <StatusBadge status={session.status} />
                    </td>
                    <td className="py-2">{session.last_connected_at ? formatDateTime(session.last_connected_at) : "—"}</td>
                    <td className={session.last_error ? "py-2 text-destructive" : "py-2 text-muted-foreground"}>
                      {session.last_error ??
                        (session.flood_wait_until ? `Em espera até ${formatDateTime(session.flood_wait_until)}` : "—")}
                    </td>
                    <td className="py-2 text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {session.status !== "connected" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setPendingSessionId(session.id);
                              setStep("code");
                            }}
                          >
                            Informar código
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={removeMutation.isPending}
                          onClick={() => removeMutation.mutate(session.id)}
                        >
                          Remover
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
    </section>
  );
}
