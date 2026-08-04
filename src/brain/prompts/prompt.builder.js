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

    /**
     * Sugestão de descrição do wizard (Fase 4.5).
     *
     * O `input` aqui NÃO é o formulário cru: é a ficha já filtrada por
     * `buildDescriptionFacts` (allowlist do catálogo). Tudo que chega aqui é
     * dado declarado pelo anunciante. A regra do prompt é: não acrescentar
     * NADA a isso.
     *
     * A trava não é só o prompt — `ad-description.guard` valida a saída e
     * derruba frase que cite item não-marcado, preço, FIPE, CTA ou elogio
     * vazio. O prompt reduz a frequência; o guard é quem garante.
     */
    case "ad_description_suggestion":
      return `
Você escreve descrições de anúncio de carro usado para um classificado brasileiro.
Escreva a descrição do veículo abaixo.

REGRA ABSOLUTA — só existe o que está nos DADOS:
Você só pode citar informação presente no bloco DADOS. Se algo não está lá, esse
algo NÃO EXISTE e não pode ser mencionado, nem de forma vaga, nem como suposição,
mesmo que seja comum em anúncio de carro. É melhor um texto curto e pobre do que
uma frase inventada — o anunciante publica sem revisar e fato inventado é
propaganda enganosa.

NUNCA escreva (mesmo soando natural):
- número de donos, "único dono", "primeiro dono" — a menos que esteja nos DADOS
- revisões, histórico de manutenção, concessionária, "documentação em dia"
- pneus novos, "nunca bateu", "sem detalhes", "sem retoques"
- aceita troca, financiamento, entrada, parcelas, test drive
- consumo em números (km/l), potência, desempenho que não esteja nos DADOS
- preço, valor, "R$", FIPE, tabela, "abaixo da tabela", "preço especial"
- nome de loja, do vendedor, telefone, cidade
- urgência ("aproveite", "antes que seja vendido", "não perca")
- elogio vazio: bonito, moderno, robusto, impecável, "excelente estado",
  "linhas marcantes", "presença imponente", "custo-benefício", "conservado"
- qualquer estado de conservação que não esteja nos DADOS
- chamada para contato de qualquer tipo

FORMATO:
- português do Brasil, tom informativo e seco, texto corrido
- 2 a 4 parágrafos curtos, entre 400 e 900 caracteres no total
- SEM markdown, sem asteriscos, sem títulos, sem lista de itens, sem bullets
- não repita no fim uma lista dos opcionais: a página já mostra essa lista

ESTRUTURA:
Parágrafo 1 — ficha: modelo, versão, ano, quilometragem, câmbio, tração, cor,
combustível. Depois, os itens avulsos declarados (manual, chave reserva, laudo).
Parágrafo 2 — os opcionais em prosa corrida, agrupados: primeiro segurança,
depois conforto, depois dirigibilidade. Frase corrida, não lista.
Parágrafo 3 — OPCIONAL: uma ou duas frases sobre o posicionamento da versão na
linha do modelo ou o tipo de mecânica. Se você não tiver CERTEZA de como essa
versão se posiciona, OMITA o parágrafo inteiro. Hierarquia de acabamento errada
é pior que parágrafo faltando. Itens de condição declarados (ex.: motor
revisado) podem entrar aqui.

Se os DADOS forem poucos, escreva um texto curto. Nunca estique com elogio.

Responda APENAS com o texto final da descrição, sem aspas e sem comentários.

DADOS:
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
- Contexto de maturidade do território (ajuste o tom): ${context?.stage || "discovery"}
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
