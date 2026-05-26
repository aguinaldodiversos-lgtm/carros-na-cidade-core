import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { recordAdminAction } from "../admin.audit.js";
import * as repo from "./admin-plans.repository.js";

/**
 * Faixas e enums canônicos. Espelha os CHECK do schema 020 + a auditoria
 * documentada no header de ads-ranking.sql.js (camadas 50/80 do
 * commercialLayerExpr — mudar priority_level move o plano de camada).
 *
 * MAX_PRIORITY_LEVEL=200 é folgado para permitir admin moldar nichos
 * (ex.: plano Evento Premium em 100), mas previne ranking_weight absurdo
 * tipo 999 que poderia inflar artificialmente um plano específico.
 */
const PLAN_TYPES = Object.freeze(["CPF", "CNPJ"]);
const BILLING_MODELS = Object.freeze(["free", "one_time", "monthly"]);
const MAX_PRIORITY_LEVEL = 200;
const MAX_AD_LIMIT = 100000;
const MAX_PRICE = 1000000;
const MAX_WEIGHT = 10;
const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,63}$/;

/**
 * Campos cuja mudança exige reason obrigatório (decisão comercial).
 * Encadeia com o pedido da Fase 2: preço, ranking_weight, limites,
 * status, créditos de destaque, duração de destaque.
 */
const FIELDS_REQUIRING_REASON = new Set([
  "price",
  "priority_level",
  "weight",
  "ad_limit",
  "max_photos",
  "is_active",
  "monthly_highlight_credits",
  "validity_days",
]);

function isNonNegativeInt(n) {
  return Number.isInteger(n) && n >= 0;
}

function isNonNegativeFinite(n) {
  return Number.isFinite(n) && n >= 0;
}

function validateBenefits(value) {
  if (!Array.isArray(value)) throw new AppError("benefits deve ser um array de strings", 400);
  if (value.length > 30) throw new AppError("benefits aceita no máximo 30 itens", 400);
  for (const item of value) {
    if (typeof item !== "string") throw new AppError("benefits deve conter apenas strings", 400);
    if (item.length > 200) throw new AppError("cada benefit aceita no máximo 200 chars", 400);
  }
  return value.map((s) => s.trim()).filter(Boolean);
}

