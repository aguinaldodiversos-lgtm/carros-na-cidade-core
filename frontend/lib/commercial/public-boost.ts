import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";

/**
 * Config pública do produto avulso de destaque (boost-7d), consumida pelo
 * card público de /planos. Mesma fonte lógica do modal de impulsionamento,
 * da página /impulsionar e de createBoostCheckout (platform_settings) — via
 * o endpoint público GET /api/public/commercial/boost.
 */
export type PublicBoost = {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  duration_days: number;
  active: boolean;
};

/**
 * Fonte ÚNICA de fallback do card público. Espelha os DEFAULTS de
 * `commercial-rules.service` (R$ 39,90 / 7 dias). Só é usado se o endpoint
 * público falhar/cair — em operação normal os valores vêm de platform_settings
 * e NUNCA contradizem o admin. Centralizado aqui para não reespalhar hardcode.
 */
export const PUBLIC_BOOST_FALLBACK: PublicBoost = {
  id: "boost-7d",
  name: "Destaque 7 dias",
  description: "Prioridade alta nas buscas e badge de destaque por 7 dias.",
  price_cents: 3990,
  duration_days: 7,
  active: true,
};

function isValidPublicBoost(value: unknown): value is PublicBoost {
  if (!value || typeof value !== "object") return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.id === "string" &&
    typeof b.name === "string" &&
    typeof b.description === "string" &&
    typeof b.price_cents === "number" &&
    Number.isFinite(b.price_cents) &&
    b.price_cents >= 0 &&
    typeof b.duration_days === "number" &&
    Number.isFinite(b.duration_days) &&
    b.duration_days > 0 &&
    typeof b.active === "boolean"
  );
}

/**
 * Busca server-side com ISR (revalidate 900s). Qualquer falha (sem base,
 * !ok, shape inválido, exceção) cai no fallback centralizado — a página
 * pública nunca quebra por causa do boost.
 */
export async function fetchPublicBoost(): Promise<PublicBoost> {
  try {
    const url = resolveInternalBackendApiUrl("/api/public/commercial/boost");
    if (!url) return PUBLIC_BOOST_FALLBACK;

    const res = await fetch(url, {
      next: { revalidate: 900 },
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return PUBLIC_BOOST_FALLBACK;

    const json = (await res.json()) as { boost?: unknown };
    return isValidPublicBoost(json?.boost) ? json.boost : PUBLIC_BOOST_FALLBACK;
  } catch {
    return PUBLIC_BOOST_FALLBACK;
  }
}

/**
 * Formata price_cents em BRL para exibição ("R$ 39,90"). Normaliza o espaço
 * não-quebrável (U+00A0) que o Intl insere entre "R$" e o número para um
 * espaço comum — mantém consistência visual com os demais cards de /planos.
 */
export function formatBoostPriceBRL(priceCents: number): string {
  const formatted = (priceCents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  // Normaliza o espaco nao-quebravel (U+00A0) do Intl para espaco comum,
  // mantendo consistencia visual com os demais cards de /planos.
  return formatted.replace(new RegExp(String.fromCharCode(160), "g"), " ");
}
