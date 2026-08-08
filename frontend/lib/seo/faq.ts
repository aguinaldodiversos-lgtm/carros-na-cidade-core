// frontend/lib/seo/faq.ts
//
// Fase 4.3 (§6/§7) — FAQ útil para páginas territoriais + FAQPage JSON-LD.
//
// Regra de ouro: o FAQPage só é emitido quando as perguntas estão VISÍVEIS
// na página (renderizadas pelo FaqBlock). buildFaqPageJsonLd devolve `null`
// para lista vazia, então a página nunca injeta schema sem conteúdo visível.
// As respostas são úteis e recebem contexto da cidade quando faz sentido —
// não são FAQ genérico vazio.

export type FaqEntry = { question: string; answer: string };

/** FAQPage JSON-LD — `null` quando não há entradas (não emitir schema vazio). */
export function buildFaqPageJsonLd(entries: FaqEntry[]): Record<string, unknown> | null {
  const valid = (Array.isArray(entries) ? entries : []).filter(
    (e) => e && e.question?.trim() && e.answer?.trim()
  );
  if (valid.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: valid.map((e) => ({
      "@type": "Question",
      name: e.question.trim(),
      acceptedAnswer: { "@type": "Answer", text: e.answer.trim() },
    })),
  };
}

/**
 * Perguntas de INVENTÁRIO (Fase 3) — respondidas com o número real da cidade.
 *
 * São as perguntas que só esta página pode responder ("quantos carros há em
 * Atibaia?"), diferente das perguntas de processo abaixo, que valem para
 * qualquer cidade. Uma pergunta só é escrita quando o dado que a responde
 * existe: sem estoque não há pergunta, sem automático não há pergunta de
 * automático. Nada de "temos diversos veículos".
 *
 * As respostas descrevem o portal como ele funciona: um classificado onde o
 * anunciante publica e o comprador negocia direto. Nunca "vendemos",
 * "garantimos" ou "intermediamos" — ver Termos de Uso.
 */
export function buildCityInventoryFaqEntries(input: {
  cityName: string;
  activeAds: number;
  activeDealers: number;
  automaticCount: number;
  belowFipeCount: number;
  brandLabels: string[];
  medianPrice: number | null;
}): FaqEntry[] {
  const city = (input.cityName || "").trim();
  if (!city || input.activeAds <= 0) return [];

  const entries: FaqEntry[] = [];
  const brl = (v: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: 0,
    }).format(v);

  entries.push({
    question: `Quantos carros estão anunciados em ${city}?`,
    answer:
      `No momento há ${input.activeAds} ${input.activeAds === 1 ? "veículo anunciado" : "veículos anunciados"} em ${city} no Carros na Cidade` +
      (input.activeDealers > 0
        ? `, publicados por ${input.activeDealers} ${input.activeDealers === 1 ? "anunciante" : "anunciantes"}`
        : "") +
      `. O número muda conforme os anúncios são publicados e vendidos.`,
  });

  if (input.brandLabels.length > 0) {
    const list = input.brandLabels.slice(0, 6);
    entries.push({
      question: `Quais marcas têm veículos disponíveis em ${city}?`,
      answer: `Hoje há ofertas de ${list.join(", ")}. A lista de marcas na página é gerada a partir dos anúncios ativos, então acompanha o estoque real.`,
    });
  }

  if (input.automaticCount > 0) {
    entries.push({
      question: `Há carros automáticos em ${city}?`,
      answer: `Sim: ${input.automaticCount} ${input.automaticCount === 1 ? "anúncio ativo é" : "anúncios ativos são"} de câmbio automático. Você pode isolar essas ofertas pelo filtro de câmbio no catálogo.`,
    });
  }

  if (input.belowFipeCount > 0) {
    entries.push({
      question: `Existem carros abaixo da FIPE em ${city}?`,
      answer: `${input.belowFipeCount} ${input.belowFipeCount === 1 ? "anúncio está" : "anúncios estão"} com preço abaixo do valor de referência da Tabela FIPE para o mesmo modelo, ano e versão. A comparação aparece na própria página do veículo.`,
    });
  }

  if (input.medianPrice != null) {
    entries.push({
      question: `Quanto custa um carro usado em ${city}?`,
      answer: `Entre os anúncios ativos, o preço mediano é de ${brl(input.medianPrice)}. É a mediana do que está anunciado agora, não uma avaliação de mercado — o valor de cada carro depende de ano, versão, quilometragem e estado de conservação.`,
    });
  }

  entries.push({
    question: "Os veículos são vendidos pelo Carros na Cidade?",
    answer:
      "Não. O Carros na Cidade é um classificado: os anúncios são publicados por lojas e vendedores particulares, e a negociação, o pagamento e a transferência acontecem diretamente entre comprador e anunciante. O portal não vende, não intermedia pagamento e não garante o veículo.",
  });

  return entries;
}

