import type {
  TerritorialModelLink,
  TerritorialPagePayload,
} from "@/lib/search/territorial-public";
import { getTerritorialInventoryCount } from "@/lib/search/territorial-navigation";

/**
 * Bloco de ESTATÍSTICAS LOCAIS da página marca+cidade (`/cidade/[slug]/marca/
 * [brand]`), equivalente ao `CityInventoryStats` de `/carros-em` mas filtrado
 * por MARCA (auditoria SEO 2026-07-03). Objetivo: conteúdo único por
 * marca+cidade, que muda com os dados — saindo do texto genérico que rankeava
 * mal (~pos. 25).
 *
 * Fonte: `TerritorialPagePayload` (mesmo payload que já alimenta a página).
 * Renderizado dentro do client component do território, então entra no HTML SSR
 * inicial (canônico) que o Google indexa. Data vem de `data.generatedAt` (prop
 * estável — evita `new Date()` e hydration mismatch).
 *
 * Gate: só renderiza com inventário real da marca (>0). A página inteira já é
 * `noindex,follow` quando a marca tem < 3 anúncios (ver page.tsx), então aqui
 * não há risco de estatística inventada em página que compete na busca.
 */

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatGeneratedAt(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Modelos mais anunciados da marca na cidade (com contagem), do payload. */
function getTopModels(data: TerritorialPagePayload): TerritorialModelLink[] {
  const fromLinks = (data.internalLinks?.models || []).filter((m) => m.model);
  if (fromLinks.length) return fromLinks;
  // Fallback: sections.models / relatedModels (sem path).
  const fromSections = (data.sections?.models || data.sections?.relatedModels || [])
    .filter((m) => m.model)
    .map((m) => ({ model: m.model, total: m.total, path: null, brand: m.brand }));
  return fromSections;
}

interface StatCell {
  label: string;
  value: string;
}

export function BrandCityStats({ data }: { data: TerritorialPagePayload }) {
  const brandName = data.brand?.name?.trim();
  const cityName = data.city?.name?.trim();
  const count = getTerritorialInventoryCount(data);

  // Sem marca/cidade ou sem inventário → nada (página já é noindex nesse caso).
  if (!brandName || !cityName || count <= 0) return null;

  const uf = data.city?.state ? ` - ${data.city.state}` : "";
  const avgPrice =
    typeof data.stats?.avgPrice === "number" && data.stats.avgPrice > 0
      ? data.stats.avgPrice
      : null;
  const minPrice =
    typeof data.stats?.minPrice === "number" && data.stats.minPrice > 0
      ? data.stats.minPrice
      : null;
  const maxPrice =
    typeof data.stats?.maxPrice === "number" && data.stats.maxPrice > 0
      ? data.stats.maxPrice
      : null;
  const belowFipe =
    typeof data.stats?.totalBelowFipeAds === "number" && data.stats.totalBelowFipeAds > 0
      ? data.stats.totalBelowFipeAds
      : 0;

  const topModels = getTopModels(data);
  const generatedAt = formatGeneratedAt(data.generatedAt);

  // ── Intro data-driven (falha no find-replace) ──────────────────────────────
  let intro = `Há ${count} ${brandName} à venda em ${cityName}${uf}`;
  if (avgPrice) intro += `, com preço médio de ${formatBRL(avgPrice)}`;
  intro += ".";
  const introModels = topModels.slice(0, 2).map((m) => m.model);
  if (introModels.length === 2) {
    intro += ` ${introModels[0]} e ${introModels[1]} são os modelos mais anunciados da marca na cidade.`;
  } else if (introModels.length === 1) {
    intro += ` ${introModels[0]} é o modelo mais anunciado da marca na cidade.`;
  }

  // ── Tabela de estatísticas ────────────────────────────────────────────────
  const cells: StatCell[] = [{ label: `Anúncios ${brandName}`, value: String(count) }];
  if (avgPrice) cells.push({ label: "Preço médio", value: formatBRL(avgPrice) });
  if (minPrice && maxPrice) {
    cells.push({
      label: "Faixa de preço",
      value: minPrice === maxPrice ? formatBRL(minPrice) : `${formatBRL(minPrice)} a ${formatBRL(maxPrice)}`,
    });
  }
  if (belowFipe > 0) {
    const pct = Math.round((belowFipe / count) * 100);
    cells.push({ label: "Abaixo da FIPE", value: `${belowFipe} (${pct}%)` });
  }

  const modelChips = topModels.slice(0, 8);

  return (
    <div className="mt-1">
      <p className="max-w-4xl text-sm leading-7 text-[#475569] md:text-[15px]">{intro}</p>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5"
          >
            <dt className="text-[11px] font-medium uppercase tracking-wide text-[#64748b]">
              {cell.label}
            </dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-[#0f172a]">{cell.value}</dd>
          </div>
        ))}
      </dl>

      {modelChips.length > 0 ? (
        <div className="mt-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">
            Modelos de {brandName} mais anunciados em {cityName}
          </h2>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {modelChips.map((m) => {
              const label = (
                <>
                  {m.model}
                  {m.total && m.total > 0 ? (
                    <span className="ml-1.5 text-[#64748b]">({m.total})</span>
                  ) : null}
                </>
              );
              return (
                <li key={m.model}>
                  {m.path ? (
                    <a
                      href={m.path}
                      className="inline-flex items-center rounded-full border border-[#e2e8f0] bg-white px-2.5 py-1 text-[12px] font-medium text-[#334155] transition hover:border-[#1F66E5]/50 hover:text-[#1F66E5]"
                    >
                      {label}
                    </a>
                  ) : (
                    <span className="inline-flex items-center rounded-full border border-[#e2e8f0] bg-white px-2.5 py-1 text-[12px] font-medium text-[#334155]">
                      {label}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {generatedAt ? (
        <p className="mt-2 text-[12px] text-[#94a3b8]">Dados atualizados em {generatedAt}.</p>
      ) : null}
    </div>
  );
}

export default BrandCityStats;
