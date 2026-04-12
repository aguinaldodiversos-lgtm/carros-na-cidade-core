/**
 * Vehicle image normalisation service.
 *
 * Strategy: accept any supported input format → always store as WebP.
 *
 * Why WebP as the single output format?
 *   • Universal browser support since 2020 (Chrome, Firefox, Safari, Edge)
 *   • ~35–40 % smaller than JPEG at equivalent perceived quality
 *   • Supports transparency (PNG source photos with alpha survive correctly)
 *   • sharp's HEIC/HEIF → WebP path (via bundled libheif ≥ 8.15) handles
 *     iPhone photos on Node 20 LTS without extra system packages or builds
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
 * Deploy requirements:
 *   sharp ≥ 0.33 prebuilt binaries for Node 20 LTS include all codecs used
 *   here (jpeg, png, webp, heif/heic) on linux-x64, linux-arm64,
 *   darwin-arm64, darwin-x64 and win32-x64.
 *   AVIF input is excluded from ACCEPTED_INPUT_MIMES because the avif codec
 *   is not available in all prebuilt binary variants (confirmed absence on
 *   win32-x64 in libvips 8.17.3); removing it avoids a runtime failure on
 *   platforms without avif support. Re-enable when the target deploy platform
 *   has been validated.
 */

import sharp from "sharp";

/** Format written to R2 and served to all browsers. */
export const OUTPUT_MIME = "image/webp";
export const OUTPUT_EXT  = "webp";

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
  "image/jpeg",  // canonical JPEG
  "image/jpg",   // non-canonical alias — Android, many old browsers
  "image/x-jpg", // very old alias (some cameras / HTTP servers)
  "image/pjpeg", // progressive JPEG (legacy IE)
  "image/png",
  "image/webp",
  "image/heic",  // iPhone HEVC photo format (iOS 11+)
  "image/heif",  // iPhone HEVC, alternative MIME declaration
]);

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
  const buf = Buffer.isBuffer(inputBuffer)
    ? inputBuffer
    : Buffer.from(inputBuffer);

  if (buf.length === 0) {
    throw new Error("[normalizer] Buffer de entrada vazio.");
  }

  const { data, info } = await sharp(buf)
    .rotate()                                        // step 1: EXIF auto-rotate + strip orientation
    .resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,                      // step 2: downscale only, preserve aspect ratio
    })
    .webp({ quality: WEBP_QUALITY, effort: 4 })      // step 3: encode to WebP
    .toBuffer({ resolveWithObject: true });

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
