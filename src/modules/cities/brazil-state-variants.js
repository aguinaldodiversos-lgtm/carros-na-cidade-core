/**
 * Valores que podem aparecer em `cities.state` no banco (UF de 2 letras ou nome do estado).
 * Usado em WHERE UPPER(TRIM(state)) = ANY($1) para autocomplete e resolução.
 */
export function stateColumnValuesForUf(ufInput) {
  const code = String(ufInput ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
  if (code.length !== 2) return [];

  const longUpper = {
    AC: ["ACRE"],
    AL: ["ALAGOAS"],
    AP: ["AMAPÁ", "AMAPA"],
    AM: ["AMAZONAS"],
    BA: ["BAHIA"],
    CE: ["CEARÁ", "CEARA"],
    DF: ["DISTRITO FEDERAL"],
    ES: ["ESPÍRITO SANTO", "ESPIRITO SANTO"],
    GO: ["GOIÁS", "GOIAS"],
    MA: ["MARANHÃO", "MARANHAO"],
    MT: ["MATO GROSSO"],
    MS: ["MATO GROSSO DO SUL"],
    MG: ["MINAS GERAIS"],
    PA: ["PARÁ", "PARA"],
    PB: ["PARAÍBA", "PARAIBA"],
    PR: ["PARANÁ", "PARANA"],
    PE: ["PERNAMBUCO"],
    PI: ["PIAUÍ", "PIAUI"],
    RJ: ["RIO DE JANEIRO"],
    RN: ["RIO GRANDE DO NORTE"],
    RS: ["RIO GRANDE DO SUL"],
    RO: ["RONDÔNIA", "RONDONIA"],
    RR: ["RORAIMA"],
    SC: ["SANTA CATARINA"],
    SP: ["SÃO PAULO", "SAO PAULO"],
    SE: ["SERGIPE"],
    TO: ["TOCANTINS"],
  };

  const extras = longUpper[code] ?? [];
  return [...new Set([code, ...extras])];
}

/** Verifica se o valor em `cities.state` corresponde à UF escolhida (código ou nome do estado). */
export function stateRowMatchesUf(rowStateRaw, ufCode) {
  const ufNorm = String(ufCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 2);
  if (ufNorm.length !== 2) return false;
  if (rowStateRaw == null || String(rowStateRaw).trim() === "") return true;
  const row = String(rowStateRaw).trim().toUpperCase();
  if (row === ufNorm) return true;
  const variants = stateColumnValuesForUf(ufNorm);
  return variants.includes(row);
}
