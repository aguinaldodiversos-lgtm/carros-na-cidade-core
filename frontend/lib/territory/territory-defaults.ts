/**
 * Estado padrão do portal — base do princípio territorial.
 *
 * Política nova (substitui a "rodada de credibilidade", que tinha
 * DEFAULT_PUBLIC_CITY_SLUG=sao-paulo-sp e nacionalizava /comprar):
 *
 *   - Home e /comprar SEM cookie/query → estado padrão (SP).
 *   - Com cookie/query → resolve UF inferida da cidade do usuário.
 *   - Cidade segue sendo o filtro mais restrito (não default).
 *
 * O default é overridable via env (`NEXT_PUBLIC_DEFAULT_STATE_UF`) para
 * que ambientes de staging/dev possam apontar para outro estado sem
 * mexer no código.
 */

import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";

import type { TerritoryState } from "./territory-context";

const FALLBACK_STATE: TerritoryState = {
  code: "SP",
  slug: "sp",
  name: "São Paulo",
};

function readEnv(name: string): string {
  return process.env[name]?.trim() || "";
}

function buildDefaultState(): TerritoryState {
  const raw = readEnv("NEXT_PUBLIC_DEFAULT_STATE_UF").toUpperCase();
  if (!/^[A-Z]{2}$/.test(raw)) return FALLBACK_STATE;
  const match = BRAZIL_UFS.find((uf) => uf.value === raw);
  if (!match) return FALLBACK_STATE;
  return { code: match.value, slug: match.value.toLowerCase(), name: match.label };
}

const DEFAULT_STATE = buildDefaultState();

export function getDefaultTerritoryState(): TerritoryState {
  return DEFAULT_STATE;
}

export function stateFromUf(uf: string | null | undefined): TerritoryState | null {
  if (!uf) return null;
  const value = String(uf).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(value)) return null;
  const match = BRAZIL_UFS.find((u) => u.value === value);
  if (!match) return null;
  return { code: match.value, slug: match.value.toLowerCase(), name: match.label };
}

/**
 * Infere UF a partir do sufixo de um slug `cidade-uf`.
 * Retorna null se o slug não termina em duas letras de UF válida.
 */
export function ufFromCitySlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const parts = String(slug).trim().toLowerCase().split("-").filter(Boolean);
  if (parts.length < 2) return null;
  const tail = parts[parts.length - 1];
  if (!/^[a-z]{2}$/.test(tail)) return null;
  const uf = tail.toUpperCase();
  return BRAZIL_UFS.some((u) => u.value === uf) ? uf : null;
}
