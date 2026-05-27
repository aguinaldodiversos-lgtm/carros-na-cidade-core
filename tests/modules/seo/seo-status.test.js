import { describe, expect, it } from "vitest";
import {
  SCP_STATUS,
  SP_STATUS,
  CLUSTER_TYPES,
  SITEMAP_ELIGIBLE_SCP_STATUSES,
  SITEMAP_ELIGIBLE_SP_STATUSES,
  SITEMAP_BUCKET_TO_CLUSTER_TYPE,
  sqlInClause,
  sqlInLiteral,
} from "../../../src/modules/seo/constants/seo-status.js";

describe("seo-status — enums congelados", () => {
  it("SCP_STATUS contém transições explícitas", () => {
    expect(SCP_STATUS.PLANNED).toBe("planned");
    expect(SCP_STATUS.GENERATING).toBe("generating");
    expect(SCP_STATUS.PUBLISHED).toBe("published");
    expect(Object.isFrozen(SCP_STATUS)).toBe(true);
  });

  it("SP_STATUS reflete states reais da seo_publications", () => {
    expect(SP_STATUS.PUBLISHED).toBe("published");
    expect(SP_STATUS.REVIEW_REQUIRED).toBe("review_required");
    expect(Object.isFrozen(SP_STATUS)).toBe(true);
  });

  it("CLUSTER_TYPES bate com cluster-planner.tasks.js", () => {
    expect(CLUSTER_TYPES.CITY_HOME).toBe("city_home");
    expect(CLUSTER_TYPES.CITY_BELOW_FIPE).toBe("city_below_fipe");
    expect(CLUSTER_TYPES.CITY_OPPORTUNITIES).toBe("city_opportunities");
    expect(CLUSTER_TYPES.CITY_BRAND).toBe("city_brand");
    expect(CLUSTER_TYPES.CITY_BRAND_MODEL).toBe("city_brand_model");
  });
});

describe("seo-status — sitemap elegibilidade", () => {
  it("inclui planned e published; mantém generated como legado", () => {
    expect(SITEMAP_ELIGIBLE_SCP_STATUSES).toContain("planned");
    expect(SITEMAP_ELIGIBLE_SCP_STATUSES).toContain("published");
    expect(SITEMAP_ELIGIBLE_SCP_STATUSES).toContain("generated");
  });

  it("NÃO inclui generating (transiente)", () => {
    expect(SITEMAP_ELIGIBLE_SCP_STATUSES).not.toContain("generating");
  });

  it("NÃO inclui failed ou archived (estados finais ruins/inativos)", () => {
    expect(SITEMAP_ELIGIBLE_SCP_STATUSES).not.toContain("failed");
    expect(SITEMAP_ELIGIBLE_SCP_STATUSES).not.toContain("archived");
  });

  it("SP elegíveis cobrem published e review_required", () => {
    expect(SITEMAP_ELIGIBLE_SP_STATUSES).toContain("published");
    expect(SITEMAP_ELIGIBLE_SP_STATUSES).toContain("review_required");
    expect(SITEMAP_ELIGIBLE_SP_STATUSES).not.toContain("draft");
  });
});

describe("seo-status — mapeamento de buckets do painel", () => {
  it("traduz nomes amigáveis para cluster_type reais", () => {
    expect(SITEMAP_BUCKET_TO_CLUSTER_TYPE.cities).toBe("city_home");
    expect(SITEMAP_BUCKET_TO_CLUSTER_TYPE.below_fipe).toBe("city_below_fipe");
    expect(SITEMAP_BUCKET_TO_CLUSTER_TYPE.brands).toBe("city_brand");
    expect(SITEMAP_BUCKET_TO_CLUSTER_TYPE.models).toBe("city_brand_model");
    expect(SITEMAP_BUCKET_TO_CLUSTER_TYPE.opportunities).toBe("city_opportunities");
  });

  it("não mapeia local_seo (vazio por design)", () => {
    expect(SITEMAP_BUCKET_TO_CLUSTER_TYPE.local_seo).toBeUndefined();
  });
});

describe("seo-status — sqlInClause / sqlInLiteral", () => {
  it("sqlInClause gera placeholders sequenciais com offset", () => {
    const { sql, params } = sqlInClause(["a", "b", "c"], 3);
    expect(sql).toBe("IN ($3,$4,$5)");
    expect(params).toEqual(["a", "b", "c"]);
  });

  it("sqlInClause default startIdx=1", () => {
    const { sql } = sqlInClause(["x", "y"]);
    expect(sql).toBe("IN ($1,$2)");
  });

  it("sqlInLiteral inline literais com escape de aspas", () => {
    expect(sqlInLiteral(["planned", "published"])).toBe("IN ('planned','published')");
  });

  it("sqlInLiteral escapa aspas simples para evitar SQL injection mesmo em whitelist", () => {
    expect(sqlInLiteral(["o'malley"])).toBe("IN ('o''malley')");
  });
});
