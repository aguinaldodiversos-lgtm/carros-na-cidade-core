import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { logger } from "../../../shared/logger.js";
import { uploadSiteImage } from "../../../infrastructure/storage/r2.service.js";
import { recordAdminAction } from "../admin.audit.js";
import {
  listPosts,
  findById,
  findBySlug,
  insertPost,
  updateById,
  listPublishedPosts,
  findPublishedBySlug,
} from "./admin-blog.repository.js";

/**
 * CMS do Blog (Fase 4.2).
 *
 * Workflow
 * --------
 *   draft ──publish──▶ published ──unpublish──▶ unpublished ──publish──▶ published
 *     │                                │
 *     └────────────archive────────────┴──▶ archived ──restore──▶ draft|unpublished
 *
 * Regras-chave:
 *   - Público só enxerga status='published' (repository.findPublishedBySlug /
 *     listPublishedPosts filtram no WHERE).
 *   - publish exige conteúdo completo (title/slug/excerpt/content) — draft
 *     pode ser salvo incompleto.
 *   - published_at é a PRIMEIRA publicação (datePublished do JSON-LD);
 *     despublicar/republicar não reseta.
 *   - Toda transição (publish/unpublish/archive/restore) exige reason e
 *     registra admin_actions com snapshot old/new.
 *   - PATCH de campos em post published revalida as regras de publicação
 *     no estado final (merge) — não dá para "quebrar" um post no ar.
 *
 * Conteúdo
 * --------
 * `content` é Markdown simples (parágrafos, ## subtítulos, listas, links).
 * O frontend público renderiza com renderer próprio que NÃO emite HTML
 * bruto — sem dangerouslySetInnerHTML para conteúdo — então não há
 * superfície de XSS via banco. Ainda assim rejeitamos aqui conteúdos com
 * esquemas perigosos em links markdown (javascript:, data:, file:, vbscript:).
 */

export const BLOG_POST_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  UNPUBLISHED: "unpublished",
  ARCHIVED: "archived",
});

const VALID_STATUSES = new Set(Object.values(BLOG_POST_STATUS));

export const BLOG_CATEGORIES = Object.freeze([
  "compra",
  "venda",
  "manutencao",
  "mercado",
  "financiamento",
  "cidades",
]);

const LIMITS = Object.freeze({
  title: 180,
  title_min: 5,
  slug: 180,
  excerpt: 240,
  content_min: 300,
  content_max: 100_000,
  cover_image_alt: 240,
  meta_title: 70,
  meta_description: 200,
  canonical_url: 500,
  og_image_url: 500,
  tag: 40,
  tags_max: 12,
  reason: 500,
});

const ALLOWED_URL_PROTOCOLS = new Set(["http:", "https:"]);

// Esquemas perigosos em links markdown dentro do content: [x](javascript:...)
const DANGEROUS_LINK_RE = /\]\(\s*(javascript|data|file|vbscript)\s*:/i;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ───────────────────────────────────────────────────────────────────────────
// Helpers de validação/normalização
// ───────────────────────────────────────────────────────────────────────────

/**
 * Gera slug a partir do título: lowercase, sem acentos, apenas
 * [a-z0-9] com hífens. Ex.: "Como comprar um carro usado?" →
 * "como-comprar-um-carro-usado".
 */
export function slugify(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, LIMITS.slug)
    .replace(/-+$/g, "");
}

