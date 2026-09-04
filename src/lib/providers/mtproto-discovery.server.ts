// Telegram MTProto discovery provider. Server-only.
//
// Searches Telegram itself through the self-hosted MTProto companion service using
// an authorized session of the workspace. Only public supergroups are accepted;
// users, bots, broadcast channels and private groups are discarded. Results are
// exactly what Telegram returned — nothing is invented.

import {
  MTPROTO_NOT_CONFIGURED,
  MtprotoError,
  callMtprotoService,
  loadMtprotoConfig,
  type MtprotoServiceConfig,
} from "@/lib/mtproto/service.server";
import type { DiscoveryInput, GroupDiscoveryProvider, GroupDiscoveryResult, GroupValidationResult } from "@/lib/providers/group-discovery.server";
import { validatePublicTelegramGroup } from "@/lib/providers/group-discovery.server";

export type MtprotoSearchItem = {
  entity_type?: string;
  type?: string;
  telegram_id?: string | number | null;
  username?: string | null;
  title?: string | null;
  about?: string | null;
  description?: string | null;
  participants_count?: number | null;
  member_count?: number | null;
  is_public?: boolean;
  is_megagroup?: boolean;
  is_broadcast?: boolean;
  keyword?: string | null;
};

/** Keeps only public supergroups (real groups) and drops everything else. */
export function isPublicGroupEntity(item: MtprotoSearchItem): boolean {
  const kind = String(item.entity_type ?? item.type ?? "").toLowerCase();
  if (item.is_broadcast === true) return false;
  if (kind === "user" || kind === "bot" || kind === "channel" || kind === "broadcast") return false;
  const isGroup = item.is_megagroup === true || kind === "megagroup" || kind === "supergroup" || kind === "group" || kind === "chat";
  if (!isGroup) return false;
  if (item.is_public === false) return false;
  return Boolean(item.username && String(item.username).trim());
}

export function parseMtprotoResults(items: unknown): GroupDiscoveryResult[] {
  const out: GroupDiscoveryResult[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(items)) return out;
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as MtprotoSearchItem;
    if (!isPublicGroupEntity(item)) continue;

    const username = String(item.username).replace(/^@/, "").trim();
    const key = username.toLowerCase();
    if (!username || seen.has(key)) continue;
    seen.add(key);
    out.push({
      reference: `https://t.me/${username}`,
      externalId: item.telegram_id != null ? String(item.telegram_id) : null,
      username,
      publicLink: `https://t.me/${username}`,
      title: item.title ?? null,
      description: item.about ?? item.description ?? null,
      memberCount: item.participants_count ?? item.member_count ?? null,
      source: "telegram_mtproto",
      discoveredAt: new Date().toISOString(),
    });
  }
  return out;
}

class MtprotoDiscoveryProvider implements GroupDiscoveryProvider {
  readonly name = "telegram_mtproto";
  readonly configured = true;
  constructor(
    private readonly config: MtprotoServiceConfig,
    private readonly remoteSessionId: string,
  ) {}

  async discoverGroups(input: DiscoveryInput): Promise<GroupDiscoveryResult[]> {
    const payload = await callMtprotoService<{ results?: MtprotoSearchItem[] }>(this.config, "/v1/search", {
      method: "POST",
      body: { session_id: this.remoteSessionId, keywords: input.keywords, limit: input.limit },
    });
    if (!Array.isArray(payload.results)) {
      throw new MtprotoError("SERVICE_ERROR", "Resposta do serviço MTProto fora do formato esperado.");
    }
    return parseMtprotoResults(payload.results).slice(0, input.limit);
  }

  /** Metadata comes from Telegram; the public preview page confirms the group is reachable. */
  validateGroup(reference: string): Promise<GroupValidationResult> {
    return validatePublicTelegramGroup(reference);
  }
}

export type MtprotoProviderResolution =
  | { ok: true; provider: GroupDiscoveryProvider; sessionId: string }
  | { ok: false; code: "NOT_CONFIGURED" | "NO_SESSION" | "FLOOD_WAIT"; message: string };

type AdminLike = { from: (table: string) => any };

/** Picks an authorized, non-throttled session of the workspace. */
export async function resolveMtprotoProvider(
  workspaceId: string,
  preferredSessionId?: string | null,
): Promise<MtprotoProviderResolution> {
  const config = await loadMtprotoConfig(workspaceId);
  if (!config) return { ok: false, code: "NOT_CONFIGURED", message: MTPROTO_NOT_CONFIGURED };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let query = (supabaseAdmin as unknown as AdminLike)
    .from("telegram_mtproto_sessions")
    .select("id, remote_session_id, status, flood_wait_until, label")
    .eq("workspace_id", workspaceId)
    .eq("status", "connected")
    .order("last_connected_at", { ascending: false, nullsFirst: false });
  if (preferredSessionId) query = query.eq("id", preferredSessionId);

  const { data } = await query.limit(5);
  const sessions = (data ?? []) as Array<{ id: string; remote_session_id: string | null; flood_wait_until: string | null; label: string }>;
  if (sessions.length === 0) {
    return {
      ok: false,
      code: "NO_SESSION",
      message: "Nenhuma conta de Telegram conectada para mineração. Conecte uma conta em Configurações.",
    };
  }

  const now = Date.now();
  const usable = sessions.find(
    (session) => session.remote_session_id && (!session.flood_wait_until || Date.parse(session.flood_wait_until) <= now),
  );
  if (!usable) {
    const until = sessions[0]?.flood_wait_until;
    return {
      ok: false,
      code: "FLOOD_WAIT",
      message: until
        ? `Telegram pediu espera até ${new Date(until).toLocaleString("pt-BR")} para esta conta.`
        : "Conta conectada sem sessão remota válida. Reconecte a conta.",
    };
  }

  return { ok: true, provider: new MtprotoDiscoveryProvider(config, usable.remote_session_id as string), sessionId: usable.id };
}

/** Records a Telegram-imposed wait so scheduling respects it instead of hammering the API. */
export async function recordFloodWait(sessionId: string, seconds: number, message: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await (supabaseAdmin as unknown as AdminLike)
    .from("telegram_mtproto_sessions")
    .update({
      flood_wait_until: new Date(Date.now() + Math.max(1, seconds) * 1000).toISOString(),
      last_error: message.slice(0, 500),
    })
    .eq("id", sessionId);
}
