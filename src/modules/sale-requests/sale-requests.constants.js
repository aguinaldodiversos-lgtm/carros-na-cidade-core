// Constantes do domínio "Venda seu carro para lojas" (Produto 2, Fase 4.1).
// Espelho no frontend: frontend/lib/sale-requests/api.ts — manter em sincronia.
//
// Este módulo NÃO redefine taxonomia de veículo. Câmbio e combustível vêm dos
// normalizadores canônicos dos anúncios (`ads.storage-normalize.js`), que são a
// fonte única já usada por `ads` e por `purchase_intents`. Uma segunda lista
// aqui divergiria da primeira no dia em que alguém adicionasse um valor num lado
// só — e as fases 4.2+ vão comparar solicitação com estoque, então as duas
// pontas precisam falar o mesmo vocabulário.

/**
 * Estados da solicitação. TRÊS, e cada um com um writer real.
 *
 * `receiving_offers` — o INSERT da publicação (migration 052);
 * `offer_selected`   — a transação de seleção da Fase 4.4;
 * `cancelled`        — `cancelForOwner`.
 *
 * `completed`, `sold`, `expired`, `reopened` e afins continuam NÃO existindo:
 * nenhum endpoint os escreve. Criar o valor antes do caminho que o grava é o
 * erro que a migration 030 documenta em `ads.status` — `draft`, `sold` e
 * `expired` estão em `AD_STATUS` há fases, sem nenhum caminho de escrita, e
 * viraram lista morta que todo filtro precisa considerar.
 *
 * `offer_selected` (e não `selected`, que a 052 previu em comentário) porque
 * "selecionado" sozinho não diz O QUE foi selecionado — e este produto vai
 * selecionar outra coisa na 4.5, a avaliação presencial.
 */
export const SALE_REQUEST_STATUS = Object.freeze({
  RECEIVING_OFFERS: "receiving_offers",
  OFFER_SELECTED: "offer_selected",

  // ──────────────────────────────────────────────────────────────────────────
  // FASE 4.5 — a avaliação presencial e a proposta final
  // ──────────────────────────────────────────────────────────────────────────
  // `offer_selected` deixou de ser terminal: agora é o começo desta etapa.
  //
  // Os estados do AGENDAMENTO (a loja ainda não mandou horários; mandou e o
  // proprietário ainda não escolheu) NÃO estão aqui de propósito — eles vivem em
  // `sale_request_inspections.schedule_status`. Do ponto de vista de quem está
  // vendendo o carro, os dois casos são a mesma coisa: a visita ainda não foi
  // marcada. Promovê-los a status da oportunidade obrigaria todo filtro, feed e
  // DTO do domínio a conhecer quatro valores que não mudam nada para eles.
  INSPECTION_SCHEDULED: "inspection_scheduled",
  INSPECTION_COMPLETED: "inspection_completed",
  FINAL_OFFER_SUBMITTED: "final_offer_submitted",
  /** A loja avaliou presencialmente e decidiu NÃO apresentar proposta. */
  FINAL_OFFER_DECLINED: "final_offer_declined",

  CANCELLED: "cancelled",
});

export const SALE_REQUEST_STATUSES = Object.freeze(Object.values(SALE_REQUEST_STATUS));

/**
 * Os estados em que a solicitação TEM uma proposta preliminar selecionada.
 *
 * Espelha, em JavaScript, a partição do CHECK
 * `sale_requests_selected_offer_coherence_check` (migration 058). Existe como
 * lista PRÓPRIA — e não como "tudo menos receiving_offers e cancelled" — pelo
 * mesmo motivo que o CHECK enumera os dois lados: um estado novo criado por uma
 * fase futura não entra em nenhuma das listas, e o erro aparece na hora em vez
 * de o estado ser silenciosamente colocado do lado errado.
 *
 * Foi exatamente esse o defeito que a 058 precisou consertar na 057.
 */
export const SALE_REQUEST_SELECTED_STATUSES = Object.freeze([
  SALE_REQUEST_STATUS.OFFER_SELECTED,
  SALE_REQUEST_STATUS.INSPECTION_SCHEDULED,
  SALE_REQUEST_STATUS.INSPECTION_COMPLETED,
  SALE_REQUEST_STATUS.FINAL_OFFER_SUBMITTED,
  SALE_REQUEST_STATUS.FINAL_OFFER_DECLINED,
]);

/**
 * Estados TERMINAIS nesta fase — a loja já disse o que tinha a dizer.
 *
 * `final_offer_submitted` espera a decisão do proprietário (Fase 4.6);
 * `final_offer_declined` encerrou sem proposta. Nenhum dos dois reabre a disputa
 * nem volta para `receiving_offers` — essa é uma decisão de produto da 4.6, e
 * tomá-la aqui por omissão seria decidi-la sem ninguém perceber.
 */
