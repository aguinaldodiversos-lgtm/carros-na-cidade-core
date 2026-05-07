// frontend/lib/fipe/fipe-provider.ts
import { FIPE_BRAND_SNAPSHOT } from "./fipe-brands-snapshot";

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
    typeof rawCode === "string" || typeof rawCode === "number" ? String(rawCode).trim() : "";
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

/**
 * O provider público (parallelum.com.br) tem rate limit agressivo e
 * frequentemente devolve 429 quando o tráfego de SEO da /tabela-fipe
 * sobe. Em 429/5xx fazemos retry com backoff curto (200/600/1200ms);
 * esgotadas as tentativas, traduzimos o status para mensagem PT-BR
 * amigável em vez do críptico "FIPE provider error (429)". O Next.js
 * cacheia (revalidate=86400 listas / 3600 cotação), então o retry
 * afeta apenas a primeira chamada de cada tupla cacheada.
 */
async function providerFetch(path: string, revalidateSeconds = 86400) {
  const url = `${getBaseUrl()}${path}`;
  const retriableStatus = new Set([429, 500, 502, 503, 504]);
  const delaysMs = [200, 600, 1200];
  let lastStatus: number | null = null;

  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    let response: Response;

    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        next: { revalidate: revalidateSeconds },
      });
    } catch {
      if (attempt >= delaysMs.length) {
        throw new Error(
          "Não foi possível consultar a FIPE no momento. Tente novamente em alguns instantes."
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
      continue;
    }

    if (response.ok) return response.json();

    lastStatus = response.status;

    if (!retriableStatus.has(response.status) || attempt >= delaysMs.length) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, delaysMs[attempt]));
  }

  if (lastStatus === 429) {
    throw new Error(
      "A consulta FIPE está temporariamente saturada. Aguarde alguns segundos e tente novamente."
    );
  }

  if (lastStatus === 404) {
    throw new Error("Não encontramos esse veículo na Tabela FIPE. Revise marca, modelo e ano.");
  }

  throw new Error("A FIPE está indisponível no momento. Tente novamente em alguns instantes.");
}

/**
 * Lista de marcas via provider, com fallback estático.
 *
 * Caso real (produção, Render free tier): parallelum bloqueia/rate-limita
 * o IP de saída e o `/marcas` falha 100% das vezes — todo o wizard de
 * anúncio fica preso no Step "Veículo" com "Não foi possível carregar
 * marcas da FIPE.". Marcas raramente mudam (adições ~1-2x/ano), então
 * usar o snapshot estático embutido como fallback é seguro: o usuário
 * consegue escolher montadora e seguir; modelos/anos são lazy e tentam
 * o provider de novo (cache de Next.js cobre cold start). Quando o
 * provider voltar, futuros deploys/builds atualizam naturalmente.
 */
export async function getFipeBrands(vehicleType?: string): Promise<FipeOption[]> {
  const type = normalizeVehicleType(vehicleType);

  try {
    const data = await providerFetch(`/${type}/marcas`, 86400);
    const items = Array.isArray(data) ? data : [];
    const brands = items.map(toOption).filter(Boolean) as FipeOption[];
    if (brands.length > 0) return brands;
    // Provider devolveu lista vazia → trata como falha pra cair no fallback.
    throw new Error("Provider devolveu lista de marcas vazia.");
  } catch (error) {
    const fallback = FIPE_BRAND_SNAPSHOT[type];
    if (fallback && fallback.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(
        `[fipe-provider] usando snapshot estático para marcas (${type}) — provider falhou:`,
        error instanceof Error ? error.message : error
      );
      return fallback.map((item) => ({ code: item.code, name: item.name }));
    }
    throw error;
  }
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
