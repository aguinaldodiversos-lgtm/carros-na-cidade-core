/**
 * Centralized feature flags for the Express backend.
 *
 * Convention:
 *   - Each flag has a clear name, default value, and documented purpose.
 *   - Env vars are resolved once at import time.
 *   - Import `features` wherever you need a runtime check.
 *
 * For frontend flags, see: frontend/lib/config/feature-flags.ts
 */

function envBool(key, fallback) {
  const v = process.env[key];
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return fallback;
}

/**
 * Variante estrita de `envBool`: apenas `"true"` (lowercase, exato) ativa
 * a flag. Qualquer outro valor — incluindo `"TRUE"`, `"1"`, `"yes"`,
 * `"on"`, vazio, undefined — mantém em `false`.
 *
 * Usada para flags de produtos sensíveis (Eventos/Feirão/Banner Regional)
 * que devem permanecer DESLIGADOS por default e blindar contra erros de
 * configuração (typo de operador, default acidental do orquestrador).
 * "Falhar fechado" é a postura correta para shutdown de produto.
 */
function envBoolStrict(key) {
  return process.env[key] === "true";
}

export const features = {
  /** Background banner worker (generates promotional images). Default: off. */
  bannerWorkerEnabled: envBool("ENABLE_BANNER_WORKER", false),

  /** Local AI inference (Ollama / local models). Default: on. */
  localAIEnabled: envBool("LOCAL_AI_ENABLED", true),

  /** Premium AI (OpenAI / external paid models). Default: off. */
  premiumAIEnabled: envBool("PREMIUM_AI_ENABLED", false),

  /** Master AI toggle. Default: off. */
  aiEnabled: envBool("AI_ENABLED", false),

  /** Emit legacy image proxy URLs in public API. Default: off in prod, on in dev. */
  legacyImageProxy: envBool(
    "PUBLIC_EMIT_LEGACY_IMAGE_PROXY",
    process.env.NODE_ENV !== "production"
  ),

  /** HTTP request audit logs. Default: off. */
  requestAuditLogs: envBool("REQUEST_AUDIT_LOGS_ENABLED", false),

  /** Serve static /uploads directory. Default: true in dev. */
  serveUploadsStatic: envBool("SERVE_UPLOADS_STATIC", process.env.NODE_ENV !== "production"),

  /** Disable Redis entirely (cache + queues). Default: false. */
  disableRedis: envBool("DISABLE_REDIS", false),

  /** Auto-run DB migrations on startup. Default: false. */
  runMigrations: envBool("RUN_MIGRATIONS", false),

  /** Start background workers on startup. Default: false. */
  runWorkers: envBool("RUN_WORKERS", false),

  // ───────────────────────────────────────────────────────────────────
  // Eventos / Feirão / Banner Regional / Impulsionamento Geolocalizado
  //
  // Decisão de produto (2026-05-04): produto Evento fica DORMENTE até
  // o portal ter volume + operação comercial madura. Ver runbook
  // `docs/runbooks/events-feature-shutdown.md` para superfície completa
  // e checklist de reativação.
  //
  // Todas as flags abaixo usam `envBoolStrict` — apenas `"true"` lowercase
  // exato ativa. Default fechado: ausência de env mantém produto DESLIGADO.
  //
  // NÃO confundir com "Destaque pago" (Boost de anúncio): aquele é parte
  // do produto kept (planos Grátis/Start/Pro/Destaque) e NÃO é tocado
  // por estas flags.
  // ───────────────────────────────────────────────────────────────────

  /** Master toggle do produto Evento. Default: off. Se off, todas as
   *  outras EVENTS_* ficam efetivamente off (kill-switch absoluto). */
  eventsEnabled: envBoolStrict("EVENTS_ENABLED"),

  /** Exposição pública: plano `cnpj-evento-premium` listado em /planos,
   *  páginas públicas de evento, sitemap. Default: off. */
  eventsPublicEnabled: envBoolStrict("EVENTS_PUBLIC_ENABLED"),

  /** Criação de novos eventos via API (POST). Default: off. */
  eventsCreationEnabled: envBoolStrict("EVENTS_CREATION_ENABLED"),

  /** Checkout/pagamento de plano de evento. Default: off. */
  eventsPaymentsEnabled: envBoolStrict("EVENTS_PAYMENTS_ENABLED"),

  /** Workers de eventos (scheduler/broadcast/dispatch/fail-safe/etc).
   *  Default: off. */
  eventsWorkerEnabled: envBoolStrict("EVENTS_WORKER_ENABLED"),

  /** Geração de banner via IA (DALL-E) para eventos. Default: off.
   *  Custo OpenAI real — manter trancado. */
  eventsAiBannerEnabled: envBoolStrict("EVENTS_AI_BANNER_ENABLED"),
};

/**
 * Helper de composição: produto Evento está ativo num determinado domínio?
 * Combina `eventsEnabled` (master) com a flag específica via AND lógico.
 *
 * Exemplo:
 *   if (!isEventsDomainEnabled("public")) return res.status(410).end();
 */
export function isEventsDomainEnabled(domain) {
  if (!features.eventsEnabled) return false;
  switch (domain) {
    case "public":
      return features.eventsPublicEnabled;
    case "creation":
      return features.eventsCreationEnabled;
    case "payments":
      return features.eventsPaymentsEnabled;
    case "worker":
      return features.eventsWorkerEnabled;
    case "ai_banner":
      return features.eventsAiBannerEnabled;
    default:
      return false;
  }
}
