import { NextResponse } from "next/server";

import {
  getBackendApiBaseUrl,
  getBackendApiResolutionInfo,
  resolveBackendApiUrl,
} from "@/lib/env/backend-api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Endpoint de diagnóstico: expõe qual BACKEND_API_URL o SSR resolveu em tempo
 * de execução e testa uma chamada leve. Útil quando em produção o catálogo
 * aparece vazio — permite confirmar se o frontend está falando com o backend.
 *
 * Não expõe secrets: só base URL + status de fetch + latência.
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

async function probeBackend(pathname: string, timeoutMs: number): Promise<BackendProbe> {
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
      headers: { Accept: "application/json" },
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

export async function GET() {
  const resolution = getBackendApiResolutionInfo();
  const baseUrl = getBackendApiBaseUrl();

  const [adsSearchProbe, homeProbe, healthProbe] = await Promise.all([
    probeBackend("/api/ads/search?state=SP&limit=1", 20_000),
    probeBackend("/api/public/home", 20_000),
    probeBackend("/health", 20_000),
  ]);

  return NextResponse.json(
    {
      diagnostic: "carros-na-cidade frontend ↔ backend connectivity",
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
      probes: {
        adsSearch_SP: adsSearchProbe,
        publicHome: homeProbe,
        backendHealth: healthProbe,
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, must-revalidate",
      },
    }
  );
}
