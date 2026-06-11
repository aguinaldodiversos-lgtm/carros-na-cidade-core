import { describe, it, expect } from "vitest";
import { buildHomeJsonLd } from "./home-structured-data";

describe("buildHomeJsonLd", () => {
  const [website, org] = buildHomeJsonLd();

  it("emite WebSite com SearchAction apontando para /comprar", () => {
    expect(website["@type"]).toBe("WebSite");
    const action = website.potentialAction as Record<string, unknown>;
    expect(action["@type"]).toBe("SearchAction");
    const target = action.target as Record<string, unknown>;
    expect(String(target.urlTemplate)).toContain("/comprar?q={search_term_string}");
    expect(action["query-input"]).toBe("required name=search_term_string");
  });

  it("emite Organization com logo absoluto", () => {
    expect(org["@type"]).toBe("Organization");
    expect(String(org.url)).toMatch(/^https?:\/\//);
    expect(String(org.logo)).toMatch(/^https?:\/\/.+logo-carros-na-cidade\.png$/);
  });
});
