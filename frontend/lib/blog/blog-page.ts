// frontend/lib/blog/blog-page.ts
export type BlogCategoryId =
  | "compra"
  | "venda"
  | "manutencao"
  | "mercado"
  | "financiamento"
  | "cidades";

export type BlogBannerSlot = {
  enabled?: boolean;
  badge?: string;
  title: string;
  subtitle: string;
  ctaLabel?: string;
  ctaHref?: string;
  image: string;
  readTime?: string;
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  coverImage: string;
  publishedAt: string;
  readTime: string;
  category: string;
  categoryId?: BlogCategoryId;
  cityLabel: string;
  ctaLabel?: string;
};

export type BlogCategory = {
  id: BlogCategoryId;
  label: string;
  href: string;
  description?: string;
};

export type BlogTrendingItem = {
  id: string;
  title: string;
  image: string;
  href: string;
};

export type BlogPageContent = {
  citySlug: string;
  cityName: string;
  cityState: string;
  cityLabel: string;
  heroBanner: BlogBannerSlot;
  bottomBanner: BlogBannerSlot;
  categories: BlogCategory[];
  featuredPosts: BlogPost[];
  trendingPosts: BlogTrendingItem[];
  popularPosts: BlogPost[];
};

function normalizeWord(word: string) {
  const lower = word.toLowerCase();

  const dictionary: Record<string, string> = {
    sao: "São",
    joao: "João",
    jose: "José",
    conceicao: "Conceição",
  };

  if (dictionary[lower]) return dictionary[lower];
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function prettifyCitySlug(slug: string) {
  const parts = slug.split("-").filter(Boolean);
  const ufCandidate = parts.at(-1)?.toUpperCase();
  const hasUf = Boolean(ufCandidate && ufCandidate.length === 2);

  const cityName = parts
    .slice(0, hasUf ? -1 : undefined)
    .map(normalizeWord)
    .join(" ");

  const name = cityName || "São Paulo";
  const state = hasUf ? ufCandidate! : "SP";

  return {
    name,
    state,
    slug,
    label: `${name} - ${state}`,
  };
}

export const BLOG_CATEGORY_DEFINITIONS: Array<{
  id: BlogCategoryId;
  label: string;
  description: string;
}> = [
  {
    id: "compra",
    label: "Compra",
    description: "Guias, comparativos e dicas para escolher o carro certo.",
  },
  {
    id: "venda",
    label: "Venda",
    description: "Como anunciar, precificar e vender com segurança.",
  },
  {
    id: "manutencao",
    label: "Manutenção",
    description: "Cuidados, revisões, peças e economia no dia a dia.",
  },
  {
    id: "mercado",
    label: "Mercado",
    description: "Tendências, lançamentos e movimentações do setor.",
  },
  {
    id: "financiamento",
    label: "Financiamento",
    description: "Crédito, taxas, simulações e estratégias de pagamento.",
  },
  {
    id: "cidades",
    label: "Cidades",
    description: "Conteúdo automotivo regional, hotspots e cultura urbana.",
  },
];

export function findCategoryDefinition(id: string) {
  return BLOG_CATEGORY_DEFINITIONS.find((cat) => cat.id === id) ?? null;
}

function buildFallbackContent(citySlug: string): BlogPageContent {
  const city = prettifyCitySlug(citySlug);
  const cityNameEncoded = encodeURIComponent(citySlug);

  const categories: BlogCategory[] = BLOG_CATEGORY_DEFINITIONS.map((def) => ({
    id: def.id,
    label: def.label,
    href: `/blog/${cityNameEncoded}/categoria/${def.id}`,
    description: def.description,
  }));

  return {
    citySlug,
    cityName: city.name,
    cityState: city.state,
    cityLabel: city.label,
    heroBanner: {
      badge: "DICA",
      title: `Os carros que estão em alta em ${city.name}`,
      subtitle:
        "Confira os modelos mais procurados, as tendências do mercado e dicas para fazer a melhor escolha.",
      image: "/images/imagem_banner_blog.png",
      readTime: "6 min de leitura",
    },
    bottomBanner: {
      title: `Encontre o carro ideal na sua região`,
      subtitle: `Veículos verificados, vendedores confiáveis e as melhores oportunidades em ${city.name} e região.`,
      ctaLabel: `Ver carros em ${city.name}`,
      ctaHref: `/comprar/cidade/${cityNameEncoded}`,
      image: "/images/imagem_banner_blog.png",
    },
    categories,
    featuredPosts: [
      {
        id: "featured-compra",
        slug: `como-comprar-carro-com-seguranca-em-${citySlug}`,
        title: `Como comprar um carro usado com segurança em ${city.name}`,
        excerpt:
          "Checklist completo de inspeção, documentação e negociação para fechar negócio sem dor de cabeça.",
        coverImage: "/images/blog/banner-blog.jpg",
        publishedAt: "2026-04-22",
        readTime: "5 min de leitura",
        category: "Compra",
        categoryId: "compra",
        cityLabel: city.label,
      },
      {
        id: "featured-venda",
        slug: `como-vender-seu-carro-em-${citySlug}-com-seguranca`,
        title: `Como vender seu carro em ${city.name} com segurança`,
        excerpt:
          "Saiba como avaliar, anunciar e fechar a venda do seu veículo evitando golpes e maximizando o valor.",
        coverImage: "/images/blog/venda-handshake.jpg",
        publishedAt: "2026-04-18",
        readTime: "4 min de leitura",
        category: "Venda",
        categoryId: "venda",
        cityLabel: city.label,
      },
      {
        id: "featured-mercado",
        slug: "suvs-mais-buscados-na-regiao",
        title: "SUVs mais buscados na região",
        excerpt:
          "Levantamento dos modelos com maior procura, comparativos de preço e tendência de valorização.",
        coverImage: "/images/blog/mercado-suv.jpg",
        publishedAt: "2026-04-15",
        readTime: "5 min de leitura",
        category: "Mercado",
        categoryId: "mercado",
        cityLabel: city.label,
      },
      {
        id: "featured-manutencao",
        slug: "quando-trocar-os-pneus-do-seu-carro",
        title: "Quando trocar os pneus do seu carro",
        excerpt:
          "Sinais visuais, tempo de uso e padrões de desgaste para programar a troca sem comprometer a segurança.",
        coverImage: "/images/blog/manutencao-pneus.jpg",
        publishedAt: "2026-04-10",
        readTime: "4 min de leitura",
        category: "Manutenção",
        categoryId: "manutencao",
        cityLabel: city.label,
      },
      {
        id: "featured-financiamento",
        slug: "financiamento-de-veiculos-vale-a-pena",
        title: "Financiamento de veículos: vale a pena?",
        excerpt:
          "Compare CET, simule prazos e descubra quando vale financiar e quando faz mais sentido pagar à vista.",
        coverImage: "/images/blog/financiamento-calc.jpg",
        publishedAt: "2026-04-08",
        readTime: "6 min de leitura",
        category: "Financiamento",
        categoryId: "financiamento",
        cityLabel: city.label,
      },
      {
        id: "featured-cidades",
        slug: `melhores-bairros-para-rodar-em-${citySlug}`,
        title: `Melhores bairros para rodar em ${city.name}`,
        excerpt:
          "Roteiros urbanos, hotspots automotivos e dicas de rotas para aproveitar mais o seu carro na cidade.",
        coverImage: "/images/blog/banner-blog.jpg",
        publishedAt: "2026-04-05",
        readTime: "4 min de leitura",
        category: "Cidades",
        categoryId: "cidades",
        cityLabel: city.label,
      },
    ],
    trendingPosts: [
      {
        id: "trend-1",
        title: "Carros econômicos mais buscados",
        image: "/images/blog/banner-blog.jpg",
        href: `/blog/${cityNameEncoded}/categoria/mercado`,
      },
      {
        id: "trend-2",
        title: "IPVA 2026 em São Paulo",
        image: "/images/blog/financiamento-calc.jpg",
        href: `/blog/${cityNameEncoded}/categoria/financiamento`,
      },
      {
        id: "trend-3",
        title: "Tecnologia que valoriza seu carro",
        image: "/images/blog/mercado-suv.jpg",
        href: `/blog/${cityNameEncoded}/categoria/manutencao`,
      },
      {
        id: "trend-4",
        title: "Documentos para vender carro",
        image: "/images/blog/venda-handshake.jpg",
        href: `/blog/${cityNameEncoded}/categoria/venda`,
      },
    ],
    popularPosts: [
      {
        id: "popular-1",
        slug: "diferencas-entre-revisoes-e-manutencoes",
        title: `Diferenças entre revisões e manutenções em ${city.name}`,
        excerpt:
          "Entenda quando fazer revisão preventiva, o que realmente precisa ser trocado e como evitar gastos desnecessários no dia a dia.",
        coverImage: "/images/blog/manutencao-pneus.jpg",
        publishedAt: "2026-04-16",
        readTime: "4 min de leitura",
        category: "Manutenção",
        categoryId: "manutencao",
        cityLabel: city.label,
      },
      {
        id: "popular-2",
        slug: "melhores-roteiros-final-semana",
        title: `10 melhores roteiros de carro saindo de ${city.name}`,
        excerpt:
          "Descubra destinos próximos, ideias de passeio e rotas urbanas para curtir mais o seu carro nos arredores.",
        coverImage: "/images/blog/banner-blog.jpg",
        publishedAt: "2026-04-10",
        readTime: "5 min de leitura",
        category: "Cidades",
        categoryId: "cidades",
        cityLabel: city.label,
      },
      {
        id: "popular-3",
        slug: "como-manter-revisao-em-dia",
        title: "Como manter a revisão em dia sem apertar o orçamento",
        excerpt:
          "Veja como planejar manutenção, separar custos previsíveis e evitar surpresas que derrubam o valor de revenda do veículo.",
        coverImage: "/images/blog/financiamento-calc.jpg",
        publishedAt: "2026-04-04",
        readTime: "4 min de leitura",
        category: "Manutenção",
        categoryId: "manutencao",
        cityLabel: city.label,
      },
    ],
  };
}

async function tryFetchRemoteContent(citySlug: string): Promise<Partial<BlogPageContent> | null> {
  const apiBase = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
  if (!apiBase) return null;

  try {
    const response = await fetch(
      `${apiBase.replace(/\/$/, "")}/content/public/blog-page?city_slug=${encodeURIComponent(citySlug)}`,
      {
        next: { revalidate: 300 },
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) return null;

    const payload = await response.json();
    if (!payload || typeof payload !== "object") return null;

    return payload;
  } catch {
    return null;
  }
}

export async function fetchBlogPageContent(citySlug: string): Promise<BlogPageContent> {
  const fallback = buildFallbackContent(citySlug);
  const remote = await tryFetchRemoteContent(citySlug);

  if (!remote) return fallback;

  return {
    ...fallback,
    ...remote,
    heroBanner: {
      ...fallback.heroBanner,
      ...(remote.heroBanner || {}),
    },
    bottomBanner: {
      ...fallback.bottomBanner,
      ...(remote.bottomBanner || {}),
    },
    categories:
      Array.isArray(remote.categories) && remote.categories.length > 0
        ? (remote.categories as BlogCategory[])
        : fallback.categories,
    featuredPosts:
      Array.isArray(remote.featuredPosts) && remote.featuredPosts.length > 0
        ? (remote.featuredPosts as BlogPost[])
        : fallback.featuredPosts,
    trendingPosts:
      Array.isArray(remote.trendingPosts) && remote.trendingPosts.length > 0
        ? (remote.trendingPosts as BlogTrendingItem[])
        : fallback.trendingPosts,
    popularPosts:
      Array.isArray(remote.popularPosts) && remote.popularPosts.length > 0
        ? (remote.popularPosts as BlogPost[])
        : fallback.popularPosts,
  };
}

export async function fetchBlogCategoryContent(citySlug: string, categoryId: BlogCategoryId) {
  const content = await fetchBlogPageContent(citySlug);
  const allPosts: BlogPost[] = [
    ...(content.featuredPosts || []),
    ...(content.popularPosts || []),
  ];

  const posts = allPosts.filter((post) => post.categoryId === categoryId);
  const definition = findCategoryDefinition(categoryId);

  return {
    ...content,
    categoryId,
    categoryLabel: definition?.label ?? categoryId,
    categoryDescription: definition?.description ?? "",
    categoryPosts: posts,
  };
}
