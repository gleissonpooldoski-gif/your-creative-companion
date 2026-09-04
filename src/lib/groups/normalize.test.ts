import { describe, expect, it } from "vitest";

import { computeGroupScore, normalizeGroupReference, parseKeywords, scoreBand } from "./normalize";

describe("normalizeGroupReference", () => {
  it("normaliza links, @usernames e nomes crus para a mesma identidade canônica", () => {
    const forms = ["https://t.me/Grupo_Teste", "t.me/grupo_teste", "@Grupo_Teste", "grupo_teste"];
    const canonical = forms.map((form) => normalizeGroupReference(form)?.canonicalIdentifier);
    expect(new Set(canonical).size).toBe(1);
    expect(canonical[0]).toBe("grupo_teste");
  });

  it("normaliza convites privados para invite:<hash>", () => {
    expect(normalizeGroupReference("https://t.me/+AbC123xyz")?.canonicalIdentifier).toBe("invite:AbC123xyz");
    expect(normalizeGroupReference("t.me/joinchat/AbC123xyz")?.canonicalIdentifier).toBe("invite:AbC123xyz");
  });

  it("rejeita referências inválidas", () => {
    expect(normalizeGroupReference("")).toBeNull();
    expect(normalizeGroupReference("ab")).toBeNull();
    expect(normalizeGroupReference("https://example.com/foo")).toBeNull();
  });

  it("deduplica uma lista mista de referências pela identidade canônica", () => {
    const input = ["https://t.me/alpha_group", "@alpha_group", "t.me/beta_group", "lixo!!"];
    const ids = new Set<string>();
    for (const item of input) {
      const normalized = normalizeGroupReference(item);
      if (normalized) ids.add(normalized.canonicalIdentifier);
    }
    expect([...ids].sort()).toEqual(["alpha_group", "beta_group"]);
  });
});

describe("parseKeywords", () => {
  it("separa por vírgula e linha, normaliza e deduplica", () => {
    expect(parseKeywords("Marketing, marketing\ndropshipping ,, ")).toEqual(["marketing", "dropshipping"]);
  });
});

describe("computeGroupScore", () => {
  const base = {
    title: "Grupo de Marketing Digital",
    description: "Discussões sobre marketing digital e tráfego pago",
    keywords: ["marketing digital"],
    category: "marketing",
    requestedCategories: ["marketing"],
    memberCount: 5000,
    isValid: true,
    lastSeenAt: new Date(),
  };

  it("retorna score entre 0 e 100 e as palavras-chave casadas", () => {
    const result = computeGroupScore(base);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.matchedKeywords).toContain("marketing digital");
  });

  it("é determinístico para a mesma entrada", () => {
    expect(computeGroupScore(base).score).toBe(computeGroupScore(base).score);
  });

  it("pontua grupos inválidos abaixo de grupos válidos equivalentes", () => {
    const invalid = computeGroupScore({ ...base, isValid: false });
    expect(invalid.score).toBeLessThan(computeGroupScore(base).score);
  });

  it("pontua grupos sem relação com as palavras-chave abaixo dos relacionados", () => {
    const unrelated = computeGroupScore({ ...base, title: "Receitas de bolo", description: "culinária", keywords: ["marketing digital"] });
    expect(unrelated.score).toBeLessThan(computeGroupScore(base).score);
    expect(unrelated.matchedKeywords).toHaveLength(0);
  });
});

describe("scoreBand", () => {
  it("classifica faixas de score", () => {
    expect(scoreBand(10)).toBe("baixo");
    expect(scoreBand(55)).toBe("médio");
    expect(scoreBand(90)).toBe("alto");
  });
});
