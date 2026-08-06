"use client";

import { useEffect, useState } from "react";

/**
 * Conjunto de cidades públicas no CLIENTE.
 *
 * Ver `docs/architecture/invariante-cidade-existe-se-tem-anuncio.md`.
 *
 * ── Três estados, e a diferença importa ──────────────────────────────────
 *   "loading"     → ainda não sei
 *   "unavailable" → tentei e não consegui saber
 *   "ready"       → sei
 *
 * Só em `ready` é seguro afirmar que uma cidade NÃO existe. Colapsar
 * `unavailable` em "conjunto vazio" faria uma falha de rede descartar a cidade
 * de todo visitante e esvaziar o cabeçalho — é a versão cliente da lição
 * "payload malformado ≠ conjunto vazio" aplicada no servidor.
 */

export type PublicCitySetStatus = "loading" | "ready" | "unavailable";

export type PublicCitySetState = {
  status: PublicCitySetStatus;
  /**
   * `undefined` enquanto não se sabe (loading/unavailable) — propagado assim
   * de propósito para os consumidores caírem no caminho de fail-open.
   */
  isPublicCity: (slug: string | null | undefined) => boolean | undefined;
};

/**
 * Cache em nível de MÓDULO: uma requisição por carregamento de página, não uma
 * por componente que consome o hook (cabeçalho, contexto de cidade, rodapé…).
 * O `Cache-Control` da rota cuida das navegações seguintes.
 */
let inFlight: Promise<Set<string> | null> | null = null;
let cached: Set<string> | null = null;
let cacheFailed = false;

async function loadPublicCitySlugs(): Promise<Set<string> | null> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch("/api/cities/public-set");
      if (!res.ok) return null;

      const json = (await res.json()) as { ok?: boolean; slugs?: unknown };
      // Sem `ok` explícito ou sem array, tratamos como indisponível — nunca
      // como "não há cidade nenhuma".
      if (!json?.ok || !Array.isArray(json.slugs)) return null;

      cached = new Set(
        json.slugs
          .filter((s): s is string => typeof s === "string")
          .map((s) => s.trim().toLowerCase())
      );
      return cached;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Só para teste: zera o cache de módulo entre casos. */
export function __resetPublicCitySetCache() {
  inFlight = null;
  cached = null;
  cacheFailed = false;
}

export function usePublicCitySet(): PublicCitySetState {
  const [status, setStatus] = useState<PublicCitySetStatus>(() => {
    if (cached) return "ready";
    if (cacheFailed) return "unavailable";
    return "loading";
  });

  useEffect(() => {
    let active = true;

    void loadPublicCitySlugs().then((slugs) => {
      if (!active) return;
      if (slugs) {
        setStatus("ready");
      } else {
        cacheFailed = true;
        setStatus("unavailable");
      }
    });

    return () => {
      active = false;
    };
  }, []);

  return {
    status,
    isPublicCity: (slug) => {
      if (status !== "ready" || !cached) return undefined;
      const key = String(slug || "")
        .trim()
        .toLowerCase();
      return key ? cached.has(key) : undefined;
    },
  };
}
