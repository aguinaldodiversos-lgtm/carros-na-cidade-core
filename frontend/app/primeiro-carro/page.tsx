import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Primeiro carro | Carros na Cidade",
  description: "Dicas e opções para quem vai comprar o primeiro carro. Veículos econômicos, seguros e com baixo custo de manutenção para estreantes.",
  keywords: ["primeiro carro", "carro para iniciante", "carro barato e econômico", "carro para habilitado"],
  alternates: { canonical: "/primeiro-carro" },
};

export const revalidate = 3600;

export default function PrimeiroCarroPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      <div className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0e62d8]">Guia de compra</p>
          <h1 className="mt-3 text-[36px] font-extrabold tracking-tight text-[#1d2538]">
            Primeiro carro
          </h1>
          <p className="mt-3 mx-auto max-w-2xl text-[16px] leading-7 text-[#5c6881]">
            Tudo que você precisa saber para comprar seu primeiro carro com segurança,
            economia e tranquilidade.
          </p>
          <Link
            href="/comprar?prioridade=economico"
            className="mt-7 inline-flex items-center justify-center rounded-xl bg-[#0e62d8] px-7 py-3.5 text-[15px] font-bold text-white transition hover:bg-[#0b54be]"
          >
            Ver carros ideais para iniciantes
          </Link>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { title: "Baixo consumo", desc: "Escolha veículos flex com boa eficiência para economizar no dia a dia." },
            { title: "Manutenção acessível", desc: "Prefira marcas populares com ampla rede de assistência técnica." },
            { title: "IPVA e seguro", desc: "Veículos mais baratos têm IPVA menor e seguros mais em conta." },
            { title: "Facilidade de dirigir", desc: "Hatches compactos são mais fáceis para estacionar e manobrar." },
            { title: "Peças disponíveis", desc: "Modelos populares têm reposição fácil e preços mais baixos." },
            { title: "Valor de revenda", desc: "Alguns modelos mantêm melhor valor ao revender após 2-3 anos." },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-[#dfe4ef] bg-white p-5 shadow-sm">
              <h3 className="text-[15px] font-extrabold text-[#1d2538]">{item.title}</h3>
              <p className="mt-1.5 text-[13px] leading-5 text-[#5c6881]">{item.desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-8">
          <h2 className="text-[22px] font-extrabold text-[#1d2538]">Modelos populares para estreantes</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {["Hyundai HB20", "Fiat Mobi", "Volkswagen Gol", "Chevrolet Onix", "Fiat Argo", "Renault Kwid"].map((model) => (
              <Link key={model} href={`/comprar?busca=${encodeURIComponent(model)}`}
                className="rounded-full border border-[#d4daea] bg-white px-4 py-2 text-[13px] font-semibold text-[#333d54] transition hover:border-[#0e62d8] hover:text-[#0e62d8]">
                {model}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-8 rounded-2xl bg-[#0e62d8] p-6 text-center text-white">
          <p className="text-[18px] font-extrabold">Use nosso simulador para calcular as parcelas</p>
          <Link href="/simulador-financiamento" className="mt-4 inline-flex items-center justify-center rounded-xl bg-white px-6 py-3 text-[14px] font-bold text-[#0e62d8] transition hover:bg-[#edf4ff]">
            Simular financiamento
          </Link>
        </div>
      </div>
    </main>
  );
}
