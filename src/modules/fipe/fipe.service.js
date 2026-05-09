/**
 * Backend FIPE Service — fonte de verdade do valor FIPE no pipeline.
 *
 * Objetivo: fechar o spoof onde o frontend enviava `fipe_value` arbitrário
 * e o backend confiava cegamente. Daqui pra frente, o `fipe_value` do
 * cliente é apenas dado informativo de baixa confiança — a decisão de
 * antifraude usa o snapshot retornado por este service.
 *
 * Contrato (snapshot retornado):
 *
 *   {
 *     ok: boolean,
 *     value: number | null,            // BRL, mesmo unidade que ads.price
 *     fipe_code: string | null,
 *     fipe_source: "parallelum" | "client_hint" | null,
 *     fipe_snapshot_at: string,        // ISO timestamp da resolução
 *     confidence: "high" | "medium" | "low" | "none",
 *     failure_reason: string | null,   // só quando ok=false
 *     used_client_hint: boolean,       // só true se aceitamos hint do cliente
 *                                      // como FALLBACK INFORMATIVO. Mesmo
 *                                      // assim, confidence é "low" e o
 *                                      // valor não pode liberar review.
 *   }
 *
 * Estratégia em camadas:
 *   1. Se vier `fipe_code_year_pair` (brandCode + modelCode + yearCode) ou
 *      apenas `fipe_year_code` + `fipe_code`, cota direto via provider →
 *      confidence = "high".
 *   2. Caso contrário e o cliente tenha enviado `fipe_value` numérico
 *      plausível, usamos como hint informativo com confidence = "low" e
 *      `failure_reason="server_lookup_skipped"`. **Esse hint NÃO é usado
 *      como fonte autoritativa para decisão de PENDING_REVIEW** — é
 *      apenas registrado.
 *   3. Sem hint nem códigos: retorna `ok: false, confidence: "none",
 *      failure_reason: "no_codes_no_hint"`.
 *
 * Decisão arquitetural (Tarefa 7/8 da rodada):
 *
 *   O `pipeline` deve passar para `calculateForAd`:
 *       - snapshot.value           se confidence == "high"
 *       - null                     em qualquer outro caso
 *
 *   Assim, mesmo que o cliente envie `fipe_value` falso ou ainda que o
 *   backend tenha um hint de baixa confiança, o sinal usado pelo
 *   adRiskService é `FIPE_UNAVAILABLE` (regra segura que mantém o ad
 *   em score normal). NÃO há caminho em que o cliente consiga "passar"
 *   `fipe_value` alto pra escapar de PENDING_REVIEW.
 *
 * Override de comportamento via env:
 *   FIPE_BACKEND_DISABLED=true       → tudo retorna `unavailable`.
 *   FIPE_API_BASE_URL=...            → URL alternativa (parallelum compat).
 *   FIPE_ALLOW_CLIENT_HINT=false     → desliga até o registro de hint
 *                                       informativo (modo "paranoid").
 */

import { quoteByCodes } from "./fipe.provider.js";
import { logger } from "../../shared/logger.js";

const PRICE_MIN_PLAUSIBLE = 1_000;
const PRICE_MAX_PLAUSIBLE = 5_000_000;

function nowIso() {
  return new Date().toISOString();
}

function isAllowClientHint() {
  return String(process.env.FIPE_ALLOW_CLIENT_HINT ?? "true").toLowerCase() !== "false";
}

function plausiblePrice(n) {
  return (
    Number.isFinite(n) && n >= PRICE_MIN_PLAUSIBLE && n <= PRICE_MAX_PLAUSIBLE
  );
}

function snapshotUnavailable(failure_reason, extras = {}) {
  return {
    ok: false,
    value: null,
    fipe_code: null,
    fipe_source: null,
    fipe_snapshot_at: nowIso(),
    confidence: "none",
    failure_reason,
    used_client_hint: false,
    ...extras,
  };
}

