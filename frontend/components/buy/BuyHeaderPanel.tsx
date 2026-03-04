export default function BuyHeaderPanel() {
  return (
    <section className="border-b border-[#e0e4ee] bg-[#eff1f6]">
      <div className="mx-auto grid w-full max-w-[1240px] gap-5 px-6 py-8 lg:grid-cols-[1fr_1.45fr]">
        <div>
          <h1 className="text-[32px] font-extrabold leading-tight text-[#1d2538] sm:text-[48px]">
            Carros usados e seminovos em Sao Paulo
          </h1>
          <p className="mt-3 text-[18px] text-[#525f7a] sm:text-[28px]">13.928 anuncios encontrados</p>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-[#dde2ed] bg-white px-7 py-6">
          <div className="pr-20">
            <h2 className="text-[32px] font-extrabold leading-tight text-[#21283a] sm:text-[40px]">Venda mais rapido</h2>
            <p className="mt-1 text-[22px] text-[#303a53] sm:text-[30px]">
              com anuncios em <span className="font-bold text-[#0e62d8]">destaque</span>
            </p>
          </div>
          <button
            type="button"
            className="mt-4 inline-flex h-12 items-center rounded-xl bg-[#0e62d8] px-6 text-[16px] font-bold text-white transition hover:bg-[#0c4fb0]"
          >
            Patrocinar anuncio
          </button>
          <div className="absolute -right-10 -top-8 h-36 w-36 rounded-full border-[14px] border-[#0e62d8]/80" />
          <div className="absolute -right-6 top-10 h-24 w-24 rounded-full border-[12px] border-[#12b7ff]/80" />
          <div className="absolute right-6 bottom-0 h-16 w-16 rounded-t-full bg-[#ffca2e]" />
        </div>
      </div>
    </section>
  );
}
