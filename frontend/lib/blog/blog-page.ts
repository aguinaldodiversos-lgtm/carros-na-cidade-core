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

// Imagens locais extraídas do mockup oficial em
// `frontend/public/images/blog.png` — todas com tema 100% automotivo
// (handshake com chave, SUV escuro, pneus close-up, calc+chave em mesa
// de financiamento). Quando o admin CRUD subir, essas paths migram para
// uploads S3/R2 e o backend serve a lista. Hero usa o banner já
// extraído do sprite (Jeep Compass + cidade).
const POST_IMAGE_HERO = "/images/home-hero-banner.png";
const POST_IMAGE_VENDA = "/images/blog/venda-handshake.jpg";
const POST_IMAGE_MERCADO = "/images/blog/mercado-suv.jpg";
const POST_IMAGE_MANUTENCAO = "/images/blog/manutencao-pneus.jpg";
const POST_IMAGE_FINANCIAMENTO = "/images/blog/financiamento-calc.jpg";

function buildFallbackContent(citySlug: string): BlogPageContent {
  const city = prettifyCitySlug(citySlug);

  const categories: BlogCategory[] = [
    {
      id: "compra",
      label: "Compra",
      href: `/blog/${citySlug}?categoria=compra`,
      icon: "buy",
    },
    {
      id: "venda",
      label: "Venda",
      href: `/blog/${citySlug}?categoria=venda`,
      icon: "buy",
    },
    {
      id: "manutencao",
      label: "Manutenção",
      href: `/blog/${citySlug}?categoria=manutencao`,
      icon: "maintenance",
    },
    {
      id: "mercado",
      label: "Mercado",
      href: `/blog/${citySlug}?categoria=mercado`,
      icon: "news",
    },
    {
      id: "financiamento",
      label: "Financiamento",
      href: `/blog/${citySlug}?categoria=financiamento`,
      icon: "buy",
    },
    {
      id: "cidades",
      label: "Cidades",
      href: `/blog/${citySlug}?categoria=cidades`,
      icon: "news",
    },
  ];

  return {
    citySlug,
    cityName: city.name,
    cityState: city.state,
    cityLabel: city.label,
    heroBanner: {
      title: `Melhores carros usados para comprar em ${city.name}`,
      subtitle: `Guia completo com modelos, preços e o que avaliar antes de fechar negócio em ${city.name}.`,
      image: "/images/home-hero-banner.png",
      ctaLabel: "Ler guia",
      ctaHref: `/blog/${citySlug}/melhores-carros-usados-${citySlug}`,
    },
    bottomBanner: {
      title: `Encontre o carro ideal na sua região`,
      subtitle: `Explore ofertas de veículos em ${city.name} e região.`,
      ctaLabel: `Ver carros em ${city.name}`,
      ctaHref: `/comprar/cidade/${citySlug}`,
      image: "/images/home-hero-banner.png",
    },
    sidebarSaleCta: {
      title: "Anuncie seu carro grátis",
      subtitle: `Venda fácil e segura na sua cidade.`,
      ctaLabel: "Criar anúncio grátis",
      ctaHref: "/anunciar/novo",
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
        id: "featured-hero",
        slug: `melhores-carros-usados-${citySlug}`,
        title: `Melhores carros usados para comprar em ${city.name}`,
        excerpt:
          `Selecionamos os modelos com melhor custo-benefício para quem vai comprar usado em ${city.name} e região: SUVs urbanos, sedãs eficientes e hatches econômicos. Confira o que avaliar em cada categoria, faixa de preço justa e onde negociar com segurança.`,
        coverImage: POST_IMAGE_HERO,
        publishedAt: "2026-04-26",
        readTime: "6 min",
        category: "Guia",
        cityLabel: city.label,
      },
    ],
    popularPosts: [
      {
        id: "post-venda",
        slug: `como-vender-carro-${citySlug}-com-seguranca`,
        title: `Como vender seu carro em ${city.name} com segurança`,
        excerpt:
          `Da documentação ao test-drive, veja o passo a passo profissional para anunciar, negociar e transferir seu veículo sem dor de cabeça em ${city.name}. Inclui modelo de proposta e checklist de transferência.`,
        coverImage: POST_IMAGE_VENDA,
        publishedAt: "2026-04-22",
        readTime: "4 min",
        category: "Dicas",
        cityLabel: city.label,
      },
      {
        id: "post-mercado",
        slug: "suvs-mais-buscados-na-regiao",
        title: "SUVs mais buscados na região",
        excerpt:
          `Compass, T-Cross, Creta e Corolla Cross lideram a procura no portal. Veja a faixa de preço média, os anos com melhor revenda e qual versão tem o melhor custo-benefício hoje.`,
        coverImage: POST_IMAGE_MERCADO,
        publishedAt: "2026-04-19",
        readTime: "5 min",
        category: "Mercado",
        cityLabel: city.label,
      },
      {
        id: "post-manutencao",
        slug: "quando-trocar-os-pneus-do-seu-carro",
        title: "Quando trocar os pneus do seu carro",
        excerpt:
          `Saiba identificar os sinais de desgaste, entender as marcações TWI e calcular o ponto certo de troca. Pneus em bom estado reduzem o consumo e evitam multas em revisões.`,
        coverImage: POST_IMAGE_MANUTENCAO,
        publishedAt: "2026-04-15",
        readTime: "3 min",
        category: "Manutenção",
        cityLabel: city.label,
      },
      {
        id: "post-financiamento",
        slug: "financiamento-de-veiculos-vale-a-pena",
        title: "Financiamento de veículos: vale a pena?",
        excerpt:
          `Análise completa de CET, prazo, entrada e cenários: quando financiar é mais inteligente que comprar à vista, e como negociar a taxa diretamente com o banco antes de fechar com a loja.`,
        coverImage: POST_IMAGE_FINANCIAMENTO,
        publishedAt: "2026-04-12",
        readTime: "4 min",
        category: "Financiamento",
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
