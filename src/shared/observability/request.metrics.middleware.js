// src/shared/observability/request.metrics.middleware.js
import { incrementCounter, observeHistogram } from "./metrics.registry.js";

/**
 * Middleware de métricas robusto:
 * - não quebra request se metrics.registry falhar
 * - evita high-cardinality (não usa querystring, normaliza rota)
 * - suporta req.route (quando existe) e fallback seguro
 * - ignora alguns paths ruidosos por padrão (configurável)
 */
export function requestMetricsMiddleware(req, res, next) {
  const startedAt = process.hrtime.bigint();

  // opcional: ignorar paths para reduzir ruído/custo
  const ignore = new Set(
    String(process.env.METRICS_IGNORE_PATHS || "/metrics,/health,/health/meta")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  // Usa req.originalUrl sem query para evitar cardinalidade
  const rawPath = String(req.originalUrl || req.url || req.path || "/");
  const pathNoQuery = rawPath.split("?")[0];

  if (ignore.has(pathNoQuery)) return next();

  // Melhor esforço para obter um "route pattern" (baixa cardinalidade)
  // - req.route.path existe só dentro do handler da rota
  // - baseUrl ajuda quando montado via app.use('/api/ads', router)
  const baseUrl = String(req.baseUrl || "");
  const routePath =
    (req.route && typeof req.route.path === "string" && req.route.path) ||
    (Array.isArray(req.route?.path) ? req.route.path.join("|") : null) ||
    null;

  // fallback: path sem query, mas com uma normalização simples
  // (opcional) remove IDs numéricos longos e UUIDs para reduzir cardinalidade
  const normalizedPath = pathNoQuery
    .replace(
      /\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi,
      "/:uuid"
    )
    .replace(/\/\d{3,}/g, "/:id");

  const routeLabel = routePath ? `${baseUrl}${routePath}` : normalizedPath;

  let observed = false;

  function recordMetrics() {
    if (observed) return;
    observed = true;

    // hrtime em ms, com precisão e sem drift
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    const labels = {
      method: String(req.method || "GET"),
      route: routeLabel,
      status_code: String(res.statusCode || 0),
    };

    try {
      incrementCounter("http_requests_total", 1, labels);
    } catch {
      // nunca derruba request por metrics
    }

    try {
      observeHistogram("http_request_duration_ms", durationMs, labels);
    } catch {
      // nunca derruba request por metrics
    }
  }

  // finish = resposta foi enviada
  res.once("finish", recordMetrics);

  // close = conexão fechada antes de finish (client abort)
  res.once("close", recordMetrics);

  next();
}
