import Link from "next/link";

export default function PagamentoErroPage() {
  return (
    <main className="mx-auto min-h-[70vh] w-full max-w-3xl px-6 py-20">
      <section className="rounded-2xl border border-[#dfe4ef] bg-white p-8 text-center shadow-[0_2px_18px_rgba(10,20,40,0.06)]">
        <h1 className="text-3xl font-extrabold text-[#1d2538]">Pagamento nao concluido</h1>
        <p className="mt-2 text-sm text-[#53607b]">
          Nao foi possivel confirmar seu pagamento. Tente novamente ou escolha outro plano.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Link
            href="/planos"
            className="inline-flex h-11 items-center rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white"
          >
            Tentar novamente
          </Link>
          <Link
            href="/contato"
            className="inline-flex h-11 items-center rounded-xl border border-[#dfe4ef] px-5 text-sm font-bold text-[#2d3852]"
          >
            Falar com suporte
          </Link>
        </div>
      </section>
    </main>
  );
}
