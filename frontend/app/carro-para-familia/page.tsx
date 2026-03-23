import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Carro para família | Carros na Cidade",
  description: "Os melhores carros para família: espaçosos, seguros e confortáveis. Minivans, SUVs e sedãs ideais para quem precisa de espaço e segurança.",
  keywords: ["carro para família", "carro espaçoso", "suv familiar", "minivan", "carro com 7 lugares"],
  alternates: { canonical: "/carro-para-familia" },
};

export const revalidate = 3600;

export default function CarroParaFamiliaPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      <div className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0e62d8]">Guia de compra</p>
          <h1 className="mt-3 text-[36px] font-extrabold tracking-tight text-[#1d2538]">
            Carro para família
          </h1>
          <p className="mt-3 mx-auto max-w-2xl text-[16px] leading-7 text-[#5c6881]">
            Espaçoso, seguro e confortável para toda a família. Encontre SUVs, sedãs e
            veículos de 7 lugares ideais para o dia a dia com crianças.
          </p>
          <Link
            href="/comprar?categoria=familiar"
            className="mt-7 inline-flex items-center justify-center rounded-xl bg-[#0e62d8] px-7 py-3.5 text-[15px] font-bold text-white transition hover:bg-[#0b54be]"
          >
            Ver carros para família
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: "Espaço interno", desc: "Bagageiro amplo, bancos confortáveis e espaço para todos." },
            { title: "Segurança", desc: "Airbags, freios ABS, câmera de ré e assistência de faixa." },
            { title: "7 lugares", desc: "Opções com 3ª fileira de bancos para famílias maiores." },
            { title: "Consumo eficiente", desc: "SUVs flex com boa eficiência para viagens e cidade." },
            { title: "Altura do solo", desc: "Boa altura para estradas e acesso fácil para crianças." },
            { title: "Entretenimento", desc: "Central multimídia com conectividade para toda a família." },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm">
              <h3 className="text-[15px] font-extrabold text-[#1d2538]">{item.title}</h3>
              <p className="mt-1.5 text-[13px] leading-5 text-[#5c6881]">{item.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <h2 className="text-[22px] font-extrabold text-[#1d2538]">Modelos recomendados</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {["Toyota SW4", "Jeep Commander", "Chevrolet S10", "Fiat Freemont", "Hyundai Tucson", "Volkswagen Tiguan"].map((model) => (
              <Link key={model} href={`/comprar?busca=${encodeURIComponent(model)}`}
                className="rounded-full border border-[#d4daea] bg-white px-4 py-2 text-[13px] font-semibold text-[#333d54] transition hover:border-[#0e62d8] hover:text-[#0e62d8]">
                {model}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/simulador-financiamento" className="rounded-xl border border-[#d4daea] bg-white px-5 py-3 text-[14px] font-semibold text-[#333d54] transition hover:border-[#0e62d8]">
            Simular financiamento
          </Link>
          <Link href="/categoria/suv" className="rounded-xl border border-[#d4daea] bg-white px-5 py-3 text-[14px] font-semibold text-[#333d54] transition hover:border-[#0e62d8]">
            Ver todos os SUVs
          </Link>
        </div>
      </div>
    </main>
  );
}
