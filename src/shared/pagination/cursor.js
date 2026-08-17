// Cursor opaco de paginação por TUPLA (timestamp, id).
//
// ────────────────────────────────────────────────────────────────────────────
// POR QUE TUPLA, E NÃO SÓ O TIMESTAMP
// ────────────────────────────────────────────────────────────────────────────
// Com `created_at < $cursor` puro, duas linhas gravadas no mesmo instante caem
// no mesmo lado do corte: uma delas SOME entre páginas. Trocar para `<=`
// inverte o defeito e passa a REPETIR a linha da borda. Só a comparação de
// tupla — `(created_at, id) < ($1, $2)` — corta exatamente uma vez.
//
// O `id` é o desempate porque é único e monotônico dentro da tabela; qualquer
// outra coluna precisaria provar unicidade para servir.
//
// ────────────────────────────────────────────────────────────────────────────
// POR QUE OPACO (base64url)
// ────────────────────────────────────────────────────────────────────────────
// O cliente recebe uma string sem estrutura aparente e a devolve intacta. Não é
// segurança — o conteúdo é trivialmente decodificável — é CONTRATO: um cursor
// legível convida o cliente a montar o próprio, e a partir daí a ordenação do
// servidor não pode mais mudar sem quebrar quem estiver por aí.
//
// ────────────────────────────────────────────────────────────────────────────
// POR QUE TOLERANTE A LIXO
// ────────────────────────────────────────────────────────────────────────────
// `decodeCursor` devolve `null` para qualquer entrada inválida em vez de lançar.
// Um link velho colado da barra de endereços, um cursor de outra tabela ou um
// base64 truncado devolvem a PRIMEIRA página — que é o que o usuário espera —
// em vez de um 400 numa listagem que ele só queria abrir.
//
// ────────────────────────────────────────────────────────────────────────────
// RELAÇÃO COM O PRODUTO 1
// ────────────────────────────────────────────────────────────────────────────
// `purchase-intents.validation.js` e `notifications.validation.js` mantêm cada
// um a sua própria cópia deste codec. Esta versão é a genérica (o nome do campo
// de tempo é parâmetro) e nasce como a canônica para o que vier depois.
//
// As cópias existentes NÃO foram migradas nesta fase de propósito: `purchase_intents`
// está na lista de domínios protegidos da Fase 4.1, e trocar a paginação de um
// produto em produção para entregar outro produto é risco sem contrapartida.
// TODO(4.2+): unificar, com a suíte do Produto 1 verde antes e depois.

/**
 * @param {unknown} raw — cursor recebido do cliente
 * @param {{ field?: string }} [options] — nome do campo de tempo no objeto devolvido
 * @returns {{ [key: string]: string|number, id: number }|null}
 */
export function decodeCursor(raw, { field = "createdAt" } = {}) {
  if (raw == null || String(raw).trim() === "") return null;

  try {
    const decoded = Buffer.from(String(raw), "base64url").toString("utf8");

    // `lastIndexOf` e não `split`: o timestamp ISO não contém "|", mas usar o
    // ÚLTIMO separador mantém a decodificação correta mesmo que um campo futuro
    // passe a conter o caractere.
    const separator = decoded.lastIndexOf("|");
    if (separator <= 0) return null;

    const timestamp = decoded.slice(0, separator);
    const id = Number.parseInt(decoded.slice(separator + 1), 10);

    if (!Number.isInteger(id) || id <= 0) return null;
    if (Number.isNaN(Date.parse(timestamp))) return null;

    return { [field]: timestamp, id };
  } catch {
    return null;
  }
}

/**
 * Inverso de `decodeCursor`, a partir da ÚLTIMA linha da página.
 *
 * Devolve `null` quando a linha não tem os dois campos — quem chama trata isso
 * como "não há próxima página", que é o comportamento seguro: um cursor
 * incompleto faria a página seguinte recomeçar do início e paginar para sempre.
 *
 * @param {{ id?: unknown }} row
 * @param {{ column?: string }} [options] — nome da coluna de tempo na linha
 * @returns {string|null}
 */
export function encodeCursor(row, { column = "created_at" } = {}) {
  const rawTimestamp = row?.[column];
  if (rawTimestamp == null || row?.id == null) return null;

  const timestamp =
    rawTimestamp instanceof Date ? rawTimestamp.toISOString() : String(rawTimestamp);

  return Buffer.from(`${timestamp}|${row.id}`, "utf8").toString("base64url");
}

/**
 * `limit` da query → inteiro dentro de [1, max]. Ausente, zero, negativo ou
 * absurdo cai no default em vez de virar erro: paginação é detalhe de
 * transporte, e um `?limit=abc` não deve impedir alguém de ver a própria lista.
 */
export function parseLimit(raw, { defaultLimit, maxLimit }) {
  if (raw == null || String(raw).trim() === "") return defaultLimit;

  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return defaultLimit;

  return Math.min(parsed, maxLimit);
}