function validatePlanFields(patch, { isCreate }) {
  const sanitized = {};

  if (isCreate || "id" in patch) {
    const id = String(patch.id || "").trim().toLowerCase();
    if (!SLUG_REGEX.test(id)) {
      throw new AppError(
        "id (slug) inválido. Use minúsculas, números e hifens (2..64 chars).",
        400
      );
    }
    sanitized.id = id;
  }

  if (isCreate || "name" in patch) {
    const name = String(patch.name || "").trim();
    if (!name) throw new AppError("name é obrigatório", 400);
    if (name.length > 120) throw new AppError("name aceita no máximo 120 chars", 400);
    sanitized.name = name;
  }

  if (isCreate || "type" in patch) {
    const type = String(patch.type || "").trim().toUpperCase();
    if (!PLAN_TYPES.includes(type)) {
      throw new AppError(`type deve ser um de: ${PLAN_TYPES.join(", ")}`, 400);
    }
    sanitized.type = type;
  }

  if (isCreate || "price" in patch) {
    const price = Number(patch.price);
    if (!isNonNegativeFinite(price)) throw new AppError("price não pode ser negativo", 400);
    if (price > MAX_PRICE) throw new AppError(`price excede o máximo permitido (${MAX_PRICE})`, 400);
    sanitized.price = price;
  }

  if (isCreate || "ad_limit" in patch) {
    const adLimit = Number(patch.ad_limit);
    if (!isNonNegativeInt(adLimit)) {
      throw new AppError("ad_limit deve ser inteiro >= 0", 400);
    }
    if (adLimit > MAX_AD_LIMIT) {
      throw new AppError(`ad_limit excede o máximo (${MAX_AD_LIMIT})`, 400);
    }
    sanitized.ad_limit = adLimit;
  }

  if (isCreate || "priority_level" in patch) {
    const pl = Number(patch.priority_level);
    if (!isNonNegativeInt(pl) || pl > MAX_PRIORITY_LEVEL) {
      throw new AppError(`priority_level deve ser inteiro 0..${MAX_PRIORITY_LEVEL}`, 400);
    }
    sanitized.priority_level = pl;
  }

  if (isCreate || "weight" in patch) {
    const w = Number(patch.weight ?? 1);
    if (!isNonNegativeInt(w) || w === 0 || w > MAX_WEIGHT) {
      throw new AppError(`weight deve ser inteiro 1..${MAX_WEIGHT}`, 400);
    }
    sanitized.weight = w;
  }

  if (isCreate || "billing_model" in patch) {
    const bm = String(patch.billing_model || "free").trim().toLowerCase();
    if (!BILLING_MODELS.includes(bm)) {
      throw new AppError(`billing_model deve ser um de: ${BILLING_MODELS.join(", ")}`, 400);
    }
    sanitized.billing_model = bm;
  }

  if (isCreate || "validity_days" in patch) {
    const vd = patch.validity_days;
    if (vd === null || vd === undefined) {
      sanitized.validity_days = null;
    } else {
      const n = Number(vd);
      if (!isNonNegativeInt(n) || n > 3650) {
        throw new AppError("validity_days deve ser inteiro 0..3650 ou null", 400);
      }
      sanitized.validity_days = n;
    }
  }

  if (isCreate || "max_photos" in patch) {
    const mp = Number(patch.max_photos ?? 0);
    if (!isNonNegativeInt(mp) || mp > 50) {
      throw new AppError("max_photos deve ser inteiro 0..50", 400);
    }
    sanitized.max_photos = mp;
  }

  if (isCreate || "monthly_highlight_credits" in patch) {
    const mhc = Number(patch.monthly_highlight_credits ?? 0);
    if (!isNonNegativeInt(mhc) || mhc > 100) {
      throw new AppError("monthly_highlight_credits deve ser inteiro 0..100", 400);
    }
    sanitized.monthly_highlight_credits = mhc;
  }

  if (isCreate || "sort_order" in patch) {
    const so = Number(patch.sort_order ?? 0);
    if (!Number.isInteger(so) || so < -10000 || so > 10000) {
      throw new AppError("sort_order deve ser inteiro -10000..10000", 400);
    }
    sanitized.sort_order = so;
  }

  // booleans
  for (const flag of [
    "is_featured_enabled",
    "has_store_profile",
    "is_active",
    "recommended",
    "video_360_enabled",
    "public_visible",
  ]) {
    if (isCreate || flag in patch) {
      sanitized[flag] = Boolean(patch[flag]);
    }
  }

  if (isCreate || "description" in patch) {
    const d = String(patch.description || "").trim();
    if (d.length > 1000) throw new AppError("description aceita no máximo 1000 chars", 400);
    sanitized.description = d;
  }

  if (isCreate || "benefits" in patch) {
    sanitized.benefits = validateBenefits(patch.benefits ?? []);
  }

  return sanitized;
}

function buildDiff(oldRow, newPatch) {
  const oldValue = {};
  const newValue = {};
  for (const key of Object.keys(newPatch)) {
    if (oldRow && oldRow[key] !== undefined && JSON.stringify(oldRow[key]) !== JSON.stringify(newPatch[key])) {
      oldValue[key] = oldRow[key];
      newValue[key] = newPatch[key];
    } else if (!oldRow) {
      newValue[key] = newPatch[key];
    }
  }
  return { oldValue, newValue };
}

function requiresReason(diff) {
  return Object.keys(diff.newValue).some((k) => FIELDS_REQUIRING_REASON.has(k));
}

// ── Public service API ─────────────────────────────────────────────

export async function listPlans({ includeInactive = true } = {}) {
  const data = await repo.list({ includeInactive });
  return { data, total: data.length };
}

export async function getPlanById(id) {
  const plan = await repo.findById(id);
  if (!plan) throw new AppError("Plano não encontrado", 404);
  return plan;
}

export async function listPlanSubscriptions(planId, { limit, offset }) {
  const plan = await repo.findById(planId);
  if (!plan) throw new AppError("Plano não encontrado", 404);
  return repo.listSubscriptions(planId, { limit, offset });
}

