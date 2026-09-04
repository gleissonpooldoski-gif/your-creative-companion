// Group discovery provider layer. Server-only.
// Nothing here invents groups: discovery requires a configured directory provider,
// validation reads the public t.me preview page of a public group.

import { normalizeGroupReference } from "@/lib/groups/normalize";

export type DiscoveryInput = {
  keywords: string[];
  categories: string[];
  limit: number;
  /** References supplied by the user (import flow). Always allowed. */
  seedReferences?: string[];
};

export type GroupDiscoveryResult = {
  reference: string;
  title?: string | null;
  description?: string | null;
  memberCount?: number | null;
  source: string;
};

export type GroupValidationResult = {
  valid: boolean;
  title?: string | null;
  description?: string | null;
  memberCount?: number | null;
  isPublic: boolean;
  code?: string;
  reason?: string;
};

export interface GroupDiscoveryProvider {
  readonly name: string;
  readonly configured: boolean;
  discoverGroups(input: DiscoveryInput): Promise<GroupDiscoveryResult[]>;
  validateGroup(reference: string): Promise<GroupValidationResult>;
}

export const PROVIDER_NOT_CONFIGURED = "Nenhum provider de descoberta configurado.";

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function meta(html: string, property: string): string | null {
  const pattern = new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*)["']`, "i");
  const match = html.match(pattern);
  return match?.[1] ? decodeEntities(match[1]) : null;
}

function parseMemberCount(html: string): number | null {
  const match = html.match(/([\d\s.,]+)\s*(?:members|subscribers|membros|inscritos)/i);
  if (!match?.[1]) return null;
  const digits = match[1].replace(/[^\d]/g, "");
  if (!digits) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

/** Validates a public group by reading its public t.me preview page. */
export async function validatePublicTelegramGroup(reference: string): Promise<GroupValidationResult> {
  const normalized = normalizeGroupReference(reference);
  if (!normalized) {
    return { valid: false, isPublic: false, code: "INVALID_REFERENCE", reason: "Referência de grupo inválida." };
  }
  if (!normalized.username) {
    return {
      valid: false,
      isPublic: false,
      code: "PRIVATE_INVITE",
      reason: "Convite privado não pode ser validado publicamente. Requer runtime autorizado.",
    };
  }

  let response: Response;
  try {
    response = await fetch(`https://t.me/${normalized.username}`, {
      headers: { "user-agent": "Mozilla/5.0 (compatible; ReelyxGroupValidator/1.0)" },
    });
  } catch (error) {
    return {
      valid: false,
      isPublic: true,
      code: "NETWORK_ERROR",
      reason: error instanceof Error ? error.message : "falha de rede",
    };
  }

  if (response.status === 404) {
    return { valid: false, isPublic: true, code: "NOT_FOUND", reason: "Grupo inexistente ou removido." };
  }
  if (response.status === 429) {
    return { valid: false, isPublic: true, code: "RATE_LIMITED", reason: "Limite de requisições atingido." };
  }
  if (!response.ok) {
    return { valid: false, isPublic: true, code: "PROVIDER_ERROR", reason: `HTTP ${response.status}` };
  }

  const html = await response.text();
  const title = meta(html, "og:title");
  const description = meta(html, "og:description");
  if (!title || !/tgme_page/.test(html)) {
    return { valid: false, isPublic: true, code: "NOT_FOUND", reason: "Página pública não encontrada." };
  }


  const cleanTitle = (title ?? "").replace(/^Telegram:\s*Contact\s*@?/i, "").trim() || normalized.username;
  return {
    valid: true,
    isPublic: true,
    title: cleanTitle,
    description,
    memberCount: parseMemberCount(html),
  };
}

/**
 * Directory-backed discovery. Requires an authorized directory/search API:
 *   GROUP_DIRECTORY_API_URL  (POST, JSON)
 *   GROUP_DIRECTORY_API_KEY  (bearer)
 * Response shape: { results: [{ reference|link|username, title?, description?, member_count? }] }
 */
class DirectoryDiscoveryProvider implements GroupDiscoveryProvider {
  readonly name = "directory_api";
  constructor(
    private readonly url: string,
    private readonly key: string,
  ) {}
  get configured() {
    return Boolean(this.url && this.key);
  }
  async discoverGroups(input: DiscoveryInput): Promise<GroupDiscoveryResult[]> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: { authorization: `Bearer ${this.key}`, "content-type": "application/json" },
      body: JSON.stringify({ keywords: input.keywords, categories: input.categories, limit: input.limit }),
    });
    if (!response.ok) {
      throw new Error(`Provider de descoberta respondeu HTTP ${response.status}`);
    }
    const payload = (await response.json()) as {
      results?: Array<{ reference?: string; link?: string; username?: string; title?: string; description?: string; member_count?: number }>;
    };
    const out: GroupDiscoveryResult[] = [];
    for (const item of payload.results ?? []) {
      const reference = item.reference ?? item.link ?? item.username ?? "";
      if (!reference) continue;
      out.push({
        reference,
        title: item.title ?? null,
        description: item.description ?? null,
        memberCount: item.member_count ?? null,
        source: this.name,
      });
    }
    return out;

  }
  validateGroup(reference: string) {
    return validatePublicTelegramGroup(reference);
  }
}

/** Seed provider: the operator supplies the references, we validate them for real. */
class SeedDiscoveryProvider implements GroupDiscoveryProvider {
  readonly name = "seed_import";
  readonly configured = true;
  async discoverGroups(input: DiscoveryInput): Promise<GroupDiscoveryResult[]> {
    return (input.seedReferences ?? [])
      .map((reference) => reference.trim())
      .filter(Boolean)
      .slice(0, input.limit)
      .map((reference) => ({ reference, source: this.name }));
  }
  validateGroup(reference: string) {
    return validatePublicTelegramGroup(reference);
  }
}

export function getDiscoveryProvider(input: DiscoveryInput): GroupDiscoveryProvider | null {
  if ((input.seedReferences ?? []).length > 0) return new SeedDiscoveryProvider();
  const url = process.env["GROUP_DIRECTORY_API_URL"];
  const key = process.env["GROUP_DIRECTORY_API_KEY"];
  if (url && key) return new DirectoryDiscoveryProvider(url, key);
  return null;
}

export function discoveryProviderStatus(): { configured: boolean; name: string | null; missing: string[] } {
  const url = process.env["GROUP_DIRECTORY_API_URL"];
  const key = process.env["GROUP_DIRECTORY_API_KEY"];
  const missing: string[] = [];
  if (!url) missing.push("GROUP_DIRECTORY_API_URL");
  if (!key) missing.push("GROUP_DIRECTORY_API_KEY");
  return { configured: missing.length === 0, name: missing.length === 0 ? "directory_api" : null, missing };
}
