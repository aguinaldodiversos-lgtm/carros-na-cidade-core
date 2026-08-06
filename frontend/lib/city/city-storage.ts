import { CITY_COOKIE_NAME, CITY_STORAGE_KEY, CITY_USER_SET_KEY } from "@/lib/city/city-constants";
import type { CityRef } from "@/lib/city/city-types";
import { buildCityLabel, normalizeCityId } from "@/lib/city/city-types";

export { CITY_COOKIE_NAME, CITY_STORAGE_KEY, CITY_USER_SET_KEY };

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

/**
 * O slug canônico é `<nome-slugificado>-<uf>`, então a UF do slug e o campo
 * `state` têm que concordar. Quando divergem, o registro está corrompido.
 *
 * Caso real observado em produção (2026-08-05):
 *   { slug: "altaneira-ce", name: "São Paulo", state: "SP", label: "São Paulo (SP)" }
 * O cabeçalho exibia "São Paulo (SP)" enquanto a navegação usava
 * `altaneira-ce` — e o botão Comprar levava a uma URL que passou a dar 404.
 *
 * Valida DUAS coisas, porque só a UF não basta: `{slug:"atibaia-sp",
 * name:"São Paulo", state:"SP"}` tem a UF batendo e ainda assim mostraria
 * "São Paulo (SP)" no cabeçalho navegando para Atibaia.
 *
 *   1. a UF do slug bate com `state`;
 *   2. o NOME, compactado, bate com o corpo do slug.
 *
 * A comparação do nome remove tudo que não é letra ou dígito dos dois lados
 * ("Santa Bárbara d'Oeste" → "santabarbaradoeste"), para tolerar divergência
 * de pontuação entre o slug do banco e uma slugificação ingênua sem, com isso,
 * deixar passar cidade trocada.
 */
export function isCityRefSelfConsistent(city: Partial<CityRef> | null | undefined): boolean {
  const slug = String(city?.slug || "")
    .trim()
    .toLowerCase();
  const state = String(city?.state || "")
    .trim()
    .toLowerCase();
  if (!slug || !state) return false;

  const parts = slug.split("-").filter(Boolean);
  if (parts.length < 2) return false;
  if (parts[parts.length - 1] !== state.slice(0, 2)) return false;

  const name = String(city?.name || "");
  if (!name.trim()) return false;

  return compactAlnum(parts.slice(0, -1).join("-")) === compactAlnum(name);
}

/** "Santa Bárbara d'Oeste" e "santa-barbara-doeste" → "santabarbaradoeste". */
function compactAlnum(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Normaliza um `CityRef` para gravação, com o rótulo SEMPRE derivado de
 * nome+UF. O `label` deixa de ser um campo que o chamador pode passar
 * dessincronizado — vira função dos outros dois, por construção.
 *
 * Devolve `null` quando o registro é incoerente: melhor não ter cidade
 * guardada do que ter uma que aponta para lugar nenhum.
 */
export function normalizeCityRefForStorage(city: Partial<CityRef> | null | undefined) {
  const slug = String(city?.slug || "")
    .trim()
    .toLowerCase();
  const name = String(city?.name || "").trim();
  const state = String(city?.state || "")
    .trim()
    .toUpperCase()
    .slice(0, 2);

  if (!slug || !name || !state) return null;

  const normalized: CityRef = {
    id: normalizeCityId(city?.id),
    slug,
    name,
    state,
    // Derivado, nunca copiado: elimina a divergência rótulo↔dados.
    label: buildCityLabel(name, state),
  };

  return isCityRefSelfConsistent(normalized) ? normalized : null;
}

export function readCityFromLocalStorage(): CityRef | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(CITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CityRef>;
    // Registro incoerente (slug de uma cidade, rótulo de outra) é DESCARTADO
    // na leitura, não "consertado": não há como saber qual dos dois lados está
    // certo, e adivinhar levaria o usuário para a cidade errada em silêncio.
    return normalizeCityRefForStorage(parsed);
  } catch {
    return null;
  }
}

export type WriteCityStorageOptions = {
  /** Quando true, marca que o usuário escolheu ou confirmou a cidade (banner / picker). */
  userConfirmed?: boolean;
};

export function writeCityToLocalStorage(city: CityRef, options?: WriteCityStorageOptions): void {
  if (!isBrowser()) return;

  // Barra a gravação incoerente na ORIGEM. Antes, qualquer chamador que
  // montasse o objeto com slug de uma cidade e nome de outra persistia a
  // divergência, e ela só aparecia depois, na navegação.
  const normalized = normalizeCityRefForStorage(city);
  if (!normalized) return;

  try {
    localStorage.setItem(CITY_STORAGE_KEY, JSON.stringify(normalized));
    if (options?.userConfirmed) {
      localStorage.setItem(CITY_USER_SET_KEY, "1");
    }
  } catch {
    /* quota */
  }
}

/**
 * Descarta a cidade guardada quando ela não pertence mais ao conjunto público.
 *
 * Consequência direta do invariante: cidade que perde o último anúncio deixa
 * de existir, e o estado do cliente precisa saber disso — senão o usuário
 * segue navegando para uma URL que agora responde 404.
 *
 * Recebe um PREDICADO em vez do conjunto para não acoplar este módulo ao
 * transporte (o conjunto chega por fetch, este arquivo é síncrono).
 *
 * Devolve `true` quando descartou. Só mexe nas DUAS chaves de cidade — o
 * rascunho do wizard (`carros-na-cidade:new-ad-wizard:v3`) e qualquer outra
 * chave ficam intactos.
 */
export function discardStoredCityIfAbsent(isPublicCity: (slug: string) => boolean): boolean {
  if (!isBrowser()) return false;

  const stored = readCityFromLocalStorage();
  if (!stored) return false;
  if (isPublicCity(stored.slug)) return false;

  clearCityStorage();
  return true;
}

/** Confirmação explícita (ex.: banner “Confirme sua região”) sem alterar a cidade. */
export function markUserConfirmedCity(): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(CITY_USER_SET_KEY, "1");
  } catch {
    /* quota */
  }
}

export function readCityFromCookie(): CityRef | null {
  if (!isBrowser() || !document.cookie) return null;
  const match = document.cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${CITY_COOKIE_NAME}=`));
  if (!match) return null;
  try {
    const value = decodeURIComponent(match.split("=").slice(1).join("="));
    const parsed = JSON.parse(value) as Partial<CityRef>;
    if (!parsed?.slug || !parsed?.name) return null;
    return {
      id: normalizeCityId(parsed.id),
      slug: String(parsed.slug),
      name: String(parsed.name),
      state: String(parsed.state || "SP")
        .toUpperCase()
        .slice(0, 2),
      label: parsed.label || buildCityLabel(parsed.name, parsed.state || "SP"),
    };
  } catch {
    return null;
  }
}

export function writeCityCookie(city: CityRef): void {
  if (!isBrowser()) return;
  try {
    const payload = encodeURIComponent(JSON.stringify(city));
    document.cookie = `${CITY_COOKIE_NAME}=${payload};path=/;max-age=${COOKIE_MAX_AGE_SEC};SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function clearCityStorage(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(CITY_STORAGE_KEY);
    localStorage.removeItem(CITY_USER_SET_KEY);
    document.cookie = `${CITY_COOKIE_NAME}=;path=/;max-age=0;SameSite=Lax`;
  } catch {
    /* ignore */
  }
}

export function hasUserConfirmedCity(): boolean {
  if (!isBrowser()) return false;
  return localStorage.getItem(CITY_USER_SET_KEY) === "1";
}
