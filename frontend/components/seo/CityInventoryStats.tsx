import type { LocalSeoLandingModel } from "@/lib/seo/local-seo-data";

/**
 * Bloco de ESTATÍSTICAS LOCAIS renderizado com dados reais do inventário da
 * cidade (Correção 6 / auditoria 2026-07-03). Objetivo: o conteúdo visível do
 * corpo muda por cidade e quando os dados mudam — saindo do "conteúdo em escala
 * sem valor" que o Google pune (update mar/2026).
 *
 * Fonte única: `LocalSeoLandingModel` (mesmos dados que alimentam a meta
 * description). Server component — sem "use client".
 *
 * PROTEÇÃO (Correção 6, item 5): NÃO renderiza nada para cidade sem inventário.
 * `hasCityInventoryData` gateia; cidade com 0 anúncios continua 200 +
 * noindex,follow sem estatística inventada. Nenhum campo mostra placeholder ou
 * "R$ 0": cada linha é omitida quando o dado real não existe.
 */

function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Data por extenso pt-BR ("3 de julho de 2026"). Página é `force-dynamic`,
 *  então reflete o dia da renderização — sinal de frescor honesto. */
function formatToday(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

/** True só quando há inventário REAL na cidade para descrever. */
export function hasCityInventoryData(model: LocalSeoLandingModel): boolean {
  return !model.isEmptyCity && model.totalAds > 0;
}

/**
 * Frase introdutória data-driven (item 2): depende de nº de anúncios, preço
 * médio e marca líder, de modo que NÃO passa no teste find-replace (trocar a
 * cidade muda os números). Varia por variante. Omite partes sem dado.
 */
export function buildLocalIntro(model: LocalSeoLandingModel): string {
  const uf = model.state ? ` - ${model.state}` : "";
  const kind =
    model.variant === "baratos"
      ? "carros abaixo da tabela FIPE"
      : model.variant === "automaticos"
        ? "carros com câmbio automático"
        : "carros à venda";

  let sentence = `Há ${model.totalAds} ${kind} em ${model.cityName}${uf}`;
  if (model.avgPrice !== null && model.avgPrice > 0) {
    sentence += `, com preço médio de ${formatBRL(model.avgPrice)}`;
  }

  const topBrand = model.topBrands[0]?.brand;
  if (topBrand) {
    const tail =
      model.variant === "em"
        ? `${topBrand} é a marca mais anunciada na cidade`
        : model.variant === "baratos"
          ? `${topBrand} lidera as ofertas abaixo da FIPE`
          : `${topBrand} é a marca automática mais frequente`;
    sentence += ` — ${tail}.`;
  } else {
    sentence += ".";
  }
  return sentence;
}

interface StatCell {
  label: string;
  value: string;
}

function buildStatCells(model: LocalSeoLandingModel): StatCell[] {
  const cells: StatCell[] = [
    { label: "Anúncios ativos", value: String(model.totalAds) },
  ];

  if (model.avgPrice !== null && model.avgPrice > 0) {
    cells.push({ label: "Preço médio", value: formatBRL(model.avgPrice) });
  }

  if (model.minPrice !== null && model.maxPrice !== null && model.minPrice > 0) {
    cells.push({
      label: "Faixa de preço",
      value:
        model.minPrice === model.maxPrice
          ? formatBRL(model.minPrice)
          : `${formatBRL(model.minPrice)} a ${formatBRL(model.maxPrice)}`,
    });
  }

  // % abaixo da FIPE só na variante "em" (nas outras o recorte já é abaixo da
  // FIPE ou não se aplica). Omite quando não há oportunidades reais.
  if (model.variant === "em" && model.belowFipeCount > 0 && model.totalAds > 0) {
    const pct = Math.round((model.belowFipeCount / model.totalAds) * 100);
    cells.push({
      label: "Abaixo da FIPE",
      value: `${model.belowFipeCount} (${pct}%)`,
    });
  }

  return cells;
}

export interface CityInventoryStatsProps {
  model: LocalSeoLandingModel;
  /** Renderiza a frase introdutória data-driven acima da tabela. */
  showIntro?: boolean;
  className?: string;
}

export function CityInventoryStats({
  model,
  showIntro = false,
  className,
}: CityInventoryStatsProps) {
  if (!hasCityInventoryData(model)) return null;

  const cells = buildStatCells(model);

  return (
    <div className={className}>
      {showIntro ? (
        <p className="max-w-3xl text-sm leading-relaxed text-cnc-muted sm:text-[15px]">
          {buildLocalIntro(model)}
        </p>
      ) : null}

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="rounded-xl border border-cnc-line bg-cnc-surface px-3 py-2.5"
          >
            <dt className="text-[11px] font-medium uppercase tracking-wide text-cnc-muted">
              {cell.label}
            </dt>
            <dd className="mt-0.5 text-[15px] font-semibold text-cnc-text-strong">{cell.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 text-[12px] text-cnc-muted-soft">Dados atualizados em {formatToday()}.</p>
    </div>
  );
}
