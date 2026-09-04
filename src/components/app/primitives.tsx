import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_TONES: Record<string, string> = {
  online: "bg-success/15 text-success border-success/30",
  active: "bg-success/15 text-success border-success/30",
  running: "bg-success/15 text-success border-success/30",
  sent: "bg-success/15 text-success border-success/30",
  published: "bg-success/15 text-success border-success/30",
  paid: "bg-success/15 text-success border-success/30",
  completed: "bg-success/15 text-success border-success/30",
  pending_auth: "bg-warning/15 text-warning border-warning/30",
  pending: "bg-warning/15 text-warning border-warning/30",
  paused: "bg-warning/15 text-warning border-warning/30",
  retry: "bg-warning/15 text-warning border-warning/30",
  scheduled: "bg-info/15 text-info border-info/30",
  processing: "bg-info/15 text-info border-info/30",
  checking: "bg-info/15 text-info border-info/30",
  upload: "bg-info/15 text-info border-info/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  error: "bg-destructive/15 text-destructive border-destructive/30",
  cancelled: "bg-muted text-muted-foreground border-border",
  skipped: "bg-muted text-muted-foreground border-border",
  draft: "bg-muted text-muted-foreground border-border",
  finished: "bg-muted text-muted-foreground border-border",
  pending_config: "bg-warning/15 text-warning border-warning/30",
  awaiting_config: "bg-warning/15 text-warning border-warning/30",
};

const STATUS_LABELS: Record<string, string> = {
  online: "Online",
  pending_auth: "Aguardando autenticação",
  failed: "Falha",
  checking: "Verificando",
  paused: "Pausada",
  draft: "Rascunho",
  scheduled: "Agendada",
  running: "Rodando",
  finished: "Finalizada",
  cancelled: "Cancelada",
  pending: "Pendente",
  processing: "Processando",
  completed: "Concluído",
  retry: "Retry",
  sent: "Enviado",
  skipped: "Pulado",
  active: "Ativo",
  published: "Publicado",
  paid: "Pago",
  upload: "Upload",
  pending_config: "Configuração necessária",
  awaiting_config: "Configuração necessária",
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const key = (status ?? "unknown").toLowerCase();
  return (
    <Badge variant="outline" className={cn("font-medium", STATUS_TONES[key] ?? "bg-muted text-muted-foreground")}>
      {STATUS_LABELS[key] ?? key}
    </Badge>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  tone = "default",
  action,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger";
  action?: ReactNode;
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "danger"
          ? "text-destructive"
          : "text-foreground";
  return (
    <div className="panel p-4 transition-shadow hover:shadow-glow">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", toneClass)}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  breadcrumb,
  title,
  description,
  actions,
}: {
  breadcrumb?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {breadcrumb ? <p className="text-xs font-medium text-muted-foreground">{breadcrumb}</p> : null}
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function formatMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value ?? 0));
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("pt-BR").format(Number(value ?? 0));
}
