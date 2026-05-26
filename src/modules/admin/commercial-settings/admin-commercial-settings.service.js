import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { getSetting, setSetting } from "../../platform/settings.service.js";
import { recordAdminAction } from "../admin.audit.js";

/**
 * Configurações comerciais globais (preço/duração default do destaque
 * avulso, comportamento de duplicado, allowlist por tipo de doc, trava
 * técnica do plano Pro).
 *
 * Storage: platform_settings com namespace `commercial.*` (seeded em
 * migration 031). Mesmo pattern usado por admin-regional-settings.
 *
 * Validação fica APENAS aqui — banco grava JSONB cru e confia no service.
 */

const KEYS = Object.freeze({
  BOOST_PRICE_CENTS: "commercial.boost_default_price_cents",
  BOOST_DAYS: "commercial.boost_default_days",
  DUPLICATE_BEHAVIOR: "commercial.boost_duplicate_behavior",
  MAX_EXT_DAYS: "commercial.boost_max_extension_days",
  ALLOW_CPF: "commercial.allow_boost_cpf",
  ALLOW_CNPJ: "commercial.allow_boost_cnpj",
  PRO_AD_LIMIT: "commercial.pro_ad_limit_guard",
});

const DEFAULTS = Object.freeze({
  [KEYS.BOOST_PRICE_CENTS]: 3990,
  [KEYS.BOOST_DAYS]: 7,
  [KEYS.DUPLICATE_BEHAVIOR]: "extend_duration",
  [KEYS.MAX_EXT_DAYS]: 90,
  [KEYS.ALLOW_CPF]: true,
  [KEYS.ALLOW_CNPJ]: true,
  [KEYS.PRO_AD_LIMIT]: 1000,
});

const RANGES = Object.freeze({
  [KEYS.BOOST_PRICE_CENTS]: { min: 100, max: 1000000, kind: "int" },
  [KEYS.BOOST_DAYS]: { min: 1, max: 365, kind: "int" },
  [KEYS.MAX_EXT_DAYS]: { min: 7, max: 365, kind: "int" },
  [KEYS.PRO_AD_LIMIT]: { min: 100, max: 100000, kind: "int" },
});

const DUPLICATE_BEHAVIORS = Object.freeze(["extend_duration", "replace", "block_duplicate"]);

function normalizeInt(raw, key) {
  const candidate =
    raw && typeof raw === "object" && !Array.isArray(raw) && "value" in raw ? raw.value : raw;
  const n = Number(candidate);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return DEFAULTS[key];
  const range = RANGES[key];
  if (range && (n < range.min || n > range.max)) return DEFAULTS[key];
  return n;
}

function normalizeBool(raw, key) {
  const candidate =
    raw && typeof raw === "object" && !Array.isArray(raw) && "value" in raw ? raw.value : raw;
  if (typeof candidate === "boolean") return candidate;
  if (candidate === "true") return true;
  if (candidate === "false") return false;
  return DEFAULTS[key];
}

function normalizeDuplicateBehavior(raw) {
  const candidate =
    raw && typeof raw === "object" && !Array.isArray(raw) && "value" in raw ? raw.value : raw;
  if (typeof candidate === "string" && DUPLICATE_BEHAVIORS.includes(candidate)) {
    return candidate;
  }
  return DEFAULTS[KEYS.DUPLICATE_BEHAVIOR];
}

async function readAll() {
  const [price, days, dup, maxExt, cpf, cnpj, proLimit] = await Promise.all([
    getSetting(KEYS.BOOST_PRICE_CENTS, DEFAULTS[KEYS.BOOST_PRICE_CENTS]),
    getSetting(KEYS.BOOST_DAYS, DEFAULTS[KEYS.BOOST_DAYS]),
    getSetting(KEYS.DUPLICATE_BEHAVIOR, DEFAULTS[KEYS.DUPLICATE_BEHAVIOR]),
    getSetting(KEYS.MAX_EXT_DAYS, DEFAULTS[KEYS.MAX_EXT_DAYS]),
    getSetting(KEYS.ALLOW_CPF, DEFAULTS[KEYS.ALLOW_CPF]),
    getSetting(KEYS.ALLOW_CNPJ, DEFAULTS[KEYS.ALLOW_CNPJ]),
    getSetting(KEYS.PRO_AD_LIMIT, DEFAULTS[KEYS.PRO_AD_LIMIT]),
  ]);

  return {
    boost_default_price_cents: normalizeInt(price, KEYS.BOOST_PRICE_CENTS),
    boost_default_days: normalizeInt(days, KEYS.BOOST_DAYS),
    boost_duplicate_behavior: normalizeDuplicateBehavior(dup),
    boost_max_extension_days: normalizeInt(maxExt, KEYS.MAX_EXT_DAYS),
    allow_boost_cpf: normalizeBool(cpf, KEYS.ALLOW_CPF),
    allow_boost_cnpj: normalizeBool(cnpj, KEYS.ALLOW_CNPJ),
    pro_ad_limit_guard: normalizeInt(proLimit, KEYS.PRO_AD_LIMIT),
  };
}