/** Tempo de leitura estimado (~200 palavras/min, mínimo 1). */
export function estimateReadingMinutes(content) {
  const words = String(content || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  if (words === 0) return null;
  return Math.max(1, Math.ceil(words / 200));
}

function trimOrNull(value, max) {
  if (value === null) return null;
  if (typeof value !== "string") return undefined; // "não tocar"
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed.slice(0, max);
}

function validateHttpUrl(raw, fieldName, { allowInternalPath = false } = {}) {
  if (raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: true, value: undefined };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > LIMITS.canonical_url) {
    return { ok: false, message: `${fieldName} excede ${LIMITS.canonical_url} caracteres.` };
  }
  if (allowInternalPath && trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return { ok: true, value: trimmed };
  }
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

function normalizeTags(raw) {
  if (raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) {
    if (raw === undefined) return { ok: true, value: undefined };
    return { ok: false, message: "tags deve ser uma lista de strings." };
  }
  const out = [];
  for (const item of raw) {
    if (typeof item !== "string") {
      return { ok: false, message: "tags deve conter apenas strings." };
    }
    const t = item.trim().slice(0, LIMITS.tag);
    if (t && !out.includes(t)) out.push(t);
  }
  if (out.length > LIMITS.tags_max) {
    return { ok: false, message: `Máximo de ${LIMITS.tags_max} tags por post.` };
  }
  return { ok: true, value: out };
}

function requireReason(reason, actionLabel) {
  const trimmed =
    typeof reason === "string" && reason.trim() ? reason.trim().slice(0, LIMITS.reason) : null;
  if (!trimmed) {
    throw new AppError(`Motivo (reason) é obrigatório para ${actionLabel}.`, 400);
  }
  return trimmed;
}

function rowToDto(row) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content,
    cover_image_url: row.cover_image_url,
    cover_image_alt: row.cover_image_alt,
    category: row.category,
    tags: Array.isArray(row.tags) ? row.tags : [],
    author_id: row.author_id,
    status: row.status,
    published_at: row.published_at,
    archived_at: row.archived_at,
    meta_title: row.meta_title,
    meta_description: row.meta_description,
    canonical_url: row.canonical_url,
    og_image_url: row.og_image_url,
    is_indexable: row.is_indexable,
    reading_time_minutes: row.reading_time_minutes,
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    updated_by_admin_id: row.updated_by_admin_id,
  };
}

/** Snapshot enxuto para admin_actions (sem content completo — só tamanho). */
function rowToAuditSnapshot(row) {
  if (!row) return null;
  const dto = rowToDto(row);
  return {
    ...dto,
    content: undefined,
    content_length: typeof row.content === "string" ? row.content.length : 0,
  };
}

/**
 * DTO público — sem campos administrativos. `includeContent=false` na
 * listagem: cards não precisam do markdown completo (payload enxuto).
 */
function rowToPublicDto(row, { includeContent = true } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: includeContent ? row.content : undefined,
    cover_image_url: row.cover_image_url,
    cover_image_alt: row.cover_image_alt,
    category: row.category,
    tags: Array.isArray(row.tags) ? row.tags : [],
    published_at: row.published_at,
    updated_at: row.updated_at,
    meta_title: row.meta_title,
    meta_description: row.meta_description,
    canonical_url: row.canonical_url,
    og_image_url: row.og_image_url,
    is_indexable: row.is_indexable,
    reading_time_minutes: row.reading_time_minutes,
  };
}

/**
 * Regras para um post poder estar/ficar PUBLISHED. Aplica sobre o estado
 * FINAL (row existente + patch mesclado). Lança AppError 400 com a lista
 * de pendências — mensagem única para o admin corrigir tudo de uma vez.
 */
function assertPublishable(state) {
  const problems = [];

  const title = String(state.title || "").trim();
  if (title.length < LIMITS.title_min) {
    problems.push(`título com pelo menos ${LIMITS.title_min} caracteres`);
  }

  const slug = String(state.slug || "").trim();
  if (!SLUG_RE.test(slug)) {
    problems.push("slug válido (minúsculas, números e hífens)");
  }

  const excerpt = String(state.excerpt || "").trim();
  if (!excerpt) {
    problems.push("resumo (excerpt)");
  } else if (excerpt.length > LIMITS.excerpt) {
    problems.push(`resumo com no máximo ${LIMITS.excerpt} caracteres`);
  }

  const content = String(state.content || "").trim();
  if (content.length < LIMITS.content_min) {
    problems.push(`conteúdo com pelo menos ${LIMITS.content_min} caracteres`);
  }

  if (state.cover_image_url && !String(state.cover_image_alt || "").trim()) {
    problems.push("texto alternativo (alt) da imagem de capa");
  }

  if (problems.length > 0) {
    throw new AppError(`Para publicar, defina: ${problems.join("; ")}.`, 400);
  }
}

async function assertSlugAvailable(slug, { excludeId = null } = {}) {
  const existing = await findBySlug(slug, { excludeId });
  if (existing) {
    throw new AppError(`Slug "${slug}" já está em uso por outro post.`, 409);
  }
}

