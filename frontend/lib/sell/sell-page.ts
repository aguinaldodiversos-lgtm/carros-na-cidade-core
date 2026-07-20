import { loginWithNext } from "@/lib/auth/routes";

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
 * Prévia do anúncio renderizada no hero QUANDO não há anúncio real
 * disponível. NÃO é um anúncio real — a UI rotula claramente como
 * "Prévia do anúncio". Os selos seguem a taxonomia pública canônica
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
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
};

export type SellPageContent = {
  hero: {
    eyebrow: string;
    title: string;
    /** Trecho do título destacado em azul (ex.: "sua região"). */
    titleHighlight: string;
    subtitle: string;
    primaryCtaLabel: string;
    primaryCtaHref: string;
    secondaryCtaLabel: string;
    secondaryCtaHref: string;
    /** Micro-benefícios curtos abaixo dos CTAs. */
    microBenefits: string[];
    mockup: SellMockup;
  };
  /** Faixa única de benefícios principais (3 itens). */
  benefits: SellBenefit[];
  steps: SellStep[];
  /** Cards "Escolha seu perfil" — particular e lojista. */
  profiles: SellProfile[];
  /** Faixa compacta de confiança (4 itens). */
  assurance: SellBenefit[];
  /**
   * Mantidos no contrato para retrocompatibilidade e para os testes de
   * regressão (ranking-terms varre a copy de lojista; credibilidade varre
   * `trust`). O conteúdo de lojista/particular foi consolidado nos cards
   * de perfil; as regras de moderação são surgidas no FAQ. Evita
   * duplicação visual sem quebrar os contratos de teste.
   */
  dealerBenefits: SellBenefit[];
  privateSellerBenefits: SellBenefit[];
  testimonials: SellTestimonial[];
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

/**
 * Href do CTA de anunciar, ciente da sessão (removemos a tela intermediária
 * `/anunciar/publicar`):
 *  - logado  → vai DIRETO ao formulário (`/anunciar/novo?tipo=…`), sem passar
 *    pelo login.
 *  - anônimo → vai ao `/login?next=…` apontando para o formulário; depois de
 *    logar OU criar conta, o mecanismo `next` do projeto leva ao formulário.
 *
 * O `?tipo` é só o default COSMÉTICO inicial do wizard — o tipo real da conta
 * (CPF/CNPJ) sobrescreve `sellerType` quando o dashboard carrega, e o gate de
 * documento não depende dele. Preservá-lo mantém o rótulo certo por um instante
 * e a intenção particular/lojista do clique.
 */
export function buildAnunciarCtaHref(tipo: "particular" | "lojista", authed: boolean): string {
  const form = `/anunciar/novo?tipo=${tipo}`;
  return authed ? form : loginWithNext(form);
}

function fallbackContent(authed: boolean): SellPageContent {
  const particularHref = buildAnunciarCtaHref("particular", authed);
  const lojistaHref = buildAnunciarCtaHref("lojista", authed);

  return {
    hero: {
      eyebrow: "Venda mais rápido e com segurança",
      title: "Anuncie seu veículo e alcance compradores da sua região",
      titleHighlight: "sua região",
      subtitle:
        "Publique em poucos minutos, mostre seu carro com aparência profissional e receba contatos diretamente pelo WhatsApp.",
      primaryCtaLabel: "Começar anúncio",
      primaryCtaHref: particularHref,
      secondaryCtaLabel: "Sou lojista",
      secondaryCtaHref: lojistaHref,
      microBenefits: ["É rápido", "Contato direto", "Sem compromisso"],
      mockup: {
        badges: ["Destaque", "Abaixo da FIPE"],
        name: "Honda Civic EXL 2.0 Flex",
        specs: "2021 · Automático · 38.000 km",
        city: "São Paulo, SP",
        price: "R$ 96.900",
        fipeRef: "Referência FIPE R$ 102.300",
        imageSrc: "/images/civic.jpeg",
        imageAlt: "Prévia de como um anúncio aparece no Carros na Cidade",
      },
    },
    benefits: [
      {
        title: "Mais visibilidade local",
        description: "Seu anúncio aparece para compradores próximos.",
      },
      {
        title: "Contato por WhatsApp",
        description: "Os interessados falam direto com você.",
      },
      {
        title: "Publicação rápida",
        description: "Cadastre e publique em poucos minutos.",
      },
    ],
    steps: [
      {
        step: "01",
        title: "Cadastre o veículo",
        description: "Informe os dados principais do carro.",
      },
      {
        step: "02",
        title: "Adicione fotos",
        description: "Boas fotos valorizam o seu anúncio.",
      },
      {
        step: "03",
        title: "Publique",
        description: "Seu anúncio entra no ar com presença local.",
      },
      {
        step: "04",
        title: "Receba contatos",
        description: "Os interessados chegam pelo WhatsApp.",
      },
    ],
    profiles: [
      {
        audience: "particular",
        title: "Para particulares",
        bullets: [
          "Anuncie seu carro com facilidade",
          "Receba contatos pelo WhatsApp",
          "Venda com mais segurança",
        ],
        ctaLabel: "Anunciar como particular",
        ctaHref: particularHref,
      },
      {
        audience: "lojista",
        title: "Para lojistas",
        bullets: [
          "Mais visibilidade para seu estoque",
          "Leads mais organizados",
          "Presença regional para sua loja",
        ],
        ctaLabel: "Anunciar como lojista",
        ctaHref: lojistaHref,
      },
    ],
    assurance: [
      {
        title: "Anúncio profissional",
        description: "Layout limpo que valoriza o seu veículo.",
      },
      {
        title: "Sem burocracia",
        description: "Publique em poucos passos, sem complicação.",
      },
      {
        title: "Suporte especializado",
        description: "Central de ajuda para tirar suas dúvidas.",
      },
      {
        title: "Foco local",
        description: "Seu carro perto de quem procura na região.",
      },
    ],
    dealerBenefits: [
      {
        title: "Página da loja e vitrine regional",
        description: "Sua operação ganha presença profissional e mais autoridade na sua cidade.",
      },
      {
        // Briefing P2-D 2026-05-25: NÃO expor nomes internos de plano
        // (Pro/Start/Grátis) na vitrine pública. Linguagem descreve o
        // BENEFÍCIO sem citar nome técnico do plano. Selos vistos pelo
        // comprador (Destaque/Loja/Oportunidade) seguem canônicos via
        // `resolvePublicAdBadges`.
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
        description:
          "Seu veículo aparece em ambiente profissional, com cara de marketplace confiável.",
      },
      {
        title: "Maior chance de contato qualificado",
        description: "O foco regional reduz ruído e aproxima o comprador certo.",
      },
    ],
    // Sem depoimentos fictícios. Quando houver nome+role+texto vindos
    // de fonte verificável, preencher este array — caso contrário, manter
    // vazio (a moderação real é descrita no FAQ).
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
          "Você pode publicar seu veículo no Carros na Cidade. Há planos pagos para quem quer mais visibilidade e posições de destaque, mas começar a anunciar é simples.",
      },
      {
        question: "Como recebo contatos?",
        answer:
          "O interessado fala direto com você, principalmente pelo WhatsApp, a partir do botão de contato no anúncio.",
      },
      {
        question: "Lojista pode anunciar estoque?",
        answer:
          "Sim. O fluxo de lojista é pensado para anunciar estoque, com vitrine regional e os contatos organizados.",
      },
      {
        question: "Meu anúncio passa por revisão?",
        answer:
          "Pode passar. Anúncios com sinais de risco ou preço muito fora da referência FIPE são revisados antes de aparecer, e denúncias podem reabrir a análise.",
      },
    ],
    bottomCta: {
      title: "Pronto para anunciar seu carro?",
      subtitle: "Comece agora e conecte seu veículo a compradores da sua região.",
      microcopy: "Rápido, simples e seguro.",
      primaryCtaLabel: "Começar agora",
      primaryCtaHref: particularHref,
      secondaryCtaLabel: "Sou lojista",
      secondaryCtaHref: lojistaHref,
    },
  };
}

/**
 * Conteúdo da landing `/anunciar`. `authed` decide o destino dos CTAs (form
 * direto p/ logado; login com `next` p/ anônimo) — ver `buildAnunciarCtaHref`.
 * Default `false` preserva a assinatura zero-arg usada nos testes de copy.
 */
export async function getSellPageContent(authed = false): Promise<SellPageContent> {
  return fallbackContent(authed);
}
