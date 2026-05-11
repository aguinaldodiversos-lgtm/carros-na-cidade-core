"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { extractCitySlugFromPathname } from "@/lib/city/city-from-pathname";
import { DEFAULT_CITY } from "@/lib/city/city-default";
import type { CityRef, CitySource } from "@/lib/city/city-types";
import {
  hasUserConfirmedCity,
  readCityFromCookie,
  readCityFromLocalStorage,
  writeCityCookie,
  writeCityToLocalStorage,
} from "@/lib/city/city-storage";

type CityContextValue = {
  city: CityRef;
  /** `cities.id` quando conhecido (API / cookie). */
  cityId: number | null;
  /** Origem do território ativo no cliente. */
  source: CitySource;
  setCity: (city: CityRef) => void;
  isReady: boolean;
  openCityPicker: () => void;
  closeCityPicker: () => void;
  cityPickerOpen: boolean;
};

const CityCtx = createContext<CityContextValue | null>(null);

async function fetchCityBySlug(slug: string): Promise<CityRef | null> {
  try {
    const res = await fetch(`/api/cities/by-slug/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    const json = (await res.json()) as { success?: boolean; data?: CityRef };
    if (!json.success || !json.data?.slug) return null;
    return json.data;
  } catch {
    return null;
  }
}

function CityProviderInner({
  children,
  initialCity,
}: {
  children: ReactNode;
  initialCity: CityRef;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [city, setCityState] = useState<CityRef>(initialCity);
  const [citySource, setCitySource] = useState<CitySource>("fallback");
  const [ready, setReady] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const hydrated = useRef(false);
  const searchKey = searchParams.toString();

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;

    const qSlug = searchParams.get("city_slug")?.trim();
    // Slug derivado do pathname em rotas territoriais (ex.:
    // `/carros-usados/regiao/atibaia-sp` → atibaia-sp). Tem prioridade
    // MENOR que `?city_slug=` (clique explícito) e MAIOR que cookie/
    // localStorage — caso contrário, ao visitar a página regional de
    // Atibaia com cookie=sao-paulo-sp, o header mostraria São Paulo
    // (incoerência territorial reproduzida em 2026-05-11).
    const pathSlug = extractCitySlugFromPathname(pathname);
    const ls = readCityFromLocalStorage();
    const ck = readCityFromCookie();

    void (async () => {
      let next: CityRef = initialCity;
      let nextSource: CitySource = "fallback";
      // Ativos contextuais (path) NÃO sobrescrevem a cidade que o
      // visitante já escolheu/salvou. Só `url` (query explícita) e
      // ações de `setCity` persistem. Assim, navegar pela página
      // regional de Atibaia exibe Atibaia no header sem mudar a
      // "cidade-base" salva do usuário.
      let shouldPersist = true;

      if (qSlug) {
        const resolved = await fetchCityBySlug(qSlug);
        if (resolved) {
          next = resolved;
        } else if (ls?.slug === qSlug) {
          next = ls;
        } else if (ck?.slug === qSlug) {
          next = ck;
        } else {
          next = { ...DEFAULT_CITY, slug: qSlug };
        }
        nextSource = "url";
      } else if (pathSlug) {
        // Tenta resolver via API (label/name reais). Fallback:
        // monta um CityRef minimamente válido com o slug, marcando
        // como source="path". O hook abaixo (segundo useEffect)
        // continua escutando mudanças de query, mas não escutamos
        // mudanças de pathname aqui — re-hidratação inicial é
        // suficiente porque `useMemo(routes, [city.slug])` no
        // PublicHeader reage à troca, e navegação client-side
        // entre territoriais dispara este efeito de novo se o
        // contexto for remontado.
        const resolved = await fetchCityBySlug(pathSlug);
        if (resolved) {
          next = resolved;
        } else if (ls?.slug === pathSlug) {
          next = ls;
        } else if (ck?.slug === pathSlug) {
          next = ck;
        } else {
          next = { ...DEFAULT_CITY, slug: pathSlug };
        }
        nextSource = "path";
        shouldPersist = false;
      } else if (hasUserConfirmedCity() && ls) {
        next = ls;
        nextSource = "manual";
      } else if (ck?.slug) {
        next = ck;
        nextSource = "cookie";
      } else if (ls?.slug) {
        next = ls;
        nextSource = "cookie";
      } else {
        next = initialCity;
        nextSource = initialCity.slug === DEFAULT_CITY.slug ? "fallback" : "cookie";
      }

      setCityState(next);
      setCitySource(nextSource);
      if (shouldPersist) {
        writeCityToLocalStorage(next, { userConfirmed: false });
        writeCityCookie(next);
      }
      setReady(true);
    })();
  }, [initialCity, searchKey]);

  const setCity = useCallback(
    (next: CityRef) => {
      setCityState(next);
      setCitySource("manual");
      writeCityToLocalStorage(next, { userConfirmed: true });
      writeCityCookie(next);
      setPickerOpen(false);

      const normalizedPath = pathname.replace(/\/+$/, "") || "/";
      const onComprar =
        normalizedPath === "/comprar" ||
        normalizedPath.startsWith("/comprar/estado/") ||
        normalizedPath.startsWith("/comprar/cidade/");

      if (onComprar) {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("city_slug");
        params.delete("city_id");
        params.delete("city");
        params.delete("state");
        params.delete("page");
        const qs = params.toString();
        const target = `/comprar/cidade/${encodeURIComponent(next.slug)}`;
        router.push(qs ? `${target}?${qs}` : target);
        return;
      }

      router.refresh();
    },
    [router, pathname, searchParams]
  );

  useEffect(() => {
    if (!ready) return;
    const qSlug = searchParams.get("city_slug")?.trim();
    if (!qSlug || qSlug === city.slug) return;

    void fetchCityBySlug(qSlug).then((resolved) => {
      if (resolved) {
        setCityState(resolved);
        setCitySource("url");
        writeCityToLocalStorage(resolved, { userConfirmed: false });
        writeCityCookie(resolved);
      }
    });
  }, [ready, searchParams, city.slug]);

  // Sync `city` quando o usuário navega entre rotas territoriais
  // client-side (ex.: /carros-em/sao-paulo-sp → /carros-usados/regiao/
  // atibaia-sp). Sem isso, o header continuaria mostrando a cidade
  // resolvida na hidratação inicial.
  //
  // Regras de quando NÃO reagir ao pathname:
  //   - `?city_slug=` na URL atual: o efeito acima já cuida disso e
  //     vence o path-slug (query é mais explícita).
  //   - source = "manual": usuário escolheu cidade conscientemente
  //     via picker; respeitamos a escolha mesmo ao visitar páginas
  //     de outras cidades. Atibaia aparece no h1 da regional via o
  //     próprio template; o header reflete a preferência salva.
  //   - source = "url": query é a fonte de verdade enquanto vigente.
  //
  // Em qualquer outro caso (source = path/cookie/fallback), o
  // path-derived vence — porque é mais específico que cookie default
  // e menos invasivo que sobrescrever escolha manual.
  useEffect(() => {
    if (!ready) return;
    if (searchParams.get("city_slug")?.trim()) return;
    if (citySource === "manual" || citySource === "url") return;

    const pathSlug = extractCitySlugFromPathname(pathname);
    if (!pathSlug || pathSlug === city.slug) return;

    void fetchCityBySlug(pathSlug).then((resolved) => {
      const next: CityRef = resolved ?? { ...DEFAULT_CITY, slug: pathSlug };
      setCityState(next);
      setCitySource("path");
      // Importante: NÃO persistir. Path-derived é display-only —
      // se sobrescrevêssemos cookie/localStorage, navegar pela página
      // de Atibaia mudaria a "cidade-base" salva do usuário sem
      // consentimento, e a próxima visita pela home apareceria
      // Atibaia em vez da preferência prévia.
    });
  }, [ready, pathname, city.slug, citySource, searchParams]);

  const cityId = city.id ?? null;

  const value = useMemo<CityContextValue>(
    () => ({
      city,
      cityId,
      source: citySource,
      setCity,
      isReady: ready,
      openCityPicker: () => setPickerOpen(true),
      closeCityPicker: () => setPickerOpen(false),
      cityPickerOpen: pickerOpen,
    }),
    [city, cityId, citySource, setCity, ready, pickerOpen]
  );

  return <CityCtx.Provider value={value}>{children}</CityCtx.Provider>;
}

export function CityProvider({
  children,
  initialCity,
}: {
  children: ReactNode;
  initialCity: CityRef;
}) {
  return <CityProviderInner initialCity={initialCity}>{children}</CityProviderInner>;
}

export function useCity(): CityContextValue {
  const ctx = useContext(CityCtx);
  if (!ctx) {
    throw new Error("useCity deve ser usado dentro de CityProvider.");
  }
  return ctx;
}

export function useCityOptional(): CityContextValue | null {
  return useContext(CityCtx);
}
