/**
 * Mapper canônico de selos do card de anúncio.
 *
 * Fonte ÚNICA dos selos visuais. AdCard (e qualquer card adapter) consome
 * `resolvePublicAdBadges` em vez de re-implementar a lógica. Isso evita
 * que a heurística textual baseada em `ads.plan` (snapshot legado) se
 * espalhe por múltiplos componentes — divergindo do ranking SQL.
 *
 * Duas faces:
 *   - `resolvePublicAdBadges`  → vitrine pública. Nunca expõe nomes de
 *     plano comercial (Pro/Start/Grátis). Apenas:
 *         Destaque, Oportunidade, Abaixo da FIPE, Loja, Particular,
 *         Anúncio Analisado.
 *   - `resolveAdminAdBadges`   → painel admin/diagnóstico. Expõe Pro/Start
 *     como rótulos de plano para uso INTERNO de moderação.
 *
 * Decisão de produto (correção da Fase 2):
 *   priority_tier=3/2 NÃO viram badge público com nome de plano
 *   ("Lojista Pro"/"Lojista Start") porque revelam bastidor comercial
 *   e poluem a interface de decisão de compra. O tier comercial continua
 *   sendo a chave primária do ranking SQL — bastidor comercial fica
 *   apenas no ranking, não na vitrine.
 *
 * Sinais canônicos preferidos:
 *   - priority_tier            (commercialLayerExpr — só decide "Destaque" público)
 *   - highlight_until          (canônico timestamp)
 *   - below_fipe               (flag de risk)
 *   - opportunity              (opportunityExpr — >= 10% abaixo da FIPE)
 *   - seller_kind              (trust pass: 'dealer' | 'private')
 *   - reviewed_after_below_fipe (canônico de moderação)
 *
 * Heurísticas (fallback APENAS quando o canônico não veio do backend):
 *   - plan contém "pro/premium/master/etc."  → tier 3
 *   - dealership_id/seller_type === "dealer" → tier 2
 *
 * Selos NÃO emitidos publicamente:
 *   - "Loja verificada": auditoria 2026-05-19 mostrou que
 *     `users.document_verified` é checksum self-service (sem KYC externo)
 *     e `advertisers.verified` é coluna morta. Sem sinal canônico
 *     confiável, este selo fica adiado até integração com Receita/Junta.
 *   - "Lojista Pro"/"Lojista Start"/"Grátis": ver decisão de produto acima.
 */

import { resolveSellerKind } from "@/lib/vehicle/seller-kind";

export type AdBadgeId =
  | "destaque"
  | "opportunity"
  | "below_fipe"
  | "loja"
  | "particular"
  | "reviewed"
  // ADMIN-ONLY — nunca exibidos em UI pública.
  | "pro"
  | "start";

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
 *
 * O tier serve PRIMARIAMENTE ao ranking SQL. No card público, só o
 * tier=4 (Destaque) vira badge visível — Pro/Start são bastidor comercial.
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
 * Selos para a VITRINE PÚBLICA. Caller renderiza in-order.
 *
 * Ordem produzida:
 *   1. Destaque        — só se tier=4 (oferta destacada paga)
 *   2. Oportunidade    — opportunity=true (>= 10% abaixo da FIPE)
 *   3. Abaixo da FIPE  — below_fipe=true e !opportunity (não duplica)
 *   4. Anúncio Analisado — selo sóbrio de moderação
 *   5. Loja OU Particular — sempre um dos dois (tipo de vendedor)
 *
 * NÃO emite:
 *   - "Lojista Pro" / "Lojista Start" — bastidor comercial, fora da vitrine.
 *   - "Grátis" — bastidor comercial, fora da vitrine.
 *   - "Loja verificada" — sem sinal canônico confiável (adiado).
 *
 * Tier 2/3 (Pro/Start) caem sob o selo genérico "Loja" via seller_kind,
 * preservando informação útil ao comprador (loja vs. particular) sem
 * vazar o plano contratado.
 */
export function resolvePublicAdBadges(ad: AdBadgeSignals): AdBadge[] {
  const out: AdBadge[] = [];
  const tier = inferAdTier(ad);

  if (tier === 4) {
    out.push({ id: "destaque", label: "DESTAQUE", variant: "warning" });
  }

  if (ad.opportunity === true) {
    out.push({ id: "opportunity", label: "OPORTUNIDADE", variant: "success" });
  } else if (ad.below_fipe === true) {
    out.push({ id: "below_fipe", label: "ABAIXO DA FIPE", variant: "success" });
  }

  if (ad.reviewed_after_below_fipe === true) {
    out.push({ id: "reviewed", label: "ANÚNCIO ANALISADO", variant: "reviewed" });
  }

  // Tipo de vendedor — SEMPRE exibido (dealer OU private). Comprador
  // precisa saber se está falando com loja ou particular, independente
  // do plano comercial contratado.
  const sellerKind = resolveSellerKind(ad);
  if (sellerKind === "dealer") {
    out.push({ id: "loja", label: "LOJA", variant: "info" });
  } else {
    out.push({ id: "particular", label: "PARTICULAR", variant: "info" });
  }

  return out;
}

/**
 * Selos para o painel ADMIN/MODERAÇÃO. Inclui rótulos de plano
 * (Pro/Start) para diagnóstico interno. Nunca usar em UI pública.
 *
 * Ordem produzida:
 *   1. Destaque  (tier=4)
 *   2. Pro       (tier=3)
 *   3. Start     (tier=2)
 *   4. Oportunidade
 *   5. Abaixo da FIPE
 *   6. Anúncio Analisado
 *   7. Loja / Particular
 *
 * Não emite "Grátis" — ausência de selo de plano já comunica isso.
 */
export function resolveAdminAdBadges(ad: AdBadgeSignals): AdBadge[] {
  const out: AdBadge[] = [];
  const tier = inferAdTier(ad);

  if (tier === 4) {
    out.push({ id: "destaque", label: "DESTAQUE", variant: "warning" });
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

  const sellerKind = resolveSellerKind(ad);
  if (sellerKind === "dealer") {
    out.push({ id: "loja", label: "LOJA", variant: "info" });
  } else {
    out.push({ id: "particular", label: "PARTICULAR", variant: "info" });
  }

  return out;
}
