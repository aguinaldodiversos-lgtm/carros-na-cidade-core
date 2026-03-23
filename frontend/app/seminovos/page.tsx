import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Seminovos | Carros na Cidade",
  description: "Encontre os melhores seminovos com até 3 anos de uso, baixa quilometragem e garantia. Veículos revisados e com procedência verificada.",
  keywords: ["seminovos", "carros seminovos", "seminovo usado", "carro com baixa km", "carro recente"],
  alternates: { canonical: "/seminovos" },
};

export const revalidate = 3600;

export default function SeminovosPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      <div className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0e62d8]">Melhor custo-benefício</p>
          <h1 className="mt-3 text-[36px] font-extrabold tracking-tight text-[#1d2538]">
            Seminovos
          </h1>
          <p className="mt-3 mx-auto max-w-2xl text-[16px] leading-7 text-[#5c6881]">
            Veículos com até 3 anos de uso, baixa quilometragem e condições próximas de zero km
            por um preço muito mais acessível.
          </p>
          <Link
            href="/comprar?tipo=seminovo"
            className="mt-7 inline-flex items-center justify-center rounded-xl bg-[#0e62d8] px-7 py-3.5 text-[15px] font-bold text-white transition hover:bg-[#0b54be]"
          >
            Ver seminovos disponíveis
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { title: "Preço menor que o zero km", desc: "Economia real de 20% a 40% em relação ao mesmo modelo 0 km." },
            { title: "Baixa quilometragem", desc: "Geralmente com menos de 30.000 km rodados e em ótimo estado." },
            { title: "Garantia disponível", desc: "Muitos seminovos de lojas incluem garantia de fábrica ou da loja." },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm">
              <h3 className="text-[15px] font-extrabold text-[#1d2538]">{item.title}</h3>
              <p className="mt-1.5 text-[13px] leading-5 text-[#5c6881]">{item.desc}</p>
            </div>
          ))}
        </div>
        <section className="mt-8 rounded-2xl border border-[#dfe4ef] bg-white p-6 shadow-sm">
          <h2 className="text-[20px] font-extrabold text-[#1d2538]">O que verificar em um seminovo</h2>
          <ul className="mt-4 space-y-3 text-[14px] leading-6 text-[#5c6881]">
            <li className="flex items-start gap-3"><span className="text-[#0e62d8]">→</span> Histórico de acidentes e laudo de procedência (DETRAN e Denatran).</li>
            <li className="flex items-start gap-3"><span className="text-[#0e62d8]">→</span> Verificação de revisões e histórico de manutenção no manual.</li>
            <li className="flex items-start gap-3"><span className="text-[#0e62d8]">→</span> Teste drive obrigatório para identificar ruídos ou problemas mecânicos.</li>
            <li className="flex items-start gap-3"><span className="text-[#0e62d8]">→</span> Conferir IPVA quitado, CRLV em dia e ausência de multas pendentes.</li>
            <li className="flex items-start gap-3"><span className="text-[#0e62d8]">→</span> Comparar o preço pedido com a tabela FIPE para garantir negociação justa.</li>
          </ul>
        </section>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/tabela-fipe" className="rounded-xl border border-[#d4daea] bg-white px-5 py-3 text-[14px] font-semibold text-[#333d54] transition hover:border-[#0e62d8]">
            Consultar tabela FIPE
          </Link>
          <Link href="/lojas" className="rounded-xl border border-[#d4daea] bg-white px-5 py-3 text-[14px] font-semibold text-[#333d54] transition hover:border-[#0e62d8]">
            Ver lojas verificadas
          </Link>
          <Link href="/simulador-financiamento" className="rounded-xl border border-[#d4daea] bg-white px-5 py-3 text-[14px] font-semibold text-[#333d54] transition hover:border-[#0e62d8]">
            Simular financiamento
          </Link>
        </div>
      </div>
    </main>
  );
}
