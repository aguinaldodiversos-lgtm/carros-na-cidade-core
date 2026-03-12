import Link from "next/link";

export default function PlanCTA() {
  return (
    <section className="mt-8 rounded-2xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] p-6 text-white shadow-[0_14px_30px_rgba(14,98,216,0.3)]">
      <h2 className="text-2xl font-extrabold">Pronto para vender mais no Carros na Cidade?</h2>
      <p className="mt-2 max-w-3xl text-sm text-white/90">
        Entre no painel, escolha o plano ideal para seu momento e use impulsionamento quando quiser acelerar visibilidade.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {[
          "1. Escolha o plano de acordo com seu volume e perfil.",
          "2. Ative a conta e publique com limite claro no dashboard.",
          "3. Impulsione anúncios prioritários nos momentos de maior intenção.",
        ].map((item) => (
          <div key={item} className="rounded-xl border border-white/20 bg-white/10 p-4 text-sm font-semibold text-white/95">
            {item}
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/login"
          className="inline-flex h-11 items-center rounded-xl bg-white px-5 text-sm font-bold text-[#0e62d8] transition hover:bg-[#edf3ff]"
        >
          Entrar para ativar
        </Link>
        <Link
          href="/anuncios"
          className="inline-flex h-11 items-center rounded-xl border border-white/35 px-5 text-sm font-bold text-white transition hover:bg-white/15"
        >
          Ver vitrine premium
        </Link>
      </div>
    </section>
  );
}
