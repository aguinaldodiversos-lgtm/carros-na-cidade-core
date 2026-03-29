import {
  CITY_COOKIE_NAME,
  CITY_STORAGE_KEY,
  CITY_USER_SET_KEY,
} from "@/lib/city/city-constants";
import type { CityRef } from "@/lib/city/city-types";
import { buildCityLabel, normalizeCityId } from "@/lib/city/city-types";

export { CITY_COOKIE_NAME, CITY_STORAGE_KEY, CITY_USER_SET_KEY };

const COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 400;

function isBrowser() {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

export function readCityFromLocalStorage(): CityRef | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(CITY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CityRef>;
    if (!parsed?.slug || !parsed?.name) return null;
    return {
      id: normalizeCityId(parsed.id),
      slug: String(parsed.slug),
      name: String(parsed.name),
      state: String(parsed.state || "SP").toUpperCase().slice(0, 2),
      label: parsed.label || buildCityLabel(parsed.name, parsed.state || "SP"),
    };
  } catch {
    return null;
  }
}

export type WriteCityStorageOptions = {
  /** Quando true, marca que o usuário escolheu ou confirmou a cidade (banner / picker). */
  userConfirmed?: boolean;
};

export function writeCityToLocalStorage(
  city: CityRef,
  options?: WriteCityStorageOptions
): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(CITY_STORAGE_KEY, JSON.stringify(city));
    if (options?.userConfirmed) {
      localStorage.setItem(CITY_USER_SET_KEY, "1");
    }
  } catch {
    /* quota */
  }
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
      state: String(parsed.state || "SP").toUpperCase().slice(0, 2),
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