export const SALE_REQUEST_POST_DECISION_STATUSES = Object.freeze([
  SALE_REQUEST_STATUS.FINAL_OFFER_SUBMITTED,
  SALE_REQUEST_STATUS.FINAL_OFFER_DECLINED,
]);

/**
 * Condição declarada pelo dono. Lista curta e fechada de propósito: campo livre
 * aqui viraria texto para moderar e não serviria para nenhuma comparação futura
 * entre o declarado e o encontrado na avaliação presencial (Fase 4.5).
 */
export const DECLARED_CONDITION = Object.freeze({
  EXCELENTE: "excelente",
  BOM: "bom",
  REGULAR: "regular",
  PRECISA_REPAROS: "precisa_reparos",
});

export const DECLARED_CONDITIONS = Object.freeze(Object.values(DECLARED_CONDITION));

/** Rótulos pt-BR. Espelhados no frontend. */
export const DECLARED_CONDITION_LABEL = Object.freeze({
  [DECLARED_CONDITION.EXCELENTE]: "Excelente",
  [DECLARED_CONDITION.BOM]: "Bom",
  [DECLARED_CONDITION.REGULAR]: "Regular",
  [DECLARED_CONDITION.PRECISA_REPAROS]: "Precisa de reparos",
});

/**
 * Fotos por solicitação.
 *
 * O MÍNIMO existe por uma razão comercial, não estética: um lojista não faz
 * oferta preliminar sem ver o carro. Quatro é o menor conjunto que cobre frente,
 * traseira, lateral e interior.
 *
 * O MÁXIMO protege o storage e a tela. Fica abaixo do teto físico do pipeline
 * (`VEHICLE_IMAGE_MAX_FILES`, default 24) de propósito: este é o limite do
 * PRODUTO, e o do pipeline é o limite da INFRAESTRUTURA.
 */
export const SALE_REQUEST_PHOTOS = Object.freeze({
  MIN: 4,
  MAX: 12,
});

/**
 * Teto de solicitações ABERTAS por usuário.
 *
 * É a mitigação de duplicidade e spam escolhida pela auditoria da Fase 4.0 no
 * lugar de coletar placa: resolve "a mesma pessoa publica o mesmo carro cinco
 * vezes" sem criar nenhum dado sensível novo. Cancelada não conta — quem
 * cancelou e quer republicar não fica preso.
 */
export const SALE_REQUEST_ACTIVE_LIMIT = 3;

/** Paginação. Mesmo formato de `PURCHASE_INTENT_PAGE` e `NOTIFICATION_PAGE`. */
export const SALE_REQUEST_PAGE = Object.freeze({
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 50,
});

/**
 * Limites de entrada.
 *
 * `YEAR_MIN` é o piso do CHECK da migration. O TETO é dinâmico
 * (`maxModelYear()`) porque o ano-modelo legítimo pode ser o próximo ano civil —
 * um carro 2027 é vendido em 2026. O CHECK do banco usa 2100 como faixa larga
 * anti-digitação; esta função é a regra fina, que dá mensagem legível.
 *
 * `MILEAGE_MAX` é sanidade, não regra: nenhum carro de passeio chega a dois
 * milhões de quilômetros, e o valor pega o erro de unidade (metros digitados
 * como quilômetros).
 */
export const SALE_REQUEST_LIMITS = Object.freeze({
  YEAR_MIN: 1950,
  MILEAGE_MAX: 2_000_000,
  KNOWN_ISSUES_MAX: 1000,
  BRAND_MAX: 80,
  MODEL_DESCRIPTION_MAX: 180,
});

/** Teto de ano aceito na publicação: o próximo ano civil (UTC). */
export function maxModelYear(now = new Date()) {
  return now.getUTCFullYear() + 1;
}

// ────────────────────────────────────────────────────────────────────────────
// O PISO DO PROPRIETÁRIO (Fase 4.3.3)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Desconto RECOMENDADO sobre a referência FIPE para venda a lojistas.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * RECOMENDAÇÃO, NUNCA REGRA
 * ────────────────────────────────────────────────────────────────────────────
 * A loja compra para revender: sobre o valor pago ainda entram preparação,
 * garantia, impostos e margem. Um piso colado na FIPE não recebe proposta
 * nenhuma — e o proprietário descobre isso depois de uma semana de silêncio,
 * sem entender por quê.
 *
 * Por isso o número existe: para ser DITO na tela antes da publicação. Ele NÃO
 * é validado no servidor, e publicar acima do recomendado é um caminho normal
 * do produto — quem quer valor de mercado tem o anúncio convencional, e a tela
 * oferece esse caminho em vez de recusar a publicação.
 *
 * Transformar isto num `if` do backend seria trocar orientação por proibição, e
 * a pessoa nem saberia que existe outro produto para o caso dela.
 *
 * Espelhado no frontend em `frontend/lib/sale-requests/pricing.ts` — os dois
 * lados precisam do mesmo número, e há teste de sincronia.
 */
