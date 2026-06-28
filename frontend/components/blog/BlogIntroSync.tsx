// frontend/components/blog/BlogIntroSync.tsx
//
// Cabeçalho SÍNCRONO do blog (H1 + frase). Componente server 100% síncrono:
// SEM await, SEM fetch, SEM client component, SEM Suspense. Deve ser
// renderizado pela PAGE síncrona ANTES do <Suspense> do conteúdo assíncrono,
// para que o H1 entre no `<main>` no primeiro flush do HTML — antes do footer.
//
// CRÍTICO: NÃO importar client component aqui, NÃO buscar dados, NÃO tornar
// async. O nome da cidade vem por prop (derivado do slug de forma síncrona).

export function BlogIntroSync({ cityName }: { cityName?: string }) {
  const heading = cityName ? `Blog automotivo em ${cityName}` : "Blog automotivo";
  const phrase = cityName
    ? "Dicas rápidas sobre compra, venda, financiamento e cuidados com veículos na sua região."
    : "Dicas rápidas para comprar, vender, financiar e cuidar melhor do seu veículo.";

  return (
    <section className="border-b border-[#EDF1F8] bg-white">
      <div className="mx-auto w-full max-w-7xl px-4 pb-6 pt-8 sm:px-6 md:pb-10 md:pt-12">
        <div className="max-w-3xl">
          <h1 className="text-[32px] font-extrabold leading-[1.05] tracking-[-0.02em] text-[#1D2440] md:text-[44px]">
            {heading}
          </h1>
          <p className="mt-2 text-[15px] leading-7 text-[#5D667D] md:text-[18px]">{phrase}</p>
        </div>
      </div>
    </section>
  );
}

/** Skeleton do conteúdo pesado do blog (fallback do <Suspense>). */
export function BlogContentSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6" aria-hidden="true">
      <div className="h-9 w-full max-w-md rounded-xl bg-black/5" />
      <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-56 rounded-2xl bg-black/5" />
        ))}
      </div>
    </div>
  );
}

export default BlogIntroSync;
