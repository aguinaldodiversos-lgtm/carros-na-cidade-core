import Link from "next/link";

export default function PlanCTA() {
  return (
    <section className="mt-8 rounded-2xl bg-[linear-gradient(120deg,#0f4db6_0%,#1381e3_100%)] p-6 text-white shadow-[0_14px_30px_rgba(14,98,216,0.3)]">
      <h2 className="text-2xl font-extrabold">Pronto para vender mais no Carros na Cidade?</h2>
      <p className="mt-2 max-w-3xl text-sm text-white/90">
        Ative seu plano com cobranca via Mercado Pago (pagamento unico ou recorrente) e ganhe prioridade de exibicao.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/anunciar"
          className="inline-flex h-11 items-center rounded-xl bg-white px-5 text-sm font-bold text-[#0e62d8] transition hover:bg-[#edf3ff]"
        >
          Comecar a anunciar
        </Link>
        <Link
          href="/contato"
          className="inline-flex h-11 items-center rounded-xl border border-white/35 px-5 text-sm font-bold text-white transition hover:bg-white/15"
        >
          Falar com comercial
        </Link>
      </div>
    </section>
  );
}
