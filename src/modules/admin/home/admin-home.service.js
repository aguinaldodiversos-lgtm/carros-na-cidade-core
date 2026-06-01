import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { logger } from "../../../shared/logger.js";
import { uploadSiteImage } from "../../../infrastructure/storage/r2.service.js";
import { recordAdminAction } from "../admin.audit.js";
import {
  listBySectionType,
  findByPosition,
  updateByPosition,
} from "./admin-home.repository.js";

/**
 * Gestão do carrossel de hero da Home (Fase 4.1.1).
 *
 * Modelo
 * ------
 * Cada banner é uma row em `home_sections` identificada por
 * (section_type='home_hero', position=1..3). PATCH em um banner NUNCA
 * altera os demais — o repository.updateByPosition filtra por position
 * no WHERE.
 *
 * Audit
 * -----
 * action='update_home_hero_banner', target_type='home_content',
 * target_id='home_hero_<position>'. Snapshot old/new contém SOMENTE o
 * banner alterado (não os 3) — para que a leitura de admin_actions seja
 * direta ("quem mudou o banner 2 em DD/MM").
 *
 * Reason obrigatório — alinhado a 4.1, commercial-settings e
 * arquivamento de anúncios.
 *
 * Fallback público
 * ----------------
 * `listPublicHeroBanners()` retorna apenas ativos, ordenados por
 * position. Se nenhum estiver ativo, retorna []. O frontend trata []
 * como fallback hardcoded (mesma semântica do null da 4.1).
 */

const SECTION_TYPE = "home_hero";
const VALID_POSITIONS = [1, 2, 3];

const LIMITS = Object.freeze({
  title: 140,
  subtitle: 240,
  cta_label: 40,
  cta_url: 500,
  image_alt: 240,
  reason: 500,
});

const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

function assertValidPosition(position) {
  const n = Number(position);
  if (!Number.isInteger(n) || !VALID_POSITIONS.includes(n)) {
    throw new AppError(
      `position inválido. Aceitos: ${VALID_POSITIONS.join(", ")}.`,
      400
    );
  }
  return n;
}

function trimOrNull(value, max) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined; // sinaliza "não tocar"
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, max);
}

/**
 * CTA URL: caminho interno '/...' OU http(s). Rejeita javascript:, data:,
 * file:, protocol-relative '//', etc.
 */
function validateCtaUrl(raw) {
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: true, value: undefined };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > LIMITS.cta_url) {
    return { ok: false, message: `cta_url excede ${LIMITS.cta_url} caracteres.` };
  }
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return { ok: true, value: trimmed };
  }
  try {
    const url = new URL(trimmed);
    if (!ALLOWED_URL_PROTOCOLS.has(url.protocol)) {
      return {
        ok: false,
        message: "cta_url deve ser caminho interno (/...) ou URL http/https.",
      };
    }
    return { ok: true, value: trimmed };
  } catch {
    return {
      ok: false,
      message: "cta_url inválida: use caminho interno (/...) ou URL http/https.",
    };
  }
}

function validateImageUrl(raw, fieldName) {
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: true, value: undefined };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  try {
    const url = new URL(trimmed);
    if (!ALLOWED_URL_PROTOCOLS.has(url.protocol)) {
      return { ok: false, message: `${fieldName} deve ser URL http/https.` };
    }
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false, message: `${fieldName} inválida.` };
  }
}

function rowToDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    section_type: row.section_type,
    position: row.position,
    title: row.title,
    subtitle: row.subtitle,
    cta_label: row.cta_label,
    cta_url: row.cta_url,
    image_desktop_url: row.image_desktop_url,
    image_mobile_url: row.image_mobile_url,
    image_alt: row.image_alt,
    is_active: row.is_active,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    updated_by_admin_id: row.updated_by_admin_id,
  };
}

/**
 * Lista admin: 3 banners (todos), ordenados por position. Inclui inativos.
 */
export async function listHeroBanners() {
  const rows = await listBySectionType(SECTION_TYPE, { includeInactive: true });
  return rows.map(rowToDto);
}

/**
 * Lista pública: somente ativos, ordenados por position.
 */
export async function listPublicHeroBanners() {
  const rows = await listBySectionType(SECTION_TYPE, { includeInactive: false });
  return rows.map(rowToDto);
}

/**
 * Banner único por position (admin).
 */
export async function getHeroBanner(position) {
  const pos = assertValidPosition(position);
  const row = await findByPosition(SECTION_TYPE, pos);
  return rowToDto(row);
}

/**
 * PATCH semântico em UM banner. Demais banners ficam intactos.
 *
 * Quando ativando uma row sem conteúdo mínimo (sem title nem imagem),
 * rejeitamos — banner ativo no carrossel sem nada pra mostrar polui
 * a Home. Esta regra evita ativação acidental do Banner 2/3 vazios.
 */
