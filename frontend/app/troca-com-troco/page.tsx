import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Troca com troco | Carros na Cidade",
  description: "Troque seu carro usado por um novo ou seminovo e receba o troco em dinheiro. Veja como funciona a modalidade de troca com troco.",
  keywords: ["troca com troco", "trocar carro", "aceita carro na troca", "troca de veículo"],
  alternates: { canonical: "/troca-com-troco" },
};

export const revalidate = 3600;

export default function TrocaComTrocoPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      <div className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0e62d8]">Troca facilitada</p>
          <h1 className="mt-3 text-[36px] font-extrabold tracking-tight text-[#1d2538]">
            Troca com troco
          </h1>
          <p className="mt-3 mx-auto max-w-2xl text-[16px] leading-7 text-[#5c6881]">
            Entregue seu carro como parte do pagamento e receba a diferença em dinheiro.
            Prático, seguro e sem burocracia.
          </p>
          <Link
            href="/comprar?aceita_troca=true"
            className="mt-7 inline-flex items-center justify-center rounded-xl bg-[#0e62d8] px-7 py-3.5 text-[15px] font-bold text-white transition hover:bg-[#0b54be]"
          >
            Ver veículos que aceitam troca
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <section>
          <h2 className="text-[22px] font-extrabold text-[#1d2538]">Como funciona?</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: "01", title: "Avalie seu carro", desc: "Consulte a tabela FIPE para saber o valor de referência do seu veículo." },
              { step: "02", title: "Encontre o veículo", desc: "Filtre anúncios que aceitam troca como parte do pagamento." },
              { step: "03", title: "Negocie a diferença", desc: "Acorde com o vendedor o valor da troca e o troco a receber ou pagar." },
              { step: "04", title: "Finalize a negociação", desc: "Formalize a troca, transfira os documentos e receba o troco combinado." },
            ].map((item) => (
              <div key={item.step} className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm">
                <span className="inline-block rounded-full bg-[#edf4ff] px-2.5 py-0.5 text-xs font-black text-[#0e62d8]">{item.step}</span>
                <h3 className="mt-3 text-[14px] font-extrabold text-[#1d2538]">{item.title}</h3>
                <p className="mt-1.5 text-[13px] leading-5 text-[#5c6881]">{item.desc}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="mt-8 rounded-2xl border border-[#dfe4ef] bg-white p-6 shadow-sm">
          <h2 className="text-[20px] font-extrabold text-[#1d2538]">Dicas para uma boa troca</h2>
          <ul className="mt-4 space-y-3 text-[14px] leading-6 text-[#5c6881]">
            <li className="flex items-start gap-3"><span className="text-[#0e62d8]">→</span> Consulte a tabela FIPE antes de negociar para saber o valor real do seu veículo.</li>
            <li className="flex items-start gap-3"><span className="text-[#0e62d8]">→</span> Verifique as pendências do veículo que você vai receber (IPVA, multas, financiamento).</li>
            <li className="flex items-start gap-3"><span className="text-[#0e62d8]">→</span> Exija laudo de procedência e histórico de acidentes.</li>
            <li className="flex items-start gap-3"><span className="text-[#0e62d8]">→</span> Fique atento ao custo de transferência de ambos os veículos.</li>
          </ul>
        </section>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/tabela-fipe" className="rounded-xl border border-[#d4daea] bg-white px-5 py-3 text-[14px] font-semibold text-[#333d54] transition hover:border-[#0e62d8]">
            Consultar tabela FIPE
          </Link>
          <Link href="/comprar" className="rounded-xl border border-[#d4daea] bg-white px-5 py-3 text-[14px] font-semibold text-[#333d54] transition hover:border-[#0e62d8]">
            Buscar veículos
          </Link>
        </div>
      </div>
    </main>
  );
}
