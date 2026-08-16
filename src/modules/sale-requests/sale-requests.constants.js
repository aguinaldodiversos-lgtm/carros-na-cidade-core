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
 * Estados da solicitação NESTA FASE. Somente dois.
 *
 * `selected` e `completed` pertencem às fases 4.4/4.5 e não existem aqui — nem
 * na constante, nem no CHECK da migration 052. Criar o valor antes do endpoint
 * que o escreve é o erro que a migration 030 documenta em `ads.status`:
 * `draft`, `sold` e `expired` estão em `AD_STATUS` há fases, sem nenhum caminho
 * de escrita, e viraram lista morta que todo filtro precisa considerar.
 */
export const SALE_REQUEST_STATUS = Object.freeze({
  RECEIVING_OFFERS: "receiving_offers",
  CANCELLED: "cancelled",
});

export const SALE_REQUEST_STATUSES = Object.freeze(Object.values(SALE_REQUEST_STATUS));

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
  NOT_CANCELLABLE: "SALE_REQUEST_NOT_CANCELLABLE",
});

/**
 * Aviso de privacidade mostrado no formulário.
 *
 * Vive no backend porque é regra de produto derivada de uma limitação REAL da
 * infraestrutura: o bucket R2 é servido publicamente, então uma foto que mostra
 * a placa ou a fachada da casa fica acessível a quem tiver a URL, para sempre —
 * inclusive depois do cancelamento. A auditoria da Fase 4.0 registrou isso como
 * risco R-1.
 */
export const SALE_REQUEST_PHOTO_PRIVACY_NOTICE =
  "Evite fotos que mostrem a placa do veículo, documentos, pessoas ou a fachada da sua residência.";

export const SALE_REQUEST_ISSUES_PRIVACY_NOTICE =
  "Informe problemas conhecidos do veículo, se houver. Não inclua telefone, endereço, placa ou dados pessoais.";
