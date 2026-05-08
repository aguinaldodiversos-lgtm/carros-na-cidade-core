/**
 * Fonte única de verdade para limite de fotos por anúncio.
 *
 * Obrigação: multer (`ads-upload.middleware.js`), validador Zod
 * (`ads.validators.js`), routing (`ads.routes.js`) e o serviço de storage
 * (`r2.service.js`) precisam usar O MESMO número. Antes desta constante,
 * havia divergência (24 no multer/validator, 12 no R2 default) — isso
 * fazia upload de 13–24 fotos passar no multer e cair silenciosamente
 * dentro do R2 service em ambientes sem `VEHICLE_IMAGE_MAX_FILES`.
 *
 * Override: definir env `VEHICLE_IMAGE_MAX_FILES` (inteiro positivo).
 * O default explícito é 24 — alinhado ao maior plano comercial atual
 * + folga. Limites por plano (Grátis=8, Start=12, Pro=15) são aplicados
 * no painel/wizard, não aqui — esta constante é o teto físico do storage.
 *
 * NÃO IMPORTAR DO FRONTEND. O BFF tem o seu próprio teto por
 * requisição (MAX_WIZARD_FILES) — limite ergonômico de UI, não comercial.
 */

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const VEHICLE_IMAGE_MAX_FILES_DEFAULT = 24;

export const VEHICLE_IMAGE_MAX_FILES = parsePositiveInt(
  process.env.VEHICLE_IMAGE_MAX_FILES,
  VEHICLE_IMAGE_MAX_FILES_DEFAULT
);

/** 10 MB por arquivo (alinhado a `VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES`). */
export const VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES_DEFAULT = 10 * 1024 * 1024;

export const VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES = parsePositiveInt(
  process.env.VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES,
  VEHICLE_IMAGE_MAX_FILE_SIZE_BYTES_DEFAULT
);
