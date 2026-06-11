/**
 * Dataset de ADOÇÃO das matérias legadas do Blog (Fase 4.2.1).
 *
 * Origem
 * ------
 * Até a Fase 4.2 os cards do blog público vinham de um array HARDCODED no
 * frontend (frontend/lib/blog/blog-page.ts → buildFallbackContent). Não havia
 * linha em `blog_posts` para eles — por isso o admin mostrava "0 posts".
 *
 * Esta lista canoniza essas matérias como posts do CMS (source='cms'),
 * editáveis pelo painel. Títulos/slugs foram tornados CITY-AGNOSTIC (sem "em
 * Atibaia"): um único post canônico em /blog/<slug> serve todas as cidades —
 * o hub /blog/<cidade> apenas os lista. Isso evita conteúdo duplicado por
 * cidade e simplifica o SEO.
 *
 * Categorias limitadas às 6 válidas do CMS
 * (compra, venda, manutencao, mercado, financiamento, cidades).
 *
 * O conteúdo é um ponto de partida editorial real (intro + subtítulos +
 * bullets + conclusão + CTA), suficiente para publicar, mas marcado com a tag
 * interna `adotado-4.2.1` para o time revisar/expandir/localizar depois.
 *
 * Sem regra de I/O aqui — só dados + a função pura `buildAdoptionPlan`, para
 * o script (scripts/blog/adopt-legacy-blog-posts.mjs) e os testes consumirem.
 */

const CTA = [
  "## Pronto para o próximo passo?",
  "",
  "No Carros na Cidade você compara ofertas reais, filtra por preço e cidade e",
  "fala direto com o anunciante. [Veja os carros disponíveis na sua região](/comprar)",
  "e encontre a melhor oportunidade com segurança.",
].join("\n");

/** Monta o content final juntando os blocos + CTA padrão. */
function body(...blocks) {
  return [...blocks, "", CTA, ""].join("\n").trim();
}

export const ADOPTION_TAG = "adotado-4.2.1";

/**
 * Matérias legadas a adotar. `slug` é a chave de idempotência.
 * Campos: slug, title, excerpt, category, coverImage, coverAlt, tags, content.
 */
