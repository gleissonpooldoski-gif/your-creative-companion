// Group discovery provider layer. Server-only.
// Nothing here invents groups: discovery requires a configured directory provider,
// validation reads the public t.me preview page of a public group.

import { normalizeGroupReference } from "@/lib/groups/normalize";
import { loadProviderConfig } from "@/lib/provider-config.server";

export type DiscoveryInput = {
  keywords: string[];
  categories: string[];
  limit: number;
  /** References supplied by the user (import flow). Always allowed. */
  seedReferences?: string[];
};

export type GroupDiscoveryResult = {
  reference: string;
  externalId?: string | null;
  username?: string | null;
  publicLink?: string | null;
  title?: string | null;
  description?: string | null;
  memberCount?: number | null;
  source: string;
  discoveredAt?: string | null;
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
const DIRECTORY_TIMEOUT_MS = 20_000;

export type ProviderConnectionResult = {
  ok: boolean;
  code: "CONNECTED" | "NOT_CONFIGURED" | "INVALID_URL" | "INVALID_KEY" | "TIMEOUT" | "EXTERNAL_ERROR";
  message: string;
};

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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DIRECTORY_TIMEOUT_MS);
    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: { authorization: `Bearer ${this.key}`, "content-type": "application/json" },
        body: JSON.stringify({ keywords: input.keywords, categories: input.categories, limit: input.limit }),
        signal: controller.signal,
      });
      if (response.status === 401 || response.status === 403) throw new Error("API Key inválida.");
      if (!response.ok) throw new Error(`Provider externo respondeu HTTP ${response.status}.`);
      const payload = (await response.json()) as {
        results?: Array<{
          externalId?: string;
          external_id?: string;
          reference?: string;
          publicLink?: string;
          public_link?: string;
          link?: string;
          username?: string;
          title?: string;
          description?: string;
          memberCount?: number;
          member_count?: number;
          discoveredAt?: string;
          discovered_at?: string;
        }>;
      };
      if (!Array.isArray(payload.results)) throw new Error("Resposta do provider fora do formato esperado.");
      return parseDirectoryResults(payload.results);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Provider não respondeu dentro do tempo esperado.");
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  validateGroup(reference: string) {
    return validatePublicTelegramGroup(reference);
  }
}

type DirectoryItem = {
  externalId?: string;
  external_id?: string;
  reference?: string;
  publicLink?: string;
  public_link?: string;
  link?: string;
  username?: string;
  title?: string;
  description?: string;
  memberCount?: number;
  member_count?: number;
  discoveredAt?: string;
  discovered_at?: string;
};

export function parseDirectoryResults(items: DirectoryItem[]): GroupDiscoveryResult[] {
  const out: GroupDiscoveryResult[] = [];
  for (const item of items) {
        const reference = item.reference ?? item.publicLink ?? item.public_link ?? item.link ?? item.username ?? "";
        if (!reference) continue;
        const normalized = normalizeGroupReference(reference);
        out.push({
          reference,
          externalId: item.externalId ?? item.external_id ?? null,
          username: item.username ?? normalized?.username ?? null,
          publicLink: item.publicLink ?? item.public_link ?? item.link ?? normalized?.inviteLink ?? null,
          title: item.title ?? null,
          description: item.description ?? null,
          memberCount: item.memberCount ?? item.member_count ?? null,
          source: this.name,
          discoveredAt: item.discoveredAt ?? item.discovered_at ?? null,
        });
  }
  return out;
}

export function createDirectoryDiscoveryProvider(url: string, key: string): GroupDiscoveryProvider {
  return new DirectoryDiscoveryProvider(url, key);
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

export async function getDiscoveryProvider(input: DiscoveryInput, workspaceId?: string): Promise<GroupDiscoveryProvider | null> {
  if ((input.seedReferences ?? []).length > 0) return new SeedDiscoveryProvider();
  const config = workspaceId ? await loadProviderConfig(workspaceId) : null;
  const url = config?.apiUrl ?? process.env["GROUP_DIRECTORY_API_URL"];
  const key = config?.apiKey ?? process.env["GROUP_DIRECTORY_API_KEY"];
  if (url && key) return new DirectoryDiscoveryProvider(url, key);
  return null;
}

export async function testConfiguredDiscoveryProvider(workspaceId: string): Promise<ProviderConnectionResult> {
  const config = await loadProviderConfig(workspaceId);
  if (!config) return { ok: false, code: "NOT_CONFIGURED", message: "Provider não configurado." };
  try {
    const url = new URL(config.apiUrl);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      return { ok: false, code: "INVALID_URL", message: "URL do provider inválida." };
    }
  } catch {
    return { ok: false, code: "INVALID_URL", message: "URL do provider inválida." };
  }
  try {
    const provider = new DirectoryDiscoveryProvider(config.apiUrl, config.apiKey);
    await provider.discoverGroups({ keywords: ["connection-test"], categories: [], limit: 1 });
    return { ok: true, code: "CONNECTED", message: "Provider conectado com sucesso." };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro externo ao testar o provider.";
    if (message === "API Key inválida.") return { ok: false, code: "INVALID_KEY", message };
    if (message.includes("tempo esperado")) return { ok: false, code: "TIMEOUT", message };
    return { ok: false, code: "EXTERNAL_ERROR", message: message.slice(0, 300) };
  }
}

export function discoveryProviderStatus(): { configured: boolean; name: string | null; missing: string[] } {
  const url = process.env["GROUP_DIRECTORY_API_URL"];
  const key = process.env["GROUP_DIRECTORY_API_KEY"];
  const missing: string[] = [];
  if (!url) missing.push("GROUP_DIRECTORY_API_URL");
  if (!key) missing.push("GROUP_DIRECTORY_API_KEY");
  return { configured: missing.length === 0, name: missing.length === 0 ? "directory_api" : null, missing };
}
