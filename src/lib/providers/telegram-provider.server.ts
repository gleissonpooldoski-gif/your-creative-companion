// Telegram execution provider. Server-only. Never called from React components.
// Only reports success when the Telegram API confirms the operation.

export type ProviderError = {
  code:
    | "AUTH_ERROR"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "RATE_LIMITED"
    | "TIMEOUT"
    | "NETWORK_ERROR"
    | "PROVIDER_ERROR"
    | "NOT_CONFIGURED";
  message: string;
  retryable: boolean;
  retryAfterSeconds?: number;
};

export type SendResult = { ok: true; messageId: number } | { ok: false; error: ProviderError };

export interface TelegramProvider {
  sendMessage(input: { chatId: string; text: string; linkPreview?: boolean }): Promise<SendResult>;
}

const TIMEOUT_MS = 20_000;

function classify(status: number, description: string, retryAfter?: number): ProviderError {
  if (status === 401) return { code: "AUTH_ERROR", message: description, retryable: false };
  if (status === 403) return { code: "FORBIDDEN", message: description, retryable: false };
  if (status === 400 && /chat not found|not found/i.test(description))
    return { code: "NOT_FOUND", message: description, retryable: false };
  if (status === 404) return { code: "NOT_FOUND", message: description, retryable: false };
  if (status === 429)
    return { code: "RATE_LIMITED", message: description, retryable: true, ...(retryAfter ? { retryAfterSeconds: retryAfter } : {}) };
  if (status >= 500) return { code: "PROVIDER_ERROR", message: description, retryable: true };
  return { code: "PROVIDER_ERROR", message: description, retryable: false };
}

class BotApiTelegramProvider implements TelegramProvider {
  constructor(private readonly token: string) {}

  async sendMessage(input: { chatId: string; text: string; linkPreview?: boolean }): Promise<SendResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: input.text,
          disable_web_page_preview: input.linkPreview === false,
        }),
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        ok: boolean;
        result?: { message_id?: number };
        description?: string;
        parameters?: { retry_after?: number };
      };
      if (payload.ok && payload.result?.message_id) {
        return { ok: true, messageId: payload.result.message_id };
      }
      return {
        ok: false,
        error: classify(response.status, payload.description ?? `HTTP ${response.status}`, payload.parameters?.retry_after),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { ok: false, error: { code: "TIMEOUT", message: "Tempo limite excedido no provedor Telegram.", retryable: true } };
      }
      return {
        ok: false,
        error: {
          code: "NETWORK_ERROR",
          message: error instanceof Error ? error.message : "falha de rede",
          retryable: true,
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createTelegramProvider(botToken: string | null | undefined): TelegramProvider | null {
  if (!botToken) return null;
  return new BotApiTelegramProvider(botToken);
}
