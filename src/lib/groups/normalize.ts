// Pure, client-safe helpers for group normalization, dedup keys, scoring and categories.
// No network, no database — unit-tested in normalize.test.ts.

export const GROUP_CATEGORIES = [
  { value: "divulgacao", label: "Divulgação & Cooperação" },
  { value: "renda_extra", label: "Renda Extra & Ganhar Dinheiro" },
  { value: "afiliados", label: "Afiliados & Marketing" },
  { value: "cripto", label: "Cripto & Trader" },
  { value: "apostas", label: "Apostas & Cassino" },
  { value: "sorteios", label: "Sorteios & Promoções" },
  { value: "influencia", label: "Blogueiros & Influência" },
  { value: "vendas", label: "Vendas & Comércio" },
  { value: "adulto", label: "Adulto +18" },
  { value: "regioes", label: "Cidades & Regiões" },
  { value: "games", label: "Games & Streaming" },
  { value: "geral_br", label: "Grupos Gerais BR" },
] as const;

export type GroupCategory = (typeof GROUP_CATEGORIES)[number]["value"];

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return GROUP_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export type NormalizedGroup = {
  canonicalIdentifier: string;
  username: string | null;
  inviteLink: string | null;
  isPublic: boolean;
};

/**
 * Converts every accepted shape of a Telegram group reference into one canonical form.
 *   https://t.me/grupo | t.me/grupo | @grupo | grupo   -> "grupo" (public username)
 *   https://t.me/+abc  | t.me/joinchat/abc             -> "invite:abc" (private invite)
 * Returns null when the input cannot be interpreted as a group reference.
 */
export function normalizeGroupReference(raw: string): NormalizedGroup | null {
  const input = (raw ?? "").trim();
  if (!input) return null;

  let rest = input
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^(t\.me|telegram\.me|telegram\.dog)\//i, "")
    .replace(/^@/, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "")
    .trim();
  if (!rest) return null;

  const joinchat = rest.match(/^joinchat\/(.+)$/i);
  if (joinchat?.[1]) {
    const hash = joinchat[1].trim();
    return { canonicalIdentifier: `invite:${hash}`, username: null, inviteLink: `https://t.me/joinchat/${hash}`, isPublic: false };
  }
  if (rest.startsWith("+")) {
    const hash = rest.slice(1).trim();
    if (!hash) return null;
    return { canonicalIdentifier: `invite:${hash}`, username: null, inviteLink: `https://t.me/+${hash}`, isPublic: false };
  }

  // strip trailing "/123" message ids and "s/" preview prefix
  rest = rest.replace(/^s\//i, "").replace(/\/\d+$/, "");
  const username = rest.toLowerCase();
  if (!/^[a-z0-9_]{4,32}$/.test(username)) return null;
  return {
    canonicalIdentifier: username,
    username,
    inviteLink: `https://t.me/${username}`,
    isPublic: true,
  };
}

export function parseKeywords(raw: string): string[] {
  return Array.from(
    new Set(
      (raw ?? "")
        .split(/[,\n;]/)
        .map((k) => k.trim().toLowerCase())
        .filter((k) => k.length > 1 && k.length <= 60),
    ),
  );
}

export type ScoreInput = {
  title?: string | null;
  description?: string | null;
  keywords: string[];
  category?: string | null;
  requestedCategories?: string[];
  memberCount?: number | null;
  isValid: boolean;
  lastSeenAt?: string | Date | null;
};

export type ScoreResult = { score: number; matchedKeywords: string[] };

/** Deterministic 0-100 relevance score. Used as-is and as fallback when AI is unavailable. */
export function computeGroupScore(input: ScoreInput): ScoreResult {
  const title = (input.title ?? "").toLowerCase();
  const description = (input.description ?? "").toLowerCase();
  const matched = input.keywords.filter((k) => title.includes(k) || description.includes(k));

  let score = 0;
  if (input.keywords.length > 0) {
    score += Math.round((matched.length / input.keywords.length) * 30); // keyword_match
  }
  if (input.keywords.some((k) => title.includes(k))) score += 20; // title_match
  if (input.keywords.some((k) => description.includes(k))) score += 10; // description_match
  if (input.category && (input.requestedCategories ?? []).includes(input.category)) score += 10; // category_match
  if (input.isValid) score += 20; // validation
  const members = input.memberCount ?? 0;
  if (members >= 50_000) score += 5;
  else if (members >= 5_000) score += 3;
  else if (members >= 500) score += 1;

  // freshness
  const seen = input.lastSeenAt ? new Date(input.lastSeenAt).getTime() : Date.now();
  const ageDays = (Date.now() - seen) / 86_400_000;
  if (ageDays <= 7) score += 5;
  else if (ageDays <= 30) score += 2;

  return { score: Math.max(0, Math.min(100, score)), matchedKeywords: matched };
}

export function scoreBand(score: number): "baixo" | "médio" | "alto" {
  if (score >= 70) return "alto";
  if (score >= 40) return "médio";
  return "baixo";
}
