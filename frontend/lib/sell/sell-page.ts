export type SellBenefit = {
  title: string;
  description: string;
};

export type SellStep = {
  step: string;
  title: string;
  description: string;
};

export type SellTestimonial = {
  name: string;
  role: string;
  text: string;
};

export type SellFaq = {
  question: string;
  answer: string;
};

export type SellPageContent = {
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryCtaLabel: string;
    primaryCtaHref: string;
    secondaryCtaLabel: string;
    secondaryCtaHref: string;
    stats: Array<{
      value: string;
      label: string;
    }>;
    highlights: string[];
  };
  reasons: SellBenefit[];
  steps: SellStep[];
  dealerBenefits: SellBenefit[];
  privateSellerBenefits: SellBenefit[];
  testimonials: SellTestimonial[];
  faq: SellFaq[];
  bottomCta: {
    title: string;
    subtitle: string;
    primaryCtaLabel: string;
    primaryCtaHref: string;
    secondaryCtaLabel: string;
    secondaryCtaHref: string;
  };
};

function fallbackContent(): SellPageContent {
  return {
    hero: {
      eyebrow: "Venda seu carro com presença regional forte",
      title: "Anuncie no Carros na Cidade e fale com compradores da sua região",
      subtitle:
        "Publique seu veículo com visual premium, destaque regional, apoio de páginas locais e ferramentas que ajudam você a vender com mais confiança. Ideal para particulares e lojistas.",
      primaryCtaLabel: "Começar meu anúncio",
      primaryCtaHref: "/anunciar/publicar?tipo=particular",
      secondaryCtaLabel: "Sou lojista",
      secondaryCtaHref: "/anunciar/publicar?tipo=lojista",
      stats: [
        { value: "SEO local", label: "páginas por cidade e região" },
        { value: "FIPE", label: "apoio de preço e contexto comercial" },
        { value: "WhatsApp", label: "contato direto com comprador" },
      ],
      highlights: [
        "Anúncio com aparência premium",
        "Maior foco em compradores da sua cidade",
        "Integração futura com CRM automotivo",
        "Fluxo pensado para particular e lojista",
      ],
    },
    reasons: [
      {
        title: "Audiência regional mais qualificada",
        description:
          "O portal foi pensado para captar compradores próximos, aumentando a chance de contato útil e visita real.",
      },
      {
        title: "Visual premium que valoriza o veículo",
        description:
          "Seu anúncio aparece em uma experiência comercial forte, limpa e confiável, no padrão de grandes marketplaces automotivos.",
      },
      {
        title: "Preço com apoio de FIPE",
        description:
          "O portal conversa com páginas de Tabela FIPE e financiamento para ajudar o comprador a tomar decisão mais rápido.",
      },
      {
        title: "Contato direto pelo WhatsApp",
        description:
          "Facilitamos o contato entre comprador e vendedor com CTAs claros e foco em conversão.",
      },
      {
        title: "Bom para particular e excelente para lojista",
        description:
          "Particulares anunciam com simplicidade. Lojistas ganham vitrine regional, autoridade e escala de estoque.",
      },
      {
        title: "Base pronta para evolução comercial",
        description:
          "A estrutura do produto já nasce alinhada a destaque pago, hierarquia comercial e expansão por cidade.",
      },
    ],
    steps: [
      {
        step: "01",
        title: "Escolha o perfil",
        description:
          "Defina se você vai anunciar como particular ou lojista para seguir no fluxo correto.",
      },
      {
        step: "02",
        title: "Entre ou crie sua conta",
        description: "O acesso prepara o seu ambiente para publicação e continuidade do anúncio.",
      },
      {
        step: "03",
        title: "Preencha os dados do veículo",
        description: "Informe versão, quilometragem, cidade, preço e diferenciais principais.",
      },
      {
        step: "04",
        title: "Publique e receba contatos",
        description:
          "Seu anúncio entra no portal com foco em visibilidade regional e geração de leads.",
      },
    ],
    dealerBenefits: [
      {
        title: "Página da loja e vitrine regional",
        description: "Sua operação ganha presença profissional e mais autoridade na sua cidade.",
      },
      {
        title: "Hierarquia comercial de exposição",
        description:
          "Destaque, plano premium e plano básico respeitam posição comercial no catálogo.",
      },
      {
        title: "Base pronta para integração com CRM",
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
        description:
          "Seu veículo aparece em ambiente profissional, com cara de marketplace premium.",
      },
      {
        title: "Maior chance de contato qualificado",
        description: "O foco regional reduz ruído e aproxima o comprador certo.",
      },
    ],
    testimonials: [
      {
        name: "Carlos M.",
        role: "Vendedor particular • São Paulo",
        text: "Gostei da proposta porque o anúncio fica com aparência muito mais profissional e o comprador já chega mais decidido.",
      },
      {
        name: "Prime Auto Center",
        role: "Lojista • Zona Sul",
        text: "Para loja, o diferencial está na presença regional e na forma como o estoque ganha cara de operação séria.",
      },
      {
        name: "Fernanda R.",
        role: "Vendedora particular • ABC",
        text: "A combinação entre anúncio bonito, preço de referência e contato rápido ajuda muito na confiança.",
      },
    ],
    faq: [
      {
        question: "Quem pode anunciar no Carros na Cidade?",
        answer:
          "Tanto particulares quanto lojistas. A página foi pensada para atender os dois perfis com proposta comercial adequada.",
      },
      {
        question: "Preciso definir o preço sozinho?",
        answer:
          "Não. O portal trabalha junto com a lógica de FIPE e contexto de mercado para ajudar no posicionamento do anúncio.",
      },
      {
        question: "O comprador fala direto com o vendedor?",
        answer:
          "Sim. A experiência prioriza contato rápido, especialmente via WhatsApp, para acelerar a negociação.",
      },
      {
        question: "Lojista terá vantagens extras?",
        answer:
          "Sim. A estratégia do produto considera vitrine regional, hierarquia comercial, integração com CRM e expansão do estoque.",
      },
      {
        question: "Posso começar como particular e depois evoluir?",
        answer:
          "Sim. O produto foi pensado para escalar sem quebrar a experiência, tanto para quem vende um carro quanto para quem opera uma loja.",
      },
    ],
    bottomCta: {
      title: "Seu próximo comprador pode estar procurando exatamente o seu carro hoje",
      subtitle:
        "Publique agora e coloque seu veículo em uma vitrine premium, regional e pronta para conversão.",
      primaryCtaLabel: "Criar meu anúncio",
      primaryCtaHref: "/anunciar/publicar?tipo=particular",
      secondaryCtaLabel: "Quero anunciar como lojista",
      secondaryCtaHref: "/anunciar/publicar?tipo=lojista",
    },
  };
}

export async function getSellPageContent(): Promise<SellPageContent> {
  return fallbackContent();
}