export const SALE_REQUEST_DEALER_DISCOUNT = 0.15;

/** FIPE × este fator = teto da faixa recomendada. Derivado, para não repetir 0,85 solto. */
export const SALE_REQUEST_RECOMMENDED_RATIO = 1 - SALE_REQUEST_DEALER_DISCOUNT;

/**
 * Códigos de erro estáveis. O frontend discrimina por `code`, nunca por parsing
 * de mensagem — mesmo contrato de `ad-ownership.js` e do módulo de ofertas.
 */
export const SALE_REQUEST_CODE = Object.freeze({
  INVALID_FIELD: "SALE_REQUEST_INVALID_FIELD",
  INVALID_USER: "SALE_REQUEST_INVALID_USER",
  OWNER_ONLY: "SALE_REQUEST_OWNER_ONLY",
  CITY_REQUIRED: "SALE_REQUEST_CITY_REQUIRED",
  ACTIVE_LIMIT_REACHED: "SALE_REQUEST_ACTIVE_LIMIT_REACHED",
  INVALID_PHOTO: "SALE_REQUEST_INVALID_PHOTO",
  PHOTO_COUNT: "SALE_REQUEST_PHOTO_COUNT",
  /**
   * O STORAGE falhou — a foto não tem defeito nenhum.
   *
   * Existe separado de `INVALID_PHOTO` porque as duas exigem reações opostas do
   * usuário: `INVALID_PHOTO` pede outro arquivo; este pede a MESMA foto de novo,
   * daqui a pouco. Colapsar os dois foi o bug do smoke da Fase 4.1 — o bucket não
   * existia e a pessoa foi mandada converter uma JPEG que estava perfeita.
   */
  PHOTO_STORAGE_UNAVAILABLE: "SALE_REQUEST_PHOTO_STORAGE_UNAVAILABLE",

  /**
   * A solicitação não está num estado que aceite cancelamento.
   *
   * O código existia desde a 4.1 sem consumidor. Ele ganhou um na Fase 4.4:
   * depois que uma proposta é selecionada, cancelar deixa de ser possível.
   *
   * Até esta fase o `UPDATE` de cancelamento simplesmente não casava linha
   * nenhuma nesse caso (o `AND status = 'receiving_offers'` já estava lá) e o
   * service respondia 200 com `changed: false` — a resposta idempotente, correta
   * para o SEGUNDO clique em "cancelar" e enganosa para o PRIMEIRO clique depois
   * de uma seleção: a tela diria "cancelada" sobre uma solicitação que continua
   * `offer_selected`, e a loja escolhida continuaria vendo a oportunidade dela.
   */
  NOT_CANCELLABLE: "SALE_REQUEST_NOT_CANCELLABLE",

  // ──────────────────────────────────────────────────────────────────────────
  // SELEÇÃO DE PROPOSTA (Fase 4.4)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * O `offer_id` enviado não é uma proposta desta solicitação.
   *
   * Cobre os dois casos — id inexistente e proposta de OUTRA solicitação — com
   * a mesma resposta, de propósito: distinguir contaria a quem sonda ids qual
   * deles existe. Não é 404 da solicitação (essa o dono possui e acabou de
   * abrir), é 404 da PROPOSTA dentro dela.
   */
  OFFER_NOT_FOUND: "SALE_REQUEST_OFFER_NOT_FOUND",

  /**
   * A proposta apontada JÁ NÃO É a proposta atual daquela loja (§9).
   *
   * O caso real: o proprietário está com a tela aberta desde antes de a loja
   * aumentar. Ele veria R$ 62.500 e selecionaria a oferta #10, enquanto a loja
   * já está em R$ 65.000 na oferta #18. Aceitar seria congelar um valor que a
   * loja já superou — e o proprietário escolheria menos dinheiro sem saber.
   *
   * Código próprio porque é o único erro desta tela que se resolve sem sair
   * dela: basta recarregar as propostas. A resposta carrega o valor atual junto,
   * pelo mesmo motivo que a recusa de proposta carrega o líder.
   */
  OFFER_STALE: "SALE_REQUEST_OFFER_STALE",

  /**
   * Já existe uma seleção nesta solicitação, e é OUTRA (§11).
   *
   * Separado de `OFFER_STALE` porque a causa e a reação são diferentes: ali a
   * disputa continua e a tela se corrige recarregando; aqui a disputa ACABOU, e
   * não há segunda escolha a fazer (§8). Repetir a MESMA seleção não passa por
   * este código — é idempotente e devolve 200.
   */
  ALREADY_SELECTED: "SALE_REQUEST_ALREADY_SELECTED",

  /**
   * A solicitação não está mais recebendo propostas e não pode ser selecionada.
   *
   * Hoje significa `cancelled` — a própria pessoa encerrou. Distinto de
   * `ALREADY_SELECTED` porque lá existe uma escolha para mostrar, e aqui não
   * existe nada: a tela precisa dizer coisas diferentes.
   */
  SELECTION_CLOSED: "SALE_REQUEST_SELECTION_CLOSED",
});

