import { describe, it, expect } from "vitest";
import { OrchestratorInputSchema } from "../../src/brain/schemas/ai.schemas.js";

describe("OrchestratorInputSchema — preserva contexto de roteamento", () => {
  it("mantém stage e campos extra com passthrough", () => {
    const parsed = OrchestratorInputSchema.parse({
      task: "seo_city_page",
      input: { city: "SP" },
      context: {
        stage: "dominance",
        locale: "pt-BR",
        clusterPlanId: "cp_123",
      },
    });
    expect(parsed.context.stage).toBe("dominance");
    expect(parsed.context.clusterPlanId).toBe("cp_123");
  });
});
