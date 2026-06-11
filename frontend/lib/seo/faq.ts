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
