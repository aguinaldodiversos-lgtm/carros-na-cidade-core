import { OrchestratorInputSchema, OrchestratorResultSchema } from "./ai.schemas.js";
import { AiPolicy } from "./ai.policy.js";
import { auditAiCall } from "./ai.audit.js";
import { LocalAiProvider } from "./providers/local.provider.js";
import { PremiumAiProvider } from "./providers/premium.provider.js";

function buildPrompt({ task, input, context }) {
  // Prompts por tarefa (padrão enterprise: determinístico, curto, com regras)
  // Você pode evoluir isso para templates em arquivos.
  const locale = context?.locale || "pt-BR";

  switch (task) {
    case "ad_description_short":
      return `
Crie uma descrição curta e persuasiva para anúncio de veículo.
Regras:
- ${locale}
- Tom profissional e direto
- Máximo 5 parágrafos curtos
- Foco em conversão e clareza
- Não invente itens que não existam
Dados do veículo:
${JSON.stringify(input, null, 2)}
`;
    case "whatsapp_message":
      return `
Gere uma mensagem de WhatsApp para vendedor automotivo com objetivo de agendar visita.
Regras:
- ${locale}
- Curto, humano, sem enrolação
- Finalize com duas opções de horário (hoje/amanhã)
Contexto:
${JSON.stringify(input, null, 2)}
`;
    case "lead_scoring":
      return `
Classifique o lead em: quente, morno ou frio.
Retorne JSON no formato:
{"label":"quente|morno|frio","score":0-100,"reasons":["...","..."]}
Dados:
${JSON.stringify(input, null, 2)}
`;
    case "seo_city_page":
    case "seo_money_page":
      return `
Escreva conteúdo SEO para página de portal automotivo.
Regras:
- ${locale}
- Estrutura com H1, H2, parágrafos curtos
- Sem exagero de keywords
- Inclua seção FAQ com 4 perguntas
Brief:
${JSON.stringify(input, null, 2)}
`;
    case "banner_prompt_only":
      return `
Crie um PROMPT para gerar banner automotivo (sem gerar imagem aqui).
Regras:
- Visual profissional, limpo
- Texto em pt-BR
- Layout 16:9
Dados:
${JSON.stringify(input, null, 2)}
Retorne APENAS o prompt final.
`;
    default:
      return String(input);
  }
}

function templateFallback(task, input) {
  // fallback ultra seguro: sem IA
  switch (task) {
    case "ad_description_short":
      return `Veículo em excelente estado. Documentação em dia. Entre em contato para mais informações e agendar uma visita.`;
    case "whatsapp_message":
      return `Esse modelo vale a pena ver pessoalmente. Vamos marcar pra você vir tomar um café e olhar o carro com calma. Você consegue passar hoje no fim da tarde ou prefere amanhã?`;
    case "lead_scoring":
      return { label: "morno", score: 50, reasons: ["Fallback sem IA"] };
    default:
      return null;
  }
}

export class AiOrchestrator {
  constructor({ logger, cache, aiQueue }) {
    this.logger = logger;
    this.cache = cache;
    this.aiQueue = aiQueue;

    this.policy = new AiPolicy({ logger, cache });
    this.local = new LocalAiProvider({ logger });
    this.premium = new PremiumAiProvider({ logger });
  }

  async generate(payload) {
    const parsed = OrchestratorInputSchema.parse(payload);

    const { task, input, context } = parsed;

    if (!this.policy.isEnabled()) {
      return OrchestratorResultSchema.parse({
        ok: true,
        task,
        provider: "template",
        cached: false,
        output: templateFallback(task, input),
        meta: { reason: "AI_DISABLED" },
      });
    }

    const cacheKey = this.policy.cacheKey({ task, input, context });
    const shouldCache = this.policy.shouldCache(task);

    // 1) Cache
    if (shouldCache) {
      const cached = await this.cache.get(cacheKey);
      if (cached) {
        return OrchestratorResultSchema.parse({
          ok: true,
          task,
          provider: "cache",
          cached: true,
          output: JSON.parse(cached),
        });
      }
    }

    const prompt = buildPrompt({ task, input, context });

    // 2) Decide provider (local/premium)
    const canPremium = await this.policy.canUsePremium({ task, context });
    const mode = this.policy.mode();

    const order =
      mode === "premium"
        ? ["premium", "local"]
        : mode === "local"
          ? ["local"]
          : canPremium
            ? ["local", "premium"]
            : ["local"];

    const t0 = Date.now();
    let lastErr = null;

    for (const provider of order) {
      try {
        const res =
          provider === "local"
            ? await this.local.generate({ task, prompt, context })
            : await this.premium.generate({ task, prompt, context });

        const latencyMs = res.latencyMs ?? Date.now() - t0;

        // 3) Cache set
        if (shouldCache) {
          const ttl = this.policy.cacheTtlSeconds(task);
          await this.cache.set(cacheKey, JSON.stringify(res.output), ttl);
        }

        // 4) Budget note (premium)
        if (res.provider === "premium") {
          await this.policy.notePremiumSpend(res.costUsdEstimate || 0);
        }

        // 5) Audit (best effort)
        await auditAiCall({
          logger: this.logger,
          task,
          provider: res.provider,
          model: res.model,
          latencyMs,
          cached: false,
          costUsdEstimate: res.costUsdEstimate || 0,
          tenantId: context?.tenantId,
          userId: context?.userId,
          requestId: context?.requestId,
          ok: true,
          error: null,
        });

        return OrchestratorResultSchema.parse({
          ok: true,
          task,
          provider: res.provider,
          model: res.model,
          latencyMs,
          cached: false,
          costUsdEstimate: res.costUsdEstimate || 0,
          output: res.output,
          meta: res.meta || {},
        });
      } catch (err) {
        lastErr = err;
        this.logger.warn({
          message: "AI provider failed",
          task,
          provider,
          error: err?.message || String(err),
        });
      }
    }

    // 6) Fallback determinístico
    const fallback = templateFallback(task, input);

    await auditAiCall({
      logger: this.logger,
      task,
      provider: "template",
      model: null,
      latencyMs: Date.now() - t0,
      cached: false,
      costUsdEstimate: 0,
      tenantId: context?.tenantId,
      userId: context?.userId,
      requestId: context?.requestId,
      ok: false,
      error: lastErr?.message || "AI_FAILED",
    });

    return OrchestratorResultSchema.parse({
      ok: false,
      task,
      provider: "template",
      cached: false,
      output: fallback,
      error: lastErr?.message || "AI_FAILED",
      meta: { reason: "FALLBACK_TEMPLATE" },
    });
  }

  // Enfileira tarefa (assíncrona)
  async enqueue(payload, opts = {}) {
    if (!this.aiQueue) {
      throw new Error("AI Queue not configured");
    }

    const parsed = OrchestratorInputSchema.parse(payload);
    const priority = Number(opts.priority || 3);

    const job = await this.aiQueue.add(
      `ai:${parsed.task}`,
      parsed,
      {
        priority,
        jobId: opts.jobId, // opcional para dedupe
      }
    );

    return { jobId: job.id };
  }
}
