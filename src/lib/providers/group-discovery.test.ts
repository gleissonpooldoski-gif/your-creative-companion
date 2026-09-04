import { describe, expect, it } from "vitest";

import { parseDirectoryResults } from "./group-discovery.server";

describe("parseDirectoryResults", () => {
  it("aceita o contrato camelCase do provider", () => {
    expect(parseDirectoryResults([{ externalId: "42", username: "canal_teste", publicLink: "https://t.me/canal_teste", memberCount: 120 }])).toEqual([
      expect.objectContaining({ externalId: "42", username: "canal_teste", publicLink: "https://t.me/canal_teste", memberCount: 120, source: "directory_api" }),
    ]);
  });

  it("mantém compatibilidade com o contrato snake_case", () => {
    expect(parseDirectoryResults([{ external_id: "7", link: "@grupo_real", member_count: 55, discovered_at: "2026-09-04T00:00:00Z" }])[0]).toEqual(
      expect.objectContaining({ externalId: "7", username: "grupo_real", memberCount: 55, discoveredAt: "2026-09-04T00:00:00Z" }),
    );
  });

  it("ignora resultados sem referência pública", () => {
    expect(parseDirectoryResults([{ title: "Sem link" }])).toEqual([]);
  });
});