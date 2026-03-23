import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Carro para aplicativo | Carros na Cidade",
  description: "Encontre o melhor carro para Uber, 99, inDrive e outros aplicativos. Veículos econômicos, com bom conforto e custo de manutenção reduzido.",
  keywords: ["carro para aplicativo", "carro para uber", "carro para 99", "carro uber seminovo"],
  alternates: { canonical: "/carro-para-aplicativo" },
};

export const revalidate = 3600;

export default function CarroParaAplicativoPage() {
  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      <div className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 text-center">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0e62d8]">Landing page</p>
          <h1 className="mt-3 text-[36px] font-extrabold tracking-tight text-[#1d2538]">
            Carro para aplicativo
          </h1>
          <p className="mt-3 mx-auto max-w-2xl text-[16px] leading-7 text-[#5c6881]">
            Os melhores carros para trabalhar com Uber, 99, inDrive e outros aplicativos de transporte. 
            Econômicos, confortáveis e com baixo custo de manutenção.
          </p>
          <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/comprar?finalidade=aplicativo" className="rounded-xl bg-[#0e62d8] px-7 py-3.5 text-[15px] font-bold text-white transition hover:bg-[#0b54be]">
              Ver veículos disponíveis
            </Link>
            <Link href="/planos" className="rounded-xl border border-[#d4daea] bg-white px-7 py-3.5 text-[15px] font-semibold text-[#333d54] transition hover:border-[#0e62d8]">
              Anunciar meu carro
            </Link>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { title: "Economia de combustível", desc: "Prefira veículos flex com baixo consumo médio por km rodado." },
            { title: "Custo de manutenção", desc: "Carros populares com peças fáceis e revisões acessíveis." },
            { title: "Conforto dos passageiros", desc: "Ar-condicionado, bancos em bom estado e espaço interno." },
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
            {["Honda City", "Toyota Yaris", "Hyundai HB20", "Volkswagen Polo", "Chevrolet Onix", "Fiat Cronos"].map((model) => (
              <Link key={model} href={`/comprar?busca=${encodeURIComponent(model)}`}
                className="rounded-full border border-[#d4daea] bg-white px-4 py-2 text-[13px] font-semibold text-[#333d54] transition hover:border-[#0e62d8] hover:text-[#0e62d8]">
                {model}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
