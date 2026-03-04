export default function PlanHero() {
  return (
    <section className="overflow-hidden rounded-2xl bg-[linear-gradient(125deg,#0c4fb2_0%,#1390eb_100%)] p-8 text-white shadow-[0_16px_34px_rgba(12,79,178,0.3)]">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/80">Monetizacao e Conversao</p>
      <h1 className="mt-2 text-4xl font-extrabold leading-tight md:text-6xl">Anuncie gratis ou em destaque</h1>
      <p className="mt-3 max-w-3xl text-sm text-white/90 md:text-base">
        Venda mais rapido com planos flexiveis para particulares e lojistas, sem comissao por venda e com controle total no painel.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { title: "Sem mensalidade", desc: "Comece no plano gratis e publique hoje." },
          { title: "Sem comissao", desc: "Negocie direto com comprador sem taxa por venda." },
          { title: "Publicacao rapida", desc: "Ative anuncio em poucos minutos." },
        ].map((highlight) => (
          <article key={highlight.title} className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
            <h2 className="text-base font-extrabold">{highlight.title}</h2>
            <p className="mt-1 text-sm text-white/90">{highlight.desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
