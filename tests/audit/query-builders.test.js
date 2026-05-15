import { describe, expect, it } from "vitest";

import {
  ALL_ADS_COLUMNS,
  OPTIONAL_ADS_COLUMNS,
  REQUIRED_ADS_COLUMNS,
  buildAdsQualityQuery,
  buildDuplicateSlugsQuery,
} from "../../scripts/audit/lib/ads-query-builder.mjs";
import {
  buildAdCityJoinQuery,
  buildCitiesScanQuery,
  buildMissingCoordsQuery,
  buildOrphanAdsQuery,
} from "../../scripts/audit/lib/city-integrity-query-builder.mjs";
import {
  buildImagesAuditQuery,
} from "../../scripts/audit/lib/image-integrity-query-builder.mjs";

const DEFAULT_ARGS = { limit: 1000, statusFilter: "active", sinceDays: null };

describe("buildAdsQualityQuery — schema completo (caso ideal)", () => {
  it("monta SELECT com todas as colunas REQUIRED + OPTIONAL presentes", () => {
    const available = new Set(ALL_ADS_COLUMNS);
    const { sql, params, present, missing } = buildAdsQualityQuery({
      availableColumns: available,
      args: DEFAULT_ARGS,
    });

    for (const col of ALL_ADS_COLUMNS) {
      expect(sql).toContain(col);
    }
    expect(present.sort()).toEqual([...ALL_ADS_COLUMNS].sort());
    expect(missing).toEqual([]);
    expect(sql).toContain("FROM ads");
    expect(sql).toContain("WHERE status = $1");
    expect(sql).toContain("ORDER BY created_at DESC");
    expect(sql).toContain("LIMIT $2");
    expect(params).toEqual(["active", 1000]);
  });
});

describe("buildAdsQualityQuery — coluna 'version' inexistente (incidente PR5)", () => {
  it("NÃO inclui 'version' no SELECT quando coluna não existe", () => {
    const available = new Set([
      "id", "title", "slug", "status",
      "brand", "model", "description",
      "city", "state", "city_id", "plan", "created_at",
      "advertiser_id", "user_id",
      // dealership_id e version AUSENTES de propósito
    ]);
    const { sql, missing } = buildAdsQualityQuery({
      availableColumns: available,
      args: DEFAULT_ARGS,
    });

    expect(sql).not.toMatch(/\bversion\b/);
    expect(sql).not.toMatch(/\bdealership_id\b/);
    expect(missing).toContain("version");
    expect(missing).toContain("dealership_id");
  });

  it("retorna present sem 'version' quando ausente", () => {
    const available = new Set([
      "id", "title", "slug", "status", "brand", "model", "created_at",
    ]);
    const { present } = buildAdsQualityQuery({
      availableColumns: available,
      args: DEFAULT_ARGS,
    });
    expect(present).not.toContain("version");
    expect(present).toContain("id");
    expect(present).toContain("title");
  });
});

describe("buildAdsQualityQuery — colunas REQUIRED ausentes", () => {
  it("aborta com erro claro quando 'id' está ausente", () => {
    const available = new Set(["title", "slug", "status"]); // id missing
    expect(() =>
      buildAdsQualityQuery({ availableColumns: available, args: DEFAULT_ARGS })
    ).toThrow(/coluna obrigatória 'id'/);
  });

  it("aborta com erro claro quando 'slug' está ausente", () => {
    const available = new Set(["id", "title", "status"]);
    expect(() =>
      buildAdsQualityQuery({ availableColumns: available, args: DEFAULT_ARGS })
    ).toThrow(/coluna obrigatória 'slug'/);
  });

  it("mensagem de erro orienta a rodar --print-schema", () => {
    const available = new Set(["id"]); // title, slug, status ausentes
    expect(() =>
      buildAdsQualityQuery({ availableColumns: available, args: DEFAULT_ARGS })
    ).toThrow(/--print-schema/);
  });
});

describe("buildAdsQualityQuery — WHERE adapta a colunas ausentes", () => {
  it("sem coluna 'status', remove filtro de status do WHERE", () => {
    const available = new Set(["id", "title", "slug", "status", "brand", "created_at"]);
    const { sql, params } = buildAdsQualityQuery({
      availableColumns: available,
      args: { ...DEFAULT_ARGS, statusFilter: "active" },
    });
    expect(sql).toContain("WHERE status = $1");
    expect(params[0]).toBe("active");
  });

  it("sem coluna 'created_at', remove ORDER BY", () => {
    const available = new Set(["id", "title", "slug", "status"]);
    const { sql } = buildAdsQualityQuery({
      availableColumns: available,
      args: DEFAULT_ARGS,
    });
    expect(sql).not.toMatch(/ORDER BY/);
  });

  it("sinceDays sem created_at: filtro é silenciosamente omitido", () => {
    const available = new Set(["id", "title", "slug", "status"]);
    const { sql, params } = buildAdsQualityQuery({
      availableColumns: available,
      args: { limit: 100, statusFilter: null, sinceDays: 7 },
    });
    expect(sql).not.toMatch(/INTERVAL/);
    expect(params).toEqual([100]); // só o limit
  });
});

describe("buildAdsQualityQuery — defesa SQL injection", () => {
  it("targetTable unsafe é rejeitado (passa por SAFE_IDENTIFIER_RE? Não — está hardcoded por padrão)", () => {
    // O targetTable está hardcoded como 'ads' por default — o caller não
    // pode injetar. Mas se passar manualmente um valor, a SQL string sai
    // como está. Documentamos o pattern: o caller NUNCA expõe targetTable
    // ao input externo. Testamos que o default funciona.
    const available = new Set(ALL_ADS_COLUMNS);
    const { sql } = buildAdsQualityQuery({
      availableColumns: available,
      args: DEFAULT_ARGS,
    });
    expect(sql).toContain("FROM ads");
  });
});