export const LEGACY_BLOG_POSTS = Object.freeze([
  {
    slug: "como-comprar-carro-usado-com-seguranca",
    title: "Como comprar um carro usado com segurança",
    excerpt:
      "Checklist completo de documentação, preço, histórico e negociação para fechar negócio sem dor de cabeça.",
    category: "compra",
    coverImage: "/images/blog/banner-blog.jpg",
    coverAlt: "Carro usado em destaque numa avenida urbana ao entardecer",
    tags: ["compra", "carros usados", "vistoria"],
    content: body(
      "# Como comprar um carro usado com segurança",
      "",
      "Comprar um carro usado pode ser um ótimo negócio — desde que você cuide de preço, documentação, histórico e estado geral do veículo antes de fechar.",
      "",
      "## Confira a documentação",
      "",
      "- CRLV em dia e sem pendências de IPVA, multas ou licenciamento.",
      "- Número do chassi e do motor batendo com o documento.",
      "- Comunicação de venda e ausência de restrições (alienação, roubo/furto).",
      "",
      "## Compare o preço com a Tabela FIPE",
      "",
      "Use a FIPE como referência e desconfie de preços muito abaixo do mercado — costumam esconder sinistro, débito ou problema mecânico.",
      "",
      "## Avalie o histórico e o estado do veículo",
      "",
      "- Faça uma vistoria cautelar e, se possível, leve um mecânico de confiança.",
      "- Verifique pneus, freios, suspensão, fluidos e sinais de batida ou repintura.",
      "- Teste o carro em diferentes velocidades e observe ruídos e luzes no painel.",
      "",
      "## Negocie com segurança",
      "",
      "Combine pagamento por meios rastreáveis, exija recibo e transfira a documentação no mesmo ato. Nunca antecipe valores antes de ver o carro e os documentos.",
      "",
      "## Conclusão",
      "",
      "Com documentação verificada, preço comparado e vistoria feita, a compra de um usado fica muito mais tranquila."
    ),
  },
  {
    slug: "como-vender-seu-carro-com-seguranca",
    title: "Como vender seu carro com segurança",
    excerpt:
      "Avalie, anuncie e feche a venda do seu veículo evitando golpes e maximizando o valor.",
    category: "venda",
    coverImage: "/images/blog/venda-handshake.jpg",
    coverAlt: "Aperto de mãos e entrega de chave de carro fechando uma venda",
    tags: ["venda", "anúncio", "segurança"],
    content: body(
      "# Como vender seu carro com segurança",
      "",
      "Vender bem é precificar com critério, anunciar com qualidade e fechar o negócio sem cair em golpes.",
      "",
      "## Precifique pela FIPE e pelo mercado",
      "",
      "Parta da Tabela FIPE e ajuste pelo estado, quilometragem e demanda da sua região.",
      "",
      "## Prepare o carro e o anúncio",
      "",
      "- Faça uma limpeza completa e pequenos reparos de baixo custo.",
      "- Tire fotos com boa luz, mostrando todos os ângulos e detalhes.",
      "- Descreva itens, revisões e histórico com honestidade.",
      "",
      "## Cuidados contra golpes",
      "",
      "- Desconfie de pagamentos por comprovantes enviados por mensagem.",
      "- Só entregue o veículo com o valor efetivamente compensado na conta.",
      "- Faça a comunicação de venda assim que transferir a posse.",
      "",
      "## Documentação da transferência",
      "",
      "Reúna CRLV, recibo (ATPV-e) preenchido e assinado e comprovantes de quitação de débitos.",
      "",
      "## Conclusão",
      "",
      "Preço justo, bom anúncio e atenção aos pagamentos garantem uma venda rápida e segura."
    ),
  },
  {
    slug: "suvs-mais-buscados-na-regiao",
    title: "SUVs mais buscados na região",
    excerpt:
      "Levantamento dos modelos com maior procura, comparativos de preço e tendência de valorização.",
    category: "mercado",
    coverImage: "/images/blog/mercado-suv.jpg",
    coverAlt: "SUV moderno fotografado de frente em ambiente urbano",
    tags: ["mercado", "suv", "tendências"],
    content: body(
      "# SUVs mais buscados na região",
      "",
      "Os SUVs seguem em alta pela posição de dirigir elevada, espaço interno e boa revenda. Veja o que pesar antes de escolher.",
      "",
      "## Por que os SUVs dominam a procura",
      "",
      "- Conforto e versatilidade para cidade e estrada.",
      "- Sensação de segurança e porta-malas generoso.",
      "- Liquidez alta na hora de revender.",
      "",
      "## Compactos x médios",
      "",
      "SUVs compactos equilibram preço e consumo; os médios entregam mais espaço e itens de série, com custo de manutenção maior.",
      "",
      "## O que avaliar antes de comprar",
      "",
      "- Consumo real na sua rotina de uso.",
      "- Custo de peças, seguro e manutenção do modelo.",
      "- Histórico de valorização e demanda na sua cidade.",
      "",
      "## Conclusão",
      "",
      "Defina o porte ideal pelo seu uso e compare ofertas reais para encontrar o melhor custo-benefício."
    ),
  },
  {
    slug: "quando-trocar-os-pneus-do-seu-carro",
    title: "Quando trocar os pneus do seu carro",
    excerpt:
      "Sinais de desgaste, tempo de uso e padrões que indicam a hora certa de trocar sem comprometer a segurança.",
    category: "manutencao",
    coverImage: "/images/blog/manutencao-pneus.jpg",
    coverAlt: "Detalhe de pneus de carro empilhados em oficina",
    tags: ["manutenção", "pneus", "segurança"],
    content: body(
      "# Quando trocar os pneus do seu carro",
      "",
      "O pneu é o único contato do carro com o solo. Trocar na hora certa evita acidentes e melhora consumo e frenagem.",
      "",
      "## Verifique a profundidade dos sulcos",
      "",
      "O limite legal é 1,6 mm. Use o indicador de desgaste (TWI) — quando o sulco chega à marcação, é hora de trocar.",
      "",
      "## Observe a idade do pneu",
      "",
      "Mesmo pouco rodado, a borracha envelhece. Acima de 5 anos, redobre a atenção; perto de 10, considere a troca.",
      "",
      "## Sinais de alerta",
      "",
      "- Desgaste irregular (bordas ou centro), bolhas ou rachaduras.",
      "- Vibração no volante e perda de aderência na chuva.",
      "- Calibragem que cai com frequência.",
      "",
      "## Conclusão",
      "",
      "Calibre regularmente, faça rodízio e alinhamento e troque ao primeiro sinal de desgaste para rodar com segurança."
    ),
  },
  {
    slug: "financiamento-de-veiculos-vale-a-pena",
    title: "Financiamento de veículos: vale a pena?",
    excerpt:
      "Compare o CET, simule prazos e descubra quando financiar e quando faz mais sentido pagar à vista.",
    category: "financiamento",
    coverImage: "/images/blog/financiamento-calc.jpg",
    coverAlt: "Calculadora, caneta e documentos de financiamento sobre a mesa",
    tags: ["financiamento", "crédito", "cet"],
    content: body(
      "# Financiamento de veículos: vale a pena?",
      "",
      "Financiar dá acesso ao carro sem juntar o valor total — mas o custo do crédito pode pesar. Veja como decidir.",
      "",
      "## Olhe o CET, não só a parcela",
      "",
      "O Custo Efetivo Total reúne juros, tarifas e seguros. Duas propostas com a mesma parcela podem ter CET bem diferente.",
      "",
      "## Entrada e prazo",
      "",
      "- Quanto maior a entrada, menor o juro total pago.",
      "- Prazos longos reduzem a parcela, mas encarecem o carro no fim.",
      "",
      "## Quando pagar à vista faz sentido",
      "",
      "Se você tem o valor e o rendimento da reserva é menor que o juro do financiamento, à vista costuma sair na frente.",
      "",
      "## Conclusão",
      "",
      "Simule cenários, compare o CET entre bancos e escolha a opção que cabe no orçamento sem comprometer a reserva."
    ),
  },
  {
    slug: "melhores-bairros-para-rodar-na-cidade",
    title: "Melhores bairros para rodar na cidade",
    excerpt:
      "Roteiros urbanos, dicas de mobilidade e rotas para aproveitar mais o seu carro no dia a dia.",
    category: "cidades",
    coverImage: "/images/blog/banner-blog.jpg",
    coverAlt: "Carro em avenida arborizada com prédios ao fundo",
    tags: ["cidades", "mobilidade", "rotas"],
    content: body(
      "# Melhores bairros para rodar na cidade",
      "",
      "Conhecer os melhores trajetos torna o uso do carro mais prático, econômico e agradável.",
      "",
      "## Bairros com boa fluidez",
      "",
      "Prefira regiões com vias largas, estacionamento e acesso rápido a avenidas principais nos horários de pico.",
      "",
      "## Mobilidade e estacionamento",
      "",
      "- Identifique zonas azuis e estacionamentos seguros.",
      "- Evite gargalos conhecidos nos horários críticos.",
      "- Use apps de trânsito para rotas alternativas.",
      "",
      "## Lazer sobre rodas",
      "",
      "Mapeie parques, mirantes e polos gastronômicos com fácil acesso de carro para os fins de semana.",
      "",
      "## Conclusão",
      "",
      "Planejar os trajetos economiza tempo e combustível e deixa a rotina ao volante muito mais leve."
    ),
  },
  {
    slug: "carros-economicos-mais-buscados",
    title: "Carros econômicos mais buscados",
    excerpt:
      "Modelos que combinam baixo consumo, manutenção barata e boa revenda para quem quer economizar.",
    category: "mercado",
    coverImage: "/images/blog/mercado-suv.jpg",
    coverAlt: "Carros econômicos expostos em pátio de revenda",
    tags: ["mercado", "economia", "consumo"],
    content: body(
      "# Carros econômicos mais buscados",
      "",
      "Economia não é só o preço de etiqueta: é consumo, manutenção, seguro e revenda somados ao longo do uso.",
      "",
      "## O que faz um carro ser econômico",
      "",
      "- Boa média de consumo na cidade e na estrada.",
      "- Peças acessíveis e rede de oficinas ampla.",
      "- Seguro mais barato e desvalorização baixa.",
      "",
      "## Hatch x sedã de entrada",
      "",
      "Hatches compactos costumam ser mais baratos de rodar; sedãs de entrada oferecem mais espaço com consumo parecido.",
      "",
      "## Dicas para gastar menos",
      "",
      "- Mantenha revisões e calibragem em dia.",
      "- Dirija de forma suave e evite excesso de peso.",
      "",
      "## Conclusão",
      "",
      "Some todos os custos antes de decidir — o carro mais barato para comprar nem sempre é o mais barato para manter."
    ),
  },
  {
    slug: "ipva-2025-entenda-tudo",
    title: "IPVA 2025: entenda tudo",
    excerpt:
      "Como é calculado, prazos, descontos à vista e o que acontece se você atrasar o pagamento.",
    category: "financiamento",
    coverImage: "/images/blog/financiamento-calc.jpg",
    coverAlt: "Documentos de veículo e calculadora representando o IPVA",
    tags: ["financiamento", "ipva", "impostos"],
    content: body(
      "# IPVA 2025: entenda tudo",
      "",
      "O IPVA é um imposto anual sobre a propriedade do veículo. Planejar o pagamento evita juros e bloqueios.",
      "",
      "## Como é calculado",
      "",
      "O valor sai da multiplicação do preço venal do carro (base na tabela do estado) pela alíquota estadual, que varia conforme o tipo de veículo.",
      "",
      "## Prazos e formas de pagamento",
      "",
      "- À vista costuma ter desconto.",
      "- O parcelamento segue o calendário por final de placa.",
      "- Guarde os comprovantes para o licenciamento.",
      "",
      "## E se atrasar?",
      "",
      "Atraso gera multa e juros e impede o licenciamento — o que pode levar a multa por circular irregular e apreensão.",
      "",
      "## Conclusão",
      "",
      "Confira o calendário do seu estado, avalie o desconto à vista e mantenha o imposto em dia para rodar tranquilo."
    ),
  },
  {
    slug: "tecnologia-que-valoriza-seu-carro",
    title: "Tecnologia que valoriza seu carro",
    excerpt:
      "Itens de conforto, conectividade e segurança que aumentam o valor de revenda do veículo.",
    category: "mercado",
    coverImage: "/images/blog/mercado-suv.jpg",
    coverAlt: "Painel digital moderno de carro com central multimídia",
    tags: ["mercado", "tecnologia", "revenda"],
    content: body(
      "# Tecnologia que valoriza seu carro",
      "",
      "Alguns recursos tecnológicos fazem diferença real no conforto, na segurança e no preço de revenda.",
      "",
      "## Conectividade e multimídia",
      "",
      "Central com Android Auto/Apple CarPlay, câmera de ré e sensores são muito valorizados por quem compra usado.",
      "",
      "## Assistências de segurança",
      "",
      "- Controle de estabilidade e tração.",
      "- Frenagem autônoma e alerta de ponto cego.",
      "- Airbags adicionais e faróis de LED.",
      "",
      "## Vale a pena instalar depois?",
      "",
      "Acessórios de qualidade e bem instalados podem ajudar, mas itens de fábrica costumam pesar mais na avaliação.",
      "",
      "## Conclusão",
      "",
      "Priorize tecnologia de série e mantenha tudo funcionando: isso protege a segurança e o valor do seu carro."
    ),
  },
  {
    slug: "documentos-para-vender-carro",
    title: "Documentos para vender carro",
    excerpt: "A lista completa de documentos e passos para transferir o veículo sem pendências.",
    category: "venda",
    coverImage: "/images/blog/venda-handshake.jpg",
    coverAlt: "Documentos de veículo sendo entregues na venda de um carro",
    tags: ["venda", "documentação", "transferência"],
    content: body(
      "# Documentos para vender carro",
      "",
      "Organizar a papelada antes de anunciar acelera a venda e evita dor de cabeça na transferência.",
      "",
      "## O que você precisa ter em mãos",
      "",
      "- CRLV do ano vigente, sem débitos.",
      "- Recibo de transferência (ATPV-e) preenchido e assinado.",
      "- Comprovantes de quitação de IPVA, multas e licenciamento.",
      "",
      "## Passo a passo da transferência",
      "",
      "- Faça a vistoria quando exigida pelo Detran do estado.",
      "- Reconheça firma/assine digitalmente conforme a regra local.",
      "- Registre a comunicação de venda para se isentar de futuras infrações.",
      "",
      "## Cuidados finais",
      "",
      "Só entregue o veículo após confirmar o pagamento e guardar cópia de toda a documentação.",
      "",
      "## Conclusão",
      "",
      "Com a papelada em ordem e a comunicação de venda feita, a transferência fica rápida e segura para os dois lados."
    ),
  },
  {
    slug: "diferencas-entre-revisoes-e-manutencoes",
    title: "Diferenças entre revisões e manutenções",
    excerpt:
      "Entenda quando fazer revisão preventiva, o que realmente precisa ser trocado e como evitar gastos desnecessários.",
    category: "manutencao",
    coverImage: "/images/blog/manutencao-pneus.jpg",
    coverAlt: "Mecânico inspecionando o carro durante uma revisão",
    tags: ["manutenção", "revisão", "prevenção"],
    content: body(
      "# Diferenças entre revisões e manutenções",
      "",
      "Revisão e manutenção parecem a mesma coisa, mas têm objetivos diferentes — e confundir os dois custa caro.",
      "",
      "## Revisão preventiva",
      "",
      "Segue o plano do fabricante por quilometragem ou tempo: troca de óleo e filtros, checagem de itens e atualização do histórico.",
      "",
      "## Manutenção corretiva",
      "",
      "Acontece quando algo falha ou se desgasta: pastilhas, correia, bateria, suspensão. Quanto antes, menor o estrago.",
      "",
      "## Como evitar gastos desnecessários",
      "",
      "- Siga o manual e guarde notas e ordens de serviço.",
      '- Desconfie de trocas "preventivas" sem necessidade.',
      "- Compare orçamentos em oficinas de confiança.",
      "",
      "## Conclusão",
      "",
      "Revisão em dia previne a corretiva mais cara e mantém a garantia e o valor de revenda do carro."
    ),
  },
  {
    slug: "como-manter-revisao-em-dia",
    title: "Como manter a revisão em dia sem apertar o orçamento",
    excerpt:
      "Planeje a manutenção, separe custos previsíveis e evite surpresas que derrubam o valor de revenda.",
    category: "manutencao",
    coverImage: "/images/blog/manutencao-pneus.jpg",
    coverAlt: "Ferramentas e peças organizadas para a manutenção do carro",
    tags: ["manutenção", "orçamento", "planejamento"],
    content: body(
      "# Como manter a revisão em dia sem apertar o orçamento",
      "",
      "Manutenção previsível é manutenção barata. Com planejamento, dá para cuidar do carro sem sustos no fim do mês.",
      "",
      "## Crie um calendário de manutenção",
      "",
      "Anote quilometragem e datas das próximas trocas (óleo, filtros, correia, pneus) e antecipe-se a elas.",
      "",
      "## Reserve um valor mensal",
      "",
      '- Separe uma pequena quantia todo mês para o "fundo do carro".',
      "- Use-o só para manutenção e imprevistos mecânicos.",
      "",
      "## Economize sem abrir mão da qualidade",
      "",
      "- Compare oficinas e prefira peças de boa procedência.",
      "- Faça itens simples em dia para evitar danos maiores.",
      "",
      "## Conclusão",
      "",
      "Planejar e reservar transforma a manutenção em custo previsível — e protege a segurança e o valor do veículo."
    ),
  },
  {
    slug: "10-melhores-rotas-de-carro",
    title: "10 melhores rotas de carro para curtir no fim de semana",
    excerpt:
      "Destinos próximos, ideias de passeio e rotas para aproveitar o carro nos arredores da cidade.",
    category: "cidades",
    coverImage: "/images/blog/banner-blog.jpg",
    coverAlt: "Estrada cênica com carro viajando ao entardecer",
    tags: ["cidades", "viagem", "roteiros"],
    content: body(
      "# 10 melhores rotas de carro para curtir no fim de semana",
      "",
      "Um bom passeio de carro recarrega as energias. Planeje a rota, o veículo e a parada certa para aproveitar sem stress.",
      "",
      "## Antes de pegar a estrada",
      "",
      "- Cheque pneus, óleo, freios e estepe.",
      "- Calcule abastecimento e pontos de parada.",
      "- Leve documentos e kit de emergência.",
      "",
      "## Tipos de roteiro para escolher",
      "",
      "- Serra e mirantes para clima ameno e paisagem.",
      "- Litoral para o calor e a praia.",
      "- Campo e cidades históricas para gastronomia e descanso.",
      "",
      "## Dicas para a viagem render",
      "",
      "Saia cedo, respeite os limites de velocidade e faça pausas a cada duas horas para dirigir descansado.",
      "",
      "## Conclusão",
      "",
      "Com o carro revisado e a rota planejada, o fim de semana sobre rodas fica seguro e inesquecível."
    ),
  },
]);

