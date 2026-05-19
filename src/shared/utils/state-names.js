/**
 * Mapeamento UF → nome completo do estado brasileiro.
 *
 * Único ponto de verdade para apresentação de UFs ao usuário no backend.
 * O frontend tem um helper equivalente em `lib/buy/territory-variant.ts`
 * (`stateNameFromUf`) — mantido em paralelo para reduzir round-trip ao
 * backend para algo que muda nunca.
 *
 * Caller deve passar UF de 2 letras (case-insensitive). UF desconhecida
 * retorna `null` — caller decide fallback (geralmente exibir só a sigla).
 */

const STATE_NAMES = Object.freeze({
  AC: "Acre",
  AL: "Alagoas",
  AM: "Amazonas",
  AP: "Amapá",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MG: "Minas Gerais",
  MS: "Mato Grosso do Sul",
  MT: "Mato Grosso",
  PA: "Pará",
  PB: "Paraíba",
  PE: "Pernambuco",
  PI: "Piauí",
  PR: "Paraná",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RO: "Rondônia",
  RR: "Roraima",
  RS: "Rio Grande do Sul",
  SC: "Santa Catarina",
  SE: "Sergipe",
  SP: "São Paulo",
  TO: "Tocantins",
});

export function stateNameFromUf(uf) {
  const key = String(uf || "").trim().toUpperCase().slice(0, 2);
  if (!key) return null;
  return STATE_NAMES[key] ?? null;
}

export function getAllStates() {
  return Object.entries(STATE_NAMES).map(([code, name]) => ({
    code,
    slug: code.toLowerCase(),
    name,
  }));
}