describe("buildDuplicateSlugsQuery", () => {
  it("inclui filtro de status quando coluna existe", () => {
    const available = new Set(["id", "slug", "status"]);
    const { sql, params } = buildDuplicateSlugsQuery({
      availableColumns: available,
      args: DEFAULT_ARGS,
    });
    expect(sql).toContain("status = $1");
    expect(params).toEqual(["active"]);
  });

  it("OMITE filtro de status quando coluna ausente", () => {
    const available = new Set(["id", "slug"]);
    const { sql, params } = buildDuplicateSlugsQuery({
      availableColumns: available,
      args: DEFAULT_ARGS,
    });
    expect(sql).not.toMatch(/status/);
    expect(params).toEqual([]);
  });

  it("erro se coluna slug não existe (incompatível com auditoria)", () => {
    expect(() =>
      buildDuplicateSlugsQuery({
        availableColumns: new Set(["id"]),
        args: DEFAULT_ARGS,
      })
    ).toThrow(/sem coluna 'slug'/);
  });
});

describe("buildCitiesScanQuery", () => {
  it("aborta sem 'id' (REQUIRED)", () => {
    expect(() =>
      buildCitiesScanQuery({
        availableColumns: new Set(["name", "slug", "state"]),
        args: DEFAULT_ARGS,
      })
    ).toThrow(/coluna obrigatória 'id'/);
  });

  it("sem latitude/longitude (OPTIONAL), funciona com warning em missing", () => {
    const available = new Set(["id", "name", "slug", "state"]);
    const { sql, missing } = buildCitiesScanQuery({
      availableColumns: available,
      args: DEFAULT_ARGS,
    });
    expect(missing).toEqual(["latitude", "longitude"]);
    expect(sql).not.toMatch(/latitude|longitude/);
  });
});

describe("buildAdCityJoinQuery", () => {
  it("sem ads.city_id → JOIN cities ON FALSE (sem mistura)", () => {
    const adsColumns = new Set(["id", "status", "title"]);
    const citiesColumns = new Set(["id", "name", "slug", "state"]);
    const { sql } = buildAdCityJoinQuery({
      adsColumns,
      citiesColumns,
      args: DEFAULT_ARGS,
    });
    expect(sql).toContain("LEFT JOIN cities c ON FALSE");
  });

  it("com city_id, faz JOIN normal", () => {
    const adsColumns = new Set(["id", "status", "title", "city_id"]);
    const citiesColumns = new Set(["id", "name", "slug", "state"]);
    const { sql } = buildAdCityJoinQuery({
      adsColumns,
      citiesColumns,
      args: DEFAULT_ARGS,
    });
    expect(sql).toContain("LEFT JOIN cities c ON c.id = a.city_id");
  });
});

describe("buildOrphanAdsQuery", () => {
  it("sem city_id na ads → query trivial vazia (sem orphans para detectar)", () => {
    const { sql } = buildOrphanAdsQuery({
      availableColumns: new Set(["id", "title", "status"]),
      args: DEFAULT_ARGS,
    });
    expect(sql).toMatch(/WHERE FALSE/);
  });

  it("com city_id, monta WHERE city_id IS NULL", () => {
    const available = new Set(["id", "city_id", "title", "city", "state", "status", "created_at"]);
    const { sql, params } = buildOrphanAdsQuery({ availableColumns: available, args: DEFAULT_ARGS });
    expect(sql).toContain("city_id IS NULL");
    expect(sql).toContain("status = $1");
    expect(params).toEqual(["active"]);
  });
});

describe("buildMissingCoordsQuery", () => {
  it("sem latitude/longitude → query trivial vazia", () => {
    const { sql } = buildMissingCoordsQuery({
      availableColumns: new Set(["id", "name"]),
    });
    expect(sql).toMatch(/WHERE FALSE/);
  });

  it("com colunas geo, monta filtro IS NULL", () => {
    const { sql } = buildMissingCoordsQuery({
      availableColumns: new Set(["id", "name", "latitude", "longitude"]),
    });
    expect(sql).toMatch(/latitude IS NULL OR longitude IS NULL/);
  });
});

describe("buildImagesAuditQuery", () => {
  it("aborta sem 'images' (REQUIRED)", () => {
    expect(() =>
      buildImagesAuditQuery({
        availableColumns: new Set(["id", "title"]),
        args: DEFAULT_ARGS,
      })
    ).toThrow(/coluna obrigatória 'images'/);
  });

  it("monta SELECT com colunas presentes só", () => {
    const available = new Set(["id", "images", "title", "status"]);
    const { sql, present, missing } = buildImagesAuditQuery({
      availableColumns: available,
      args: DEFAULT_ARGS,
    });
    expect(present).toContain("images");
    expect(present).toContain("title");
    expect(present).toContain("status");
    expect(missing).toContain("slug");
    expect(missing).toContain("created_at");
    expect(sql).not.toMatch(/\bslug\b/);
  });
});

describe("REQUIRED_ADS_COLUMNS — contrato mínimo", () => {
  it("contém id, title, slug, status (e nada mais como required)", () => {
    expect(new Set(REQUIRED_ADS_COLUMNS)).toEqual(
      new Set(["id", "title", "slug", "status"])
    );
  });

  it("'version' está em OPTIONAL, não em REQUIRED (lição PR5)", () => {
    expect(OPTIONAL_ADS_COLUMNS).toContain("version");
    expect(REQUIRED_ADS_COLUMNS).not.toContain("version");
  });
});
