/**
 * Acesso a dados da ÁREA DO LOJISTA. Todas as queries são parametrizadas.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * REGRA DE OURO: A CIDADE ESTÁ SEMPRE NO `WHERE`
 * ────────────────────────────────────────────────────────────────────────────
 * Nenhuma função aceita "o id da solicitação" sozinho. Toda leitura carrega
 * `cityId` — a autorização territorial acontece DENTRO da query, não num `if` do
 * service. É o mesmo desenho do escopo por dono em
 * `sale-requests.repository.js`: apagar a cláusula faz o teste de IDOR falhar,
 * em vez de fazer um `if` esquecido passar despercebido.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * `DEALER_COLUMNS` — A ALLOWLIST QUE A FASE 4.1 PROMETEU
 * ────────────────────────────────────────────────────────────────────────────
 * `sale-requests.repository.js` já dizia, em comentário, que a allowlist do dono
 * era "o contrato que a Fase 4.2 vai espelhar num `DEALER_COLUMNS` separado". É
 * este arquivo.
 *
 * `owner_user_id` NÃO está na lista, e não existe JOIN com `users` em query
 * nenhuma deste módulo. Não é uma omissão de conveniência: é o que torna
 * ESTRUTURALMENTE impossível vazar nome, e-mail, telefone, WhatsApp, CPF,
 * documento ou endereço do vendedor. Não há coluna sensível chegando ao service
 * para depois ser escondida no DTO — ela não sai do banco.
 *
 * Com `SELECT *`, uma coluna sensível adicionada a `sale_requests` amanhã seria
 * entregue de graça aos dois públicos. Com a lista, ela precisa ser escrita
 * aqui, à mão, por alguém.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * FROM/JOIN/WHERE MONTADOS UMA VEZ SÓ
 * ────────────────────────────────────────────────────────────────────────────
 * A listagem e a CONTAGEM compartilham `buildFeedSource()`, que devolve o
 * `FROM ... JOIN ... WHERE ...` inteiro — não só o `WHERE`.
 *
 * A divergência entre os dois é um bug que este repositório já viu em produção:
 * o `countQuery` da busca pública compartilhava o `whereClause` mas não os
 * JOINs, e filtros que referenciavam as tabelas ausentes quebravam com "missing
 * FROM-clause entry" — disfarçado de "0 anúncios" pelo modo seguro. Compartilhar
 * a fonte inteira torna a divergência inexprimível: não existe um segundo lugar
 * onde o FROM possa ficar para trás.
 */
import { query } from "../../infrastructure/database/db.js";
import { SALE_REQUEST_STATUS } from "./sale-requests.constants.js";
import { SALE_OPPORTUNITY_SORT_SPEC } from "./sale-requests.dealer.constants.js";

/**
 * Colunas devolvidas ao LOJISTA.
 *
 * É deliberadamente a MESMA ficha que o dono vê da própria solicitação — o
 * produto inteiro existe para que o lojista possa avaliar risco e custo antes de
 * gastar uma visita, e esconder metade da ficha dele esvaziaria a fase. O que
 * muda entre os dois públicos não é a ficha: é a ausência de qualquer coluna que
 * identifique a PESSOA.
 */
const DEALER_COLUMNS = `
  sr.id,
  sr.brand,
  sr.brand_slug,
  sr.model,
  sr.model_slug,
  sr.fipe_model_description,
  sr.fipe_code,
  sr.fipe_reference_value,
  sr.fipe_reference_at,
  sr.year,
  sr.mileage,
  sr.transmission,
  sr.fuel_type,
  sr.declared_condition,
  sr.known_issues,

  sr.tire_condition,
  sr.financing_status,
  sr.financing_balance,
  sr.fines_status,
  sr.fines_amount,
  sr.ipva_status,
  sr.ipva_amount_due,
  sr.licensing_status,
  sr.caution_report_status,
  sr.auction_history,
  sr.collision_history,
  sr.engine_condition,
  sr.engine_notes,
  sr.gearbox_condition,
  sr.gearbox_notes,
  sr.suspension_condition,
  sr.suspension_notes,
  sr.body_paint_status,
  sr.body_paint_issues,
  sr.body_paint_notes,

  sr.status,
  sr.created_at,
  c.name  AS city_name,
  c.state AS city_state,
  c.slug  AS city_slug
`;

/**
 * A FONTE do feed: tabelas, junções e todos os predicados.
 *
 * Devolve `{ sql, params }` com o `FROM` inteiro. Quem chama acrescenta apenas
 * projeção, ordenação e limite — nunca outro `WHERE`.
 *
 * Os dois primeiros predicados NÃO são filtros de usuário e não têm como ser
 * desligados por parâmetro:
 *
 *   `sr.city_id = $1`  — a cidade vem de `resolveDealerStore`, jamais do cliente;
 *   `sr.status  = $2`  — só `receiving_offers`. Cancelada nunca aparece, e
 *                        qualquer estado futuro (`selected`, `completed`) fica
 *                        de fora por CONSTRUÇÃO: a lista de estados visíveis é
 *                        uma igualdade, não uma negação. Um `<> 'cancelled'`
 *                        passaria a mostrar automaticamente todo estado novo
 *                        que uma fase seguinte criasse.
 */