export async function getCommercialSettings() {
  const settings = await readAll();
  return {
    settings,
    duplicate_behaviors_supported: DUPLICATE_BEHAVIORS,
    ranges: {
      boost_default_price_cents: RANGES[KEYS.BOOST_PRICE_CENTS],
      boost_default_days: RANGES[KEYS.BOOST_DAYS],
      boost_max_extension_days: RANGES[KEYS.MAX_EXT_DAYS],
      pro_ad_limit_guard: RANGES[KEYS.PRO_AD_LIMIT],
    },
  };
}

/**
 * PATCH semântico: aceita apenas as keys conhecidas; ignora extras.
 * Valida cada campo presente. Reason obrigatório (decisão comercial).
 * Registra `update_commercial_settings` em admin_actions com diff.
 */
export async function updateCommercialSettings({ adminUserId, payload, reason }) {
  if (!payload || typeof payload !== "object") {
    throw new AppError("Body inválido", 400);
  }

  const trimmedReason =
    typeof reason === "string" && reason.trim() ? reason.trim().slice(0, 500) : null;
  if (!trimmedReason) {
    throw new AppError("Motivo (reason) é obrigatório para alterar regras comerciais.", 400);
  }

  const intFields = [
    ["boost_default_price_cents", KEYS.BOOST_PRICE_CENTS],
    ["boost_default_days", KEYS.BOOST_DAYS],
    ["boost_max_extension_days", KEYS.MAX_EXT_DAYS],
    ["pro_ad_limit_guard", KEYS.PRO_AD_LIMIT],
  ];

  const boolFields = [
    ["allow_boost_cpf", KEYS.ALLOW_CPF],
    ["allow_boost_cnpj", KEYS.ALLOW_CNPJ],
  ];

  const writes = []; // [{key, value}]
  const sanitized = {};

  for (const [field, key] of intFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      const n = Number(payload[field]);
      const range = RANGES[key];
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < range.min || n > range.max) {
        throw new AppError(
          `${field} deve ser inteiro entre ${range.min} e ${range.max}`,
          400
        );
      }
      sanitized[field] = n;
      writes.push({ key, value: n });
    }
  }

  for (const [field, key] of boolFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      const b = Boolean(payload[field]);
      sanitized[field] = b;
      writes.push({ key, value: b });
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "boost_duplicate_behavior")) {
    const b = String(payload.boost_duplicate_behavior || "").trim();
    if (!DUPLICATE_BEHAVIORS.includes(b)) {
      throw new AppError(
        `boost_duplicate_behavior deve ser um de: ${DUPLICATE_BEHAVIORS.join(", ")}`,
        400
      );
    }
    sanitized.boost_duplicate_behavior = b;
    writes.push({ key: KEYS.DUPLICATE_BEHAVIOR, value: b });
  }

  if (!writes.length) {
    throw new AppError("Nenhum campo válido para atualizar.", 400);
  }

  const oldValues = await readAll();

  for (const w of writes) {
    await setSetting({
      key: w.key,
      value: w.value,
      updatedBy: adminUserId,
    });
  }

  const newValues = await readAll();

  await recordAdminAction({
    adminUserId,
    action: "update_commercial_settings",
    targetType: "commercial_settings",
    targetId: "global",
    oldValue: oldValues,
    newValue: sanitized,
    reason: trimmedReason,
  });

  return {
    settings: newValues,
    duplicate_behaviors_supported: DUPLICATE_BEHAVIORS,
    ranges: {
      boost_default_price_cents: RANGES[KEYS.BOOST_PRICE_CENTS],
      boost_default_days: RANGES[KEYS.BOOST_DAYS],
      boost_max_extension_days: RANGES[KEYS.MAX_EXT_DAYS],
      pro_ad_limit_guard: RANGES[KEYS.PRO_AD_LIMIT],
    },
  };
}
