import {
  writeCityCookie,
  writeCityToLocalStorage,
} from "@/lib/city/city-storage";
import { writeTerritorialPrefs } from "@/lib/territory/territorial-prefs";

/**
 * Primitivas client-side compartilhadas pelo fluxo "Ver carros perto
 * de mim".
 *
 * Consumidores:
 *   - `hooks/useNearbyRegionRedirect`  (catálogo: NearbyRegionButton)
 *   - `components/home/LocationRegionalPrompt`  (Home: card grande)
 *
 * Antes da extração, cada consumidor tinha a sua cópia de
 * `postResolveLocation` + `persistCity`. Risco: divergir no futuro
 * (mudança no envelope do BFF aplicada num lado e esquecida no outro).
 * Manter num único módulo é a fonte única de verdade para a parte que
 * fala com o BFF e para a parte que persiste preferências.
 *
 * Privacidade (LGPD, briefing item 7):
 *   - Esta função NUNCA persiste lat/lng. Persiste apenas o resultado
 *     resolvido (slug/name/state/label da cidade).
 *   - Cookie `cnc_city` e localStorage `cnc_active_city_v1` carregam
 *     só nomes públicos. Cookie territorial guarda só preferência.
 *   - Caller é responsável por nunca printar `latitude`/`longitude`
 *     no console — esta função pega-os por argumento e os descarta.
 */

export interface ResolvedLocation {
  city: { slug: string; name: string; state: string } | null;
  state: { code: string; slug: string };
  region: { slug: string; name: string; href: string } | null;
  confidence: "high" | "medium" | "low";
  distanceKm: number;
}

export type ResolveOutcome =
  | { kind: "ok"; data: ResolvedLocation }
  | { kind: "empty" } // backend devolveu 200 + null (fora de cobertura)
  | { kind: "backend_error"; status: number }; // 4xx/5xx/network

/**
 * Chama o BFF `/api/location/resolve` com lat/lng. O BFF cuida de
 * injetar o `X-Internal-Token` no header server-side e proxia para o
 * backend interno `/api/internal/location/resolve`.
 *
 * Retorna union discriminada para o caller distinguir "fora de
 * cobertura" (backend ok, cidade não existe) de "backend offline"
 * (502/timeout/parse) — UX diferente para cada caso.
 *
 * Os headers `X-Diag-*` da resposta do BFF (Reason, TokenConfigured,
 * BackendStatus) ficam disponíveis na response mas não viajam para o
 * caller — operador inspeciona no DevTools quando precisa diagnosticar.
 */
export async function postResolveLocation(
  latitude: number,
  longitude: number
): Promise<ResolveOutcome> {
  let response: Response;
  try {
    response = await fetch("/api/location/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latitude, longitude }),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return { kind: "backend_error", status: 0 };
  }

  if (!response.ok) {
    return { kind: "backend_error", status: response.status };
  }

  let envelope: { ok?: boolean; data?: ResolvedLocation | null };
  try {
    envelope = await response.json();
  } catch {
    return { kind: "backend_error", status: response.status };
  }

  if (!envelope?.ok) {
    return { kind: "backend_error", status: response.status };
  }

  const data = envelope.data ?? null;
  if (!data || !data.city) {
    return { kind: "empty" };
  }
  return { kind: "ok", data };
}

/**
 * Persiste a cidade resolvida em cookie + localStorage + prefs
 * territoriais. Nunca persiste coordenadas.
 *
 * `source` documenta como a cidade foi obtida:
 *   - "geolocation": o usuário compartilhou a localização.
 *   - "manual":      escolha explícita via picker.
 * É usado para auditoria de prefs e não tem efeito de roteamento.
 */
export function persistResolvedCity(
  city: { slug: string; name: string; state: string },
  region: { slug: string } | null,
  source: "geolocation" | "manual"
): void {
  writeCityCookie({
    slug: city.slug,
    name: city.name,
    state: city.state,
    label: `${city.name} (${city.state})`,
  });
  writeCityToLocalStorage(
    {
      slug: city.slug,
      name: city.name,
      state: city.state,
      label: `${city.name} (${city.state})`,
    },
    { userConfirmed: true }
  );
  writeTerritorialPrefs({
    citySlug: city.slug,
    regionSlug: region?.slug ?? null,
    state: city.state,
    source,
  });
}
