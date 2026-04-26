import { headers } from "next/headers";
import { NextResponse } from "next/server";

import {
  getBackendApiBaseUrl,
  getBackendApiResolutionInfo,
  resolveBackendApiUrl,
} from "@/lib/env/backend-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Endpoint de diagnostico: expoe qual BACKEND_API_URL o SSR resolveu em tempo
 * de execucao e testa chamadas com e sem o header X-Cnc-Client-Ip, para
 * confirmar o comportamento do rate limit global do backend.
 *
 * Nao expoe secrets: so base URL + status de fetch + latencia.
 */
type BackendProbe = {
  url: string | null;
  attempted: boolean;
  ok: boolean;
  status: number | null;
  elapsedMs: number | null;
  bodyPreview: string | null;
  error: string | null;
};

async function probeBackend(
  pathname: string,
  timeoutMs: number,
  extraHeaders: Record<string, string> = {}
): Promise<BackendProbe> {
  const url = resolveBackendApiUrl(pathname);
  if (!url) {
    return {
      url: null,
      attempted: false,
      ok: false,
      status: null,
      elapsedMs: null,
      bodyPreview: null,
      error: "resolveBackendApiUrl retornou string vazia",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...extraHeaders },
      signal: controller.signal,
      cache: "no-store",
    });
    const elapsedMs = Date.now() - started;
    const text = await response.text();

    return {
      url,
      attempted: true,
      ok: response.ok,
      status: response.status,
      elapsedMs,
      bodyPreview: text.slice(0, 240),
      error: null,
    };
  } catch (error) {
    const elapsedMs = Date.now() - started;
    return {
      url,
      attempted: true,
      ok: false,
      status: null,
      elapsedMs,
      bodyPreview: null,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

function readClientIp(h: ReturnType<typeof headers>): string {
  const candidates = ["x-vercel-forwarded-for", "cf-connecting-ip", "x-forwarded-for", "x-real-ip"];
  for (const name of candidates) {
    const raw = h.get(name);
    if (!raw) continue;
    const first = String(raw).split(",")[0].trim();
    if (first) return first;
  }
  return "";
}

export async function GET() {
  const resolution = getBackendApiResolutionInfo();
  const baseUrl = getBackendApiBaseUrl();
  const h = headers();
  const clientIp = readClientIp(h);
  const withIpHeader: Record<string, string> = clientIp ? { "X-Cnc-Client-Ip": clientIp } : {};

  // Probes COM X-Cnc-Client-Ip (comportamento real do SSR pos-fix).
  // Se retornar 200 aqui, o rate limit global por IP do container Render
  // foi contornado corretamente.
  const [adsSearchProbe, homeProbe, healthProbe] = await Promise.all([
    probeBackend("/api/ads/search?state=SP&limit=1", 20_000, withIpHeader),
    probeBackend("/api/public/home", 20_000, withIpHeader),
    probeBackend("/health", 20_000, withIpHeader),
  ]);

  // Probe de CONTRASTE sem X-Cnc-Client-Ip: revela se o rate limit
  // compartilhado pelo IP do container esta estorado (429) ou nao.
  const adsSearchNoIp = await probeBackend("/api/ads/search?state=SP&limit=1&_diag=no-ip", 20_000);

  return NextResponse.json(
    {
      diagnostic: "carros-na-cidade frontend <-> backend connectivity",
      runtime: {
        nodeEnv: process.env.NODE_ENV,
        site: process.env.NEXT_PUBLIC_SITE_URL || null,
      },
      backendResolution: {
        baseUrl,
        originUrl: resolution.originUrl,
        source: resolution.source,
      },
      envVarsPresent: {
        AUTH_API_BASE_URL: Boolean(process.env.AUTH_API_BASE_URL),
        BACKEND_API_URL: Boolean(process.env.BACKEND_API_URL),
        CNC_API_URL: Boolean(process.env.CNC_API_URL),
        API_URL: Boolean(process.env.API_URL),
        NEXT_PUBLIC_API_URL: Boolean(process.env.NEXT_PUBLIC_API_URL),
      },
      clientIp: {
        detected: clientIp || null,
        source: clientIp ? "next/headers()" : null,
      },
      probes: {
        adsSearch_SP: adsSearchProbe,
        publicHome: homeProbe,
        backendHealth: healthProbe,
        adsSearch_SP_withoutClientIp: adsSearchNoIp,
      },
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store, must-revalidate" },
    }
  );
}
