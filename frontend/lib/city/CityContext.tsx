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
    const ls = readCityFromLocalStorage();
    const ck = readCityFromCookie();

    void (async () => {
      let next: CityRef = initialCity;
      let nextSource: CitySource = "fallback";

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
      writeCityToLocalStorage(next, { userConfirmed: false });
      writeCityCookie(next);
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

      const onComprar = (pathname.replace(/\/+$/, "") || "/") === "/comprar";
      if (onComprar) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("city_slug", next.slug);
        params.delete("city_id");
        params.delete("city");
        params.delete("state");
        params.set("page", "1");
        const qs = params.toString();
        router.push(qs ? `/comprar?${qs}` : `/comprar?city_slug=${encodeURIComponent(next.slug)}`);
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
