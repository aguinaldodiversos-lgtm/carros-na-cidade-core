export type SessionAccountType = "CPF" | "CNPJ" | "pending";

export function getDefaultDashboardRedirect(type: SessionAccountType) {
  if (type === "CNPJ") return "/dashboard-loja";
  return "/dashboard";
}

/**
 * Rejeita espaço, qualquer control-char (U+0000-U+001F), DEL (U+007F) e
 * barra-invertida (U+005C) LITERAIS. Navegadores removem/normalizam esses
 * (`\` -> `/`), o que pode revelar um `//host` oculto num destino de redirect.
 * Um `next` interno legítimo nunca os contém (espaço em query vem como `%20`).
 * Usa `charCodeAt` (não regex de control-char) para manter o fonte 100% ASCII.
 */
function hasUnsafeChars(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f || code === 0x5c) return true;
  }
  return false;
}

/**
 * ÚNICO validador de destino de redirect (`next`). Qualquer código que consuma
 * um `next` vindo do usuário DEVE passar por aqui — não crie um segundo
 * validador (foi o que causou o open redirect: havia um validador mais fraco no
 * caminho alcançável). `normalizeNextParam` da página de login delega a esta
 * função; os BFF routes (login/register) a usam via `resolvePostLoginRedirect`.
 *
 * Aceita SOMENTE caminhos da mesma origem. Rejeita, em camadas:
 *  1. não-string / vazio.
 *  2. espaço/control-char/DEL/barra-invertida literais (ver `hasUnsafeChars`).
 *  3. barra-invertida PERCENT-ENCODED (`%5C`) — sem uso legítimo em rota interna.
 *  4. o que não começa com `/` (URLs absolutas, `javascript:`, `data:`) ou começa
 *     com `//` (protocol-relative).
 *  5. `/api/` (não navegável) e as próprias telas de auth (`/login`, `/cadastro`)
 *     para evitar loop.
 *  6. robustez final: resolve contra uma origem sentinela via `new URL`; se o
 *     destino escapar da origem OU o path normalizado virar `//...`
 *     (ex.: `/..//host`), rejeita. Retorna o path normalizado.
 */
export function sanitizeInternalRedirect(value?: string | null): string | null {
  if (typeof value !== "string" || value.length === 0) return null;

  // (2) espaço/control-char/DEL/barra-invertida literais.
  if (hasUnsafeChars(value)) return null;

  // (3) barra-invertida percent-encoded.
  if (/%5c/i.test(value)) return null;

  // (4) precisa ser caminho relativo de origem.
  if (!value.startsWith("/") || value.startsWith("//")) return null;

  // (5) rotas não navegáveis / anti-loop de auth.
  const pathOnly = value.split(/[?#]/)[0];
  if (pathOnly.startsWith("/api/")) return null;
  if (pathOnly === "/login" || pathOnly === "/cadastro") return null;

  // (6) resolução robusta contra origem sentinela.
  try {
    const SENTINEL = "https://internal.invalid";
    const url = new URL(value, SENTINEL);
    if (url.origin !== SENTINEL) return null;
    const resolved = `${url.pathname}${url.search}${url.hash}`;
    if (!resolved.startsWith("/") || resolved.startsWith("//")) return null;
    return resolved;
  } catch {
    return null;
  }
}

export function resolvePostLoginRedirect(type: SessionAccountType, next?: string | null) {
  return sanitizeInternalRedirect(next) ?? getDefaultDashboardRedirect(type);
}
