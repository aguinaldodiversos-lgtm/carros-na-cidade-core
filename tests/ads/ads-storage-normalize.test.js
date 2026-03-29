import { describe, it, expect } from "vitest";
import {
  normalizeBodyTypeForStorage,
  normalizeFuelTypeForStorage,
  normalizeTransmissionForStorage,
  normalizeAdVehicleFieldsForPersistence,
} from "../../src/modules/ads/ads.storage-normalize.js";
import {
  CANONICAL_BODY_TYPE_SLUGS,
  CANONICAL_FUEL_TYPE_SLUGS,
  CANONICAL_TRANSMISSION_SLUGS,
} from "../../src/modules/ads/ads.canonical.constants.js";

describe("normalizeBodyTypeForStorage", () => {
  it("mapeia rótulos para slugs canônicos", () => {
    expect(normalizeBodyTypeForStorage("Sedã")).toBe("sedan");
    expect(normalizeBodyTypeForStorage("SUV")).toBe("suv");
  });

  it("desconhecido usa fallback sedan", () => {
    expect(normalizeBodyTypeForStorage("tipo-desconhecido-xyz")).toBe("sedan");
  });

  it("vazio vira null", () => {
    expect(normalizeBodyTypeForStorage(null)).toBe(null);
    expect(normalizeBodyTypeForStorage("")).toBe(null);
  });
});

describe("normalizeFuelTypeForStorage", () => {
  it("cobre sinônimos e FIPE comum", () => {
    expect(normalizeFuelTypeForStorage("Flex")).toBe("flex");
    expect(normalizeFuelTypeForStorage("Elétrico")).toBe("eletrico");
    expect(normalizeFuelTypeForStorage("Álcool")).toBe("etanol");
  });

  it("compostos heurísticos", () => {
    expect(normalizeFuelTypeForStorage("Álcool / Gasolina")).toBe("flex");
    expect(normalizeFuelTypeForStorage("Gasolina / Elétrico")).toBe("hibrido");
  });

  it("desconhecido → null", () => {
    expect(normalizeFuelTypeForStorage("combustivel-inventado-zz")).toBe(null);
  });
});

describe("normalizeTransmissionForStorage", () => {
  it("semi / automatizado → automatico", () => {
    expect(normalizeTransmissionForStorage("Semi-automático")).toBe("automatico");
    expect(normalizeTransmissionForStorage("Automatizado")).toBe("automatico");
  });

  it("desconhecido → null", () => {
    expect(normalizeTransmissionForStorage("caixa-mágica")).toBe(null);
  });
});

describe("normalizeAdVehicleFieldsForPersistence", () => {
  it("create: normaliza os três campos", () => {
    const out = normalizeAdVehicleFieldsForPersistence(
      {
        title: "x",
        body_type: "Sedã",
        fuel_type: "Flex",
        transmission: "Automático",
      },
      { partial: false }
    );
    expect(out.body_type).toBe("sedan");
    expect(out.fuel_type).toBe("flex");
    expect(out.transmission).toBe("automatico");
  });

  it("update parcial: só chaves presentes", () => {
    const out = normalizeAdVehicleFieldsForPersistence(
      { fuel_type: "Diesel" },
      { partial: true }
    );
    expect(out).toEqual({ fuel_type: "diesel" });
  });
});

describe("slugs canônicos exportados", () => {
  it("listas fechadas batem com normalizadores", () => {
    for (const slug of CANONICAL_BODY_TYPE_SLUGS) {
      expect(normalizeBodyTypeForStorage(slug)).toBe(slug);
    }
    for (const slug of CANONICAL_FUEL_TYPE_SLUGS) {
      expect(normalizeFuelTypeForStorage(slug)).toBe(slug);
    }
    for (const slug of CANONICAL_TRANSMISSION_SLUGS) {
      expect(normalizeTransmissionForStorage(slug)).toBe(slug);
    }
  });
});
