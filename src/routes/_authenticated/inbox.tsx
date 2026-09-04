/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/app/states";
import { PageHeader, StatusBadge, formatDateTime } from "@/components/app/primitives";
import { enqueueJob, listResource } from "@/lib/data.functions";
import { copilotRewrite } from "@/lib/ai.functions";
import { pageHead } from "@/lib/head";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => pageHead("Inbox", "Conversas reais recebidas pelos bots, com copiloto de resposta por IA."),
  component: InboxPage,
});

function InboxPage() {
  const list = useServerFn(listResource);
  const enqueue = useServerFn(enqueueJob);
  const rewrite = useServerFn(copilotRewrite);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const contacts = useQuery({
    queryKey: ["resource", "contacts", "inbox"],
    queryFn: () => list({ data: { table: "contacts", limit: 50 } }),
  });
  const activities = useQuery({
    queryKey: ["resource", "activities", "inbox"],
    queryFn: () => list({ data: { table: "activities", limit: 200 } }),
  });

  const improve = useMutation({
    mutationFn: () => rewrite({ data: { message: draft } }),
    onSuccess: (result: any) => {
      setDraft(result.message ?? draft);
      toast.success("Resposta reescrita pela IA.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const send = useMutation({
    mutationFn: () =>
      enqueue({ data: { kind: "send_dm", payload: { contact_id: selected, message: draft } } }),
    onSuccess: async () => {
      toast.success("Resposta enfileirada para envio.");
      setDraft("");
      await queryClient.invalidateQueries({ queryKey: ["resource", "activities", "inbox"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = contacts.data?.rows ?? [];
  const thread = (activities.data?.rows ?? []).filter((row: any) => row.contact_id === selected);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb="Operação"
        title="Inbox"
        description="Mensagens chegam pelo webhook do Telegram. O envio passa pela fila e só é marcado como enviado após confirmação da API."
      />

      {contacts.isPending ? (
        <LoadingSkeleton />
      ) : contacts.isError ? (
        <ErrorState message={(contacts.error as Error).message} onRetry={() => contacts.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhuma conversa ainda"
          description="Quando alguém falar com seu bot, o contato e a conversa aparecem aqui automaticamente."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
          <div className="panel max-h-[32rem] overflow-y-auto p-2">
            {rows.map((contact: any) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => setSelected(contact.id)}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
                  selected === contact.id && "bg-accent",
                )}
              >
                <span className="block truncate font-medium">
                  {contact.full_name ?? contact.username ?? contact.telegram_user_id}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {contact.username ? `@${contact.username}` : "sem username"}
                </span>
              </button>
            ))}
          </div>

          <div className="panel flex min-h-[24rem] flex-col p-4">
            {!selected ? (
              <p className="text-sm text-muted-foreground">Selecione uma conversa para ver o histórico.</p>
            ) : (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {thread.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem mensagens registradas para este contato.</p>
                  ) : (
                    thread.map((activity: any) => (
                      <div
                        key={activity.id}
                        className={cn(
                          "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                          activity.direction === "outbound"
                            ? "ml-auto bg-primary/20"
                            : "bg-muted/60",
                        )}
                      >
                        <p>{activity.summary ?? activity.kind}</p>
                        <p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(activity.created_at)}</p>
                      </div>
                    ))
                  )}
                </div>

                <div className="mt-4 space-y-2 border-t border-border pt-3">
                  <Textarea
                    rows={3}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder="Escreva a resposta..."
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={send.isPending || !draft.trim()} onClick={() => send.mutate()}>
                      {send.isPending ? "Enfileirando..." : "Enviar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={improve.isPending || draft.trim().length < 3}
                      onClick={() => improve.mutate()}
                    >
                      {improve.isPending ? "Reescrevendo..." : "Copiloto IA"}
                    </Button>
                    <StatusBadge status="pending" />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
