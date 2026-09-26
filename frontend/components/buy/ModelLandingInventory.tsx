import { buildInventorySentence, type ModelLandingSummary } from "@/lib/buy/model-landing";
import { formatPricePublic } from "@/lib/public-contracts";

/**
 * Bloco de estoque DEPOIS da listagem — Server Component.
 *
 * É o "conteúdo SEO" da landing, e por isso mesmo não tem nada que o estoque
 * não sustente: título com o modelo e a cidade, uma frase montada dos números
 * reais e os mesmos números em células. Sem parágrafo genérico, sem texto para
 * robô — a descrição da intenção já está no topo, junto do H1.
 *
 * Com anúncios de cidades vizinhas no conjunto, o título diz "e região": o
 * número é do território que o motor montou, não só da cidade.
 */

type ModelLandingInventoryProps = {
  heading: string;
  summary: ModelLandingSummary;
  regional: boolean;
};

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6" fill="currentColor">
      <rect x="4" y="12" width="4" height="8" rx="1" />
      <rect x="10" y="8" width="4" height="12" rx="1" />
      <rect x="16" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export function ModelLandingInventory({ heading, summary, regional }: ModelLandingInventoryProps) {
  const title = regional ? `${heading} e região` : heading;
  const cells: Array<{ value: string; label: string }> = [
    {
      value: new Intl.NumberFormat("pt-BR").format(summary.total),
      label: summary.total === 1 ? "veículo" : "veículos",
    },
  ];
  if (summary.belowFipe) {
    cells.push({
      value: new Intl.NumberFormat("pt-BR").format(summary.belowFipe),
      label: "abaixo da FIPE",
    });
  }
  const lo =
    summary.minPrice !== null ? formatPricePublic(summary.minPrice, { whenAbsent: "null" }) : null;
  const hi =
    summary.maxPrice !== null ? formatPricePublic(summary.maxPrice, { whenAbsent: "null" }) : null;
  if (lo && hi && lo !== hi) {
    cells.push({ value: lo, label: "menor preço" }, { value: hi, label: "maior preço" });
  } else if (lo) {
    cells.push({ value: lo, label: "preço" });
  }

  return (
    <section
      aria-labelledby="model-landing-inventory-title"
      data-testid="model-landing-inventory"
      className="mt-8 rounded-2xl border border-cnc-line bg-cnc-surface p-5 shadow-card sm:p-6 xl:flex xl:items-center xl:gap-8"
    >
      <div className="flex items-start gap-4 xl:min-w-0 xl:flex-1">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
          <ChartIcon />
        </span>
        <div className="min-w-0">
          <h2
            id="model-landing-inventory-title"
            className="text-[17px] font-extrabold leading-snug text-cnc-text-strong sm:text-lg"
          >
            {title}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-cnc-muted">
            {buildInventorySentence(summary)}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:mt-0 xl:shrink-0">
        {cells.map((cell) => (
          // Valor em cima, rótulo embaixo — a ordem do DOM (dt → dd) fica a
          // semântica; a inversão é só visual.
          <div
            key={cell.label}
            className="flex flex-col-reverse rounded-xl bg-cnc-bg px-3 py-2.5 xl:min-w-[112px]"
          >
            <dt className="mt-0.5 text-[12px] font-medium text-cnc-muted">{cell.label}</dt>
            <dd className="text-[15px] font-extrabold tabular-nums text-cnc-text-strong">
              {cell.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
