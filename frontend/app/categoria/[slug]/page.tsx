import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = {
  params: { slug: string };
};

const CATEGORIES: Record<
  string,
  {
    slug: string;
    title: string;
    description: string;
    searchQuery: string;
    eyebrow: string;
    benefits: string[];
  }
> = {
  suv: {
    slug: "suv",
    title: "SUVs usados e seminovos",
    description: "Encontre SUVs com espaço, conforto e tração ideal para cidade e estrada. Compare preços, veja opções por cidade e consulte a tabela FIPE.",
    searchQuery: "categoria=suv",
    eyebrow: "Categoria",
    benefits: ["Alto espaço interno", "Versões com tração 4x4", "Ideal para família", "Bom custo de revenda"],
  },
  sedas: {
    slug: "sedas",
    title: "Sedãs usados e seminovos",
    description: "Sedãs são sinônimo de conforto, economia e praticidade urbana. Ótima opção para quem busca elegância e custo-benefício.",
    searchQuery: "categoria=seda",
    eyebrow: "Categoria",
    benefits: ["Baixo consumo", "Conforto para passageiros", "Ideal para viagens", "Grande porta-malas"],
  },
  hatch: {
    slug: "hatch",
    title: "Hatches usados e seminovos",
    description: "Compactos, econômicos e ágeis na cidade. Hatches são a escolha certa para mobilidade urbana com facilidade de estacionamento.",
    searchQuery: "categoria=hatch",
    eyebrow: "Categoria",
    benefits: ["Fácil estacionamento", "Baixo consumo", "Manutenção acessível", "Ideal para a cidade"],
  },
  pickups: {
    slug: "pickups",
    title: "Pickups usadas e seminovos",
    description: "Pickups robustas para trabalho e aventura. Capacidade de carga, tração e conforto em um só veículo.",
    searchQuery: "categoria=pickup",
    eyebrow: "Categoria",
    benefits: ["Capacidade de carga", "Tração 4x4 opcional", "Ideal para campo e obra", "Alto valor de revenda"],
  },
  "carros-de-luxo": {
    slug: "carros-de-luxo",
    title: "Carros de luxo usados",
    description: "Encontre veículos de alto padrão com equipamentos premium, tecnologia avançada e acabamento superior.",
    searchQuery: "categoria=luxo",
    eyebrow: "Categoria premium",
    benefits: ["Acabamento premium", "Tecnologia embarcada", "Motor de alto desempenho", "Status e conforto"],
  },
  eletricos: {
    slug: "eletricos",
    title: "Carros elétricos e híbridos",
    description: "O futuro da mobilidade. Veículos elétricos e híbridos com baixo custo operacional e zero emissão.",
    searchQuery: "categoria=eletrico",
    eyebrow: "Sustentabilidade",
    benefits: ["Zero emissão (100% elétrico)", "Custo de energia baixíssimo", "Manutenção reduzida", "Incentivos fiscais"],
  },
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cat = CATEGORIES[params.slug];
  if (!cat) return { title: "Categoria não encontrada" };

  return {
    title: `${cat.title} | Carros na Cidade`,
    description: cat.description.slice(0, 160),
    alternates: { canonical: `/categoria/${cat.slug}` },
    openGraph: {
      title: `${cat.title} | Carros na Cidade`,
      description: cat.description.slice(0, 160),
      url: `/categoria/${cat.slug}`,
      type: "website",
      locale: "pt_BR",
    },
  };
}

export default function CategoriaSlugPage({ params }: Props) {
  const cat = CATEGORIES[params.slug];

  if (!cat) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#f4f6fa]">
      <div className="bg-white border-b border-[#e4e8f2]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <nav className="mb-4 text-[13px] text-[#6b7488]">
            <Link href="/" className="font-semibold text-[#0e62d8] hover:text-[#0b54be]">Home</Link>
            <span className="mx-2">/</span>
            <Link href="/comprar" className="font-semibold text-[#0e62d8] hover:text-[#0b54be]">Comprar</Link>
            <span className="mx-2">/</span>
            <span>{cat.title}</span>
          </nav>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#0e62d8]">{cat.eyebrow}</p>
          <h1 className="mt-2 text-[32px] font-extrabold tracking-tight text-[#1d2538]">{cat.title}</h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#5c6881]">{cat.description}</p>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {/* Benefits */}
        <div className="mb-6 flex flex-wrap gap-2">
          {cat.benefits.map((b) => (
            <span key={b} className="rounded-full bg-[#edf4ff] px-3 py-1 text-[12px] font-semibold text-[#0e62d8]">
              {b}
            </span>
          ))}
        </div>

        {/* CTA to search */}
        <div className="rounded-2xl border border-[#dfe4ef] bg-white p-6 text-center shadow-sm">
          <p className="text-[16px] font-extrabold text-[#1d2538]">Pronto para encontrar seu veículo?</p>
          <p className="mt-1.5 text-[14px] text-[#6b7488]">Veja todos os anúncios desta categoria disponíveis na sua região.</p>
          <Link
            href={`/comprar?${cat.searchQuery}`}
            className="mt-5 inline-flex items-center justify-center rounded-xl bg-[#0e62d8] px-7 py-3 text-[15px] font-bold text-white transition hover:bg-[#0b54be]"
          >
            Ver anúncios desta categoria
          </Link>
        </div>

        {/* Related categories */}
        <section className="mt-8">
          <h2 className="text-[20px] font-extrabold text-[#1d2538]">Outras categorias</h2>
          <div className="mt-4 flex flex-wrap gap-3">
            {Object.values(CATEGORIES)
              .filter((c) => c.slug !== cat.slug)
              .slice(0, 5)
              .map((c) => (
                <Link
                  key={c.slug}
                  href={`/categoria/${c.slug}`}
                  className="rounded-xl border border-[#d4daea] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#333d54] transition hover:border-[#0e62d8] hover:text-[#0e62d8]"
                >
                  {c.title}
                </Link>
              ))}
          </div>
        </section>
      </div>
    </main>
  );
}
