/**
 * Vehicle image normalisation service.
 *
 * Strategy: accept any supported input format → always store as WebP.
 *
 * Why WebP as the single output format?
 *   • Universal browser support since 2020 (Chrome, Firefox, Safari, Edge)
 *   • ~35–40 % smaller than JPEG at equivalent perceived quality
 *   • Supports transparency (PNG source photos with alpha survive correctly)
 *   • Cloudflare R2 + CDN serves WebP with the correct Content-Type natively
 *
 * Why not JPEG?
 *   HEIC → JPEG would still require libheif; no benefit over WebP.
 *   PNG → JPEG loses transparency (rare for vehicles but semantically wrong).
 *
 * Normalisation steps applied to every image (in order):
 *   1. EXIF auto-rotate  — reads the EXIF orientation tag, physically rotates
 *      the pixel data to match, then strips the tag from the output so all
 *      consumers (browsers, CDN) see a correctly-oriented image.
 *   2. Downscale         — longest edge is capped at MAX_DIMENSION px.
 *      Images below this limit are never upscaled (withoutEnlargement: true).
 *   3. WebP encode       — quality 85, effort 4.
 *   Metadata is stripped by default; sharp does not copy EXIF/IPTC/XMP
 *   unless you explicitly call .withMetadata().
 *
 * ─── HEIC/HEIF NÃO É SUPORTADO AQUI (corrigido em 2026-07-29) ──────────────
 *
 * Este bloco AFIRMAVA que os binários pré-compilados do sharp decodificavam
 * HEIC "sem pacotes de sistema extras". Era falso, e derrubou o upload de
 * fotos de celular em produção com um HTTP 500 exibindo a string crua do
 * libvips ao usuário final:
 *
 *   "heif: Error while loading plugin: Support for this compression format
 *    has not been built in"
 *
 * Desde o sharp 0.33/0.34 os prebuilts REMOVERAM o decoder HEVC por patente.
 * O que engana: `sharp.format.heif.input.buffer` reporta `true` — isso indica
 * suporte ao CONTÊINER HEIF, não ao codec HEVC do conteúdo. Ou seja, nenhum
 * teste de capacidade detecta o problema; só o arquivo real falha.
 *
 * Não reintroduza `image/heic`/`image/heif` em ACCEPTED_INPUT_MIMES sem antes
 * plugar um decoder de verdade (libheif em WASM via `heic-convert`, que roda
 * no Render sem pacote de sistema) ANTES do sharp no pipeline.
 *
 * AVIF também fica de fora: o codec não está presente em todas as variantes
 * de binário (ausência confirmada em win32-x64, libvips 8.17.3).
 *
 * Deploy requirements:
 *   sharp ≥ 0.34 prebuilts cobrem jpeg, png e webp em linux-x64, linux-arm64,
 *   darwin-arm64, darwin-x64 e win32-x64. Esses três são os únicos formatos
 *   que este módulo aceita — a lista abaixo é a fonte única.
 */

import sharp from "sharp";

import { logger } from "../../shared/logger.js";

/** Format written to R2 and served to all browsers. */
export const OUTPUT_MIME = "image/webp";
export const OUTPUT_EXT = "webp";

/**
 * Maximum dimension (px) for the longest edge.
 * 2048 px covers 2× retina at 1024 px display width, which is the largest
 * realistic card/detail layout in the portal. Camera originals (often
 * 4000–8000 px) are downscaled; files below this limit are untouched.
 */
const MAX_DIMENSION = 2048;

/**
 * WebP encode quality (0–100).
 * 85 is visually indistinguishable from the source for typical automotive
 * photo content while producing ~60 % of an equivalent JPEG's byte size.
 * Effort 4 (scale 0–6): a reasonable CPU / compression ratio tradeoff for
 * a synchronous Node.js process handling wizard uploads.
 */
const WEBP_QUALITY = 85;

/**
 * Single source of truth for accepted input MIME types.
 *
 * Imported by:
 *   • ads-upload.middleware.js  (multer fileFilter whitelist)
 *   • r2.service.js             (assertAllowedMimeType)
 *
 * Every entry must be decodable by sharp's bundled libvips prebuilts for
 * Node 20 LTS on the platforms listed in the module-level comment above.
 *
 * image/jpg / image/x-jpg / image/pjpeg are non-canonical aliases for JPEG.
 * They are sent by Android, old browsers, some cameras and iOS HTTP clients.
 * All aliases are normalized to "image/jpeg" before the whitelist check via
 * normalizeMimeType (r2.service.js) so the upload pipeline handles them
 * transparently. Keeping them in this set also makes the multer fileFilter
 * directly accept them before any normalization step runs.
 */
export const ACCEPTED_INPUT_MIMES = new Set([
  "image/jpeg", // canonical JPEG
  "image/jpg", // non-canonical alias — Android, many old browsers
  "image/x-jpg", // very old alias (some cameras / HTTP servers)
  "image/pjpeg", // progressive JPEG (legacy IE)
  "image/png",
  "image/webp",
  // image/heic e image/heif estavam AQUI e não eram decodificáveis — ver o
  // bloco "HEIC/HEIF NÃO É SUPORTADO AQUI" no topo do arquivo antes de
  // reintroduzir.
]);