/**
 * Mensagem pública de indisponibilidade de storage.
 *
 * Diz o que aconteceu ("agora não deu"), o que fazer ("tente de novo") e NADA
 * sobre a causa. Bucket, endpoint, account id, nome de variável de ambiente e
 * erro do SDK ficam só no log — a resposta HTTP não carrega nenhum deles.
 */
export const SALE_REQUEST_PHOTO_STORAGE_MESSAGE =
  "Não foi possível enviar a foto agora. Tente novamente em instantes.";

/** Mensagem pública quando o ARQUIVO é o problema e não há texto acionável melhor. */
export const SALE_REQUEST_PHOTO_INPUT_MESSAGE =
  "Não foi possível enviar uma das fotos. Use JPG, PNG ou WebP de até 10 MB.";

// ────────────────────────────────────────────────────────────────────────────
// FICHA DE AVALIAÇÃO PRELIMINAR (evolução da 4.1)
// ────────────────────────────────────────────────────────────────────────────
// Tudo abaixo descreve o que o PROPRIETÁRIO declara sobre o próprio carro, para
// que o lojista decida se vale abrir conversa. NÃO é laudo, NÃO substitui
// vistoria e NÃO é garantia — os rótulos dizem "conhecido/declarado" justamente
// para que nenhum valor aqui possa ser lido como atestado técnico da plataforma.
//
// TRÊS ESTADOS, NUNCA BOOLEAN
// ---------------------------
// Onde a pergunta admite "Não sei informar", o vocabulário tem TRÊS valores.
// Reduzir para boolean forçaria "não sei" a virar `false`, e `false` neste
// domínio é uma afirmação com valor comercial: "este carro NÃO tem
// financiamento" é diferente de "o dono não sabe". A diferença aparece no
// primeiro lance que um lojista fizer.

/** Sim / Não / Não sei. Financiamento, multas, leilão e sinistro. */
export const YES_NO_UNKNOWN = Object.freeze({
  YES: "yes",
  NO: "no",
  UNKNOWN: "unknown",
});

export const YES_NO_UNKNOWN_VALUES = Object.freeze(Object.values(YES_NO_UNKNOWN));

/**
 * Estado dos pneus.
 *
 * Escala fechada e ordenada por custo imediato para o comprador: `new` não gera
 * despesa, `replace_now` gera despesa no ato. É a razão de o campo ser
 * estruturado e não texto livre — "bons" digitado por mil pessoas não compara
 * com nada, e a Fase 4.2 precisa comparar.
 */
export const TIRE_CONDITION = Object.freeze({
  NEW: "new",
  GOOD: "good",
  HALF_LIFE: "half_life",
  REPLACE_SOON: "replace_soon",
  REPLACE_NOW: "replace_now",
  UNKNOWN: "unknown",
});

export const TIRE_CONDITIONS = Object.freeze(Object.values(TIRE_CONDITION));

/** Situação do IPVA. `installments` e `open` admitem valor pendente. */
export const IPVA_STATUS = Object.freeze({
  PAID: "paid",
  INSTALLMENTS: "installments",
  OPEN: "open",
  UNKNOWN: "unknown",
});

export const IPVA_STATUSES = Object.freeze(Object.values(IPVA_STATUS));

/** Situação do licenciamento. */
export const LICENSING_STATUS = Object.freeze({
  OK: "ok",
  PENDING: "pending",
  UNKNOWN: "unknown",
});

export const LICENSING_STATUSES = Object.freeze(Object.values(LICENSING_STATUS));

