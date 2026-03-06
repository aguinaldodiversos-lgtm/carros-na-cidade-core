export function buildPrompt({ task, input, context = {} }) {
  const locale = context?.locale || "pt-BR";

  switch (task) {
    case "ad_description_short":
      return `
Crie uma descrição curta e persuasiva para anúncio de veículo.
Regras:
- ${locale}
- Tom profissional e direto
- Máximo 5 parágrafos curtos
- Foco em conversão e clareza
- Não invente itens que não existam
Dados do veículo:
${JSON.stringify(input, null, 2)}
`;

    case "whatsapp_message":
      return `
Gere uma mensagem de WhatsApp para vendedor automotivo com objetivo de agendar visita.
Regras:
- ${locale}
- Curto, humano, sem enrolação
- Finalize com duas opções de horário (hoje/amanhã)
Contexto:
${JSON.stringify(input, null, 2)}
`;

    case "lead_scoring":
      return `
Classifique o lead em: quente, morno ou frio.
Retorne JSON no formato:
{"label":"quente|morno|frio","score":0-100,"reasons":["...","..."]}
Dados:
${JSON.stringify(input, null, 2)}
`;

    case "seo_city_page":
    case "seo_money_page":
      return `
Escreva conteúdo SEO para página de portal automotivo.
Regras:
- ${locale}
- Estrutura com H1, H2, parágrafos curtos
- Sem exagero de keywords
- Inclua seção FAQ com 4 perguntas
Brief:
${JSON.stringify(input, null, 2)}
`;

    case "banner_prompt_only":
      return `
Crie um PROMPT para gerar banner automotivo (sem gerar imagem aqui).
Regras:
- Visual profissional, limpo
- Texto em pt-BR
- Layout 16:9
Dados:
${JSON.stringify(input, null, 2)}
Retorne APENAS o prompt final.
`;

    default:
      return String(input);
  }
}
