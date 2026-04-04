// frontend/lib/blog/blog-page.ts
export type BlogBannerSlot = {
  enabled?: boolean;
  title: string;
  subtitle: string;
  ctaLabel?: string;
  ctaHref?: string;
  image: string;
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
  cityLabel: string;
  ctaLabel?: string;
};

export type BlogCategory = {
  id: string;
  label: string;
  href: string;
  icon?: "buy" | "maintenance" | "news";
};

export type BlogPageContent = {
  citySlug: string;
  cityName: string;
  cityState: string;
  cityLabel: string;
  heroBanner: BlogBannerSlot;
  bottomBanner: BlogBannerSlot;
  sidebarSaleCta: {
    title: string;
    subtitle: string;
    ctaLabel: string;
    ctaHref: string;
  };
  newsletter: {
    title: string;
    subtitle: string;
    placeholder: string;
    ctaLabel: string;
  };
  categories: BlogCategory[];
  featuredPosts: BlogPost[];
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

function buildFallbackContent(citySlug: string): BlogPageContent {
  const city = prettifyCitySlug(citySlug);

  const categories: BlogCategory[] = [
    {
      id: "comprando-carros",
      label: "Comprando Carros",
      href: `/blog/${citySlug}?categoria=comprando-carros`,
      icon: "buy",
    },
    {
      id: "manutencao-economia",
      label: "Manutenção e Economia",
      href: `/blog/${citySlug}?categoria=manutencao-economia`,
      icon: "maintenance",
    },
    {
      id: "noticias-curiosidades",
      label: "Notícias e Curiosidades",
      href: `/blog/${citySlug}?categoria=noticias-curiosidades`,
      icon: "news",
    },
  ];

  return {
    citySlug,
    cityName: city.name,
    cityState: city.state,
    cityLabel: city.label,
    heroBanner: {
      title: "Blog Carros na Cidade",
      subtitle: `Dicas e notícias de automóveis em ${city.name} e região`,
      image: "/images/vehicle-placeholder.svg",
    },
    bottomBanner: {
      title: "Quer vender seu carro rápido e seguro?",
      subtitle: `Anuncie grátis em ${city.name} e fale direto com compradores da sua cidade.`,
      ctaLabel: "Criar anúncio grátis",
      ctaHref: "/planos",
      image: "/images/vehicle-placeholder.svg",
    },
    sidebarSaleCta: {
      title: "Anuncie seu carro grátis",
      subtitle: `Venda fácil e segura na sua cidade. 5.0/5`,
      ctaLabel: "Criar anúncio grátis",
      ctaHref: "/planos",
    },
    newsletter: {
      title: "Receba as últimas",
      subtitle: `dicas e novidades de automóveis na sua cidade.`,
      placeholder: "Digite seu melhor email aqui",
      ctaLabel: "Quero Receber",
    },
    categories,
    featuredPosts: [
      {
        id: "featured-1",
        slug: "guia-completo-para-comprar-suvs-usados",
        title: `Guia completo para comprar SUVs usados em ${city.name}`,
        excerpt:
          "Veja onde observar, quais versões valem mais a pena e como negociar melhor na hora de comprar um SUV usado com segurança.",
        coverImage: "/images/vehicle-placeholder.svg",
        publishedAt: "2026-04-16",
        readTime: "Ver 5 min",
        category: "Comprando Carros",
        cityLabel: city.label,
        ctaLabel: "Ver 5 min",
      },
      {
        id: "featured-2",
        slug: "como-conseguir-melhores-taxas-financiamento",
        title: "Como conseguir as melhores taxas para financiar seu carro",
        excerpt:
          "Veja dicas práticas para obter as melhores condições de financiamento, comparar CET e negociar entrada e prazo com mais segurança.",
        coverImage: "/images/vehicle-placeholder.svg",
        publishedAt: "2026-04-10",
        readTime: "Ver 4 min",
        category: "Manutenção e Economia",
        cityLabel: city.label,
        ctaLabel: "Ver 4 min",
      },
    ],
    popularPosts: [
      {
        id: "popular-1",
        slug: "diferencas-entre-revisoes-e-manutencoes",
        title: `Diferenças entre revisões e manutenções em ${city.name}`,
        excerpt:
          "Entenda quando fazer revisão preventiva, o que realmente precisa ser trocado e como evitar gastos desnecessários no dia a dia.",
        coverImage: "/images/vehicle-placeholder.svg",
        publishedAt: "2026-04-16",
        readTime: "Ver 4 minutos",
        category: "Manutenção e Economia",
        cityLabel: city.label,
        ctaLabel: "Ver 4 minutos",
      },
      {
        id: "popular-2",
        slug: "melhores-roteiros-para-test-drive-final-semana",
        title: "10 melhores roteiros de carro para o final de semana",
        excerpt:
          "Descubra destinos próximos, ideias de passeio e rotas urbanas para curtir mais o seu carro nos arredores da cidade.",
        coverImage: "/images/vehicle-placeholder.svg",
        publishedAt: "2026-04-10",
        readTime: "Ver ofertas",
        category: "Notícias e Curiosidades",
        cityLabel: city.label,
        ctaLabel: "Ver ofertas",
      },
      {
        id: "popular-3",
        slug: "como-manter-revisao-em-dia",
        title: "Como manter a revisão em dia sem apertar o orçamento",
        excerpt:
          "Veja como planejar manutenção, separar custos previsíveis e evitar surpresas que derrubam o valor de revenda do veículo.",
        coverImage: "/images/vehicle-placeholder.svg",
        publishedAt: "2026-04-04",
        readTime: "Ver ofertas",
        category: "Manutenção e Economia",
        cityLabel: city.label,
        ctaLabel: "Ver ofertas",
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
    sidebarSaleCta: {
      ...fallback.sidebarSaleCta,
      ...(remote.sidebarSaleCta || {}),
    },
    newsletter: {
      ...fallback.newsletter,
      ...(remote.newsletter || {}),
    },
    categories:
      Array.isArray(remote.categories) && remote.categories.length > 0
        ? (remote.categories as BlogCategory[])
        : fallback.categories,
    featuredPosts:
      Array.isArray(remote.featuredPosts) && remote.featuredPosts.length > 0
        ? (remote.featuredPosts as BlogPost[])
        : fallback.featuredPosts,
    popularPosts:
      Array.isArray(remote.popularPosts) && remote.popularPosts.length > 0
        ? (remote.popularPosts as BlogPost[])
        : fallback.popularPosts,
  };
}
