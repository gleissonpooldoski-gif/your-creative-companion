/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  Bell,
  Bot,
  BrainCircuit,
  Boxes,
  Copy,
  CreditCard,
  Gauge,
  GitBranch,
  Instagram,
  LayoutDashboard,
  ListTree,
  Menu,
  MessageSquare,
  Megaphone,
  Phone,
  PlusCircle,
  Radar,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  Users,
  UsersRound,
  Wallet,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { globalSearch, listResource, setGlobalPause, updateResource } from "@/lib/data.functions";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { label: "Visão geral", to: "/dashboard", icon: LayoutDashboard },
  { label: "Contas", to: "/accounts", icon: Users },
  { label: "Campanhas", to: "/campaigns", icon: Megaphone },
  { label: "Bots", to: "/bots", icon: Bot },
  { label: "Lotar Grupos", to: "/groups/fill", icon: UsersRound },
  { label: "Prospecção (DM)", to: "/prospecting", icon: MessageSquare },
  { label: "Mineração de Grupos", to: "/groups/mining", icon: Radar },
  { label: "Grupos Entrados", to: "/groups/entered", icon: Boxes },
  { label: "Grupos Espelhados", to: "/groups/mirrored", icon: GitBranch },
  { label: "Fluxo DM", to: "/dm-flow", icon: ListTree },
  { label: "Cérebro", to: "/brain", icon: BrainCircuit },
  { label: "Montador de Persona", to: "/persona", icon: Sparkles },
  { label: "Remarketing Ligação", to: "/remarketing", icon: Phone },
  { label: "Clonar Bot", to: "/clone-bot", icon: Copy },
  { label: "Bots Clonados", to: "/cloned-bots", icon: Bot },
  { label: "Mini App", to: "/mini-app", icon: Zap },
  { label: "Transações", to: "/transactions", icon: CreditCard },
] as const;

const SECONDARY_NAV = [
  { label: "Inbox", to: "/inbox", icon: MessageSquare },
  { label: "CRM", to: "/crm", icon: Users },
  { label: "Cérebro / IA", to: "/ai", icon: BrainCircuit },
  { label: "Instagram", to: "/instagram", icon: Instagram },
  { label: "SMM", to: "/smm", icon: ShoppingCart },
  { label: "Carteira", to: "/wallet", icon: Wallet },
  { label: "Central de Filas", to: "/queue", icon: Gauge },
  { label: "Observabilidade", to: "/observability", icon: Activity },
  { label: "Configurações", to: "/settings", icon: Settings },
] as const;

const SHORTCUTS = [
  { label: "Disparo em BM", to: "/campaigns" },
  { label: "Grupos abertos", to: "/groups/entered" },
  { label: "Mineração", to: "/groups/mining" },
  { label: "Bots & Pix", to: "/wallet" },
] as const;

const CREATE_ACTIONS = [
  { label: "Nova campanha", to: "/campaigns/new" },
  { label: "Nova conta", to: "/accounts" },
  { label: "Novo bot", to: "/bots" },
  { label: "Novo agente IA", to: "/ai/agents/new" },
  { label: "Nova persona", to: "/persona" },
  { label: "Novo fluxo", to: "/dm-flow" },
  { label: "Novo Mini App", to: "/mini-app" },
] as const;

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ScrollArea className="h-full">
      <nav className="space-y-6 p-3">
        <div className="space-y-1">
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
            >
              <item.icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </div>
        <div className="space-y-1">
          <p className="px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Operação</p>
          {SECONDARY_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}
            >
              <item.icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </ScrollArea>
  );
}