function buildFeedSource({ cityId, filters = {} }) {
  const params = [cityId, SALE_REQUEST_STATUS.RECEIVING_OFFERS];
  const conditions = ["sr.city_id = $1", "sr.status = $2"];

  /** Acrescenta `<coluna> <operador> $n` com o parâmetro na posição certa. */
  const add = (fragment, value) => {
    params.push(value);
    conditions.push(fragment.replace("$?", `$${params.length}`));
  };

  if (filters.brandSlug) add("sr.brand_slug = $?", filters.brandSlug);
  if (filters.modelSlug) add("sr.model_slug = $?", filters.modelSlug);

  if (filters.yearMin != null) add("sr.year >= $?", filters.yearMin);
  if (filters.yearMax != null) add("sr.year <= $?", filters.yearMax);
  if (filters.mileageMax != null) add("sr.mileage <= $?", filters.mileageMax);

  if (filters.transmission) add("sr.transmission = $?", filters.transmission);
  if (filters.fuelType) add("sr.fuel_type = $?", filters.fuelType);

  if (filters.declaredCondition) add("sr.declared_condition = $?", filters.declaredCondition);

  // ──────────────────────────────────────────────────────────────────────────
  // OS FILTROS DA FICHA E O NULL LEGADO
  // ──────────────────────────────────────────────────────────────────────────
  // Uma solicitação publicada antes da migration 054 tem NULL em todas estas
  // colunas. `coluna = 'no'` NÃO casa NULL — e isso é o comportamento certo:
  // quem filtra "sem passagem por leilão" está pedindo uma DECLARAÇÃO do
  // proprietário, e a linha legada não tem nenhuma. Incluí-la com
  // `OR coluna IS NULL` entregaria "não perguntado" como se fosse "não".
  //
  // O efeito é que a linha legada some quando o filtro da ficha é usado, e
  // aparece quando não é. É a leitura honesta dos dois casos.
  if (filters.tireCondition) add("sr.tire_condition = $?", filters.tireCondition);
  if (filters.cautionReportStatus) {
    add("sr.caution_report_status = $?", filters.cautionReportStatus);
  }
  if (filters.auctionHistory) add("sr.auction_history = $?", filters.auctionHistory);
  if (filters.financingStatus) add("sr.financing_status = $?", filters.financingStatus);

  const sql = `
    FROM sale_requests sr
    JOIN cities c ON c.id = sr.city_id
    WHERE ${conditions.join("\n      AND ")}
  `;

  return { sql, params };
}

/**
 * Uma página do feed.
 *
 * `limit + 1` para descobrir se há próxima página sem `COUNT`, e comparação de
 * TUPLA no cursor: `(chave, id) < ($k, $i)` para ordem DESC,
 * `(chave, id) > ($k, $i)` para ASC. Um corte só pela chave perderia linhas com
 * o mesmo ano (ou a mesma quilometragem) e repetiria as da borda com `<=`.
 *
 * O `id` fecha a ordem em TODA ordenação — inclusive nas de `created_at`, onde
 * duas solicitações do mesmo instante existem de verdade (o teste de
 * concorrência da Fase 4.1 cria exatamente isso).
 *
 * O nome da coluna e a direção vêm de `SALE_OPPORTUNITY_SORT_SPEC`, um objeto
 * congelado: é o ÚNICO ponto em que texto entra no `ORDER BY`, e nenhum valor
 * fora dele chega a ser interpolado.
 */
export async function listOpenByCity({ cityId, filters, sort, limit, cursor }) {
  const spec = SALE_OPPORTUNITY_SORT_SPEC[sort];
  if (!spec) {
    // Chegar aqui significa que a validação foi contornada; falhar alto é o
    // comportamento certo — um default silencioso ordenaria por outra coisa.
    throw new Error(`[sale-requests] ordenação desconhecida: ${sort}`);
  }

  const source = buildFeedSource({ cityId, filters });
  const params = [...source.params];
  let cursorClause = "";

  if (cursor) {
    params.push(cursor.key, cursor.id);
    const comparator = spec.direction === "ASC" ? ">" : "<";

    // O CAST explícito na chave de tempo não é decoração. O driver `pg` envia a
    // string ISO como `text`, e dentro de uma comparação de ROW o PostgreSQL não
    // tem de onde inferir o tipo: sem `::timestamptz` o operador não resolve e a
    // paginação quebra na SEGUNDA página — a primeira não tem cursor, então o
    // defeito passa despercebido em qualquer teste que só carregue a tela.
    // É o mesmo cast que `listByOwner` já usa em `sale-requests.repository.js`.
    const keyParam =
      spec.keyType === "timestamp"
        ? `$${params.length - 1}::timestamptz`
        : `$${params.length - 1}`;

    cursorClause = `AND (${spec.column}, sr.id) ${comparator} (${keyParam}, $${params.length})`;
  }

  params.push(limit + 1);

  const result = await query(
    `
    SELECT ${DEALER_COLUMNS}
    ${source.sql}
    ${cursorClause}
    ORDER BY ${spec.column} ${spec.direction}${spec.nulls}, sr.id ${spec.direction}
    LIMIT $${params.length}
    `,
    params
  );

  const rows = result.rows.slice(0, limit);
  return { rows, hasMore: result.rows.length > limit };
}

