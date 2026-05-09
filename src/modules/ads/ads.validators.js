import { z } from "zod";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import {
  bodyTypeZodField,
  fuelTypeZodField,
  transmissionZodField,
} from "./ads.vehicle-fields.zod.js";
import { VEHICLE_IMAGE_MAX_FILES } from "./ads.upload.constants.js";

/**
 * Contrato de criação de anúncio.
 * `body_type`, `fuel_type`, `transmission`: string livre no request → preprocess normaliza
 * (`ads.storage-normalize`) → validação só contra slugs canônicos (`BODY_TYPES`, etc.).
 */
const CreateAdSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional().nullable(),
  price: z.coerce.number().positive(),
  city_id: z.coerce.number().int().positive(),
  city: z.string().min(2),
  // UF canonica: 2 letras, SEMPRE uppercase. O fallback UPPER(...) no filtro
  // ainda protege anuncios antigos; aqui garantimos consistencia no insert.
  state: z
    .string()
    .trim()
    .min(2)
    .max(2)
    .transform((v) => v.toUpperCase())
    .refine((v) => /^[A-Z]{2}$/.test(v), { message: "UF inválida" }),
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.coerce.number().int().min(1900).max(2100),
  mileage: z.coerce.number().int().min(0).default(0),
  category: z.string().optional().nullable(),
  body_type: bodyTypeZodField,
  fuel_type: fuelTypeZodField,
  transmission: transmissionZodField,
  below_fipe: z.coerce.boolean().optional().default(false),
  /**
   * URLs públicas (relativas ao portal ou absolutas) — ordem = capa primeiro.
   * Mínimo 1 imagem: invariante "anúncio active exige imagem válida". Limite
   * superior alinhado a `ads.upload.constants` (multer + r2.service).
   */
  images: z
    .array(z.string().min(1).max(2048))
    .min(1, { message: "Anúncio precisa de pelo menos 1 foto válida." })
    .max(VEHICLE_IMAGE_MAX_FILES),
  /**
   * Valor FIPE de referência consultado pelo FRONTEND. Aceito apenas
   * como hint informativo (low confidence) — o adRiskService usa o
   * snapshot do backend FIPE service como fonte autoritativa.
   * Manipular este campo NÃO permite escapar de PENDING_REVIEW.
   */
  fipe_value: z.coerce.number().positive().optional().nullable(),
  /**
   * Códigos canônicos da Tabela FIPE (parallelum) — quando enviados,
   * permitem cotação server-side com confidence='high'.
   *   fipe_brand_code: código numérico da marca (ex: "23")
   *   fipe_model_code: código numérico do modelo (ex: "5585")
   *   fipe_year_code:  string composta ano-combustível (ex: "2018-1")
   *   fipe_code:       código alfanumérico FIPE oficial (auditoria)
   */
  fipe_brand_code: z.string().trim().min(1).max(32).optional().nullable(),
  fipe_model_code: z.string().trim().min(1).max(32).optional().nullable(),
  fipe_year_code: z.string().trim().min(1).max(16).optional().nullable(),
  fipe_code: z.string().trim().min(1).max(32).optional().nullable(),
  /**
   * Mês de referência da cotação FIPE (ex: "maio de 2026"). Auditoria
   * apenas — gravado em ad_moderation_events, não decide nada.
   */
  fipe_reference_month: z.string().trim().min(1).max(64).optional().nullable(),
  vehicle_type: z.enum(["carros", "motos", "caminhoes"]).optional().nullable(),
});

const UpdateAdSchema = CreateAdSchema.partial();

export function validateAdIdentifier(value) {
  const identifier = String(value || "").trim();

  if (!identifier) {
    throw new AppError("Identificador inválido", 400);
  }

  return identifier;
}

export function validateAdId(value) {
  const id = Number(value);

  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError("ID inválido", 400);
  }

  return id;
}

export function validateCreateAdPayload(payload) {
  const result = CreateAdSchema.safeParse(payload);

  if (!result.success) {
    throw new AppError("Payload de anúncio inválido", 400, true, result.error.flatten());
  }

  return result.data;
}

export function validateUpdateAdPayload(payload) {
  const result = UpdateAdSchema.safeParse(payload);

  if (!result.success) {
    throw new AppError("Payload de atualização inválido", 400, true, result.error.flatten());
  }

  return result.data;
}
