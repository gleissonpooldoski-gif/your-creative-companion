import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reelyx v2 — Operação de aquisição e automação" },
      {
        name: "description",
        content:
          "Reelyx v2 centraliza contas, campanhas, grupos, bots, IA e carteira em um único painel operacional com filas e auditoria reais.",
      },
      { property: "og:title", content: "Reelyx v2 — Operação de aquisição e automação" },
      {
        property: "og:description",
        content: "Painel operacional com contas, campanhas, grupos, bots, IA, carteira, filas e auditoria.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const HIGHLIGHTS = [
  { title: "Contas & Bots", body: "Conecte bots do Telegram com validação real de token e webhook registrado." },
  { title: "Campanhas", body: "Variações, destinos e contas com fila persistida, retry e watchdog." },
  { title: "Cérebro IA", body: "Geração de variações, personas e conteúdo com o gateway de IA integrado." },
  { title: "Carteira & Pix", body: "Saldo, extrato e transações — provedores externos exigem configuração." },
];

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-md bg-primary/20 ring-1 ring-primary/40" />
          <span className="font-semibold tracking-tight">Reelyx v2</span>
        </div>
        <Link
          to="/auth"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Entrar
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-20">
        <section className="py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Operação real, sem simulação</p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight md:text-5xl">
            Toda a sua aquisição, automação e monetização em um só painel.
          </h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Contas, campanhas, mineração de grupos, bots, fluxos de DM, IA, mini apps, remarketing e carteira — com fila
            persistida, retentativas, watchdog, auditoria e multi-tenant isolado por workspace.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/auth"
              className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Começar agora
            </Link>
            <Link
              to="/auth"
              className="rounded-md border border-input px-5 py-2.5 text-sm font-medium hover:bg-accent"
            >
              Já tenho conta
            </Link>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2">
          {HIGHLIGHTS.map((item) => (
            <article key={item.title} className="panel p-5">
              <h2 className="text-base font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{item.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
