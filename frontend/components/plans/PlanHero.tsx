import Link from "next/link";

export default function PlanHero() {
  return (
    <section className="overflow-hidden rounded-2xl bg-[linear-gradient(125deg,#0c4fb2_0%,#1390eb_100%)] p-8 text-white shadow-[0_16px_34px_rgba(12,79,178,0.3)]">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-white/80">Monetizacao e Conversao</p>
      <h1 className="mt-2 text-4xl font-extrabold leading-tight md:text-6xl">
        Ative seu plano, publique com limite correto e impulsione quando fizer sentido
      </h1>
      <p className="mt-3 max-w-3xl text-sm text-white/90 md:text-base">
        Particular e lojista entram com um fluxo claro: escolher o plano certo, liberar capacidade de publicação, ganhar prioridade
        de exibição e acompanhar tudo no painel.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {[
          { title: "Entrada clara", desc: "Plano gratuito para começar e upgrade quando o volume pedir." },
          { title: "Valor operacional", desc: "Mais limite, destaque e prioridade para acelerar giro de estoque." },
          { title: "Ativação simples", desc: "Escolha o plano, entre no painel e acompanhe publicação e impulso." },
        ].map((highlight) => (
          <article key={highlight.title} className="rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
            <h2 className="text-base font-extrabold">{highlight.title}</h2>
            <p className="mt-1 text-sm text-white/90">{highlight.desc}</p>
          </article>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="inline-flex h-11 items-center rounded-xl bg-white px-5 text-sm font-bold text-[#0e62d8] transition hover:bg-[#edf3ff]"
        >
          Entrar para ativar
        </Link>
        <Link
          href="/anuncios"
          className="inline-flex h-11 items-center rounded-xl border border-white/30 px-5 text-sm font-bold text-white transition hover:bg-white/10"
        >
          Ver vitrine do portal
        </Link>
      </div>
    </section>
  );
}
