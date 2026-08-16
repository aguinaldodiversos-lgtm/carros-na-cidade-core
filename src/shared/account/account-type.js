/**
 * Tipo de conta (pending / CPF / CNPJ) — derivação e predicados SQL.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE MÓDULO EXISTE
 * ────────────────────────────────────────────────────────────────────────────
 * `users` não tem coluna `account_type`. O valor é DERIVADO de
 * `users.document_type` em dois lugares que precisam concordar:
 *
 *   1. `auth.service.js#buildSessionUser` — produz `req.user.account_type`,
 *      que `dealer.middleware.js#isDealerAccount` compara por igualdade
 *      estrita contra `ACCOUNT_TYPE.CNPJ`.
 *   2. Qualquer leitura administrativa que classifique contas (Admin U1).
 *
 * Uma segunda regra, ligeiramente diferente, produziria uma tela que classifica
 * como "CPF" alguém que o backend trata como "pending" — e o admin tomaria
 * decisão sobre um rótulo que não corresponde à permissão real da conta.
 *
 * `ACCOUNT_TYPE` é reexportado de `dealer.middleware.js` DE PROPÓSITO: o
 * vocabulário já tem dono, e duplicar o `Object.freeze` criaria dois conjuntos
 * de strings que só um teste manteria alinhados.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A REGRA (espelha `buildSessionUser`, verbatim em comportamento)
 * ────────────────────────────────────────────────────────────────────────────
 *   document_type ausente / NULL / ''      → 'pending'
 *   'cnpj' (case-insensitive, com espaços) → 'CNPJ'
 *   'cpf'  (case-insensitive, com espaços) → 'CPF'
 *   QUALQUER outro valor não-vazio ('rg')  → 'pending'
 *
 * O último caso é o contra-intuitivo, e é o que uma reimplementação ingênua
 * erraria: `buildSessionUser` chama `normalizeDocumentType`, que devolve `null`
 * para tudo que não seja exatamente 'cpf'/'cnpj' — e `null` cai em 'pending',
 * não em 'CPF'. O comentário de `dealer.middleware.js` descreve "qualquer outro
 * valor não-vazio vira CPF", mas o código não faz isso; quem manda é o código.
 *
 * DÍVIDA CONHECIDA: `buildSessionUser` mantém a sua própria cópia privada desta
 * regra. Unificar exige mexer em `auth.service.js`, que não tem suíte de teste
 * dedicada — mudança para um commit próprio, com cobertura antes. Até lá, o
 * teste `tests/admin/admin-users-account-type.test.js` fixa a tabela de casos.
 */

import { ACCOUNT_TYPE } from "../middlewares/dealer.middleware.js";

export { ACCOUNT_TYPE };

/** Valores aceitos por filtros administrativos de tipo de conta. */
export const ACCOUNT_TYPE_VALUES = Object.freeze(Object.values(ACCOUNT_TYPE));

export function isValidAccountType(value) {
  return ACCOUNT_TYPE_VALUES.includes(value);
}

/**
 * Deriva o tipo de conta a partir de `users.document_type`.
 *
 * @param {unknown} documentType — valor cru da coluna (string | null | undefined)
 * @returns {'pending'|'CPF'|'CNPJ'}
 */
export function deriveAccountType(documentType) {
  const normalized = typeof documentType === "string" ? documentType.trim().toLowerCase() : "";

  if (normalized === "cnpj") return ACCOUNT_TYPE.CNPJ;
  if (normalized === "cpf") return ACCOUNT_TYPE.CPF;
  return ACCOUNT_TYPE.PENDING;
}

/**
 * Predicado SQL equivalente a `deriveAccountType(col) === accountType`.
 *
 * `LOWER(BTRIM(...))` é a normalização que o projeto já usa para comparar
 * `document_type` no fan-out de Compradores Ativos
 * (`purchase-intents.repository.js`), então a comparação aqui casa exatamente
 * as mesmas linhas que decidem quem recebe notificação de procura.
 *
 * 'pending' é o COMPLEMENTO ('não é cpf nem cnpj'), e não uma lista de valores:
 * NULL, '' e lixo herdado ('rg', 'PF') pertencem todos a ele — igual ao
 * fallback de `deriveAccountType`. `COALESCE` antes do `IN` é obrigatório
 * porque `NULL IN (...)` é NULL, não FALSE, e `NOT NULL` também é NULL — sem
 * ele, toda conta com `document_type` NULL sumiria do filtro "Pendente", que é
 * justamente a fatia que a Admin U1 existe para tornar visível.
 *
 * @param {string} accountType — 'pending' | 'CPF' | 'CNPJ'
 * @param {string} column — expressão SQL da coluna (ex.: 'u.document_type')
 * @returns {string} fragmento SQL sem parâmetros (nada vem do usuário)
 */
export function accountTypeSqlPredicate(accountType, column = "u.document_type") {
  const normalized = `LOWER(BTRIM(COALESCE(${column}, '')))`;

  if (accountType === ACCOUNT_TYPE.CNPJ) return `${normalized} = 'cnpj'`;
  if (accountType === ACCOUNT_TYPE.CPF) return `${normalized} = 'cpf'`;
  if (accountType === ACCOUNT_TYPE.PENDING) return `${normalized} NOT IN ('cpf', 'cnpj')`;

  throw new Error(`accountTypeSqlPredicate: tipo de conta inválido: ${accountType}`);
}