export async function updateHeroBanner({ adminUserId, position, payload, reason }) {
  const pos = assertValidPosition(position);

  if (!payload || typeof payload !== "object") {
    throw new AppError("Body inválido.", 400);
  }

  const trimmedReason =
    typeof reason === "string" && reason.trim()
      ? reason.trim().slice(0, LIMITS.reason)
      : null;
  if (!trimmedReason) {
    throw new AppError("Motivo (reason) é obrigatório para alterar o banner.", 400);
  }

  const updates = {};

  if (Object.prototype.hasOwnProperty.call(payload, "title")) {
    const v = trimOrNull(payload.title, LIMITS.title);
    if (v !== undefined) updates.title = v;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "subtitle")) {
    const v = trimOrNull(payload.subtitle, LIMITS.subtitle);
    if (v !== undefined) updates.subtitle = v;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "cta_label")) {
    const v = trimOrNull(payload.cta_label, LIMITS.cta_label);
    if (v !== undefined) updates.cta_label = v;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "image_alt")) {
    const v = trimOrNull(payload.image_alt, LIMITS.image_alt);
    if (v !== undefined) updates.image_alt = v;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "cta_url")) {
    const check = validateCtaUrl(payload.cta_url);
    if (!check.ok) throw new AppError(check.message, 400);
    if (check.value !== undefined) updates.cta_url = check.value;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "image_desktop_url")) {
    const check = validateImageUrl(payload.image_desktop_url, "image_desktop_url");
    if (!check.ok) throw new AppError(check.message, 400);
    if (check.value !== undefined) updates.image_desktop_url = check.value;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "image_mobile_url")) {
    const check = validateImageUrl(payload.image_mobile_url, "image_mobile_url");
    if (!check.ok) throw new AppError(check.message, 400);
    if (check.value !== undefined) updates.image_mobile_url = check.value;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "is_active")) {
    if (typeof payload.is_active !== "boolean") {
      throw new AppError("is_active deve ser boolean.", 400);
    }
    updates.is_active = payload.is_active;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError("Nenhum campo válido para atualizar.", 400);
  }

  const before = await findByPosition(SECTION_TYPE, pos);
  if (!before) {
    throw new AppError(
      `Banner position=${pos} não inicializado. Rode a migration 034_home_sections_carousel.`,
      500
    );
  }

  // Compõe estado final por campo (existente OU patch) para validar
  // regras pós-merge sem efetuar UPDATE prematuro.
  function effective(field) {
    return Object.prototype.hasOwnProperty.call(updates, field)
      ? updates[field]
      : before[field];
  }

  const finalAlt = effective("image_alt");
  const finalDesktop = effective("image_desktop_url");
  if (finalDesktop && (!finalAlt || !String(finalAlt).trim())) {
    throw new AppError(
      "image_alt é obrigatório quando há imagem desktop configurada.",
      400
    );
  }

  // Ativando um banner sem nada para mostrar polui a Home — bloqueia.
  const becomingActive = effective("is_active") === true;
  if (becomingActive) {
    const finalTitle = effective("title");
    const hasAnyContent =
      (finalTitle && String(finalTitle).trim()) ||
      finalDesktop ||
      effective("image_mobile_url");
    if (!hasAnyContent) {
      throw new AppError(
        "Para ativar este banner, defina ao menos um título ou uma imagem.",
        400
      );
    }
  }

  const after = await updateByPosition(SECTION_TYPE, pos, updates, adminUserId);
  if (!after) throw new AppError("Falha ao atualizar banner.", 500);

  const oldValue = rowToDto(before);
  const newValue = rowToDto(after);

  await recordAdminAction({
    adminUserId,
    action: "update_home_hero_banner",
    targetType: "home_content",
    targetId: after.key, // home_hero_1 | home_hero_2 | home_hero_3
    oldValue,
    newValue,
    reason: trimmedReason,
  });

  return newValue;
}

/**
 * Upload de imagem para um banner específico.
 *
 * Estrutura de pasta R2: `site/home-hero/<position>/<variant>/<yyyy>/<mm>/<uuid>.webp`.
 * Confirmação da URL no banco só ocorre via PATCH (admin clica "Publicar"
 * com reason) — assim a imagem anterior do banner permanece ativa até a
 * decisão consciente do admin.
 */
export async function uploadHeroImage({ adminUserId, position, file, variant }) {
  const pos = assertValidPosition(position);
  if (!file) throw new AppError("Arquivo de imagem ausente.", 400);

  const normalizedVariant = variant === "mobile" ? "mobile" : "desktop";

  try {
    const upload = await uploadSiteImage({
      file,
      // Section diferencia por posição para que listagem do R2 fique
      // organizada por banner.
      section: `home-hero/${pos}`,
      variant: normalizedVariant,
      uploadedByUserId: adminUserId,
    });

    if (!upload.publicUrl) {
      logger.error(
        { key: upload.key, adminUserId, position: pos },
        "[admin-home] upload OK mas publicUrl vazio (R2_PUBLIC_BASE_URL não configurada)"
      );
      throw new AppError(
        "Upload concluído mas URL pública indisponível. Verifique R2_PUBLIC_BASE_URL.",
        500
      );
    }

    return {
      url: upload.publicUrl,
      key: upload.key,
      position: pos,
      variant: normalizedVariant,
      size_bytes: upload.sizeBytes,
      mime_type: upload.mimeType,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    const message = err?.message || "Falha no upload da imagem.";
    if (typeof message === "string" && message.startsWith("[r2]")) {
      throw new AppError(message.replace(/^\[r2\]\s*/, ""), 400);
    }
    throw new AppError(`Falha no upload: ${message}`, 500);
  }
}
