// frontend/lib/fipe/fipe-client.ts
"use client";

import type { FipeOption, FipeQuote, FipeVehicleType } from "@/lib/fipe/fipe-provider";

type FipeApiSuccess<T> = {
  success: true;
  data: T;
};

type FipeApiError = {
  success: false;
  error: string;
};

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  const json = (await response.json()) as FipeApiSuccess<T> | FipeApiError;

  if (!response.ok || !("success" in json) || !json.success) {
    const message =
      "error" in json && typeof json.error === "string"
        ? json.error
        : "Falha ao consultar a API FIPE";
    throw new Error(message);
  }

  return json.data;
}

export function listFipeBrands(vehicleType: FipeVehicleType) {
  return requestJson<FipeOption[]>(`/api/fipe/brands?vehicleType=${vehicleType}`);
}

export function listFipeModels(vehicleType: FipeVehicleType, brandCode: string) {
  return requestJson<FipeOption[]>(
    `/api/fipe/models/${encodeURIComponent(brandCode)}?vehicleType=${vehicleType}`
  );
}

export function listFipeYears(vehicleType: FipeVehicleType, brandCode: string, modelCode: string) {
  return requestJson<FipeOption[]>(
    `/api/fipe/years/${encodeURIComponent(brandCode)}/${encodeURIComponent(
      modelCode
    )}?vehicleType=${vehicleType}`
  );
}

export function fetchFipeQuote(
  vehicleType: FipeVehicleType,
  brandCode: string,
  modelCode: string,
  yearCode: string
) {
  return requestJson<FipeQuote>(
    `/api/fipe/quote/${encodeURIComponent(brandCode)}/${encodeURIComponent(
      modelCode
    )}/${encodeURIComponent(yearCode)}?vehicleType=${vehicleType}`
  );
}