/**
 * Cria plano novo. Por default `is_active=false` (regra da Fase 2: plano
 * novo não afeta ranking público até ser ativado explicitamente). Para
 * forçar `is_active=true` na criação, o admin passa explicitamente.
 *
 * SEMPRE registra `create_plan` em admin_actions.
 */
export async function createPlan(adminUserId, payload, reason) {
  const sanitized = validatePlanFields(payload, { isCreate: true });

  const trimmedReason =
    typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;
  if (!trimmedReason) {
    throw new AppError("Motivo (reason) é obrigatório para criar plano comercial.", 400);
  }

  // Default seguro: plano nasce inativo (regra da Fase 2) se admin não
  // mandar explicitamente true.
  if (!("is_active" in payload)) sanitized.is_active = false;
  if (!("public_visible" in payload)) sanitized.public_visible = true;

  const existing = await repo.findById(sanitized.id);
  if (existing) {
    throw new AppError(`Slug '${sanitized.id}' já está em uso.`, 409);
  }

  const inserted = await repo.insert(sanitized);
  if (!inserted) {
    throw new AppError("Falha ao criar plano (conflito de id)", 409);
  }

  await recordAdminAction({
    adminUserId,
    action: "create_plan",
    targetType: "subscription_plan",
    targetId: inserted.id,
    oldValue: null,
    newValue: sanitized,
    reason: trimmedReason,
  });

  return inserted;
}

/**
 * Atualiza plano. Reason é obrigatório quando o diff inclui campos
 * comercialmente sensíveis (price, priority_level, weight, ad_limit,
 * max_photos, is_active, monthly_highlight_credits, validity_days).
 */
export async function updatePlan(adminUserId, id, payload, reason) {
  const current = await repo.findById(id);
  if (!current) throw new AppError("Plano não encontrado", 404);

  // Não permite trocar `id` em update.
  if ("id" in payload && String(payload.id) !== String(id)) {
    throw new AppError("id do plano é imutável", 400);
  }

  const sanitized = validatePlanFields(payload, { isCreate: false });
  const diff = buildDiff(current, sanitized);

  if (!Object.keys(diff.newValue).length) {
    return current; // no-op
  }

  const trimmedReason =
    typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;
  if (requiresReason(diff) && !trimmedReason) {
    throw new AppError(
      "Motivo (reason) é obrigatório para alterar campos comerciais sensíveis.",
      400
    );
  }

  const updated = await repo.updatePartial(id, sanitized);

  await recordAdminAction({
    adminUserId,
    action: "update_plan",
    targetType: "subscription_plan",
    targetId: id,
    oldValue: diff.oldValue,
    newValue: diff.newValue,
    reason: trimmedReason,
  });

  return updated;
}

/**
 * Atalho para mudança de status (activate/deactivate). Reason obrigatório.
 * Não permite desativar se há subscriptions ativas — força admin a tomar
 * decisão explícita (usar updatePlan com is_active=false explicitamente).
 */
export async function setPlanActive(adminUserId, id, isActive, reason) {
  const current = await repo.findById(id);
  if (!current) throw new AppError("Plano não encontrado", 404);

  const trimmedReason =
    typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;
  if (!trimmedReason) {
    throw new AppError("Motivo (reason) é obrigatório para alterar status do plano.", 400);
  }

  if (current.is_active === Boolean(isActive)) {
    return current; // no-op
  }

  if (!isActive) {
    const active = await repo.countActiveSubscriptions(id);
    if (active > 0) {
      throw new AppError(
        `Plano possui ${active} assinatura(s) ativa(s). Use updatePlan com is_active=false explicitamente, ciente de que as assinaturas existentes permanecem válidas até expires_at.`,
        409
      );
    }
  }

  const updated = await repo.updatePartial(id, { is_active: Boolean(isActive) });

  await recordAdminAction({
    adminUserId,
    action: isActive ? "activate_plan" : "deactivate_plan",
    targetType: "subscription_plan",
    targetId: id,
    oldValue: { is_active: current.is_active },
    newValue: { is_active: Boolean(isActive) },
    reason: trimmedReason,
  });

  return updated;
}
