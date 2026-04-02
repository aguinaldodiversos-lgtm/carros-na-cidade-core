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

function toOption(item: unknown): FipeOption | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const rawCode = row.codigo ?? row.code;
  const code =
    typeof rawCode === "string" || typeof rawCode === "number"
      ? String(rawCode).trim()
      : "";
  const name = String(row.nome ?? row.name ?? "").trim();

  if (!code || !name) return null;
  return { code, name };
}

/**
 * A FIPE HTTP (Parallelum) retorna modelos de dois jeitos:
 * - lista plana: `{ nome, codigo: "123" }`
 * - aninhada: `{ nome: "Gol", codigo: [ { nome: "1.0", codigo: "2013-1" }, ... ] }`
 * O segundo caso quebrava o wizard (select vazio / códigos inválidos).
 */
export function flattenFipeModelRows(rawItems: unknown[]): FipeOption[] {
  const out: FipeOption[] = [];
  const seen = new Set<string>();

  for (const item of rawItems) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const parentName = String(row.nome ?? row.name ?? "").trim();
    const rawCode = row.codigo ?? row.code;

    if (Array.isArray(rawCode)) {
      for (const sub of rawCode) {
        if (!sub || typeof sub !== "object") continue;
        const subRow = sub as Record<string, unknown>;
        const code = String(subRow.codigo ?? subRow.code ?? "").trim();
        const subName = String(subRow.nome ?? subRow.name ?? "").trim();
        if (!code || !subName) continue;
        const label = [parentName, subName].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
        if (!seen.has(code)) {
          seen.add(code);
          out.push({ code, name: label || subName });
        }
      }
      continue;
    }

    const opt = toOption(item);
    if (opt && !seen.has(opt.code)) {
      seen.add(opt.code);
      out.push(opt);
    }
  }

  return out;
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

  return flattenFipeModelRows(rawItems);
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
