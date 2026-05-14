// src/modules/vehicle-images/vehicle-images.controller.js
import { readVehicleImage } from "../../infrastructure/storage/r2.service.js";
import { logger } from "../../shared/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// Política (refatorada em 2026-05-13 após incidente de outbound bandwidth).
//
// Caminho padrão: 302 redirect para o CDN público do R2. Zero bytes de imagem
// passam pelo origin do Render. O servidor só emite headers + URL.
//
// Caminho fallback: streaming via R2 BFF (carrega o objeto inteiro em RAM e
// envia como buffer). É o comportamento legado. SÓ ativa com a env
// BACKEND_IMAGE_PROXY_FALLBACK_ENABLED=true. Default false — porque cada hit
// custa bandwidth Render proporcional ao tamanho da imagem.
//
// Sem `R2_PUBLIC_BASE_URL` E sem fallback ligado → 404 com Cache-Control curto.
// Não há razão de servir bytes pelo origin como padrão.
// ─────────────────────────────────────────────────────────────────────────────

const REDIRECT_CACHE_CONTROL = "public, max-age=3600";
const NOT_FOUND_CACHE_CONTROL = "public, max-age=60";

/**
 * Validação pura de `?key=`. Não toca process.env, não chama R2.
 *
 * Regras:
 *   - precisa existir e não pode ser só espaço em branco;
 *   - não pode conter `..` (path traversal);
 *   - não pode conter `\` (Windows-style nem injeção);
 *   - não pode parecer URL absoluta (`://`, `data:`, `javascript:`);
 *   - não pode começar com `//` (protocol-relative).
 *
 * Devolve `{ ok: true, key }` (com barras iniciais removidas) ou
 * `{ ok: false, reason }` para reportar 400 sem vazar detalhes.
 */
export function validateStorageKey(raw) {
  if (typeof raw !== "string") return { ok: false, reason: "missing" };
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "missing" };
  if (trimmed.includes("..")) return { ok: false, reason: "traversal" };
  if (trimmed.includes("\\")) return { ok: false, reason: "backslash" };
  if (trimmed.includes("://")) return { ok: false, reason: "absolute-url" };
  if (/^(data|javascript|file|blob):/i.test(trimmed)) return { ok: false, reason: "scheme" };
  if (trimmed.startsWith("//")) return { ok: false, reason: "protocol-relative" };

  const normalized = trimmed.replace(/^\/+/, "");
  if (!normalized) return { ok: false, reason: "empty-after-normalize" };
  return { ok: true, key: normalized };
}

function isFallbackEnabled() {
  return process.env.BACKEND_IMAGE_PROXY_FALLBACK_ENABLED === "true";
}

/**
 * Lê on-demand para que testes (e o próprio runtime) não precisem das
 * credenciais R2 do SDK só para emitir o redirect. Aceita também o espelho
 * NEXT_PUBLIC_R2_PUBLIC_BASE_URL como cortesia (a env do frontend).
 */
function readPublicBaseUrl() {
  const raw =
    process.env.R2_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ||
    "";
  return String(raw).trim().replace(/\/+$/, "");
}

/**
 * Encoda cada segmento do path do R2 sem destruir os `/` que separam
 * pastas. Mesma estratégia do helper interno e do frontend, mantida aqui
 * para não depender de getR2Config (que exige credenciais).
 */
function encodeR2Key(key) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function rejectInvalidKey(res, reason) {
  return res
    .status(400)
    .set("Cache-Control", "no-store")
    .json({ success: false, error: "Chave inválida.", reason });
}

function notFound(res) {
  return res
    .status(404)
    .set("Cache-Control", NOT_FOUND_CACHE_CONTROL)
    .set("X-Content-Type-Options", "nosniff")
    .set("X-Vehicle-Images-Source", "no-public-base")
    .json({ success: false, error: "Imagem indisponível." });
}

export async function getVehicleImageByKey(req, res, next) {
  try {
    const raw = req.query.key || "";
    const validation = validateStorageKey(raw);
    if (!validation.ok) {
      return rejectInvalidKey(res, validation.reason);
    }

    const publicBase = readPublicBaseUrl();
    const publicUrl = publicBase ? `${publicBase}/${encodeR2Key(validation.key)}` : "";

    // Caminho padrão: 302 redirect para o CDN R2. Não toca o S3Client, não
    // baixa nenhum byte. O browser segue direto pro Cloudflare.
    if (publicUrl) {
      res.set("Cache-Control", REDIRECT_CACHE_CONTROL);
      res.set("X-Vehicle-Images-Source", "redirect-r2");
      res.set("Referrer-Policy", "no-referrer");
      return res.redirect(302, publicUrl);
    }

    // R2_PUBLIC_BASE_URL ausente.
    if (!isFallbackEnabled()) {
      logger.warn(
        { key: validation.key },
        "[vehicle-images] R2_PUBLIC_BASE_URL ausente e fallback OFF; devolvendo 404"
      );
      return notFound(res);
    }

    // Fallback legado: baixa imagem do R2 para RAM e devolve buffer.
    // ATENÇÃO: cada hit custa bandwidth Render proporcional ao tamanho da
    // imagem. Manter ligado apenas em janelas de incidente do CDN.
    logger.warn(
      { key: validation.key },
      "[vehicle-images] usando fallback streaming (BACKEND_IMAGE_PROXY_FALLBACK_ENABLED=true) — bandwidth Render aumenta"
    );
    const image = await readVehicleImage(validation.key);

    res.setHeader("Content-Type", image.contentType);
    res.setHeader("Content-Length", String(image.contentLength));
    res.setHeader("Cache-Control", image.cacheControl);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Vehicle-Images-Source", "backend-stream-fallback");

    return res.status(200).send(image.buffer);
  } catch (error) {
    return next(error);
  }
}
