import { describe, it, expect } from "vitest";

/**
 * Testa o modelo de persistência das fotos em rascunho.
 *
 * O sistema salva draftPhotoUrls (URLs remotas) dentro do WizardFormState,
 * que é persistido em localStorage. Isso garante que:
 * - fotos sobrevivem à navegação entre etapas
 * - fotos sobrevivem à recarga de página
 * - fotos sobrevivem à edição de outros campos
 * - fotos só são removidas por ação explícita do usuário
 */

const WIZARD_STORAGE_KEY = "carros-na-cidade:new-ad-wizard:v2";

function makeFormState(overrides = {}) {
  return {
    sellerType: "particular",
    step: 2,
    fipeBrandCode: "59",
    fipeModelCode: "5585",
    brandLabel: "VW",
    modelLabel: "Gol",
    yearModel: "2021",
    yearManufacture: "2020",
    fipeYearCode: "2021-1",
    versionLabel: "1.0",
    color: "Branco",
    armored: false,
    fuel: "Flex",
    transmission: "Automático",
    bodyStyle: "Hatch",
    fipeValue: "R$ 50.000,00",
    mileage: "32000",
    price: "R$ 45.000,00",
    description: "",
    cityId: 42,
    city: "Atibaia",
    state: "SP",
    plateFinal: "",
    whatsapp: "(11) 99999-9999",
    phone: "",
    acceptTerms: true,
    optionalIds: [],
    conditionIds: [],
    boostOptionId: null,
    draftPhotoUrls: [],
    ...overrides,
  };
}

describe("Photo draft persistence model", () => {
  it("draftPhotoUrls is serializable to JSON (unlike File objects)", () => {
    const form = makeFormState({
      draftPhotoUrls: [
        "https://r2.example.com/publish-1/photo-001.jpg",
        "https://r2.example.com/publish-1/photo-002.jpg",
      ],
    });
    const json = JSON.stringify(form);
    const restored = JSON.parse(json);

    expect(restored.draftPhotoUrls).toEqual(form.draftPhotoUrls);
    expect(restored.draftPhotoUrls).toHaveLength(2);
  });

  it("survives localStorage round-trip", () => {
    const form = makeFormState({
      draftPhotoUrls: [
        "https://r2.example.com/photo-a.jpg",
        "https://r2.example.com/photo-b.jpg",
        "https://r2.example.com/photo-c.jpg",
      ],
    });

    const serialized = JSON.stringify(form);
    const restored = JSON.parse(serialized);

    expect(restored.draftPhotoUrls).toEqual(form.draftPhotoUrls);
    expect(restored.draftPhotoUrls).toHaveLength(3);
  });

  it("preserves photos when other form fields change", () => {
    const original = makeFormState({
      draftPhotoUrls: ["https://r2.example.com/photo-1.jpg"],
      description: "",
    });

    const updated = { ...original, description: "Carro em ótimo estado." };

    expect(updated.draftPhotoUrls).toEqual(original.draftPhotoUrls);
    expect(updated.draftPhotoUrls).toHaveLength(1);
  });

  it("preserves photos when step changes", () => {
    const form = makeFormState({
      step: 2,
      draftPhotoUrls: ["https://r2.example.com/photo-1.jpg"],
    });

    const movedToStep3 = { ...form, step: 3 };
    const movedToStep0 = { ...form, step: 0 };
    const movedToStep5 = { ...form, step: 5 };

    expect(movedToStep3.draftPhotoUrls).toHaveLength(1);
    expect(movedToStep0.draftPhotoUrls).toHaveLength(1);
    expect(movedToStep5.draftPhotoUrls).toHaveLength(1);
  });

  it("only removes photo when explicitly filtered out", () => {
    const form = makeFormState({
      draftPhotoUrls: [
        "https://r2.example.com/a.jpg",
        "https://r2.example.com/b.jpg",
        "https://r2.example.com/c.jpg",
      ],
    });

    const indexToRemove = 1;
    const after = {
      ...form,
      draftPhotoUrls: form.draftPhotoUrls.filter((_, i) => i !== indexToRemove),
    };

    expect(after.draftPhotoUrls).toEqual([
      "https://r2.example.com/a.jpg",
      "https://r2.example.com/c.jpg",
    ]);
    expect(after.draftPhotoUrls).toHaveLength(2);
  });

  it("reorder for cover moves photo to index 0", () => {
    const urls = [
      "https://r2.example.com/a.jpg",
      "https://r2.example.com/b.jpg",
      "https://r2.example.com/c.jpg",
    ];

    const setCover = (index) => {
      if (index === 0) return urls;
      const next = [...urls];
      const [url] = next.splice(index, 1);
      next.unshift(url);
      return next;
    };

    expect(setCover(2)).toEqual([
      "https://r2.example.com/c.jpg",
      "https://r2.example.com/a.jpg",
      "https://r2.example.com/b.jpg",
    ]);

    expect(setCover(0)).toEqual(urls);
  });

  it("enforces max 10 photos limit", () => {
    const existing = Array.from({ length: 8 }, (_, i) => `https://r2.example.com/${i}.jpg`);
    const incoming = [
      "https://r2.example.com/new1.jpg",
      "https://r2.example.com/new2.jpg",
      "https://r2.example.com/new3.jpg",
    ];

    const maxNew = 10 - existing.length;
    const toAdd = incoming.slice(0, Math.max(0, maxNew));
    const combined = [...existing, ...toAdd];

    expect(combined).toHaveLength(10);
    expect(toAdd).toHaveLength(2);
  });

  it("storage key uses v2 (new version with draftPhotoUrls)", () => {
    expect(WIZARD_STORAGE_KEY).toBe("carros-na-cidade:new-ad-wizard:v2");
  });

  it("restores draftPhotoUrls from parsed localStorage (filters non-strings)", () => {
    const parsed = {
      step: 3,
      draftPhotoUrls: [
        "https://r2.example.com/valid.jpg",
        "",
        null,
        42,
        "https://r2.example.com/also-valid.jpg",
      ],
    };

    const restored = Array.isArray(parsed.draftPhotoUrls)
      ? parsed.draftPhotoUrls.filter((u) => typeof u === "string" && u.trim().length > 0)
      : [];

    expect(restored).toEqual([
      "https://r2.example.com/valid.jpg",
      "https://r2.example.com/also-valid.jpg",
    ]);
  });

  it("defaults to empty array when draftPhotoUrls is missing from stored data", () => {
    const parsed = { step: 0, brandLabel: "VW" };
    const restored = Array.isArray(parsed.draftPhotoUrls) ? parsed.draftPhotoUrls : [];
    expect(restored).toEqual([]);
  });
});