/**
 * @param {object} input
 * @param {string} [input.brand]
 * @param {string} [input.model]
 * @param {number|string} [input.year]
 * @param {string} [input.fuel]
 * @param {string} [input.fipe_code]            código canônico FIPE (string)
 * @param {string} [input.fipe_brand_code]      código numérico de marca
 * @param {string} [input.fipe_model_code]      código numérico de modelo
 * @param {string} [input.fipe_year_code]       ex: "2018-1"
 * @param {"carros"|"motos"|"caminhoes"} [input.vehicle_type]
 * @param {number|string|null} [input.client_hint_value]   `fipe_value` enviado
 *                                                          pelo cliente (BRL).
 * @param {object} [deps]
 * @param {typeof quoteByCodes} [deps.quote]   injetável para teste
 * @param {object} [deps.logger]
 * @returns {Promise<object>} snapshot — ver doc no topo.
 */
export async function resolveFipeReference(input = {}, deps = {}) {
  const quote = typeof deps.quote === "function" ? deps.quote : quoteByCodes;
  const log = deps.logger ?? logger;

  // 1) Caminho preferencial: temos códigos canônicos do veículo.
  const brandCode = String(input?.fipe_brand_code ?? "").trim();
  const modelCode = String(input?.fipe_model_code ?? "").trim();
  const yearCode = String(input?.fipe_year_code ?? "").trim();
  const vehicleType =
    input?.vehicle_type === "motos" || input?.vehicle_type === "caminhoes"
      ? input.vehicle_type
      : "carros";

  if (brandCode && modelCode && yearCode) {
    let q;
    try {
      q = await quote({ vehicleType, brandCode, modelCode, yearCode });
    } catch (err) {
      log?.warn?.(
        {
          domain: "fipe.backend",
          stage: "quoteByCodes",
          err: err?.message || String(err),
        },
        "[fipe] provider lançou exceção; tratando como unavailable"
      );
      q = { ok: false, reason: "exception" };
    }

    if (q?.ok && plausiblePrice(q.price)) {
      return {
        ok: true,
        value: Number(q.price),
        fipe_code:
          q.fipeCode ??
          (input?.fipe_code ? String(input.fipe_code).trim() : null) ??
          null,
        fipe_source: "parallelum",
        fipe_snapshot_at: nowIso(),
        confidence: "high",
        failure_reason: null,
        used_client_hint: false,
        reference_month: q.referenceMonth ?? null,
      };
    }

    // Provider falhou; cai para hint do cliente abaixo (se permitido).
    log?.info?.(
      {
        domain: "fipe.backend",
        stage: "quote_failed",
        reason: q?.reason || "unknown",
        status: q?.status ?? null,
      },
      "[fipe] cotação backend falhou — verificando hint do cliente"
    );
  }

  // 2) Caminho informativo: cliente enviou `fipe_value` plausível.
  //    NUNCA usado como fonte autoritativa — apenas registrado.
  const hint = Number(input?.client_hint_value);
  if (isAllowClientHint() && plausiblePrice(hint)) {
    return {
      ok: false, // mantém ok=false para o pipeline NÃO usar como autoritativo
      value: null, // pipeline lê isto e passa null para o adRiskService
      fipe_code: input?.fipe_code ? String(input.fipe_code).trim() : null,
      fipe_source: "client_hint",
      fipe_snapshot_at: nowIso(),
      confidence: "low",
      failure_reason: "server_lookup_skipped",
      used_client_hint: true,
      client_hint_value: hint,
    };
  }

  // 3) Indisponibilidade total.
  if (!brandCode || !modelCode || !yearCode) {
    return snapshotUnavailable("no_codes_no_hint");
  }
  return snapshotUnavailable("provider_unavailable");
}

/**
 * Helper para o pipeline: extrai o valor que o adRiskService deve usar.
 * Retorna `null` em qualquer cenário diferente de high-confidence.
 */
export function fipeValueForRiskScoring(snapshot) {
  if (!snapshot || !snapshot.ok) return null;
  if (snapshot.confidence !== "high") return null;
  return Number.isFinite(snapshot.value) && snapshot.value > 0
    ? Number(snapshot.value)
    : null;
}
