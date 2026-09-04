// Tests for the self-hosted MTProto worker helpers (services/mtproto-worker/lib.js).
import { describe, expect, it } from "vitest";

// @ts-expect-error plain JS helper module of the companion service
import * as worker from "../../../services/mtproto-worker/lib.js";

describe("worker eligibility filters", () => {
  it("accepts only public supergroups", () => {
    expect(worker.isEligibleGroup({ className: "Channel", megagroup: true, username: "grupo" })).toBe(true);
    expect(worker.isEligibleGroup({ className: "Channel", megagroup: true, usernames: [{ username: "grupo2" }] })).toBe(true);
  });

  it("rejects users, bots, channels and private groups", () => {
    expect(worker.isEligibleGroup({ className: "User", username: "pessoa" })).toBe(false);
    expect(worker.isEligibleGroup({ className: "Channel", broadcast: true, username: "canal" })).toBe(false);
    expect(worker.isEligibleGroup({ className: "Channel", megagroup: true })).toBe(false);
    expect(worker.isEligibleGroup({ className: "Chat", megagroup: true, username: "x" })).toBe(false);
    expect(worker.isEligibleGroup(null)).toBe(false);
  });
});

describe("worker normalization", () => {
  it("normalizes the three public reference formats", () => {
    expect(worker.normalizeUsername("https://t.me/Grupo_BR")).toBe("Grupo_BR");
    expect(worker.normalizeUsername("t.me/Grupo_BR")).toBe("Grupo_BR");
    expect(worker.normalizeUsername("@Grupo_BR")).toBe("Grupo_BR");
    expect(worker.normalizeUsername("não é link")).toBeNull();
  });

  it("never invents metadata Telegram did not return", () => {
    const result = worker.toResult({ className: "Channel", megagroup: true, id: 123, username: "grupo", title: "Grupo" });
    expect(result.public_link).toBe("https://t.me/grupo");
    expect(result.telegram_id).toBe("123");
    expect(result.about).toBeNull();
    expect(result.participants_count).toBeNull();
    expect(result.source).toBe("telegram_mtproto");
  });
});

describe("worker dedupe", () => {
  it("deduplicates by telegram id, username and public reference", () => {
    const unique = worker.dedupeResults([
      { telegram_id: "1", username: "a", public_link: "https://t.me/a" },
      { telegram_id: "1", username: "b", public_link: "https://t.me/b" },
      { telegram_id: "2", username: "A", public_link: "https://t.me/A" },
      { telegram_id: "3", username: "c", public_link: "https://t.me/a" },
      { telegram_id: "4", username: "d", public_link: "https://t.me/d" },
    ]);
    expect(unique.map((item: { telegram_id: string }) => item.telegram_id)).toEqual(["1", "4"]);
  });
});

describe("worker flood wait and errors", () => {
  it("reads the wait Telegram asked for", () => {
    expect(worker.floodSeconds({ seconds: 42 })).toBe(42);
    expect(worker.floodSeconds({ errorMessage: "FLOOD_WAIT_120" })).toBe(120);
    expect(worker.floodSeconds({ message: "boom" })).toBe(0);
  });

  it("maps every documented code to an HTTP status and a leak-free body", () => {
    for (const code of ["UNAUTHORIZED", "AUTH_REQUIRED", "INVALID_SESSION", "FLOOD_WAIT", "TELEGRAM_ERROR", "DISCOVERY_ERROR", "TIMEOUT"]) {
      expect(worker.ERROR_CODES[code]).toBeGreaterThanOrEqual(400);
    }
    const body = worker.errorBody("FLOOD_WAIT", "espere", 30);
    expect(body).toEqual({ error: { code: "FLOOD_WAIT", message: "espere", retry_after_seconds: 30 } });
    expect(JSON.stringify(body)).not.toMatch(/at |stack/i);
  });

  it("masks phone numbers", () => {
    expect(worker.maskPhone("+55 11 98888-7777")).toBe("55****77");
    expect(worker.maskPhone("12")).toBe("****");
  });
});
