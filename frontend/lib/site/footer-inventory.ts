import "server-only";

import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";

/**
 * Facetas do rodapé, derivadas do inventário ativo.
 *
 * O rodapé era hardcoded e listava 6 cidades com ZERO anúncios + 5 modelos dos
 * quais só um existia. Como é chrome global (toda página do site), isso
 * significava que o site inteiro não tinha um único link interno para a cidade
 * que efetivamente tinha estoque — o Search Console reportava "Nenhuma página
 * de referência detectada" para `/carros-em/atibaia-sp`.
 *
 * Os slugs de cluster (`brandSlug`/`modelSlug`) vêm PRONTOS do backend, gerados
 * pelas mesmas funções que o resolver usa para casar URL com valor real. Não
 * remontar aqui: duplicar a regra reintroduz o risco de link para página com
 * "0 anúncios".
 */

export interface FooterCityFacet {
  slug: string;
  name: string;
  state: string | null;
  total: number;
}

export interface FooterModelFacet {
  brand: string;
  model: string;
  /** Rótulo curto de exibição ("Hyundai HB20 Sense Plus"). */
  label: string;
  brandSlug: string;
  modelSlug: string;
  total: number;
}

export interface FooterInventory {
  cities: FooterCityFacet[];
  models: FooterModelFacet[];
  modelsCity: { slug: string; name: string; state: string | null } | null;
}

export const EMPTY_FOOTER_INVENTORY: FooterInventory = {
  cities: [],
  models: [],
  modelsCity: null,
};

const REVALIDATE_SECONDS = 3600;
const LOG_TAG = "footer-inventory";

/**
 * Falha SEMPRE loga — lição do incidente dos sitemaps (2026-07-27), onde um
 * degrade mudo escondeu uma queda total de frontend→backend por semanas. Aqui
 * o sintoma seria ainda mais discreto: colunas somem e o rodapé continua
 * bonito, sem nenhum sinal de que o link interno mais forte do site sumiu.
 */
function logFailure(reason: string): void {
  if (typeof window !== "undefined") return;
  // eslint-disable-next-line no-console
  console.error(`[${LOG_TAG}] rodapé degradado (colunas de inventário ocultas): ${reason}`);
}

function toCity(raw: unknown): FooterCityFacet | null {
  const c = raw as Partial<FooterCityFacet>;
  if (!c || typeof c.slug !== "string" || !c.slug.trim()) return null;
  if (typeof c.name !== "string" || !c.name.trim()) return null;
  return {
    slug: c.slug.trim(),
    name: c.name.trim(),
    state: typeof c.state === "string" && c.state.trim() ? c.state.trim() : null,
    total: Number(c.total) || 0,
  };
}

function toModel(raw: unknown): FooterModelFacet | null {
  const m = raw as Partial<FooterModelFacet>;
  if (!m || typeof m.brandSlug !== "string" || !m.brandSlug.trim()) return null;
  if (typeof m.modelSlug !== "string" || !m.modelSlug.trim()) return null;
  const label = typeof m.label === "string" && m.label.trim() ? m.label.trim() : "";
  if (!label) return null;
  return {
    brand: String(m.brand ?? "").trim(),
    model: String(m.model ?? "").trim(),
    label,
    brandSlug: m.brandSlug.trim(),
    modelSlug: m.modelSlug.trim(),
    total: Number(m.total) || 0,
  };
}

/**
 * NUNCA lança: em qualquer falha devolve inventário vazio e o rodapé oculta as
 * colunas. Um rodapé é chrome global — não pode derrubar a página.
 */
export async function fetchFooterInventory(): Promise<FooterInventory> {
  const url = resolveInternalBackendApiUrl("/api/public/footer-inventory?cities=6&models=6");
  if (!url) {
    logFailure("URL do backend não resolvida (env BACKEND_API_URL/API_URL ausente?)");
    return EMPTY_FOOTER_INVENTORY;
  }

  try {
    const res = await ssrResilientFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      logTag: LOG_TAG,
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!res.ok) {
      logFailure(`HTTP ${res.status}`);
      return EMPTY_FOOTER_INVENTORY;
    }

    const json = (await res.json()) as { success?: boolean; data?: unknown };
    if (!json?.success || !json.data) {
      logFailure(`payload inválido (success=${json?.success})`);
      return EMPTY_FOOTER_INVENTORY;
    }

    const data = json.data as Partial<FooterInventory>;
    const cities = Array.isArray(data.cities)
      ? data.cities.map(toCity).filter((c): c is FooterCityFacet => c !== null)
      : [];
    const models = Array.isArray(data.models)
      ? data.models.map(toModel).filter((m): m is FooterModelFacet => m !== null)
      : [];

    if (cities.length === 0) {
      // Não é erro de rede: o backend respondeu, mas não há cidade com estoque.
      // Ainda assim é digno de log — significa catálogo vazio no site inteiro.
      logFailure("backend respondeu sem nenhuma cidade com estoque ativo");
    }

    return {
      cities,
      models,
      modelsCity: (data.modelsCity as FooterInventory["modelsCity"]) ?? null,
    };
  } catch (error) {
    logFailure(`exceção: ${error instanceof Error ? error.message : String(error)}`);
    return EMPTY_FOOTER_INVENTORY;
  }
}
