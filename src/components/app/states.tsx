import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingSkeleton({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full rounded-lg bg-muted/60" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="rounded-full bg-accent/40 p-3 text-accent-foreground">{icon ?? <Inbox className="size-5" />}</div>
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="panel flex flex-col items-center gap-3 border-destructive/40 px-6 py-10 text-center">
      <div className="rounded-full bg-destructive/15 p-3 text-destructive">
        <AlertTriangle className="size-5" />
      </div>
      <h3 className="text-base font-semibold text-foreground">Não foi possível carregar</h3>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}

export function PendingIntegration({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="panel border-warning/40 bg-warning/5 p-4">
      <p className="text-sm font-semibold text-warning">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

export function InlineLoading({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {label}
    </span>
  );
}
