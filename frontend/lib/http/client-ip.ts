import type { NextRequest } from "next/server";

/**
 * IP do visitante no edge (Vercel/Cloudflare/Render) ou proxy.
 * Usado pelo BFF para o backend rate-limitar por usuário real, não pelo IP do servidor Next.js.
 */
export function getClientIpFromNextRequest(request: NextRequest): string {
  const vercel = request.headers.get("x-vercel-forwarded-for");
  if (vercel) {
    const first = vercel.split(",")[0]?.trim();
    if (first) return first;
  }

  const cf = request.headers.get("cf-connecting-ip");
  if (cf?.trim()) return cf.trim();

  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }

  const xri = request.headers.get("x-real-ip");
  if (xri?.trim()) return xri.trim();

  return "";
}

export function buildBffBackendForwardHeaders(request: NextRequest): Record<string, string> {
  const ip = getClientIpFromNextRequest(request);
  if (!ip) return {};
  return { "X-Cnc-Client-Ip": ip };
}
