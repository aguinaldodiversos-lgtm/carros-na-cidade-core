import Link from "next/link";

type BuyHeaderPanelProps = {
  title: string;
  totalResults: number;
  cityLabel: string;
  quickLinks?: Array<{ label: string; href: string }>;
};

function formatCount(totalResults: number) {
  return `${totalResults.toLocaleString("pt-BR")} anúncios encontrados`;
}

export default function BuyHeaderPanel({
  title,
  totalResults,
  cityLabel,
  quickLinks = [],
}: BuyHeaderPanelProps) {
  return (
    <section className="border-b border-[#e3e8f0] bg-[#f3f4f7]">
      <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_430px] lg:items-center">
        <div className="py-1">
          <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#0e62d8]">
            Comprar por cidade
          </p>

          <h1 className="mt-2 max-w-[560px] text-[31px] font-black leading-[1.08] tracking-[-0.03em] text-[#1b2437] sm:text-[42px]">
            {title}
          </h1>

          <p className="mt-3 text-[17px] font-medium text-[#697387] sm:text-[20px]">
            {formatCount(totalResults)}
          </p>

          <p className="mt-4 max-w-[620px] text-[15px] leading-7 text-[#5d677d] sm:text-[16px]">
            Explore estoque ativo, oportunidades regionais e filtros preparados para
            navegacao local em{" "}
            <span className="font-semibold text-[#1f2a3f]">{cityLabel}</span>.
          </p>

          {quickLinks.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2.5">
              {quickLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex h-10 items-center rounded-full border border-[#d9e1ec] bg-white px-4 text-sm font-semibold text-[#334155] transition hover:border-[#c3d2ea] hover:text-[#0e62d8]"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="relative overflow-hidden rounded-[24px] border border-[#dde4ef] bg-white px-6 py-6 shadow-[0_10px_26px_rgba(15,23,42,0.06)] sm:px-7">
          <div className="relative z-10 max-w-[280px]">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#0e62d8]">
              Impulsionamento premium
            </p>

            <h2 className="mt-2 text-[28px] font-black leading-tight tracking-[-0.03em] text-[#1e2638] sm:text-[34px]">
              Venda mais rápido
            </h2>

            <p className="mt-1 text-[20px] leading-tight text-[#39445b] sm:text-[27px]">
              com anúncios em{" "}
              <span className="font-black text-[#0e62d8]">destaque</span>
            </p>

            <p className="mt-4 text-sm leading-6 text-[#627087]">
              Ganhe mais visibilidade no inventario local e apareca na frente de quem
              esta comprando em {cityLabel}.
            </p>

            <Link
              href="/planos"
              className="mt-5 inline-flex h-12 items-center rounded-xl bg-[#0e62d8] px-5 text-[15px] font-bold text-white shadow-[0_12px_24px_rgba(14,98,216,0.2)] transition hover:bg-[#0c54bc]"
            >
              Patrocinar anúncio
            </Link>
          </div>

          <div className="pointer-events-none absolute -right-12 -top-8 h-36 w-36 rounded-full border-[14px] border-[#0e62d8]/85" />
          <div className="pointer-events-none absolute right-2 top-12 h-24 w-24 rounded-full border-[10px] border-[#16b4ff]/80" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-20 w-20 rounded-tl-[60px] bg-[#ffcd3c]" />
        </aside>
      </div>
    </section>
  );
}