/**
 * Métricas do cabeçalho — em UMA query, sobre a MESMA fonte da listagem.
 *
 * `total` conta o que o feed mostraria com os filtros aplicados; `new_today`, o
 * subconjunto das últimas 24 horas. Duas queries separadas custariam dois
 * planejamentos do mesmo `WHERE`, e uma delas acabaria divergindo.
 *
 * A janela de "novas hoje" é `created_at >= NOW() - INTERVAL '24 hours'`, e não
 * `created_at::date = CURRENT_DATE`. A segunda forma depende do fuso do servidor
 * de banco (UTC no Render), e uma solicitação publicada às 22h de Brasília
 * apareceria como "de ontem" para quem a vê às 9h da manhã seguinte. A janela
 * móvel não tem fuso.
 */
export async function countOpenByCity({ cityId, filters }) {
  const source = buildFeedSource({ cityId, filters });

  const result = await query(
    `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE sr.created_at >= NOW() - INTERVAL '24 hours')::int AS new_today
    ${source.sql}
    `,
    source.params
  );

  return {
    total: result.rows[0]?.total ?? 0,
    newToday: result.rows[0]?.new_today ?? 0,
  };
}

/**
 * UMA solicitação, escopada à cidade e ao estado aberto.
 *
 * A cidade está no `WHERE`, então a linha de outra cidade simplesmente NÃO CASA
 * — quem chama transforma isso em 404, nunca em "esta oportunidade é de outra
 * cidade". Distinguir os motivos confirmaria a existência da solicitação para
 * quem estivesse sondando ids de fora.
 */
export async function getOpenByIdForCity(saleRequestId, cityId) {
  const result = await query(
    `
    SELECT ${DEALER_COLUMNS}
    FROM sale_requests sr
    JOIN cities c ON c.id = sr.city_id
    WHERE sr.id = $1
      AND sr.city_id = $2
      AND sr.status = $3
    LIMIT 1
    `,
    [saleRequestId, cityId, SALE_REQUEST_STATUS.RECEIVING_OFFERS]
  );
  return result.rows[0] ?? null;
}

/**
 * CAPAS de várias solicitações, em lote — uma query para a página inteira.
 *
 * `DISTINCT ON (sale_request_id)` com `ORDER BY sale_request_id, sort_order, id`
 * devolve exatamente a primeira foto de cada solicitação. `sort_order = 0` é a
 * capa por convenção da migration 053, mas o corte é por ORDEM e não por
 * igualdade a zero: uma galeria cuja numeração comece em 1 (por reordenação
 * futura) continua tendo capa, em vez de aparecer sem foto nenhuma.
 *
 * O `id` fecha o desempate para que duas fotos com o mesmo `sort_order` não
 * alternem de capa entre carregamentos.
 *
 * @returns {Promise<Map<string, string>>} id da solicitação → `storage_key`
 */
export async function listCoverImagesByRequestIds(saleRequestIds) {
  const ids = Array.from(
    new Set(
      (saleRequestIds || [])
        .map((id) => String(id ?? "").trim())
        .filter((id) => /^\d+$/.test(id))
    )
  );

  if (ids.length === 0) return new Map();

  const result = await query(
    `
    SELECT DISTINCT ON (sale_request_id) sale_request_id, storage_key
    FROM sale_request_images
    WHERE sale_request_id = ANY($1::bigint[])
    ORDER BY sale_request_id, sort_order, id
    `,
    [ids]
  );

  const map = new Map();
  for (const row of result.rows) {
    map.set(String(row.sale_request_id), row.storage_key);
  }
  return map;
}

/**
 * Galeria COMPLETA de uma solicitação, na ordem de exibição.
 *
 * Só o detalhe usa — o card mostra apenas a capa, e carregar doze URLs por card
 * para descartar onze seria tráfego e latência sem contrapartida.
 */
export async function listImagesByRequestId(saleRequestId) {
  const result = await query(
    `
    SELECT storage_key, sort_order
    FROM sale_request_images
    WHERE sale_request_id = $1
    ORDER BY sort_order, id
    `,
    [saleRequestId]
  );
  return result.rows;
}
