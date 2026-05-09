import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/modules/platform/settings.service.js", () => ({
  getSetting: vi.fn(),
  setSetting: vi.fn(),
}));

vi.mock("../../src/modules/admin/admin.audit.js", () => ({
  recordAdminAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../src/shared/cache/cache.middleware.js", () => ({
  cacheInvalidatePrefix: vi.fn().mockResolvedValue(undefined),
}));

import { getSetting, setSetting } from "../../src/modules/platform/settings.service.js";
import { recordAdminAction } from "../../src/modules/admin/admin.audit.js";
import { cacheInvalidatePrefix } from "../../src/shared/cache/cache.middleware.js";
import {
  getRegionalRadiusKm,
  getRegionalSettings,
  normalizeRadiusValue,
  updateRegionalSettings,
  REGIONAL_RADIUS_DEFAULT,
  REGIONAL_RADIUS_MIN,
  REGIONAL_RADIUS_MAX,
  REGIONAL_RADIUS_KEY,
} from "../../src/modules/admin/regional-settings/admin-regional-settings.service.js";
import { AppError } from "../../src/shared/middlewares/error.middleware.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin regional-settings: normalizeRadiusValue", () => {
  it("aceita inteiro válido dentro do range", () => {
    expect(normalizeRadiusValue(80)).toBe(80);
    expect(normalizeRadiusValue(10)).toBe(10);
    expect(normalizeRadiusValue(150)).toBe(150);
  });

  it("rejeita valores fora do range — cai no default", () => {
    expect(normalizeRadiusValue(5)).toBe(REGIONAL_RADIUS_DEFAULT);
    expect(normalizeRadiusValue(151)).toBe(REGIONAL_RADIUS_DEFAULT);
    expect(normalizeRadiusValue(0)).toBe(REGIONAL_RADIUS_DEFAULT);
    expect(normalizeRadiusValue(-10)).toBe(REGIONAL_RADIUS_DEFAULT);
  });

  it("rejeita não-inteiros — cai no default", () => {
    expect(normalizeRadiusValue(80.5)).toBe(REGIONAL_RADIUS_DEFAULT);
    expect(normalizeRadiusValue(NaN)).toBe(REGIONAL_RADIUS_DEFAULT);
    expect(normalizeRadiusValue("abc")).toBe(REGIONAL_RADIUS_DEFAULT);
    expect(normalizeRadiusValue(null)).toBe(REGIONAL_RADIUS_DEFAULT);
    expect(normalizeRadiusValue(undefined)).toBe(REGIONAL_RADIUS_DEFAULT);
  });

  it("aceita objeto legado { value: N }", () => {
    expect(normalizeRadiusValue({ value: 50 })).toBe(50);
  });
});

describe("admin regional-settings: getRegionalRadiusKm", () => {
  it("retorna o default quando getSetting falha (degradação graceful)", async () => {
    getSetting.mockResolvedValue(REGIONAL_RADIUS_DEFAULT);
    const r = await getRegionalRadiusKm();
    expect(r).toBe(REGIONAL_RADIUS_DEFAULT);
  });

  it("retorna o valor lido quando válido", async () => {
    getSetting.mockResolvedValue(120);
    const r = await getRegionalRadiusKm();
    expect(r).toBe(120);
  });

  it("normaliza valor inválido para o default", async () => {
    getSetting.mockResolvedValue(999); // fora do range
    const r = await getRegionalRadiusKm();
    expect(r).toBe(REGIONAL_RADIUS_DEFAULT);
  });
});

describe("admin regional-settings: getRegionalSettings", () => {
  it("retorna shape completo com min/max/default", async () => {
    getSetting.mockResolvedValue(80);
    const s = await getRegionalSettings();
    expect(s).toEqual({
      radius_km: 80,
      radius_min_km: REGIONAL_RADIUS_MIN,
      radius_max_km: REGIONAL_RADIUS_MAX,
      radius_default_km: REGIONAL_RADIUS_DEFAULT,
    });
  });
});

describe("admin regional-settings: updateRegionalSettings", () => {
  it("rejeita payload vazio", async () => {
    await expect(
      updateRegionalSettings({ adminUserId: "1", payload: null })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejeita sem campo radius_km", async () => {
    await expect(
      updateRegionalSettings({ adminUserId: "1", payload: {} })
    ).rejects.toThrow(/radius_km/);
  });

  it("rejeita radius_km não-numérico", async () => {
    await expect(
      updateRegionalSettings({ adminUserId: "1", payload: { radius_km: "abc" } })
    ).rejects.toThrow(/numérico/);
  });

  it("rejeita radius_km não-inteiro", async () => {
    await expect(
      updateRegionalSettings({ adminUserId: "1", payload: { radius_km: 80.5 } })
    ).rejects.toThrow(/inteiro/);
  });

  it("rejeita radius_km abaixo do mínimo", async () => {
    await expect(
      updateRegionalSettings({
        adminUserId: "1",
        payload: { radius_km: REGIONAL_RADIUS_MIN - 1 },
      })
    ).rejects.toThrow(/mínimo/);
  });

  it("rejeita radius_km acima do máximo", async () => {
    await expect(
      updateRegionalSettings({
        adminUserId: "1",
        payload: { radius_km: REGIONAL_RADIUS_MAX + 1 },
      })
    ).rejects.toThrow(/máximo/);
  });

  it("aceita valor válido, grava, audita e invalida cache", async () => {
    getSetting.mockResolvedValue(80); // valor anterior
    setSetting.mockResolvedValue({
      key: REGIONAL_RADIUS_KEY,
      value: 50,
      updated_at: "2026-05-09T10:00:00Z",
    });

    const result = await updateRegionalSettings({
      adminUserId: "admin-42",
      payload: { radius_km: 50 },
    });

    expect(setSetting).toHaveBeenCalledWith(
      expect.objectContaining({
        key: REGIONAL_RADIUS_KEY,
        value: 50,
        updatedBy: "admin-42",
      })
    );
    expect(result.radius_km).toBe(50);
    expect(result.radius_min_km).toBe(REGIONAL_RADIUS_MIN);
    expect(result.radius_max_km).toBe(REGIONAL_RADIUS_MAX);
    expect(result.updated_at).toBe("2026-05-09T10:00:00Z");

    // Side-effects best-effort.
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update_regional_radius",
        adminUserId: "admin-42",
        oldValue: { radius_km: 80 },
        newValue: { radius_km: 50 },
      })
    );
    expect(cacheInvalidatePrefix).toHaveBeenCalledWith("internal:regions");
  });

  it("aceita valor mínimo 10 e máximo 150 (limites inclusivos)", async () => {
    getSetting.mockResolvedValue(80);
    setSetting.mockResolvedValue({
      key: REGIONAL_RADIUS_KEY,
      value: 10,
      updated_at: "2026-05-09T10:00:00Z",
    });

    await expect(
      updateRegionalSettings({
        adminUserId: "1",
        payload: { radius_km: REGIONAL_RADIUS_MIN },
      })
    ).resolves.toMatchObject({ radius_km: REGIONAL_RADIUS_MIN });

    setSetting.mockResolvedValue({
      key: REGIONAL_RADIUS_KEY,
      value: 150,
      updated_at: "2026-05-09T10:00:00Z",
    });

    await expect(
      updateRegionalSettings({
        adminUserId: "1",
        payload: { radius_km: REGIONAL_RADIUS_MAX },
      })
    ).resolves.toMatchObject({ radius_km: REGIONAL_RADIUS_MAX });
  });
});
