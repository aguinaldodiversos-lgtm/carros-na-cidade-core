export type SellBenefit = {
  title: string;
  description: string;
};

export type SellStep = {
  step: string;
  title: string;
  description: string;
};

/**
 * Tipo legado de depoimentos. NÃO popular com nomes/textos fictícios em
 * produção — a rodada de credibilidade removeu os 3 depoimentos
 * placeholder ("Carlos M.", "Prime Auto Center", "Fernanda R.") que
 * apareciam como prova social não verificada. Mantemos o tipo apenas
 * para retrocompatibilidade do contrato; quando houver depoimentos
 * reais (com fonte verificável) eles entram aqui.
 */
export type SellTestimonial = {
  name: string;
  role: string;
  text: string;
};

export type SellTrustItem = {
  title: string;
  description: string;
};

export type SellFaq = {
  question: string;
  answer: string;
};

/**
 * Dados do card de anúncio renderizado no hero (mockup visual). NÃO é um
 * anúncio real — é uma ilustração de como o anúncio do visitante aparece
 * para o comprador. Os selos seguem a taxonomia pública canônica
 * (Destaque / Abaixo da FIPE) sem expor mecânica interna de ranking.
 */
export type SellMockup = {
  badges: string[];
  name: string;
  specs: string;
  city: string;
  price: string;
  fipeRef: string;
  imageSrc: string;
  imageAlt: string;
};

export type SellProfile = {
  audience: "particular" | "lojista";
  title: string;
  description: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
};

export type SellLocalPresence = {
  features: string[];
  chips: string[];
};

export type SellPageContent = {
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    microcopy: string;
    primaryCtaLabel: string;
    primaryCtaHref: string;
    secondaryCtaLabel: string;
    secondaryCtaHref: string;
    highlights: string[];
    mockup: SellMockup;
  };
  /** Barra de benefícios rápidos logo abaixo do hero (4 itens). */
  benefits: SellBenefit[];
  reasons: SellBenefit[];
  /** Cards "Escolha seu perfil" — particular e lojista (consolida as
   *  antigas seções repetitivas de vantagens). */
  profiles: SellProfile[];
  steps: SellStep[];
  localPresence: SellLocalPresence;
  /**
   * Mantidos no contrato para retrocompatibilidade e para os testes de
   * regressão (ranking-terms) que varrem a copy de lojista. NÃO são mais
   * renderizados como blocos longos próprios — o conteúdo foi consolidado
   * nos cards de perfil e na seção "Por que anunciar". Evita duplicação.
   */
  dealerBenefits: SellBenefit[];
  privateSellerBenefits: SellBenefit[];
  testimonials: SellTestimonial[];
  /**
   * Itens de "Confiança e moderação" — substituem os depoimentos
   * fictícios. Texto descreve regras REAIS do backend (antifraude,
   * pending_review, denúncia → reavaliação). Sem promessas que o
   * sistema ainda não cumpre (Detran, vistoria, garantia).
   */
  trust: SellTrustItem[];
  faq: SellFaq[];
  bottomCta: {
    title: string;
    subtitle: string;
    microcopy: string;
    primaryCtaLabel: string;
    primaryCtaHref: string;
    secondaryCtaLabel: string;
    secondaryCtaHref: string;
  };
};

const PARTICULAR_HREF = "/anunciar/publicar?tipo=particular";
const LOJISTA_HREF = "/anunciar/publicar?tipo=lojista";

