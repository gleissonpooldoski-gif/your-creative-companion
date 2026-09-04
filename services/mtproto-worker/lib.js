// Pure helpers used by the MTProto worker. Kept side-effect free so they can be
// unit tested without opening a Telegram connection.

/** Seconds Telegram asked us to wait, or 0 when the error is not a flood wait. */
export function floodSeconds(error) {
  const value = Number(error?.seconds ?? 0);
  if (value > 0) return value;
  const match = String(error?.errorMessage || error?.message || "").match(/FLOOD_WAIT_(\d+)/);
  return match ? Number(match[1]) : 0;
}

/** Only public supergroups qualify: no users, bots, broadcast channels or private chats. */
export function isEligibleGroup(chat) {
  if (!chat || chat.className !== "Channel") return false;
  if (chat.megagroup !== true) return false;
  if (chat.broadcast === true) return false;
  return Boolean(usernameOf(chat));
}

export function usernameOf(chat) {
  const raw = chat?.username || chat?.usernames?.[0]?.username || null;
  return raw ? String(raw).replace(/^@/, "").trim() || null : null;
}

/** Accepts https://t.me/x, t.me/x and @x; returns the bare username or null. */
export function normalizeUsername(reference) {
  const value = String(reference ?? "").trim();
  if (!value) return null;
  const match = value.match(/^(?:https?:\/\/)?(?:www\.)?t\.me\/(?:s\/)?@?([\w]{4,64})\/?$/i) ?? value.match(/^@?([\w]{4,64})$/);
  return match ? match[1] : null;
}

export function publicLink(username) {
  return `https://t.me/${username}`;
}

/** Deduplicates by telegram id, then username, then normalized public reference. */
export function dedupeResults(results) {
  const seen = new Set();
  const out = [];
  for (const item of results ?? []) {
    const keys = [
      item?.telegram_id ? `id:${item.telegram_id}` : null,
      item?.username ? `user:${String(item.username).toLowerCase()}` : null,
      item?.public_link ? `ref:${String(item.public_link).toLowerCase()}` : null,
    ].filter(Boolean);
    if (keys.some((key) => seen.has(key))) continue;
    keys.forEach((key) => seen.add(key));
    out.push(item);
  }
  return out;
}

/** Shapes a Telegram chat into the payload the SaaS expects. Never invents values. */
export function toResult(chat, extra = {}) {
  const username = usernameOf(chat);
  return {
    entity_type: "megagroup",
    type: "megagroup",
    telegram_id: chat?.id != null ? String(chat.id) : null,
    username,
    title: chat?.title ?? null,
    public_link: username ? publicLink(username) : null,
    participants_count: extra.participants_count ?? chat?.participantsCount ?? null,
    about: extra.about ?? null,
    language: extra.language ?? null,
    source: "telegram_mtproto",
    keyword: extra.keyword ?? null,
    is_public: true,
    is_megagroup: true,
    is_broadcast: false,
    discovered_at: extra.discovered_at ?? new Date().toISOString(),
  };
}

/** Never log or return a full phone number. */
export function maskPhone(phone) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `${digits.slice(0, 2)}****${digits.slice(-2)}`;
}

export const ERROR_CODES = {
  UNAUTHORIZED: 401,
  AUTH_REQUIRED: 409,
  INVALID_CODE: 400,
  PASSWORD_REQUIRED: 401,
  INVALID_PASSWORD: 400,
  INVALID_SESSION: 409,
  FLOOD_WAIT: 429,
  RATE_LIMITED: 429,
  TELEGRAM_ERROR: 502,
  DISCOVERY_ERROR: 502,
  TIMEOUT: 504,
  SERVICE_ERROR: 500,
};

/** Structured error body: never a stack trace, never a secret. */
export function errorBody(code, message, retryAfterSeconds) {
  return { error: { code, message, ...(retryAfterSeconds ? { retry_after_seconds: retryAfterSeconds } : {}) } };
}
