import { describe, expect, it } from "vitest";

import { isPublicGroupEntity, parseMtprotoResults } from "./mtproto-discovery.server";

describe("isPublicGroupEntity", () => {
  it("accepts public supergroups", () => {
    expect(isPublicGroupEntity({ entity_type: "megagroup", username: "grupo", is_megagroup: true })).toBe(true);
  });

  it("rejects users, bots and broadcast channels", () => {
    expect(isPublicGroupEntity({ entity_type: "user", username: "pessoa" })).toBe(false);
    expect(isPublicGroupEntity({ entity_type: "bot", username: "meubot" })).toBe(false);
    expect(isPublicGroupEntity({ entity_type: "channel", username: "canal" })).toBe(false);
    expect(isPublicGroupEntity({ entity_type: "megagroup", username: "x", is_broadcast: true })).toBe(false);
  });
});

describe("parseMtprotoResults", () => {
  it("keeps only public groups with username and deduplicates", () => {
    const results = parseMtprotoResults([
      { entity_type: "megagroup", username: "Marketing_BR", title: "Marketing BR", participants_count: 1200, keyword: "marketing" },
      { entity_type: "megagroup", username: "marketing_br", title: "Duplicado" },
      { entity_type: "channel", username: "canal_news", title: "Canal" },
      { entity_type: "megagroup", username: null, title: "Grupo privado" },
      { entity_type: "user", username: "alguem" },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.reference).toBe("https://t.me/Marketing_BR");
    expect(results[0]?.title).toBe("Marketing BR");
    expect(results[0]?.memberCount).toBe(1200);
  });

  it("never invents metadata that Telegram did not return", () => {
    const [result] = parseMtprotoResults([{ entity_type: "megagroup", username: "grupo_sem_dados" }]);
    expect(result?.title ?? null).toBeNull();
    expect(result?.memberCount ?? null).toBeNull();
  });

  it("ignores malformed payloads", () => {
    expect(parseMtprotoResults(null)).toEqual([]);
    expect(parseMtprotoResults([null, 1, "x"] as unknown[])).toEqual([]);
  });
});