function SearchCommand({ open, setOpen }: { open: boolean; setOpen: (value: boolean) => void }) {
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  const search = useServerFn(globalSearch);
  const { data, isFetching } = useQuery({
    queryKey: ["global-search", term],
    queryFn: () => search({ data: { term } }),
    enabled: open && term.trim().length > 1,
  });

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <Command shouldFilter={false}>
        <CommandInput placeholder="Buscar ou comandar..." value={term} onValueChange={setTerm} />
        <CommandList>
          {term.trim().length > 1 && !isFetching && (data?.results?.length ?? 0) === 0 ? (
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
          ) : null}
          {(data?.results?.length ?? 0) > 0 ? (
            <CommandGroup heading="Resultados">
              {data?.results.map((result) => (
                <CommandItem
                  key={`${result.label}-${result.id}`}
                  value={`${result.label}-${result.id}`}
                  onSelect={() => {
                    setOpen(false);
                    navigate({ to: result.path });
                  }}
                >
                  <span className="text-muted-foreground">{result.label}</span>
                  <span className="ml-2">{result.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          <CommandGroup heading="Páginas">
            {[...PRIMARY_NAV, ...SECONDARY_NAV].map((item) => (
              <CommandItem
                key={item.to}
                value={item.label}
                onSelect={() => {
                  setOpen(false);
                  navigate({ to: item.to });
                }}
              >
                <item.icon className="mr-2 size-4" />
                {item.label}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function NotificationsMenu() {
  const list = useServerFn(listResource);
  const update = useServerFn(updateResource);
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => list({ data: { table: "notifications", limit: 10 } }),
    refetchInterval: 60_000,
  });
  const unread = (data?.rows ?? []).filter((row: any) => !row.read_at);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notificações" className="relative">
          <Bell className="size-4" />
          {unread.length > 0 ? (
            <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" aria-hidden="true" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(data?.rows ?? []).length === 0 ? (
          <p className="px-2 py-4 text-sm text-muted-foreground">Nenhuma notificação por enquanto.</p>
        ) : (
          (data?.rows ?? []).map((row: any) => (
            <DropdownMenuItem
              key={row.id}
              className="flex flex-col items-start gap-0.5"
              onSelect={async () => {
                if (row.read_at) return;
                await update({
                  data: { table: "notifications", id: row.id, values: { read_at: new Date().toISOString() } },
                });
                await queryClient.invalidateQueries({ queryKey: ["notifications", "unread"] });
              }}
            >
              <span className={cn("text-sm", !row.read_at && "font-semibold")}>{row.title}</span>
              {row.body ? <span className="text-xs text-muted-foreground">{row.body}</span> : null}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();
  const pauseFn = useServerFn(setGlobalPause);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const pauseMutation = useMutation({
    mutationFn: (paused: boolean) => pauseFn({ data: { paused } }),
    onSuccess: async (result) => {
      toast.success(result.paused ? "Pausa global ativada" : "Operações retomadas");
      await queryClient.invalidateQueries({ queryKey: ["workspace-context"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    router.invalidate();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen w-full">
      <aside className="hidden w-64 shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
          <div className="size-7 rounded-md bg-primary/20 ring-1 ring-primary/40" />
          <span className="font-semibold tracking-tight">Reelyx v2</span>
        </div>
        <div className="h-[calc(100vh-3.5rem)]">
          <NavList />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir menu">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-0">
              <SheetTitle className="px-4 py-3 text-left">Reelyx v2</SheetTitle>
              <NavList onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-9 flex-1 items-center gap-2 rounded-md border border-input bg-card/60 px-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/40"
          >
            <Search className="size-4" />
            <span className="truncate">Buscar ou comandar...</span>
            <kbd className="ml-auto hidden rounded border border-border px-1.5 py-0.5 text-[10px] sm:inline">
              Ctrl + K
            </kbd>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="hidden md:inline-flex">
                Atalhos
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {SHORTCUTS.map((shortcut) => (
                <DropdownMenuItem key={shortcut.label} onSelect={() => navigate({ to: shortcut.to })}>
                  {shortcut.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="gap-1">
                <PlusCircle className="size-4" /> Criar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Ações rápidas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {CREATE_ACTIONS.map((action) => (
                <DropdownMenuItem key={action.label} onSelect={() => navigate({ to: action.to })}>
                  {action.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <NotificationsMenu />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="max-w-[12rem] justify-start truncate">
                {workspace.data?.workspaceName ?? "Workspace"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="flex flex-col">
                <span>{workspace.data?.profileName ?? "Operador"}</span>
                <span className="text-xs font-normal text-muted-foreground">{workspace.data?.email}</span>
                <span className="text-xs font-normal text-muted-foreground">Papel: {workspace.data?.role}</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => navigate({ to: "/settings" })}>Configurações</DropdownMenuItem>
              <DropdownMenuItem
                disabled={pauseMutation.isPending}
                onSelect={(event) => {
                  event.preventDefault();
                  pauseMutation.mutate(!workspace.data?.globalPause);
                }}
              >
                {workspace.data?.globalPause ? "Retomar operações" : "Pausar todas as operações"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleSignOut}>Sair</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {workspace.data?.globalPause ? (
          <div className="border-b border-warning/40 bg-warning/10 px-4 py-2 text-sm text-warning">
            Pausa global ativa — nenhum novo job será processado. A fila é preservada.
          </div>
        ) : null}

        <main className="min-w-0 flex-1 space-y-6 p-4 md:p-6">{children}</main>
      </div>

      <SearchCommand open={searchOpen} setOpen={setSearchOpen} />
    </div>
  );
}
