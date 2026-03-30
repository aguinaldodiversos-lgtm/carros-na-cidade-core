import { describe, it, expect } from "vitest";
import { resolveAiStagePolicy } from "../../src/brain/policies/ai-stage.policy.js";

describe("resolveAiStagePolicy — roteamento por estágio", () => {
  it("forcePremium força premium", () => {
    const r = resolveAiStagePolicy({
      stage: "seed",
      task: "lead_scoring",
      forcePremium: true,
    });
    expect(r.preferredMode).toBe("premium");
    expect(r.reason).toBe("FORCE_PREMIUM");
  });

  it("lead_scoring ignora estágio e mantém local", () => {
    const r = resolveAiStagePolicy({
      stage: "dominance",
      task: "lead_scoring",
    });
    expect(r.preferredMode).toBe("local");
    expect(r.allowPremium).toBe(false);
  });

  it("seo_money_page em dominance prefere premium", () => {
    const r = resolveAiStagePolicy({
      stage: "dominance",
      task: "seo_money_page",
    });
    expect(r.preferredMode).toBe("premium");
    expect(r.reason).toBe("MONEY_PAGE_HIGH_STAGE");
  });

  it("banner_prompt_only em dominance prefere premium", () => {
    const r = resolveAiStagePolicy({
      stage: "dominance",
      task: "banner_prompt_only",
    });
    expect(r.preferredMode).toBe("premium");
    expect(r.reason).toBe("BANNER_CREATIVE_HIGH_STAGE");
  });

  it("ad_description_short em optimization permite premium opcional", () => {
    const r = resolveAiStagePolicy({
      stage: "optimization",
      task: "ad_description_short",
    });
    expect(r.preferredMode).toBe("local");
    expect(r.allowPremium).toBe(true);
    expect(r.quality).toBe("high");
  });
});
