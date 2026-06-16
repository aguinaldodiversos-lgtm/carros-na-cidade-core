import { NextRequest, NextResponse } from "next/server";

import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * BFF do coletor de analytics (Fase 4.4).
 *
 * Same-origin (`/api/analytics/events`) para o navegador usar sendBeacon sem
 * CORS. Encaminha ao backend público `POST /api/public/analytics/events`.
 *
 * Importante: NÃO enviamos o token interno aqui — queremos que o RATE-LIMIT
 * público do backend valha por visitante. Encaminhamos o User-Agent real (o
 * backend deriva device_type/hash dele) e o IP real via X-Cnc-Client-Ip.
 *
 * Best-effort: sempre responde 204 (a coleta nunca pode quebrar a navegação).
 */

const TIMEOUT_MS = 4000;
const MAX_BODY_BYTES = 4096;

function noContent() {
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return noContent();
  }
  if (!raw || raw.length > MAX_BODY_BYTES) return noContent();

  const backendUrl = resolveInternalBackendApiUrl("/api/public/analytics/events");
  if (!backendUrl) return noContent();

  const clientIp =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "";
  const userAgent = request.headers.get("user-agent") || "";

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userAgent) headers["User-Agent"] = userAgent;
  if (clientIp) headers["X-Cnc-Client-Ip"] = clientIp;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    await fetch(backendUrl, {
      method: "POST",
      headers,
      body: raw,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch {
    /* best effort — ignora falha de rede/timeout */
  } finally {
    clearTimeout(timer);
  }

  return noContent();
}
