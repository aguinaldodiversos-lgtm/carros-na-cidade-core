function BenefitIcon({ path }: { path: string }) {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#eaf3ff] text-[#0e62d8]">
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      >
        <path d={path} />
      </svg>
    </div>
  );
}

function BenefitItem({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <article className="flex items-start gap-4">
      <BenefitIcon path={icon} />
      <div>
        <h3 className="text-[23px] font-extrabold leading-tight text-[#1f2637] sm:text-[24px]">
          {title}
        </h3>
        <p className="mt-1 text-[16px] leading-tight text-[#4e5974] sm:text-[17px]">
          {description}
        </p>
      </div>
    </article>
  );
}

export default function BenefitsSection() {
  return (
    <section className="mb-10 mt-8 grid gap-4 lg:grid-cols-2">
      <div className="rounded-2xl border border-[#e0e5f0] bg-white p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <BenefitItem
            icon="M4 12a8 8 0 1 1 16 0v1l-8 7-8-7v-1Zm4.5 0h7"
            title="Compra segura"
            description="Negocie direto com vendedores verificados"
          />
          <BenefitItem
            icon="M12 3a7 7 0 0 1 7 7c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 7-7Zm0 5a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"
            title="Foco na sua cidade"
            description="Ofertas locais, praticadas"
          />
        </div>
      </div>

      <div className="rounded-2xl border border-[#e0e5f0] bg-white p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <BenefitItem
            icon="M4 20h16M6 16l3-3 2 2 4-4 3 3M6 7h12"
            title="Transparencia de preco"
            description="Planos em tabela FIPE"
          />
          <div>
            <BenefitItem
              icon="m4 12 6-6v4h8a2 2 0 0 1 2 2v1M20 12l-6 6v-4H6a2 2 0 0 1-2-2v-1"
              title="Venda rapida"
              description="Anuncio em menos de 1 minuto"
            />
            <button
              type="button"
              className="mt-4 inline-flex h-12 items-center rounded-xl bg-[#0e62d8] px-6 text-[17px] font-bold text-white transition hover:bg-[#0c4fb0]"
            >
              Criar anuncio
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