/**
 * Laudo cautelar — UM campo, não dois.
 *
 * A alternativa natural seria `has_caution_report` (sim/não/não sei) mais
 * `caution_report_result` (aprovado/com apontamentos/reprovado). Duas colunas
 * independentes permitem o estado IMPOSSÍVEL "não possui laudo + resultado
 * aprovado", e nada no banco o impediria: seriam dois CHECKs que não se
 * enxergam. Um único vocabulário torna esse estado inexprimível em vez de
 * apenas proibido.
 *
 * `not_available` = não possui laudo. `unknown` = não sabe se possui.
 */
export const CAUTION_REPORT_STATUS = Object.freeze({
  NOT_AVAILABLE: "not_available",
  APPROVED: "approved",
  APPROVED_WITH_NOTES: "approved_with_notes",
  REJECTED: "rejected",
  UNKNOWN: "unknown",
});

export const CAUTION_REPORT_STATUSES = Object.freeze(Object.values(CAUTION_REPORT_STATUS));

/**
 * Motor, câmbio e suspensão.
 *
 * `ok` significa SEM PROBLEMA CONHECIDO PELO PROPRIETÁRIO — não "mecanicamente
 * perfeito". O rótulo da tela diz isso com todas as letras, e o vocabulário é
 * nomeado assim para que nenhuma fase futura leia `ok` como aprovação técnica.
 */
export const MECHANICAL_CONDITION = Object.freeze({
  OK: "ok",
  ISSUE: "issue",
  UNKNOWN: "unknown",
});

export const MECHANICAL_CONDITIONS = Object.freeze(Object.values(MECHANICAL_CONDITION));

/** Os três conjuntos mecânicos, na ordem em que a ficha os apresenta. */
export const MECHANICAL_PARTS = Object.freeze(["engine", "gearbox", "suspension"]);

/** Lataria e pintura: o estado geral declarado. */
export const BODY_PAINT_STATUS = Object.freeze({
  ISSUES: "issues",
  NONE: "none",
  UNKNOWN: "unknown",
});

export const BODY_PAINT_STATUSES = Object.freeze(Object.values(BODY_PAINT_STATUS));

/**
 * Tipos de detalhe de lataria/pintura. Múltipla escolha, e só fazem sentido
 * quando `body_paint_status = 'issues'` — a validação impõe isso nos dois
 * sentidos (issues exige ao menos um; none/unknown exige nenhum).
 */
export const BODY_PAINT_ISSUE = Object.freeze({
  SCRATCHES: "scratches",
  DENTS: "dents",
  WORN_PAINT: "worn_paint",
  REPAINTED_PARTS: "repainted_parts",
  COLLISION_REPAIR: "collision_repair",
});

export const BODY_PAINT_ISSUES = Object.freeze(Object.values(BODY_PAINT_ISSUE));

/**
 * Limites dos campos NOVOS.
 *
 * `MONEY_MAX` existe pelo mesmo motivo de `MILEAGE_MAX`: pegar o erro de
 * digitação (centavos digitados como reais) sem virar regra de negócio. Cabe em
 * `NUMERIC(14,2)` com folga.
 */
export const SALE_REQUEST_EVALUATION_LIMITS = Object.freeze({
  MECHANICAL_NOTES_MAX: 500,
  BODY_PAINT_NOTES_MAX: 500,
  MONEY_MAX: 9_999_999.99,
});

// ────────────────────────────────────────────────────────────────────────────
// TEXTO DE FORMULÁRIO NÃO VIVE MAIS AQUI
// ────────────────────────────────────────────────────────────────────────────
// Este módulo já exportou `SALE_REQUEST_PHOTO_PRIVACY_NOTICE` e
// `SALE_REQUEST_ISSUES_PRIVACY_NOTICE`. Nenhum dos dois era importado por
// caminho nenhum do backend — a tela consome os literais espelhados em
// `frontend/lib/sale-requests/api.ts`.
//
// O de FOTOS foi removido junto com o aviso que ele descrevia: enumerar dados
// sensíveis (placa, documentos, pessoas, fachada), mesmo para desaconselhá-los,
// traz esses dados para o centro da experiência. A orientação da tela passou a
// ser puramente comercial.
//
// O de PROBLEMAS CONHECIDOS foi removido daqui apenas como export morto; o
// texto continua sendo renderizado pelo formulário a partir do espelho do
// frontend, sem alteração de comportamento.
//
// A limitação de infraestrutura que motivou o aviso original (bucket R2 público,
// URL de foto válida para sempre) NÃO mudou e continua registrada como risco
// R-1 no relatório da Fase 4.0 — documentação técnica é o lugar dela.
