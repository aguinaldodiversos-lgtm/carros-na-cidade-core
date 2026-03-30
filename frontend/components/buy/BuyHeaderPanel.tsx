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
    <section className="border-b border-[#e3e8f0] bg-[#f1f2f6]">
      <div className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-6 sm:px-6 sm:py-7 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="py-1">
          <div className="inline-flex items-center rounded-full border border-[#dbe4f0] bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-[#0e62d8]">
            Comprar por cidade
          </div>

          <h1 className="mt-4 max-w-[560px] text-[28px] font-black leading-[1.08] tracking-[-0.03em] text-[#1b2437] sm:text-[34px] lg:text-[41px]">
            {title}
          </h1>

          <p className="mt-3 text-[15px] font-medium text-[#697387] sm:text-[18px] lg:text-[19px]">
            {formatCount(totalResults)}
          </p>

          <p className="mt-4 max-w-[620px] text-[14px] leading-6 text-[#5d677d] sm:text-[15px] sm:leading-7 lg:text-[16px]">
            Explore estoque ativo, oportunidades regionais e filtros preparados para navegacao local
            em <span className="font-semibold text-[#1f2a3f]">{cityLabel}</span>.
          </p>

          {quickLinks.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {quickLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex min-h-10 items-center rounded-full border border-[#d9e1ec] bg-white px-3.5 text-[13px] font-semibold text-[#334155] transition hover:border-[#c3d2ea] hover:text-[#0e62d8] sm:px-4 sm:text-sm"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="relative overflow-hidden rounded-[18px] border border-[#dde4ef] bg-white px-5 py-5 shadow-[0_10px_26px_rgba(15,23,42,0.06)] sm:px-6 sm:py-6">
          <div className="relative z-10 max-w-[270px]">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#0e62d8]">
              Impulsionamento premium
            </p>

            <h2 className="mt-2 text-[24px] font-black leading-tight tracking-[-0.03em] text-[#1e2638] sm:text-[28px] lg:text-[32px]">
              Venda mais rápido
            </h2>

            <p className="mt-1 text-[17px] leading-tight text-[#39445b] sm:text-[21px] lg:text-[25px]">
              com anúncios em <span className="font-black text-[#0e62d8]">destaque</span>
            </p>

            <p className="mt-4 text-[13px] leading-6 text-[#627087] sm:text-sm">
              Ganhe mais visibilidade no inventario local e apareca na frente de quem esta comprando
              em {cityLabel}.
            </p>

            <Link
              href="/planos"
              className="mt-5 inline-flex h-11 items-center rounded-xl bg-[#0e62d8] px-4 text-[14px] font-bold text-white shadow-[0_12px_24px_rgba(14,98,216,0.2)] transition hover:bg-[#0c54bc] sm:h-12 sm:px-5 sm:text-[15px]"
            >
              Patrocinar anúncio
            </Link>
          </div>

          <div className="pointer-events-none absolute -right-10 top-4 h-32 w-32 rounded-full border-[14px] border-[#0e62d8]/80" />
          <div className="pointer-events-none absolute right-3 top-16 h-20 w-20 rounded-full border-[9px] border-[#1fb6ff]/70" />
          <div className="pointer-events-none absolute bottom-0 right-0 h-20 w-20 rounded-tl-[58px] bg-[#ffcb39]" />
        </aside>
      </div>
    </section>
  );
}
