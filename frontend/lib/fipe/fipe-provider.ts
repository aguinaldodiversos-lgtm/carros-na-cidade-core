// frontend/lib/fipe/fipe-provider.ts
export type FipeVehicleType = "carros" | "motos" | "caminhoes";

export type FipeOption = {
  code: string;
  name: string;
};

export type FipeQuote = {
  price: string;
  brand: string;
  model: string;
  modelYear: string;
  fuel: string;
  fipeCode: string;
  referenceMonth: string;
  vehicleType: string;
  fuelAcronym?: string;
  raw: Record<string, unknown>;
};

const DEFAULT_BASE_URL = "https://parallelum.com.br/fipe/api/v1";

function getBaseUrl() {
  return (process.env.FIPE_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

function normalizeVehicleType(value?: string): FipeVehicleType {
  if (value === "motos" || value === "caminhoes") return value;
  return "carros";
}

function toOption(item: any): FipeOption | null {
  const code = String(item?.codigo ?? item?.code ?? "").trim();
  const name = String(item?.nome ?? item?.name ?? "").trim();

  if (!code || !name) return null;
  return { code, name };
}

async function providerFetch(path: string, revalidateSeconds = 86400) {
  const response = await fetch(`${getBaseUrl()}${path}`, {
    headers: {
      Accept: "application/json",
    },
    next: {
      revalidate: revalidateSeconds,
    },
  });

  if (!response.ok) {
    throw new Error(`FIPE provider error (${response.status})`);
  }

  return response.json();
}

export async function getFipeBrands(vehicleType?: string): Promise<FipeOption[]> {
  const type = normalizeVehicleType(vehicleType);
  const data = await providerFetch(`/${type}/marcas`, 86400);

  const items = Array.isArray(data) ? data : [];
  return items.map(toOption).filter(Boolean) as FipeOption[];
}

export async function getFipeModels(
  brandCode: string,
  vehicleType?: string
): Promise<FipeOption[]> {
  const type = normalizeVehicleType(vehicleType);
  const data = await providerFetch(
    `/${type}/marcas/${encodeURIComponent(brandCode)}/modelos`,
    86400
  );

  const rawItems = Array.isArray(data)
    ? data
    : Array.isArray(data?.modelos)
      ? data.modelos
      : Array.isArray(data?.models)
        ? data.models
        : [];

  return rawItems.map(toOption).filter(Boolean) as FipeOption[];
}

export async function getFipeYears(
  brandCode: string,
  modelCode: string,
  vehicleType?: string
): Promise<FipeOption[]> {
  const type = normalizeVehicleType(vehicleType);
  const data = await providerFetch(
    `/${type}/marcas/${encodeURIComponent(brandCode)}/modelos/${encodeURIComponent(
      modelCode
    )}/anos`,
    86400
  );

  const items = Array.isArray(data) ? data : [];
  return items.map(toOption).filter(Boolean) as FipeOption[];
}

export async function getFipeQuote(
  brandCode: string,
  modelCode: string,
  yearCode: string,
  vehicleType?: string
): Promise<FipeQuote> {
  const type = normalizeVehicleType(vehicleType);
  const data = await providerFetch(
    `/${type}/marcas/${encodeURIComponent(brandCode)}/modelos/${encodeURIComponent(
      modelCode
    )}/anos/${encodeURIComponent(yearCode)}`,
    3600
  );

  return {
    price: String(data?.Valor ?? data?.price ?? "—"),
    brand: String(data?.Marca ?? data?.brand ?? "—"),
    model: String(data?.Modelo ?? data?.model ?? "—"),
    modelYear: String(data?.AnoModelo ?? data?.modelYear ?? "—"),
    fuel: String(data?.Combustivel ?? data?.fuel ?? "—"),
    fipeCode: String(data?.CodigoFipe ?? data?.fipeCode ?? "—"),
    referenceMonth: String(data?.MesReferencia ?? data?.referenceMonth ?? "—"),
    vehicleType: String(data?.TipoVeiculo ?? data?.vehicleType ?? type),
    fuelAcronym: String(data?.SiglaCombustivel ?? data?.fuelAcronym ?? ""),
    raw: data ?? {},
  };
}
