import { logger } from "../../shared/logger.js";
import { recordEvent } from "../analytics/analytics.service.js";

/**
 * Coletor público de analytics (Fase 4.4).
 *
 * POST /api/public/analytics/events — anônimo (sem login). Best-effort:
 * - 204 em sucesso (corpo vazio; o navegador usa sendBeacon);
 * - 400/413 em payload inválido/grande (validação no service);
 * - NUNCA derruba a navegação: erro inesperado é logado e respondido 204
 *   para não gerar ruído no cliente (a coleta é não-crítica).
 *
 * device_type/user_agent_hash são derivados do header User-Agent no servidor
 * — não confiamos no cliente e não armazenamos IP nem UA bruto.
 */
export async function collectAnalyticsEvent(req, res, next) {
  try {
    await recordEvent({
      body: req.body,
      userAgent: req.headers["user-agent"] || null,
    });
    res.status(204).end();
  } catch (err) {
    // Erros de validação (AppError operacional) seguem o fluxo normal → 400/413.
    if (err && err.isOperational) {
      next(err);
      return;
    }
    // Falha inesperada (ex.: banco): não quebra o cliente — loga e responde 204.
    logger.warn({ err: err?.message }, "[analytics] falha ao gravar evento (ignorado)");
    res.status(204).end();
  }
}
