import { z } from "zod";
import { AppError } from "../../shared/middlewares/error.middleware.js";

const CreateAdSchema = z.object({
  title: z.string().min(3),
  description: z.string().optional().nullable(),
  price: z.coerce.number().positive(),
  city_id: z.coerce.number().int().positive(),
  city: z.string().min(2),
  state: z.string().min(2).max(2),
  brand: z.string().min(1),
  model: z.string().min(1),
  year: z.coerce.number().int().min(1900).max(2100),
  mileage: z.coerce.number().int().min(0).default(0),
  category: z.string().optional().nullable(),
  body_type: z.string().optional().nullable(),
  fuel_type: z.string().optional().nullable(),
  transmission: z.string().optional().nullable(),
  below_fipe: z.coerce.boolean().optional().default(false),
});

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
