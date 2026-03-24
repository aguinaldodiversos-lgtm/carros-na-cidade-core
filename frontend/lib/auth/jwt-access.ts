/**
 * Lê exp do JWT (sem verificar assinatura) só para decidir refresh antecipado.
 * Access token do backend costuma expirar em ~15 min; o cookie do portal dura dias.
 */
export function getJwtExpiryMs(accessToken: string | undefined): number | null {
  if (!accessToken) return null;
  const parts = accessToken.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
    const json = atob(base64 + pad);
    const payload = JSON.parse(json) as { exp?: number };
    if (typeof payload.exp !== "number") return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

/** true = falta token, JWT inválido ou expira dentro de skewMs */
export function accessTokenNeedsRefresh(
  accessToken: string | undefined,
  skewMs = 120_000
): boolean {
  const expMs = getJwtExpiryMs(accessToken);
  if (!expMs) return true;
  return Date.now() + skewMs >= expMs;
}
