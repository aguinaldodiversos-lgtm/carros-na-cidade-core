// src/modules/ads/search-policy/flag.js
//
// Flag do Search Policy Engine (R4): `SEARCH_POLICY_ENGINE` ∈ off | shadow | v1
// e allowlist `SEARCH_POLICY_ENGINE_CITIES` (slugs separados por vírgula, ou "*").
//
//   off    → caminho atual, byte a byte. Nenhum módulo desta pasta é chamado.
//   shadow → caminho atual responde; o motor roda depois da resposta e só
//            grava telemetria (search.executed com old/new).
//   v1     → o motor responde, SOMENTE se a origem resolvida estiver na
//            allowlist; fora dela a requisição segue como `off`.
//
// Lido a cada chamada (não em import-time): os testes alternam o modo por
// `process.env` e o deploy troca a env sem rebuild.

export const FLAG_OFF = "off";
export const FLAG_SHADOW = "shadow";
export const FLAG_V1 = "v1";

const MODES = new Set([FLAG_OFF, FLAG_SHADOW, FLAG_V1]);

export function getSearchPolicyFlag(env = process.env) {
  const raw = String(env.SEARCH_POLICY_ENGINE || "")
    .trim()
    .toLowerCase();
  return MODES.has(raw) ? raw : FLAG_OFF;
}

/** Allowlist parseada: `"*"` ou `Set<string>` de slugs. */
export function getSearchPolicyCities(env = process.env) {
  const raw = String(env.SEARCH_POLICY_ENGINE_CITIES || "").trim();
  if (raw === "*") return "*";
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  return set;
}

/**
 * A origem resolvida pode receber o motor em v1?
 * Sem origem (NATIONAL/NONE) só entra com allowlist "*": não há o que casar.
 */
export function isOriginAllowed(originSlug, env = process.env) {
  const cities = getSearchPolicyCities(env);
  if (cities === "*") return true;
  if (!originSlug) return false;
  return cities.has(String(originSlug).toLowerCase());
}
