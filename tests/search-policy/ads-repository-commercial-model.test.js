// tests/search-policy/ads-repository-commercial-model.test.js
//
// F1 §3.2 — create/update do anúncio preenchem ads.commercial_model via
// deriveCommercialModel(ad.model, { brand }). Banco mockado: o que se prova
// aqui é o SQL emitido e os parâmetros.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/infrastructure/database/db.js", () => ({
  default: { query: vi.fn() },
}));

import db from "../../src/infrastructure/database/db.js";
import {
  createAd,
  deriveCommercialModelForPersistence,
  updateAd,
} from "../../src/modules/ads/ads.repository.js";

const ONIX = "ONIX SEDAN Plus LT 1.0 12V Flex 4p Mec.";

describe("deriveCommercialModelForPersistence", () => {
  it("deriva o rótulo e nunca lança", () => {
    expect(deriveCommercialModelForPersistence(ONIX, "GM - Chevrolet")).toBe("Onix");
    expect(deriveCommercialModelForPersistence("5 Luxury 1.5 TB FWD", "Omoda")).toBe("Omoda 5");
    expect(deriveCommercialModelForPersistence("1.0 12V Flex", "Fiat")).toBeNull();
    expect(deriveCommercialModelForPersistence(null, null)).toBeNull();
    expect(deriveCommercialModelForPersistence(undefined, undefined)).toBeNull();
  });
});

describe("createAd", () => {
  beforeEach(() => vi.mocked(db.query).mockReset());

  it("insere commercial_model derivado de model + brand", async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [{ id: 1 }] });
    await createAd({
      advertiser_id: 1,
      title: "Onix LT",
      price: 60000,
      city_id: 4761,
      city: "Atibaia",
      state: "SP",
      brand: "GM - Chevrolet",
      model: ONIX,
      year: 2022,
      slug: "onix-lt-1",
    });
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(db.query).mock.calls[0];
    expect(sql).toMatch(/vehicle_options,\s*commercial_model,\s*search_vector/);
    expect(sql).toContain("$21::jsonb,$22,");
    expect(values.length).toBe(22);
    expect(values[21]).toBe("Onix");
  });

  it("modelo não derivável → commercial_model NULL sem bloquear a escrita", async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [{ id: 2 }] });
    await createAd({
      title: "x",
      price: 1,
      city_id: 1,
      city: "c",
      state: "SP",
      brand: "Fiat",
      model: "1.0 12V Flex",
      year: 2020,
      slug: "x-2",
    });
    const [, values] = vi.mocked(db.query).mock.calls[0];
    expect(values[21]).toBeNull();
  });
});

describe("updateAd", () => {
  beforeEach(() => vi.mocked(db.query).mockReset());

  it("brand + model no payload → recomputa sem ler o banco", async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [{ id: 7 }] });
    await updateAd(7, { brand: "Omoda", model: "5 Luxury 1.5 TB FWD" });
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, values] = vi.mocked(db.query).mock.calls[0];
    expect(sql).toMatch(/commercial_model = \$\d+/);
    expect(values).toContain("Omoda 5");
  });

  it("só model no payload → lê a marca atual antes de derivar", async () => {
    vi.mocked(db.query)
      .mockResolvedValueOnce({ rows: [{ id: 7, brand: "GM - Chevrolet", model: "OLD" }] }) // findById
      .mockResolvedValueOnce({ rows: [{ id: 7 }] }); // UPDATE
    await updateAd(7, { model: ONIX });
    expect(db.query).toHaveBeenCalledTimes(2);
    const [sql, values] = vi.mocked(db.query).mock.calls[1];
    expect(sql).toMatch(/UPDATE ads/);
    expect(sql).toMatch(/commercial_model = \$\d+/);
    expect(values).toContain("Onix");
  });

  it("payload sem brand/model não toca commercial_model", async () => {
    vi.mocked(db.query).mockResolvedValue({ rows: [{ id: 7 }] });
    await updateAd(7, { price: 55000 });
    const [sql] = vi.mocked(db.query).mock.calls[0];
    expect(sql).not.toContain("commercial_model");
  });
});