/**
 * Formatos legíveis para mensagem de usuário. Fonte única do texto que
 * aparece na UI, no fileFilter do multer e no erro 415 — sem essa fonte
 * única, os três divergiram (a UI prometia "JPG ou PNG", o multer prometia
 * "JPEG, PNG, WebP, HEIC/HEIF" e o `accept` do input era `image/*`).
 */
export const ACCEPTED_FORMATS_LABEL = "JPG, PNG ou WebP";

/**
 * Erro de formato de imagem não suportado.
 *
 * `statusCode: 415` e `expose: true` fazem o errorHandler devolver ESTA
 * mensagem (em português, acionável) em vez da string interna da biblioteca.
 * O erro original vai só para o log — ver `normalizeVehicleImage`.
 */
export class UnsupportedImageFormatError extends Error {
  constructor(message) {
    super(message);
    this.name = "UnsupportedImageFormatError";
    this.statusCode = 415;
    this.expose = true;
  }
}

/**
 * Marcas HEIF/HEIC no box `ftyp` (bytes 4..12). O Android manda `.heic` com
 * MIME `application/octet-stream` com frequência, então o TIPO DECLARADO não
 * serve para identificar o arquivo — só o conteúdo serve.
 *
 * Hoje isso alimenta só o log de diagnóstico. É também o gancho para o decode
 * HEIC via WASM (etapa 2): a detecção precisa acontecer DEPOIS do buffer
 * existir, porque o `fileFilter` do multer roda antes de o stream ser lido e
 * só enxerga `file.mimetype`.
 */
const HEIF_FTYP_BRANDS = ["heic", "heix", "hevc", "hevx", "mif1", "msf1", "heim", "heis"];

/** `true` quando o buffer é da família HEIF/HEIC, pelo conteúdo. */
export function isHeifBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return false;
  if (buf.toString("ascii", 4, 8) !== "ftyp") return false;
  return HEIF_FTYP_BRANDS.includes(buf.toString("ascii", 8, 12).toLowerCase());
}

/** Rótulo curto do formato real, só para log. Nunca vai para a resposta HTTP. */
function describeMagicBytes(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return "curto-demais";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "jpeg";
  if (buf.toString("ascii", 1, 4) === "PNG") return "png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  if (buf.toString("ascii", 4, 8) === "ftyp") {
    return `ftyp:${buf.toString("ascii", 8, 12).toLowerCase()}`;
  }
  return `desconhecido:${buf.subarray(0, 4).toString("hex")}`;
}

/**
 * Normalise a vehicle photo buffer to WebP.
 *
 * @param {Buffer | Uint8Array} inputBuffer - raw image bytes (any accepted format)
 * @returns {Promise<{
 *   buffer:         Buffer,
 *   mimeType:       string,
 *   ext:            string,
 *   width:          number,
 *   height:         number,
 *   originalSize:   number,
 *   normalizedSize: number
 * }>}
 */
export async function normalizeVehicleImage(inputBuffer) {
  const buf = Buffer.isBuffer(inputBuffer) ? inputBuffer : Buffer.from(inputBuffer);

  if (buf.length === 0) {
    throw new Error("[normalizer] Buffer de entrada vazio.");
  }

  // HEIC detectado pelo CONTEÚDO, antes de chamar o sharp. Cobre o caso em que
  // o arquivo chega rotulado como image/jpeg (alguns seletores do Android
  // rotulam errado) e passaria pela whitelist de MIME. Sem isto, o sharp
  // falharia e o usuário receberia a mensagem genérica — esta é acionável,
  // porque diz exatamente o que fazer no celular.
  if (isHeifBuffer(buf)) {
    logger.warn(
      { bytes: buf.length, magic: describeMagicBytes(buf) },
      "[normalizer] upload HEIC/HEIF recusado (decoder HEVC ausente no sharp)"
    );
    throw new UnsupportedImageFormatError(
      "Esta foto está em HEIC, formato que ainda não processamos. " +
        "Na câmera do celular, desative 'alta eficiência' (ou 'HEIF') e " +
        `envie novamente, ou converta para ${ACCEPTED_FORMATS_LABEL}.`
    );
  }

  let data;
  let info;
  try {
    ({ data, info } = await sharp(buf)
      .rotate() // step 1: EXIF auto-rotate + strip orientation
      .resize(MAX_DIMENSION, MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true, // step 2: downscale only, preserve aspect ratio
      })
      .webp({ quality: WEBP_QUALITY, effort: 4 }) // step 3: encode to WebP
      .toBuffer({ resolveWithObject: true }));
  } catch (err) {
    // O sharp/libvips descreve falha de decode em inglês técnico e às vezes
    // vaza offsets internos ("bad seek to 1495082"). Isso NUNCA pode virar
    // corpo de resposta HTTP — foi exatamente o que o usuário final viu na
    // tela ao subir foto de celular. Log completo aqui, mensagem limpa acima.
    logger.error(
      {
        err: err?.message || String(err),
        bytes: buf.length,
        magic: describeMagicBytes(buf),
      },
      "[normalizer] sharp falhou ao decodificar a imagem"
    );
    throw new UnsupportedImageFormatError(
      `Não foi possível processar esta imagem. Envie em ${ACCEPTED_FORMATS_LABEL}.`
    );
  }

  return {
    buffer: data,
    mimeType: OUTPUT_MIME,
    ext: OUTPUT_EXT,
    width: info.width,
    height: info.height,
    originalSize: buf.length,
    normalizedSize: data.length,
  };
}
