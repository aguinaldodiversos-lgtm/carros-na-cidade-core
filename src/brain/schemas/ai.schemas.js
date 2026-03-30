import { z } from "zod";

export const AiTaskSchema = z.enum([
  "ad_description_short",
  "lead_scoring",
  "seo_city_page",
  "seo_money_page",
  "whatsapp_message",
  "banner_prompt_only",
]);

export const AiQualitySchema = z.enum(["low", "medium", "high"]);

export const OrchestratorInputSchema = z.object({
  task: AiTaskSchema,
  input: z.any(),
  context: z
    .object({
      tenantId: z.string().optional(),
      userId: z.union([z.string(), z.number()]).optional(),
      city: z.string().optional(),
      locale: z.string().default("pt-BR"),
      quality: AiQualitySchema.default("medium"),
      requestId: z.string().optional(),
      pii: z.boolean().default(false),
      forcePremium: z.boolean().default(false),
      /** Estágio de crescimento do território — política de roteamento (antes era removido pelo Zod sem .passthrough). */
      stage: z.string().optional(),
    })
    .passthrough()
    .default({}),
});

export const OrchestratorResultSchema = z.object({
  ok: z.boolean(),
  task: AiTaskSchema,
  provider: z.enum(["cache", "local", "premium", "template"]),
  model: z.string().optional(),
  cached: z.boolean().default(false),
  latencyMs: z.number().optional(),
  costUsdEstimate: z.number().optional(),
  output: z.any(),
  meta: z.record(z.any()).optional(),
  error: z.string().optional(),
});

export function safeJsonParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
