import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { logger } from "../../../shared/logger.js";
import { uploadSiteImage } from "../../../infrastructure/storage/r2.service.js";
import { recordAdminAction } from "../admin.audit.js";
import { findByKey, updateByKey } from "./admin-home.repository.js";

/**
 * Gestão do hero da Home (Fase 4.1).
 *
 * Por que reason obrigatório?
 * ---------------------------
 * Alinhado a commercial-settings e arquivamento de anúncios: alterações de
 * conteúdo público devem ter trilha de auditoria forte. O custo é mínimo
 * (1 campo no modal) e o ganho é grande quando precisamos investigar quem
 * trocou o banner em uma campanha.
 *
 * Por que CTA URL validada aqui?
 * ------------------------------
 * Banner principal é exposição máxima — link malicioso (`javascript:`,
 * `data:`) cria XSS. Caminho interno (`/comprar`, `/anuncios/...`) é o
 * uso esperado; http(s) externo é permitido mas com whitelist explícita.
 *
 * Fallback do frontend
 * --------------------
 * O service NÃO devolve fallback hardcoded — esse é trabalho do frontend
 * (HomeHero.tsx). O backend reflete fielmente o que está no banco; se a
 * linha não existir (migration não rodou), o public.controller devolve
 * null e o frontend cai em seu próprio fallback.
 */

const HERO_KEY = "home_hero";

const LIMITS = Object.freeze({
  title: 140,
  subtitle: 240,
  cta_label: 40,
  cta_url: 500,
  image_alt: 240,
  reason: 500,
});

const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

function trimOrNull(value, max) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined; // sinaliza "não tocar"
  const trimmed = value.trim();
  if (trimmed === "") return null; // string vazia limpa o campo
  return trimmed.slice(0, max);
}

/**
 * CTA URL: aceita caminho interno (começa com '/') ou http(s) absoluto.
 * Rejeita javascript:, data:, file:, etc.
 *
 * Retorna { ok: true, value } | { ok: false, message }.
 */
function validateCtaUrl(raw) {
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: true, value: undefined };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > LIMITS.cta_url) {
    return { ok: false, message: `cta_url excede ${LIMITS.cta_url} caracteres.` };
  }

  // Caminho interno: começa com '/' e NÃO com '//' (protocol-relative).
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return { ok: true, value: trimmed };
  }

  // URL absoluta: precisa ser http/https.
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

/**
 * Valida URL de imagem (vinda do upload R2). Aceita só http/https absoluto
 * para evitar gravar `javascript:` ou caminho local malformado.
 */
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
 * Leitura admin do hero atual. NÃO filtra por is_active — admin precisa
 * ver mesmo quando desativado para editar/reativar.
 */
export async function getHero() {
  const row = await findByKey(HERO_KEY);
  return rowToDto(row);
}

/**
 * Leitura pública do hero. Só devolve quando is_active = true. Se não
 * existir ou estiver inativo, retorna null — frontend cai no fallback.
 */
export async function getPublicHero() {
  const row = await findByKey(HERO_KEY);
  if (!row || !row.is_active) return null;
  return rowToDto(row);
}

/**
 * PATCH semântico do hero. Aceita apenas campos conhecidos.
 *
 * - title/subtitle/cta_label/image_alt: trim, limites.
 * - cta_url: caminho interno OU http/https.
 * - image_desktop_url/image_mobile_url: http/https (vêm do endpoint de
 *   upload; admin não digita à mão).
 * - is_active: boolean explícito.
 * - reason: OBRIGATÓRIO (consistência com outras ações sensíveis admin).
 */