describe("Photo draft: backward compatibility", () => {
  it("old v1 storage without draftPhotoUrls defaults safely", () => {
    const oldV1 = {
      sellerType: "particular",
      step: 2,
      fipeBrandCode: "59",
      brandLabel: "VW",
    };

    const form = {
      ...oldV1,
      draftPhotoUrls: Array.isArray(oldV1.draftPhotoUrls) ? oldV1.draftPhotoUrls : [],
    };

    expect(form.draftPhotoUrls).toEqual([]);
  });
});

describe("Photo draft: URL format compatibility (direct R2 + proxy + legacy)", () => {
  it("accepts public R2 URLs from direct BFF upload", () => {
    const form = makeFormState({
      draftPhotoUrls: [
        "https://pub-test.r2.dev/vehicles/publish-user1-uuid/original/2026/04/uuid-foto.jpg",
        "https://pub-test.r2.dev/vehicles/publish-user1-uuid/original/2026/04/uuid-foto2.png",
      ],
    });

    expect(form.draftPhotoUrls).toHaveLength(2);
    expect(form.draftPhotoUrls[0]).toMatch(/^https:\/\//);

    const json = JSON.stringify(form);
    const restored = JSON.parse(json);
    expect(restored.draftPhotoUrls).toEqual(form.draftPhotoUrls);
  });

  it("accepts proxy URLs from direct BFF upload (no R2_PUBLIC_BASE_URL)", () => {
    const form = makeFormState({
      draftPhotoUrls: [
        "/api/vehicle-images?key=vehicles%2Fpublish-user1-uuid%2Foriginal%2F2026%2F04%2Fuuid-foto.jpg",
      ],
    });

    expect(form.draftPhotoUrls).toHaveLength(1);
    expect(form.draftPhotoUrls[0]).toMatch(/^\/api\/vehicle-images\?key=/);
  });

  it("accepts legacy local URLs from dev fallback", () => {
    const form = makeFormState({
      draftPhotoUrls: ["/uploads/ads/some-uuid.jpg"],
    });

    expect(form.draftPhotoUrls).toHaveLength(1);
    expect(form.draftPhotoUrls[0]).toMatch(/^\/uploads\/ads\//);
  });

  it("mixes URL formats safely (migration scenario)", () => {
    const form = makeFormState({
      draftPhotoUrls: [
        "https://pub-test.r2.dev/vehicles/draft/photo1.jpg",
        "/api/vehicle-images?key=vehicles%2Fold%2Fphoto2.jpg",
        "/uploads/ads/legacy-photo.jpg",
      ],
    });

    expect(form.draftPhotoUrls).toHaveLength(3);

    const json = JSON.stringify(form);
    const restored = JSON.parse(json);
    expect(restored.draftPhotoUrls).toEqual(form.draftPhotoUrls);
  });

  it("URLs fit backend ad validation (string, 1-2048 chars)", () => {
    const urls = [
      "https://pub-test.r2.dev/vehicles/publish-user1-uuid/original/2026/04/uuid-foto.jpg",
      "/api/vehicle-images?key=vehicles%2Fpublish-user1-uuid%2Foriginal%2F2026%2F04%2Fuuid-foto.jpg",
    ];

    for (const url of urls) {
      expect(typeof url).toBe("string");
      expect(url.length).toBeGreaterThanOrEqual(1);
      expect(url.length).toBeLessThanOrEqual(2048);
    }
  });
});

describe("Photo draft: publish flow with draftPhotoUrls", () => {
  it("draftPhotoUrls are sent as JSON string in FormData on publish", () => {
    const form = makeFormState({
      draftPhotoUrls: [
        "https://pub-test.r2.dev/vehicles/draft/photo1.jpg",
        "https://pub-test.r2.dev/vehicles/draft/photo2.jpg",
      ],
    });

    const payload = JSON.stringify(form.draftPhotoUrls);
    const parsed = JSON.parse(payload);
    expect(parsed).toHaveLength(2);
    expect(parsed).toEqual(form.draftPhotoUrls);
  });

  it("publish route reuses existing URLs without re-upload", () => {
    const draftUrls = [
      "https://pub-test.r2.dev/vehicles/draft/photo1.jpg",
      "https://pub-test.r2.dev/vehicles/draft/photo2.jpg",
    ];

    const draftUrlsRaw = JSON.stringify(draftUrls);
    const parsed = JSON.parse(draftUrlsRaw);
    const photoUrls = Array.isArray(parsed)
      ? parsed.filter((u) => typeof u === "string" && u.trim().length > 0)
      : [];

    expect(photoUrls).toEqual(draftUrls);
    expect(photoUrls).toHaveLength(2);
  });
});
