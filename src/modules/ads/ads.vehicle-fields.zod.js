import { z } from "zod";
import {
  BODY_TYPES,
  FUEL_TYPES,
  TRANSMISSION_TYPES,
} from "./ads.canonical.constants.js";
import {
  normalizeBodyTypeForStorage,
  normalizeFuelTypeForStorage,
  normalizeTransmissionForStorage,
} from "./ads.storage-normalize.js";

/**
 * z.enum exige tupla não vazia — derivada das listas canônicas.
 */
const bodyTypeEnum = z.enum([...BODY_TYPES]);
const fuelTypeEnum = z.enum([...FUEL_TYPES]);
const transmissionEnum = z.enum([...TRANSMISSION_TYPES]);

/**
 * Campo opcional: aceita string livre no JSON; preprocess normaliza; valida só slugs canônicos ou null.
 * Não usa z.string() solto — após preprocess o tipo é enum | null | undefined.
 */
function normalizedVehicleField(normalize, schema) {
  return z.preprocess(
    (v) => {
      if (v === undefined) return undefined;
      return normalize(v);
    },
    z.union([schema, z.null()]).optional()
  );
}

export const bodyTypeZodField = normalizedVehicleField(
  normalizeBodyTypeForStorage,
  bodyTypeEnum
);

export const fuelTypeZodField = normalizedVehicleField(
  normalizeFuelTypeForStorage,
  fuelTypeEnum
);

export const transmissionZodField = normalizedVehicleField(
  normalizeTransmissionForStorage,
  transmissionEnum
);