export async function updateHero({ adminUserId, payload, reason }) {
  if (!payload || typeof payload !== "object") {
    throw new AppError("Body inválido.", 400);
  }

  const trimmedReason =
    typeof reason === "string" && reason.trim()
      ? reason.trim().slice(0, LIMITS.reason)
      : null;
  if (!trimmedReason) {
    throw new AppError("Motivo (reason) é obrigatório para alterar o hero.", 400);
  }

  const updates = {};

  // Campos texto simples
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

  // cta_url validada
  if (Object.prototype.hasOwnProperty.call(payload, "cta_url")) {
    const check = validateCtaUrl(payload.cta_url);
    if (!check.ok) throw new AppError(check.message, 400);
    if (check.value !== undefined) updates.cta_url = check.value;
  }

  // imagens (http/https)
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

  // is_active boolean
  if (Object.prototype.hasOwnProperty.call(payload, "is_active")) {
    if (typeof payload.is_active !== "boolean") {
      throw new AppError("is_active deve ser boolean.", 400);
    }
    updates.is_active = payload.is_active;
  }

  if (Object.keys(updates).length === 0) {
    throw new AppError("Nenhum campo válido para atualizar.", 400);
  }

  const before = await findByKey(HERO_KEY);
  if (!before) {
    // Defensivo: a migration cria seed; só aconteceria com banco fora de
    // sync. Não criamos a linha aqui para forçar atenção ao desvio.
    throw new AppError(
      "Seção home_hero não inicializada. Rode a migration 033_home_sections.",
      500
    );
  }

  // Validação adicional: se é troca de imagem, image_alt precisa existir
  // (no DB OU no payload). Acessibilidade não-negociável.
  const finalAltAfter =
    Object.prototype.hasOwnProperty.call(updates, "image_alt")
      ? updates.image_alt
      : before.image_alt;
  const hasDesktopImageAfter =
    (Object.prototype.hasOwnProperty.call(updates, "image_desktop_url")
      ? updates.image_desktop_url
      : before.image_desktop_url) != null;
  if (hasDesktopImageAfter && (!finalAltAfter || !finalAltAfter.trim())) {
    throw new AppError(
      "image_alt é obrigatório quando há imagem desktop configurada.",
      400
    );
  }

  const after = await updateByKey(HERO_KEY, updates, adminUserId);
  if (!after) throw new AppError("Falha ao atualizar hero.", 500);

  const oldValue = rowToDto(before);
  const newValue = rowToDto(after);

  await recordAdminAction({
    adminUserId,
    action: "update_home_hero",
    targetType: "home_content",
    targetId: HERO_KEY,
    oldValue,
    newValue,
    reason: trimmedReason,
  });

  return newValue;
}

/**
 * Upload da imagem do hero (desktop ou mobile). Reutiliza o pipeline R2
 * (uploadSiteImage). Retorna URL pública; admin chama PATCH em seguida
 * para confirmar gravação no banco — assim a imagem anterior permanece
 * ativa até o admin clicar "Salvar" com a nova URL.
 *
 * Limita variant a 'desktop' | 'mobile' — qualquer outro valor cai como
 * desktop (defensivo).
 */
export async function uploadHeroImage({ adminUserId, file, variant }) {
  if (!file) throw new AppError("Arquivo de imagem ausente.", 400);

  const normalizedVariant = variant === "mobile" ? "mobile" : "desktop";

  try {
    const upload = await uploadSiteImage({
      file,
      section: "home-hero",
      variant: normalizedVariant,
      uploadedByUserId: adminUserId,
    });

    if (!upload.publicUrl) {
      // R2_PUBLIC_BASE_URL não configurada — não é prático servir via BFF
      // para conteúdo público da home. Falha explícita.
      logger.error(
        { key: upload.key, adminUserId },
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
      variant: normalizedVariant,
      size_bytes: upload.sizeBytes,
      mime_type: upload.mimeType,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    const message = err?.message || "Falha no upload da imagem.";
    // Erros vindos do validator R2 (mime, tamanho) começam com "[r2]"; mapeia 400.
    if (typeof message === "string" && message.startsWith("[r2]")) {
      throw new AppError(message.replace(/^\[r2\]\s*/, ""), 400);
    }
    throw new AppError(`Falha no upload: ${message}`, 500);
  }
}