/** Perguntas para a página de cidade (/carros-em/[slug]). */
export function buildCityFaqEntries(input: { cityName: string; stateUf?: string }): FaqEntry[] {
  const city = (input.cityName || "sua cidade").trim();
  return [
    {
      question: `Como encontrar carros usados em ${city}?`,
      answer: `Use os filtros de marca, modelo, preço e ano no catálogo de ${city} para refinar a busca e comparar ofertas de lojas e de vendedores particulares.`,
    },
    {
      question: "É seguro comprar carro usado direto com o anunciante?",
      answer:
        "Sim, desde que você confira a documentação e o histórico do veículo, faça uma vistoria e negocie pessoalmente. O Carros na Cidade não intermedia pagamento — combine tudo diretamente com o anunciante.",
    },
    {
      question: "Como saber se o preço está abaixo da FIPE?",
      answer:
        "Compare o valor anunciado com a Tabela FIPE do mesmo modelo, ano e versão. Anúncios marcados como abaixo da FIPE já trazem essa comparação na página.",
    },
    {
      question: "Quais documentos conferir antes de comprar?",
      answer:
        "Confira o CRLV em dia, a ausência de débitos (IPVA e multas), a comunicação de venda e se não há restrições como alienação ou registro de roubo/furto.",
    },
    {
      question: "O que fazer antes de fechar negócio?",
      answer:
        "Faça uma vistoria (de preferência cautelar), teste o carro, verifique o histórico e só transfira valores após conferir a documentação e a procedência do veículo.",
    },
  ];
}

/** Perguntas para a página abaixo da FIPE (/carros-baratos-em/[slug]). */
export function buildBelowFipeFaqEntries(input: { cityName?: string } = {}): FaqEntry[] {
  const city = (input.cityName || "").trim();
  const local = city ? ` em ${city}` : "";
  return [
    {
      question: "O que significa um carro estar abaixo da FIPE?",
      answer: `Significa que o preço anunciado${local} está abaixo do valor de referência da Tabela FIPE para o mesmo modelo, ano e versão.`,
    },
    {
      question: "Por que um carro pode estar abaixo da FIPE?",
      answer:
        "Pode ser venda rápida, quilometragem mais alta, necessidade de reparos, sazonalidade ou margem de negociação. Nem sempre indica problema — mas pede verificação.",
    },
    {
      question: "Como evitar golpes em ofertas muito baratas?",
      answer:
        "Desconfie de preços muito abaixo do mercado, nunca pague antecipado, confira documentação e procedência e negocie pessoalmente. O Carros na Cidade não intermedia pagamento.",
    },
    {
      question: "Devo fazer laudo cautelar?",
      answer:
        "Sim. O laudo cautelar verifica sinistros, adulterações e pendências e é altamente recomendado antes de comprar um usado, especialmente em ofertas abaixo da FIPE.",
    },
  ];
}
