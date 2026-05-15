import { describe, expect, it } from "vitest";

import { detectImageIssues } from "../../scripts/audit/lib/detect-image-issues.mjs";

describe("detectImageIssues — anúncios com imagens OK não são flagados", () => {
  it("array com URLs HTTPS de CDN válida → ok", () => {
    const result = detectImageIssues({
      images: [
        "https://cdn.cnc.br/ads/abc/cover.jpg",
        "https://cdn.cnc.br/ads/abc/photo-2.jpg",
        "https://cdn.cnc.br/ads/abc/photo-3.webp",
      ],
    });
    expect(result.isProblematic).toBe(false);
  });

  it("array com URLs relativas em /api/vehicle-images → ok", () => {
    const result = detectImageIssues({
      images: ["/api/vehicle-images?id=1&v=cover", "/api/vehicle-images?id=1&v=2"],
    });
    expect(result.isProblematic).toBe(false);
  });
});

describe("detectImageIssues — CRITICAL (sem imagem)", () => {
  it("images=[] → critical no_images", () => {
    const result = detectImageIssues({ images: [] });
    expect(result.severity).toBe("critical");
    expect(result.issues.some((i) => i.code === "no_images")).toBe(true);
  });

  it("images=null → critical", () => {
    expect(detectImageIssues({ images: null }).severity).toBe("critical");
  });

  it("images=undefined → critical", () => {
    expect(detectImageIssues({}).severity).toBe("critical");
  });

  it("images=string não-JSON → critical", () => {
    expect(detectImageIssues({ images: "not-json" }).severity).toBe("critical");
  });

  it("images=JSON string vazio array → critical", () => {
    expect(detectImageIssues({ images: "[]" }).severity).toBe("critical");
  });
});

describe("detectImageIssues — HIGH (legacy /uploads, malformed scheme)", () => {
  it("URL /uploads/ads/... → high", () => {
    const result = detectImageIssues({
      images: ["/uploads/ads/abc/cover.jpg"],
    });
    expect(result.severity).toBe("high");
    expect(result.issues.some((i) => i.code === "url_legacy_uploads")).toBe(true);
  });

  it("URL com schema malformado → high", () => {
    const result = detectImageIssues({
      images: ["ftp://wrongscheme/foo.jpg"],
    });
    expect(result.severity).toBe("high");
  });

  it("URL com mojibake → high", () => {
    const result = detectImageIssues({
      images: ["https://example.com/SÃ£oPaulo/cover.jpg"],
    });
    expect(result.severity).toBe("high");
  });

  it("capa é placeholder → high (impacto direto na vitrine)", () => {
    const result = detectImageIssues({
      images: [
        "https://cdn.cnc.br/placeholder.png",
        "https://cdn.cnc.br/real-photo-2.jpg",
      ],
    });
    expect(result.severity).toBe("high");
    expect(result.issues.some((i) => i.code === "cover_is_placeholder")).toBe(true);
  });
});

describe("detectImageIssues — MEDIUM (render storage, duplicates, too many)", () => {
  it("URL hospedada em onrender.com → medium", () => {
    const result = detectImageIssues({
      images: ["https://my-app.onrender.com/uploads/foo.jpg"],
    });
    // /uploads dispara high; mas o render domain também marca medium.
    // Verifica que o issue está presente.
    expect(result.issues.some((i) => i.code === "url_render_storage")).toBe(true);
  });

  it("duplicatas dentro do array → medium", () => {
    const result = detectImageIssues({
      images: [
        "https://cdn.cnc.br/a.jpg",
        "https://cdn.cnc.br/b.jpg",
        "https://cdn.cnc.br/a.jpg",
      ],
    });
    expect(result.issues.some((i) => i.code === "duplicate_images")).toBe(true);
  });

  it("array com 35 imagens → medium (too_many_images)", () => {
    const images = Array.from({ length: 35 }, (_, i) => `https://cdn.cnc.br/ad/${i}.jpg`);
    const result = detectImageIssues({ images });
    expect(result.issues.some((i) => i.code === "too_many_images")).toBe(true);
  });

  it("placeholder em foto não-capa → medium (não high)", () => {
    const result = detectImageIssues({
      images: [
        "https://cdn.cnc.br/real-cover.jpg",
        "https://cdn.cnc.br/placeholder.png",
      ],
    });
    // Severity não pode ser critical/high só por causa de placeholder fora da capa.
    expect(["medium", "low", "ok"]).toContain(result.severity);
  });
});

describe("detectImageIssues — robustez", () => {
  it("ad null não joga", () => {
    expect(() => detectImageIssues(null)).not.toThrow();
  });

  it("ad sem campo images cai em critical (no_images)", () => {
    expect(detectImageIssues({ id: 1 }).severity).toBe("critical");
  });

  it("string JSON válida é parsed", () => {
    const result = detectImageIssues({
      images: JSON.stringify(["https://cdn.cnc.br/a.jpg"]),
    });
    expect(result.isProblematic).toBe(false);
  });
});