async function getPostOr404(id) {
  const row = await findById(id);
  if (!row) throw new AppError("Post não encontrado.", 404);
  return row;
}

// ───────────────────────────────────────────────────────────────────────────
// Admin — listagem/detalhe
// ───────────────────────────────────────────────────────────────────────────

export async function listAdminPosts({ status, search, limit, offset } = {}) {
  if (status && !VALID_STATUSES.has(String(status))) {
    throw new AppError(`status inválido. Aceitos: ${[...VALID_STATUSES].join(", ")}.`, 400);
  }
  const result = await listPosts({ status, search, limit, offset });
  return { ...result, data: result.data.map(rowToDto) };
}

export async function getAdminPostById(id) {
  const row = await getPostOr404(id);
  return rowToDto(row);
}

// ───────────────────────────────────────────────────────────────────────────
// Admin — criação
// ───────────────────────────────────────────────────────────────────────────

/**
 * Cria post como DRAFT. Exige apenas título (≥5 chars); slug é gerado do
 * título quando não enviado. Demais campos são opcionais e passam pelas
 * mesmas validações do PATCH.
 */
export async function createPost({ adminUserId, payload }) {
  if (!payload || typeof payload !== "object") {
    throw new AppError("Body inválido.", 400);
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (title.length < LIMITS.title_min) {
    throw new AppError(`Título é obrigatório (mínimo ${LIMITS.title_min} caracteres).`, 400);
  }

  let slug =
    typeof payload.slug === "string" && payload.slug.trim()
      ? payload.slug.trim().toLowerCase()
      : slugify(title);
  if (!SLUG_RE.test(slug)) {
    // Tenta normalizar o que o admin digitou antes de rejeitar.
    slug = slugify(slug);
  }
  if (!SLUG_RE.test(slug)) {
    throw new AppError(
      "Slug inválido: use minúsculas, números e hífens (ex.: como-comprar-carro-usado).",
      400
    );
  }
  await assertSlugAvailable(slug);

  // Reaproveita o pipeline de validação do PATCH para os campos opcionais.
  const optional = buildValidatedUpdates(payload, { skip: new Set(["title", "slug"]) });

  // Mesma invariante do PATCH: capa exige alt desde a criação.
  if (optional.cover_image_url && !String(optional.cover_image_alt || "").trim()) {
    throw new AppError("Texto alternativo (alt) é obrigatório quando há imagem de capa.", 400);
  }

  const fields = {
    ...optional,
    title: title.slice(0, LIMITS.title),
    slug,
    status: BLOG_POST_STATUS.DRAFT,
    author_id: adminUserId == null ? null : String(adminUserId),
    updated_by_admin_id: adminUserId == null ? null : String(adminUserId),
  };

  if (typeof fields.content === "string") {
    fields.reading_time_minutes = estimateReadingMinutes(fields.content);
  }

  const row = await insertPost(fields);
  if (!row) throw new AppError("Falha ao criar post.", 500);

  await recordAdminAction({
    adminUserId,
    action: "create_blog_post",
    targetType: "blog_post",
    targetId: String(row.id),
    oldValue: null,
    newValue: rowToAuditSnapshot(row),
    reason:
      typeof payload.reason === "string" && payload.reason.trim()
        ? payload.reason.trim().slice(0, LIMITS.reason)
        : null,
  });

  return rowToDto(row);
}

// ───────────────────────────────────────────────────────────────────────────
// Admin — edição de campos (PATCH)
// ───────────────────────────────────────────────────────────────────────────

/**
 * Valida e normaliza os campos editáveis de um payload PATCH/POST.
 * Campos ausentes não entram no retorno (semântica "não tocar").
 */
function buildValidatedUpdates(payload, { skip = new Set() } = {}) {
  const updates = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(payload, k) && !skip.has(k);

  if (has("title")) {
    const v = trimOrNull(payload.title, LIMITS.title);
    if (v === null) throw new AppError("Título não pode ficar vazio.", 400);
    if (v !== undefined) {
      if (v.length < LIMITS.title_min) {
        throw new AppError(`Título precisa de pelo menos ${LIMITS.title_min} caracteres.`, 400);
      }
      updates.title = v;
    }
  }

  if (has("slug")) {
    if (typeof payload.slug === "string") {
      let slug = payload.slug.trim().toLowerCase();
      if (!SLUG_RE.test(slug)) slug = slugify(slug);
      if (!SLUG_RE.test(slug)) {
        throw new AppError(
          "Slug inválido: use minúsculas, números e hífens (ex.: como-comprar-carro-usado).",
          400
        );
      }
      updates.slug = slug;
    } else if (payload.slug === null) {
      throw new AppError("Slug não pode ser removido.", 400);
    }
  }

  if (has("excerpt")) {
    const v = trimOrNull(payload.excerpt, LIMITS.excerpt);
    if (v !== undefined) updates.excerpt = v;
  }

  if (has("content")) {
    if (payload.content === null) {
      updates.content = null;
      updates.reading_time_minutes = null;
    } else if (typeof payload.content === "string") {
      const content = payload.content.trim();
      if (content.length > LIMITS.content_max) {
        throw new AppError(`Conteúdo excede o limite de ${LIMITS.content_max} caracteres.`, 400);
      }
      if (DANGEROUS_LINK_RE.test(content)) {
        throw new AppError(
          "Conteúdo contém link com esquema não permitido (javascript:, data:, file:).",
          400
        );
      }
      updates.content = content || null;
      updates.reading_time_minutes = estimateReadingMinutes(content);
    }
  }

  if (has("cover_image_url")) {
    const check = validateHttpUrl(payload.cover_image_url, "cover_image_url");
    if (!check.ok) throw new AppError(check.message, 400);
    if (check.value !== undefined) updates.cover_image_url = check.value;
  }

  if (has("cover_image_alt")) {
    const v = trimOrNull(payload.cover_image_alt, LIMITS.cover_image_alt);
    if (v !== undefined) updates.cover_image_alt = v;
  }

  if (has("category")) {
    if (payload.category === null) {
      updates.category = null;
    } else if (typeof payload.category === "string") {
      const cat = payload.category.trim().toLowerCase();
      if (!cat) {
        updates.category = null;
      } else if (!BLOG_CATEGORIES.includes(cat)) {
        throw new AppError(`Categoria inválida. Aceitas: ${BLOG_CATEGORIES.join(", ")}.`, 400);
      } else {
        updates.category = cat;
      }
    }
  }

  if (has("tags")) {
    const check = normalizeTags(payload.tags);
    if (!check.ok) throw new AppError(check.message, 400);
    if (check.value !== undefined) updates.tags = check.value;
  }

  if (has("meta_title")) {
    const v = trimOrNull(payload.meta_title, LIMITS.meta_title);
    if (v !== undefined) updates.meta_title = v;
  }

  if (has("meta_description")) {
    const v = trimOrNull(payload.meta_description, LIMITS.meta_description);
    if (v !== undefined) updates.meta_description = v;
  }

  if (has("canonical_url")) {
    const check = validateHttpUrl(payload.canonical_url, "canonical_url", {
      allowInternalPath: true,
    });
    if (!check.ok) throw new AppError(check.message, 400);
    if (check.value !== undefined) updates.canonical_url = check.value;
  }

  if (has("og_image_url")) {
    const check = validateHttpUrl(payload.og_image_url, "og_image_url");
    if (!check.ok) throw new AppError(check.message, 400);
    if (check.value !== undefined) updates.og_image_url = check.value;
  }

  if (has("is_indexable")) {
    if (typeof payload.is_indexable !== "boolean") {
      throw new AppError("is_indexable deve ser boolean.", 400);
    }
    updates.is_indexable = payload.is_indexable;
  }

  return updates;
}

/**
 * PATCH de campos. Status NÃO é editável aqui — transições têm endpoints
 * dedicados (publish/unpublish/archive/restore) com reason obrigatório.
 *
 * reason é opcional para edição (salvar rascunho não exige), mas a
 * auditoria update_blog_post é sempre registrada.
 */
export async function updatePost({ adminUserId, id, payload, reason }) {
  if (!payload || typeof payload !== "object") {
    throw new AppError("Body inválido.", 400);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    throw new AppError(
      "status não é editável via PATCH — use publish/unpublish/archive/restore.",
      400
    );
  }

  const before = await getPostOr404(id);
  const updates = buildValidatedUpdates(payload);

  if (Object.keys(updates).length === 0) {
    throw new AppError("Nenhum campo válido para atualizar.", 400);
  }

  if (updates.slug && updates.slug !== before.slug) {
    await assertSlugAvailable(updates.slug, { excludeId: before.id });
  }

  // Estado final por campo (existente OU patch) para validar invariantes.
  const effective = (field) =>
    Object.prototype.hasOwnProperty.call(updates, field) ? updates[field] : before[field];

  // Alt obrigatório sempre que houver capa — mesmo em draft, para o
  // constraint segurar quando o admin publicar depois.
  if (effective("cover_image_url") && !String(effective("cover_image_alt") || "").trim()) {
    throw new AppError("Texto alternativo (alt) é obrigatório quando há imagem de capa.", 400);
  }

  // Post no ar não pode ser editado para um estado não-publicável.
  if (before.status === BLOG_POST_STATUS.PUBLISHED) {
    assertPublishable({
      title: effective("title"),
      slug: effective("slug"),
      excerpt: effective("excerpt"),
      content: effective("content"),
      cover_image_url: effective("cover_image_url"),
      cover_image_alt: effective("cover_image_alt"),
    });
  }

  const after = await updateById(before.id, updates, adminUserId);
  if (!after) throw new AppError("Falha ao atualizar post.", 500);

  await recordAdminAction({
    adminUserId,
    action: "update_blog_post",
    targetType: "blog_post",
    targetId: String(after.id),
    oldValue: rowToAuditSnapshot(before),
    newValue: rowToAuditSnapshot(after),
    reason:
      typeof reason === "string" && reason.trim() ? reason.trim().slice(0, LIMITS.reason) : null,
  });

  return rowToDto(after);
}

// ───────────────────────────────────────────────────────────────────────────
// Admin — transições de status (reason obrigatório + auditoria)
// ───────────────────────────────────────────────────────────────────────────

async function transitionPost({
  adminUserId,
  id,
  reason,
  action,
  actionLabel,
  allowedFrom,
  buildUpdates,
}) {
  const trimmedReason = requireReason(reason, actionLabel);
  const before = await getPostOr404(id);

  if (!allowedFrom.has(before.status)) {
    throw new AppError(`Não é possível ${actionLabel} um post com status "${before.status}".`, 400);
  }

  const updates = buildUpdates(before);
  const after = await updateById(before.id, updates, adminUserId);
  if (!after) throw new AppError("Falha ao atualizar status do post.", 500);

  await recordAdminAction({
    adminUserId,
    action,
    targetType: "blog_post",
    targetId: String(after.id),
    oldValue: rowToAuditSnapshot(before),
    newValue: rowToAuditSnapshot(after),
    reason: trimmedReason,
  });

  return rowToDto(after);
}

/**
 * Publica (draft|unpublished → published). Valida conteúdo completo.
 * published_at: preenchido na primeira publicação; preservado depois.
 */
export async function publishPost({ adminUserId, id, reason }) {
  const before = await getPostOr404(id);
  assertPublishable(before);

  return transitionPost({
    adminUserId,
    id,
    reason,
    action: "publish_blog_post",
    actionLabel: "publicar",
    allowedFrom: new Set([BLOG_POST_STATUS.DRAFT, BLOG_POST_STATUS.UNPUBLISHED]),
    buildUpdates: (row) => ({
      status: BLOG_POST_STATUS.PUBLISHED,
      published_at: row.published_at || new Date(),
      archived_at: null,
    }),
  });
}

/** Despublica (published → unpublished). Post some do público (404). */
export async function unpublishPost({ adminUserId, id, reason }) {
  return transitionPost({
    adminUserId,
    id,
    reason,
    action: "unpublish_blog_post",
    actionLabel: "despublicar",
    allowedFrom: new Set([BLOG_POST_STATUS.PUBLISHED]),
    buildUpdates: () => ({ status: BLOG_POST_STATUS.UNPUBLISHED }),
  });
}

/** Arquiva (qualquer status exceto archived). */
export async function archivePost({ adminUserId, id, reason }) {
  return transitionPost({
    adminUserId,
    id,
    reason,
    action: "archive_blog_post",
    actionLabel: "arquivar",
    allowedFrom: new Set([
      BLOG_POST_STATUS.DRAFT,
      BLOG_POST_STATUS.PUBLISHED,
      BLOG_POST_STATUS.UNPUBLISHED,
    ]),
    buildUpdates: () => ({
      status: BLOG_POST_STATUS.ARCHIVED,
      archived_at: new Date(),
    }),
  });
}

/**
 * Restaura post arquivado para draft (default) ou unpublished.
 * Nunca restaura direto para published — publicar exige a validação
 * completa do publishPost.
 */
export async function restorePost({ adminUserId, id, reason, toStatus }) {
  const target =
    toStatus === BLOG_POST_STATUS.UNPUBLISHED
      ? BLOG_POST_STATUS.UNPUBLISHED
      : BLOG_POST_STATUS.DRAFT;

  return transitionPost({
    adminUserId,
    id,
    reason,
    action: "restore_blog_post",
    actionLabel: "restaurar",
    allowedFrom: new Set([BLOG_POST_STATUS.ARCHIVED]),
    buildUpdates: () => ({ status: target, archived_at: null }),
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Admin — upload de imagem de capa
// ───────────────────────────────────────────────────────────────────────────

/**
 * Upload da capa para o R2. Estrutura: site/blog/cover/<yyyy>/<mm>/<uuid>.webp.
 * Igual aos banners da Home: o upload devolve a URL pública mas NÃO grava no
 * banco — a capa só é confirmada quando o admin salva o post (PATCH com
 * cover_image_url + cover_image_alt).
 */
export async function uploadCoverImage({ adminUserId, id, file }) {
  const post = await getPostOr404(id);
  if (!file) throw new AppError("Arquivo de imagem ausente.", 400);

  try {
    const upload = await uploadSiteImage({
      file,
      section: "blog",
      variant: "cover",
      uploadedByUserId: adminUserId,
    });

    if (!upload.publicUrl) {
      logger.error(
        { key: upload.key, adminUserId, postId: post.id },
        "[admin-blog] upload OK mas publicUrl vazio (R2_PUBLIC_BASE_URL não configurada)"
      );
      throw new AppError(
        "Upload concluído mas URL pública indisponível. Verifique R2_PUBLIC_BASE_URL.",
        500
      );
    }

    return {
      url: upload.publicUrl,
      key: upload.key,
      post_id: post.id,
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

/**
 * Upload de imagem para o MEIO do conteúdo (Fase 4.2.2). Estrutura:
 * site/blog/content/<yyyy>/<mm>/<uuid>.webp. Igual à capa, mas variant
 * 'content' — devolve a URL pública R2 para o editor inserir no Markdown
 * (![alt](url)); a gravação no banco só ocorre quando o admin salva o post.
 */
export async function uploadContentImage({ adminUserId, id, file }) {
  const post = await getPostOr404(id);
  if (!file) throw new AppError("Arquivo de imagem ausente.", 400);

  try {
    const upload = await uploadSiteImage({
      file,
      section: "blog",
      variant: "content",
      uploadedByUserId: adminUserId,
    });

    if (!upload.publicUrl) {
      logger.error(
        { key: upload.key, adminUserId, postId: post.id },
        "[admin-blog] upload de conteúdo OK mas publicUrl vazio (R2_PUBLIC_BASE_URL não configurada)"
      );
      throw new AppError(
        "Upload concluído mas URL pública indisponível. Verifique R2_PUBLIC_BASE_URL.",
        500
      );
    }

    return {
      url: upload.publicUrl,
      key: upload.key,
      post_id: post.id,
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

// ───────────────────────────────────────────────────────────────────────────
// Público — somente published
// ───────────────────────────────────────────────────────────────────────────

export async function listPublicPosts({ category, limit, offset } = {}) {
  if (category && !BLOG_CATEGORIES.includes(String(category).trim().toLowerCase())) {
    // Categoria desconhecida → lista vazia (não 400: filtro público tolerante).
    return { data: [], total: 0, limit: Number(limit) || 12, offset: Number(offset) || 0 };
  }
  const result = await listPublishedPosts({ category, limit, offset });
  return {
    ...result,
    data: result.data.map((row) => rowToPublicDto(row, { includeContent: false })),
  };
}

/** Detalhe público. null quando inexistente ou não-published (controller → 404). */
export async function getPublicPostBySlug(slug) {
  const row = await findPublishedBySlug(slug);
  return rowToPublicDto(row);
}