/** Conjunto de categorias válidas (espelha admin-blog.service.BLOG_CATEGORIES). */
export const VALID_CATEGORIES = new Set([
  "compra",
  "venda",
  "manutencao",
  "mercado",
  "financiamento",
  "cidades",
]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Decide a ação de adoção de cada post legado, comparando com o que já existe
 * em `blog_posts` (mapa slug → row { id, slug, source, version, status }).
 *
 * Regras (idempotência + segurança):
 *   - slug ausente            → 'insert'
 *   - slug existe, source!='cms' → 'skip-conflict' (linha do motor SEO; não tocar)
 *   - slug existe, source='cms':
 *       - force=true          → 'update'  (re-adota, sobrescreve campos canônicos)
 *       - force=false         → 'skip-exists' (não sobrescreve post possivelmente editado)
 *
 * Função PURA — sem I/O. Retorna { plan: [...], counts: {...} }.
 */
export function buildAdoptionPlan(seedPosts, existingBySlug, { force = false } = {}) {
  const get =
    existingBySlug instanceof Map
      ? (slug) => existingBySlug.get(slug)
      : (slug) => existingBySlug?.[slug];

  const plan = seedPosts.map((post) => {
    const existing = get(post.slug) || null;
    let action;
    let reason;

    if (!existing) {
      action = "insert";
      reason = "novo post — não existe em blog_posts";
    } else if (String(existing.source) !== "cms") {
      action = "skip-conflict";
      reason = `slug já usado por linha source='${existing.source}' (não-CMS) — não sobrescrever`;
    } else if (force) {
      action = "update";
      reason = "já existe como CMS — --force re-adota (sobrescreve campos canônicos)";
    } else {
      action = "skip-exists";
      reason = "já existe como CMS — preservado (use --force para re-adotar)";
    }

    return { slug: post.slug, title: post.title, action, reason, existingId: existing?.id ?? null };
  });

  const counts = plan.reduce(
    (acc, p) => {
      acc[p.action] = (acc[p.action] || 0) + 1;
      return acc;
    },
    { insert: 0, update: 0, "skip-exists": 0, "skip-conflict": 0 }
  );

  return { plan, counts };
}

/** Valida a integridade do dataset (usado em teste e no início do script). */
export function validateLegacyDataset(posts = LEGACY_BLOG_POSTS) {
  const problems = [];
  const slugs = new Set();
  for (const p of posts) {
    if (!SLUG_RE.test(p.slug)) problems.push(`slug inválido: ${p.slug}`);
    if (slugs.has(p.slug)) problems.push(`slug duplicado: ${p.slug}`);
    slugs.add(p.slug);
    if (!p.title || p.title.trim().length < 5) problems.push(`title curto: ${p.slug}`);
    if (!p.excerpt || p.excerpt.length > 240) problems.push(`excerpt inválido: ${p.slug}`);
    if (!VALID_CATEGORIES.has(p.category)) problems.push(`category inválida: ${p.slug}`);
    if (!p.coverImage) problems.push(`coverImage ausente: ${p.slug}`);
    if (!p.coverAlt || !p.coverAlt.trim()) problems.push(`coverAlt ausente: ${p.slug}`);
    if (!Array.isArray(p.tags) || p.tags.length === 0) problems.push(`tags ausentes: ${p.slug}`);
    if (!p.content || p.content.trim().length < 300) problems.push(`content curto: ${p.slug}`);
  }
  return problems;
}
