import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { USER_ROLE } from "../../../shared/constants/status.js";
import {
  deriveAccountType,
  isValidAccountType,
} from "../../../shared/account/account-type.js";
import * as repo from "./admin-users.repository.js";

/**
 * Admin U1 — visibilidade de TODAS as contas.
 *
 * SOMENTE LEITURA. Este módulo não escreve em lugar nenhum, não cria
 * `advertisers` como efeito colateral de visualizar uma conta e não duplica
 * nenhuma ação comercial: status de loja, moderação, plano e anúncios
 * continuam endereçados por `advertiserId` em `/admin/anunciantes`.
 */

/**
 * Serializa uma linha de `users` no DTO da API.
 *
 * Esta função é a FRONTEIRA de PII: o que ela não constrói explicitamente não
 * sai no payload. Por isso ela monta um objeto novo em vez de espalhar
 * (`...row`) — um spread transformaria qualquer coluna nova adicionada à query
 * (ou ao schema, num `SELECT *` acidental de amanhã) em campo público sem que
 * ninguém decidisse isso.
 *
 * Campos deliberadamente AUSENTES: `document_number`, `document_type` cru,
 * `password_hash`, `password`, `reset_token`, `email_verification_token`,
 * `address`, `phone`, `whatsapp`, `failed_attempts`.
 *
 * `document_type` fica de fora porque o consumidor precisa da CLASSIFICAÇÃO
 * (`account_type`), não do valor bruto — expor os dois convidaria a tela a
 * derivar o rótulo por conta própria, que é exatamente a segunda regra
 * divergente que `shared/account/account-type.js` existe para impedir.
 */
function toUserDto(row) {
  if (!row) return null;

  // Herança de schema: as duas colunas existem (migration 002) e qualquer uma
  // marcada como true significa verificado — mesma leitura de buildSessionUser.
  const emailVerified = row.email_verified === true || row.is_email_verified === true;

  // Bloqueio de segurança é ESTADO PRESENTE, não histórico. Um `locked_until`
  // vencido significa "não está bloqueado"; devolvê-lo cru faria a tela exibir
  // um cadeado permanente para quem errou a senha três vezes mês passado.
  const lockedUntil = row.locked_until ? new Date(row.locked_until) : null;
  const lockActive = lockedUntil != null && lockedUntil.getTime() > Date.now();

  return {
    id: String(row.id),
    name: row.name || null,
    email: row.email || null,
    role: row.role || USER_ROLE.USER,
    account_type: deriveAccountType(row.document_type),
    plan: row.plan_id ? { id: row.plan_id, name: row.plan_name || null } : null,
    email_verified: emailVerified,
    locked_until: lockActive ? lockedUntil.toISOString() : null,
    created_at: row.created_at || null,
  };
}

/** Filtros aceitos pela listagem. Vocabulário fechado — nada cru chega ao SQL. */
function normalizeFilters({ search, accountType, role } = {}) {
  if (accountType && !isValidAccountType(accountType)) {
    throw new AppError(`Tipo de conta inválido: ${accountType}`, 400);
  }

  if (role && role !== USER_ROLE.USER && role !== USER_ROLE.ADMIN) {
    throw new AppError(`Papel inválido: ${role}`, 400);
  }

  return {
    search: typeof search === "string" && search.trim() ? search.trim() : undefined,
    accountType: accountType || undefined,
    role: role || undefined,
  };
}

export async function listUsers({ limit, offset, search, accountType, role } = {}) {
  const filters = normalizeFilters({ search, accountType, role });
  const result = await repo.listUsers({ limit, offset, ...filters });

  return {
    data: result.data.map(toUserDto),
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  };
}

/**
 * Detalhe: identidade + atividade.
 *
 * A atividade sai em queries SEPARADAS, disparadas em paralelo, e não numa
 * consulta única com JOINs. Além do risco de multiplicação de linhas
 * (`advertisers.user_id` sem UNIQUE), separar mantém a listagem — a query
 * quente, chamada a cada abertura da tela — livre de agregação.
 */
export async function getUserById(id) {
  const row = await repo.findUserById(id);
  if (!row) throw new AppError("Usuário não encontrado", 404);

  const [advertisers, ads, purchaseIntents, recentIntents, receivedOffers] = await Promise.all([
    repo.listAdvertisersByUserId(id),
    repo.countAdsByUserId(id),
    repo.countPurchaseIntentsByUserId(id),
    repo.listRecentPurchaseIntentsByUserId(id, { limit: 5 }),
    repo.countReceivedOffersByUserId(id),
  ]);

  return {
    ...toUserDto(row),
    advertisers: advertisers.map((adv) => ({
      id: String(adv.id),
      name: adv.name || adv.company_name || null,
      company_name: adv.company_name || null,
      // Mesma convenção operacional do resto do produto: `status` NULL ou ''
      // conta como 'active'. As migrations 003/012 re-adicionam a coluna com
      // DEFAULT, e DEFAULT não preenche linha preexistente — tratar NULL como
      // "desconhecido" marcaria lojista legado, que está no ar publicamente,
      // como fora de operação.
      status: adv.status && String(adv.status).trim() ? String(adv.status).trim() : "active",
      city: adv.city_name ? { name: adv.city_name, state: adv.city_state || null } : null,
      created_at: adv.created_at || null,
    })),
    activity: {
      advertisers_count: advertisers.length,
      ads_active_count: ads.active,
      ads_total_count: ads.total,
      purchase_intents_count: purchaseIntents.total,
      purchase_intents_live_count: purchaseIntents.live,
      received_offers_count: receivedOffers,
    },
    recent_purchase_intents: recentIntents.map((pi) => ({
      id: String(pi.id),
      intent_type: pi.intent_type || null,
      brand: pi.brand || null,
      model: pi.model || null,
      body_type: pi.body_type || null,
      status: pi.status || null,
      expires_at: pi.expires_at || null,
      created_at: pi.created_at || null,
      city: pi.city_name ? { name: pi.city_name, state: pi.city_state || null } : null,
    })),
  };
}

// Exportado para teste de PII: o contrato do DTO é o que a suíte inspeciona.
export { toUserDto as __toUserDtoForTest };