function fallbackContent(): SellPageContent {
  return {
    hero: {
      eyebrow: "Anuncie no Carros na Cidade",
      title: "Anuncie seu veículo e apareça para compradores da sua região",
      subtitle:
        "Publique seu carro no Carros na Cidade, apareça para compradores da sua região e receba contatos com preço, fotos, referência FIPE e chamada direta pelo WhatsApp.",
      microcopy: "Anúncios revisados para mais confiança e segurança.",
      primaryCtaLabel: "Anunciar meu veículo",
      primaryCtaHref: PARTICULAR_HREF,
      secondaryCtaLabel: "Sou lojista",
      secondaryCtaHref: LOJISTA_HREF,
      highlights: [
        "Apareça para compradores da sua região",
        "Contato direto pelo WhatsApp",
        "Preço com referência FIPE",
      ],
      mockup: {
        badges: ["Destaque", "Abaixo da FIPE"],
        name: "Honda Civic EXL 2.0 Flex",
        specs: "2021 · Automático · 38.000 km",
        city: "São Paulo, SP",
        price: "R$ 96.900",
        fipeRef: "Referência FIPE R$ 102.300",
        imageSrc: "/images/civic.jpeg",
        imageAlt: "Exemplo de anúncio de Honda Civic no Carros na Cidade",
      },
    },
    benefits: [
      {
        title: "Anúncio profissional",
        description: "Seu veículo aparece com fotos, preço e dados bem organizados.",
      },
      {
        title: "Presença local",
        description: "Seu anúncio aparece em páginas da sua cidade e região.",
      },
      {
        title: "Contato pelo WhatsApp",
        description: "Interessados falam direto com você, sem intermediários.",
      },
      {
        title: "Referência FIPE",
        description: "Seu preço aparece com contexto de mercado para o comprador.",
      },
    ],
    reasons: [
      {
        title: "Mais compradores da sua região",
        description:
          "O portal conecta o seu veículo a páginas locais com gente realmente procurando carro perto de você.",
      },
      {
        title: "Anúncio com aparência profissional",
        description:
          "Seu carro aparece em uma vitrine limpa e confiável, no padrão dos grandes marketplaces automotivos.",
      },
      {
        title: "Preço com contexto FIPE",
        description:
          "A referência FIPE ajuda o comprador a entender o valor do seu carro e a decidir mais rápido.",
      },
      {
        title: "Contato rápido pelo WhatsApp",
        description:
          "O interessado encontra um botão claro para falar direto com você e acelerar a negociação.",
      },
      {
        title: "Maior chance de venda",
        description:
          "Boa apresentação, foco regional e contexto de preço aumentam a qualidade dos contatos que você recebe.",
      },
      {
        title: "Gestão simples dos anúncios",
        description:
          "Você acompanha, edita e republica seus anúncios em um painel pensado para ser direto.",
      },
    ],
    profiles: [
      {
        audience: "particular",
        title: "Para particulares",
        description:
          "Venda seu carro com melhor apresentação, mais segurança e contato direto com compradores da sua região.",
        bullets: [
          "Publicação simples, sem complicação",
          "Contato direto pelo WhatsApp",
          "Seu carro nas páginas da sua cidade",
        ],
        ctaLabel: "Quero vender meu carro",
        ctaHref: PARTICULAR_HREF,
      },
      {
        audience: "lojista",
        title: "Para lojistas",
        description:
          "Anuncie seu estoque, aumente sua presença regional e receba leads com mais organização.",
        bullets: [
          "Vitrine regional para a sua loja",
          "Posições de destaque nos planos pagos",
          "Estrutura pronta para crescer o estoque",
        ],
        ctaLabel: "Quero anunciar meu estoque",
        ctaHref: LOJISTA_HREF,
      },
    ],
    steps: [
      {
        step: "01",
        title: "Cadastre o veículo",
        description: "Informe marca, modelo, ano, versão, preço e os dados principais do carro.",
      },
      {
        step: "02",
        title: "Envie boas fotos",
        description: "Fotos nítidas valorizam o veículo e atraem mais interessados.",
      },
      {
        step: "03",
        title: "Publique com presença local",
        description: "Seu anúncio entra nas páginas da sua cidade e região, perto de quem procura.",
      },
      {
        step: "04",
        title: "Receba interessados",
        description: "Os contatos chegam direto pelo WhatsApp, com mais intenção de compra.",
      },
    ],
    localPresence: {
      features: [
        "Páginas por cidade",
        "Páginas por marca",
        "Páginas por modelo",
        "Busca regional",
        "Contexto de preço com FIPE",
        "Compradores próximos de você",
      ],
      chips: [
        "Fiat Argo em Atibaia",
        "Onix em Campinas",
        "HB20 em Jundiaí",
        "Carros abaixo da FIPE em São Paulo",
      ],
    },
    dealerBenefits: [
      {
        title: "Página da loja e vitrine regional",
        description: "Sua operação ganha presença profissional e mais autoridade na sua cidade.",
      },
      {
        // Briefing P2-D 2026-05-25: NÃO expor nomes internos de plano
        // (Pro/Start/Grátis) na vitrine pública — esses são bastidor
        // comercial. Linguagem reescrita para descrever o BENEFÍCIO para
        // o lojista sem citar o nome técnico do plano. Selos vistos pelo
        // comprador (Destaque/Loja/Oportunidade) continuam canônicos via
        // `resolvePublicAdBadges` (sem exposição de tier 2/3).
        title: "Posições de destaque para planos pagos",
        description:
          "Anúncios em planos comerciais ganham posições mais visíveis no catálogo, com selo público claro para o comprador.",
      },
      {
        title: "Base pronta para organizar estoque e contatos",
        description: "Estrutura pensada para crescer junto com operação, leads e estoque.",
      },
    ],
    privateSellerBenefits: [
      {
        title: "Publicação simples",
        description: "Fluxo claro para quem quer vender um único carro sem complexidade.",
      },
      {
        title: "Mais confiança na apresentação",
        description: "Seu veículo aparece em ambiente profissional, com cara de marketplace confiável.",
      },
      {
        title: "Maior chance de contato qualificado",
        description: "O foco regional reduz ruído e aproxima o comprador certo.",
      },
    ],
    // Sem depoimentos fictícios. Quando houver nome+role+texto vindos
    // de fonte verificável (case study assinado, post em rede social
    // pública etc.), preencher este array — caso contrário, manter
    // vazio e renderizar a seção `trust` no lugar (regras reais).
    testimonials: [],
    trust: [
      {
        title: "Anúncios passam por checagem antes de aparecer",
        description:
          "Sinais de risco (preço muito abaixo da FIPE, dados inconsistentes, telefones na descrição, contas novas) levam o anúncio para análise antes de ficar público.",
      },
      {
        title: "Preço fora da curva exige revisão",
        description:
          "Se o valor publicado destoa muito da referência FIPE, a moderação revisa o anúncio antes de aprovar — protege o comprador de golpe e o vendedor de cadastro mal feito.",
      },
      {
        title: "Denúncias reabrem a análise",
        description:
          "Qualquer comprador pode denunciar um anúncio. As denúncias entram na fila de reavaliação, sem expor os dados de quem reportou.",
      },
    ],
    faq: [
      {
        question: "Preciso pagar para anunciar?",
        answer:
          "Você pode publicar seu veículo no Carros na Cidade. Existem planos pagos para quem quer mais visibilidade e posições de destaque no catálogo, mas começar a anunciar é simples.",
      },
      {
        question: "Meu anúncio aparece no Google?",
        answer:
          "Os anúncios e as páginas locais são pensados para indexação nos buscadores. Não garantimos posição específica, mas a presença regional ajuda quem procura carro perto de você a encontrar o seu.",
      },
      {
        question: "Como recebo contato dos interessados?",
        answer:
          "O comprador fala direto com você, principalmente pelo WhatsApp, a partir do botão de contato no anúncio. Isso acelera a negociação, sem intermediários.",
      },
      {
        question: "Posso editar meu anúncio depois?",
        answer:
          "Sim. Você acompanha, edita e republica seus anúncios pelo painel, ajustando fotos, preço e informações sempre que precisar.",
      },
      {
        question: "Lojista pode cadastrar vários veículos?",
        answer:
          "Sim. O fluxo de lojista é pensado para anunciar estoque, com vitrine regional e organização dos contatos recebidos.",
      },
      {
        question: "O anúncio passa por revisão?",
        answer:
          "Pode passar. Anúncios com sinais de risco ou preço muito fora da referência FIPE são revisados antes de aparecer, e denúncias podem reabrir a análise.",
      },
      {
        question: "Posso anunciar mesmo sem loja?",
        answer:
          "Sim. Particulares e lojistas usam a mesma plataforma. Se você quer vender o próprio carro, basta escolher o perfil de particular e começar.",
      },
    ],
    bottomCta: {
      title: "Pronto para vender seu veículo com mais visibilidade?",
      subtitle:
        "Anuncie agora no Carros na Cidade e conecte-se com compradores da sua região.",
      microcopy: "É rápido, simples e pensado para gerar contatos mais qualificados.",
      primaryCtaLabel: "Começar meu anúncio",
      primaryCtaHref: PARTICULAR_HREF,
      secondaryCtaLabel: "Sou lojista",
      secondaryCtaHref: LOJISTA_HREF,
    },
  };
}

export async function getSellPageContent(): Promise<SellPageContent> {
  return fallbackContent();
}
