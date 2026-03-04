import Link from "next/link";

export default function PagamentoSucessoPage() {
  return (
    <main className="mx-auto min-h-[70vh] w-full max-w-3xl px-6 py-20">
      <section className="rounded-2xl border border-[#dfe4ef] bg-white p-8 text-center shadow-[0_2px_18px_rgba(10,20,40,0.06)]">
        <h1 className="text-3xl font-extrabold text-[#1d2538]">Pagamento aprovado</h1>
        <p className="mt-2 text-sm text-[#53607b]">
          Recebemos sua confirmacao. Seu plano sera ativado automaticamente apos validacao do webhook.
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Link href="/planos" className="inline-flex h-11 items-center rounded-xl bg-[#0e62d8] px-5 text-sm font-bold text-white">
            Voltar para planos
          </Link>
          <Link href="/comprar" className="inline-flex h-11 items-center rounded-xl border border-[#dfe4ef] px-5 text-sm font-bold text-[#2d3852]">
            Ir para anuncios
          </Link>
        </div>
      </section>
    </main>
  );
}
