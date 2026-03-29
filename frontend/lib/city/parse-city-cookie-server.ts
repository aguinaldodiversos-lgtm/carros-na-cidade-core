import type { CityRef } from "@/lib/city/city-types";
import { buildCityLabel, normalizeCityId } from "@/lib/city/city-types";
import { CITY_COOKIE_NAME } from "@/lib/city/city-constants";

/** Parse do cookie `cnc_city` no servidor (layout / page). */
export function parseCityCookieValue(raw: string | undefined): CityRef | null {
  if (!raw?.trim()) return null;
  try {
    const decoded = decodeURIComponent(raw.trim());
    const parsed = JSON.parse(decoded) as Partial<CityRef>;
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

export function getCityCookieFromRequestCookie(
  cookieHeader: string | null | undefined
): CityRef | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith(`${CITY_COOKIE_NAME}=`)) {
      const value = p.slice(CITY_COOKIE_NAME.length + 1);
      return parseCityCookieValue(value);
    }
  }
  return null;
}
