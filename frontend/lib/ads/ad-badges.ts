/**
 * Mapper canônico de selos do card de anúncio.
 *
 * Fonte ÚNICA dos selos visuais. AdCard (e qualquer card adapter) consome
 * `resolveAdBadges` em vez de re-implementar a lógica. Isso evita que a
 * heurística textual baseada em `ads.plan` (snapshot legado) se espalhe
 * por múltiplos componentes — divergindo do ranking SQL.
 *
 * Sinais canônicos preferidos:
 *   - priority_tier        — calculado pelo backend (commercialLayerExpr).
 *                            Fonte de verdade para tier comercial.
 *   - highlight_until      — canônico (timestamp).
 *   - below_fipe           — canônico (flag de risk).
 *   - opportunity          — calculado pelo backend (opportunityExpr).
 *                            >= 10% abaixo da FIPE.
 *   - seller_kind          — canônico do backend trust pass.
 *   - reviewed_after_below_fipe — canônico de moderação.
 *
 * Heurísticas (fallback APENAS quando o canônico não veio do backend):
 *   - plan contém "pro/premium/master/etc."  → tier 3
 *   - dealership_id/seller_type === "dealer" → tier 2
 *
 * Selos NÃO emitidos:
 *   - "Loja verificada": auditoria 2026-05-19 mostrou que
 *     `users.document_verified` é checksum self-service (sem KYC externo)
 *     e `advertisers.verified` é coluna morta. Sem sinal canônico
 *     confiável, este selo fica adiado até integração com Receita/Junta.
 */

import { resolveSellerKind } from "@/lib/vehicle/seller-kind";

export type AdBadgeId =
  | "destaque"
  | "pro"
  | "start"
  | "below_fipe"
  | "opportunity"
  | "particular"
  | "reviewed";

export type AdBadgeVariant = "warning" | "premium" | "info" | "success" | "reviewed";

export type AdBadge = {
  id: AdBadgeId;
  label: string;
  variant: AdBadgeVariant;
};

/**
 * Subset do `AdItem`/`BaseAdData` que o mapper consome. Tudo opcional —
 * mapper degrada graciosamente para anúncios incompletos.
 */
export type AdBadgeSignals = {
  /** Tier canônico do backend (commercialLayerExpr). 1=Grátis 4=Destaque. */
  priority_tier?: 1 | 2 | 3 | 4 | null;
  highlight_until?: string | null;
  /** Snapshot legado de plan — fallback heurístico apenas. */
  plan?: string | null;
  /** Sinais estruturais — fallback heurístico apenas. */
  dealership_id?: string | number | null;
  dealership_name?: string | null;
  dealer_name?: string | null;
  seller_type?: string | null;
  seller_kind?: string | null;
  account_type?: string | null;
  /** Flag canônico (preço abaixo de FIPE, qualquer margem). */
  below_fipe?: boolean | null;
  /** Coluna canônica calculada pelo backend (>= 10% abaixo da FIPE). */
  opportunity?: boolean | null;
  /** Canônico de moderação (anúncio analisado após sinal de price < FIPE). */
  reviewed_after_below_fipe?: boolean | null;
};

function isHighlightActive(highlightUntil: string | null | undefined): boolean {
  if (!highlightUntil) return false;
  const ts = Date.parse(highlightUntil);
  if (!Number.isFinite(ts)) return false;
  return ts > Date.now();
}

const PRO_PLAN_SIGNALS = ["pro", "premium", "complete", "enterprise", "plus", "master"];

function isProPlanLegacy(plan: string | null | undefined): boolean {
  if (typeof plan !== "string") return false;
  const p = plan.toLowerCase();
  return PRO_PLAN_SIGNALS.some((sig) => p.includes(sig));
}

function isDealerLegacy(ad: AdBadgeSignals): boolean {
  if (ad.dealership_id != null && ad.dealership_id !== "") return true;
  if (typeof ad.dealership_name === "string" && ad.dealership_name.trim()) return true;
  if (typeof ad.dealer_name === "string" && ad.dealer_name.trim()) return true;
  const t = String(ad.seller_type || ad.seller_kind || ad.account_type || "")
    .toLowerCase()
    .trim();
  return t === "dealer" || t === "dealership" || t === "store";
}

/**
 * Tier comercial efetivo (1=Grátis ... 4=Destaque ativo).
 *
 *   1. Prefere `priority_tier` canônico quando válido (1..4).
 *   2. Senão, fallback heurístico (highlight_until → plan → dealership).
 *
 * O fallback existe para defesa em profundidade (cache antigo, BFF sem
 * o campo). Quando o backend está enviando `priority_tier`, esse caminho
 * nunca executa.
 */
export function inferAdTier(ad: AdBadgeSignals): 1 | 2 | 3 | 4 {
  if (
    ad.priority_tier === 1 ||
    ad.priority_tier === 2 ||
    ad.priority_tier === 3 ||
    ad.priority_tier === 4
  ) {
    return ad.priority_tier;
  }
  if (isHighlightActive(ad.highlight_until)) return 4;
  if (isProPlanLegacy(ad.plan)) return 3;
  if (isDealerLegacy(ad)) return 2;
  return 1;
}

/**
 * Lista canônica de selos para um anúncio. Caller renderiza in-order.
 *
 * Ordem produzida:
 *   1. Tier comercial (Destaque > Pro > Start) — máximo 1
 *   2. Sinal de preço (Oportunidade OU Abaixo da FIPE) — máximo 1
 *      (Oportunidade implica abaixo da FIPE — não duplicamos)
 *   3. Anúncio analisado — sóbrio, só se backend marcou
 *   4. Particular — apenas para tier 1 (Grátis), evita conflito
 *      visual com Pro/Start/Destaque que já comunicam o canal
 */
export function resolveAdBadges(ad: AdBadgeSignals): AdBadge[] {
  const out: AdBadge[] = [];
  const tier = inferAdTier(ad);

  if (tier === 4) {
    out.push({ id: "destaque", label: "OFERTA DESTAQUE", variant: "warning" });
  } else if (tier === 3) {
    out.push({ id: "pro", label: "LOJISTA PRO", variant: "premium" });
  } else if (tier === 2) {
    out.push({ id: "start", label: "LOJISTA START", variant: "info" });
  }

  if (ad.opportunity === true) {
    out.push({ id: "opportunity", label: "OPORTUNIDADE", variant: "success" });
  } else if (ad.below_fipe === true) {
    out.push({ id: "below_fipe", label: "ABAIXO DA FIPE", variant: "success" });
  }

  if (ad.reviewed_after_below_fipe === true) {
    out.push({ id: "reviewed", label: "ANÚNCIO ANALISADO", variant: "reviewed" });
  }

  if (tier === 1 && resolveSellerKind(ad) === "private") {
    out.push({ id: "particular", label: "PARTICULAR", variant: "info" });
  }

  return out;
}
