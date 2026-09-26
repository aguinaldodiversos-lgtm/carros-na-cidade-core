/**
 * Sanitização e enriquecimento de campos de "confiança/moderação" do
 * anúncio público.
 *
 * Responsabilidade desta camada:
 *   1. Computar derivados públicos a partir de campos internos:
 *        - `reviewed_after_below_fipe` (selo "Anúncio analisado")
 *        - `seller_kind` ("dealer" | "private")
 *   2. REMOVER campos internos que não devem ir para a API pública:
 *        - `risk_reasons` (array de sinais detalhados — vazaria heurísticas
 *          do antifraude)
 *        - `reviewed_by` (id do admin que aprovou — privacidade interna)
 *        - `rejection_reason` (texto interno da moderação)
 *        - `correction_requested_reason` (texto interno)
 *        - `risk_score`, `risk_level` (contexto interno; usuário não
 *          precisa ver o número de risco)
 *
 * Esta camada é a fonte canônica de "tipo de anunciante" e do flag
 * "anúncio passou por revisão". Frontend NÃO deve recalcular a partir do
 * nome do anunciante ou de heurísticas locais — risco de regressão para
 * casos como "ittmotors" (loja) classificada como particular.
 */

const BELOW_FIPE_SIGNAL_CODES = new Set([
  "PRICE_BELOW_FIPE_REVIEW",
  "PRICE_FAR_BELOW_FIPE_CRITICAL",
]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readSignalCode(item) {
  if (!isPlainObject(item)) return null;
  const code =
    typeof item.code === "string"
      ? item.code
      : typeof item.signal_code === "string"
        ? item.signal_code
        : null;
  return code ? code.trim().toUpperCase() : null;
}

function parseRiskReasons(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * Anúncio teve sinal de preço abaixo da FIPE? Cobre tanto
 * `PRICE_BELOW_FIPE_REVIEW` (medium, 30 pts) quanto
 * `PRICE_FAR_BELOW_FIPE_CRITICAL` (critical, 70 pts) — definidos em
 * `src/modules/ads/risk/ad-risk.thresholds.js`. Lê o snapshot público
 * `risk_reasons` (JSONB em ads) e ignora o resto.
 */
export function hadBelowFipeRiskSignal(row) {
  if (!row) return false;
  const reasons = parseRiskReasons(row.risk_reasons);
  return reasons.some((entry) => {
    const code = readSignalCode(entry);
    return Boolean(code && BELOW_FIPE_SIGNAL_CODES.has(code));
  });
}

/**
 * Anúncio elegível para o selo "Anúncio analisado":
 *   - status active (já filtrado pela query pública, mas reforçamos)
 *   - teve sinal de preço abaixo da FIPE (REVIEW ou CRITICAL)
 *   - foi efetivamente revisado por moderação (`reviewed_at` not null)
 *
 * O selo é EXPLICITAMENTE de revisão, não de garantia. Frontend deve
 * exibir copy "Anúncio analisado" ou "Este anúncio passou por revisão
 * antes de ser exibido." — nunca "Compra segura garantida" / "Sem
 * risco" / "Verificado pelo Detran".
 */
export function isReviewedAfterBelowFipe(row) {
  if (!row) return false;
  if (row.status && row.status !== "active") return false;
  if (!row.reviewed_at) return false;
  return hadBelowFipeRiskSignal(row);
}

/**
 * Tipo canônico do anunciante para exibição pública.
 *
 * Regra (mais forte → mais fraca):
 *   1. account_type === 'CNPJ' → "dealer" (documento do dono da conta)
 *   2. dealership_name preenchido → "dealer" (é `advertisers.company_name`,
 *      que só existe em conta de loja; cobre lojas antigas sem
 *      `document_type` gravado)
 *   3. caso contrário → "private"
 *
 * `dealership_id` NÃO entra: ele é `advertisers.id`, e TODO anúncio pende de
 * um advertiser — `ads` não tem `user_id`, o vínculo de dono é só o
 * `advertiser_id`. Enquanto a regra 1 foi "dealership_id > 0 → dealer", ela
 * era verdadeira para todo mundo: anúncio de pessoa física saía com selo
 * "LOJA" e pílula "Loja parceira", e o teste de CNPJ abaixo era inalcançável
 * (produção, 2026-09-25: anúncio 124, advertiser 70, `document_type='cpf'`,
 * `company_name=null`, servido como `seller_kind:"dealer"`).
 *
 * Também não usamos `seller_name`: é o nome do anunciante, não o tipo — uma
 * pessoa física pode se chamar como uma loja e vice-versa. `company_name` é
 * diferente: só a conta de loja tem.
 */
export function deriveSellerKind(row) {
  if (!row) return "private";

  const accountType = String(row.account_type || "")
    .trim()
    .toUpperCase();
  if (accountType === "CNPJ") {
    return "dealer";
  }
  if (accountType === "CPF") {
    return "private";
  }

  // Sem documento gravado (contas legadas): `company_name` decide.
  if (String(row.dealership_name || "").trim() !== "") {
    return "dealer";
  }

  return "private";
}

/**
 * Aplica sanitização + enriquecimento sobre uma row pública.
 *
 * Mantém os campos legados (seller_name, dealership_name, account_type,
 * dealership_id) para retrocompatibilidade com clientes existentes —
 * mas REMOVE os campos sensíveis de moderação e adiciona os derivados.
 */
export function applyPublicTrustFields(row) {
  if (!row || typeof row !== "object") return row;

  const sellerKind = deriveSellerKind(row);
  const reviewedAfterBelowFipe = isReviewedAfterBelowFipe(row);

  const sanitized = { ...row };
  delete sanitized.risk_reasons;
  delete sanitized.risk_score;
  delete sanitized.risk_level;
  delete sanitized.reviewed_by;
  delete sanitized.rejection_reason;
  delete sanitized.correction_requested_reason;
  delete sanitized.structural_change_count;

  return {
    ...sanitized,
    seller_kind: sellerKind,
    seller_type: sellerKind,
    reviewed_after_below_fipe: reviewedAfterBelowFipe,
  };
}

export const PUBLIC_TRUST_INTERNAL_TEST_API = Object.freeze({
  BELOW_FIPE_SIGNAL_CODES: Array.from(BELOW_FIPE_SIGNAL_CODES),
});
