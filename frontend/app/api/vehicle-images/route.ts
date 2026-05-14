import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { resolveBackendApiUrl } from "@/lib/env/backend-api";
import { readImageFromR2Direct } from "@/lib/painel/upload-draft-photos-direct-r2";
import { getSafeUploadPath } from "@/lib/vehicle/vehicle-images-src";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─────────────────────────────────────────────────────────────────────────────
// Política do handler (refatorado em 2026-05-13 após estouro de outbound
// bandwidth no Render):
//
//   Caminho padrão: 302 redirect para o CDN público R2 (`?key=...`) ou para
//                   o SVG placeholder estático. ZERO bytes de imagem servidos
//                   pelo origin do Render — o navegador é redirecionado e
//                   busca do CDN diretamente.
//
//   Fallback streaming: só ativa com VEHICLE_IMAGE_PROXY_FALLBACK_ENABLED=true.
//                   Mantém o comportamento legado (read R2 BFF, fetch backend,
//                   read local disk) para janelas de incidente do CDN.
//
//   Diagnóstico:    com IMAGE_PROXY_DIAGNOSTICS_ENABLED=true, cada request
//                   emite uma linha JSON em stdout (Render Logs). Sem PII.
//
// ─────────────────────────────────────────────────────────────────────────────

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  avif: "image/avif",
  heic: "image/heic",
  heif: "image/heif",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
};

const CACHE_CONTROL_HEADER = "public, max-age=300, stale-while-revalidate=86400";
const REDIRECT_CACHE_CONTROL = "public, max-age=3600";
const PLACEHOLDER_PATHNAME = "/images/vehicle-placeholder.svg";

type DiagnosticMode =
  | "redirect-r2"
  | "redirect-placeholder"
  | "r2-direct-stream"
  | "backend-stream"
  | "local-stream"
  | "blocked"
  | "invalid";

function isFallbackEnabled(): boolean {
  return process.env.VEHICLE_IMAGE_PROXY_FALLBACK_ENABLED === "true";
}

function isDiagnosticsEnabled(): boolean {
  return process.env.IMAGE_PROXY_DIAGNOSTICS_ENABLED === "true";
}

function readPublicR2BaseUrl(): string {
  const raw = (process.env.R2_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  return raw;
}

function encodeKeyForPublicUrl(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

type DiagFields = {
  mode: DiagnosticMode;
  status: number;
  source: string;
  durationMs: number;
  contentLength?: number;
  userAgentSummary?: string;
  paramKey?: boolean;
  paramSrc?: boolean;
};

function summarizeUserAgent(ua: string | null): string {
  if (!ua) return "";
  const trimmed = ua.slice(0, 80);
  if (/googlebot/i.test(ua)) return "bot:google";
  if (/bingbot/i.test(ua)) return "bot:bing";
  if (/Chrome\//.test(ua)) return "chrome";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "safari";
  return trimmed.replace(/\s+/g, " ");
}

function emitDiagnostic(fields: DiagFields): void {
  if (!isDiagnosticsEnabled()) return;
  try {
    // stdout JSON. Render coleta no painel de Logs.
    console.log(JSON.stringify({ event: "vehicle-images", ...fields }));
  } catch {
    // nunca derrubar request por log
  }
}

function getContentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).replace(".", "").toLowerCase();
  return CONTENT_TYPE_BY_EXT[ext] || "application/octet-stream";
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildLocalCandidates(relativePath: string): string[] {
  const normalizedRelative = relativePath.replace(/^\/+/, "");
  const uploadsRelative = relativePath.replace(/^\/uploads\/+/, "");

  return [
    path.join(process.cwd(), normalizedRelative),
    path.join(process.cwd(), "public", normalizedRelative),
    path.join(process.cwd(), "uploads", uploadsRelative),
    path.join(process.cwd(), "..", normalizedRelative),
    path.join(process.cwd(), "..", "public", normalizedRelative),
    path.join(process.cwd(), "..", "uploads", uploadsRelative),
  ];
}

async function tryReadLocalUpload(relativePath: string): Promise<Buffer | null> {
  const candidates = buildLocalCandidates(relativePath);

  for (const absolutePath of candidates) {
    try {
      if (!(await fileExists(absolutePath))) continue;
      return await readFile(absolutePath);
    } catch {
      // próximo candidato
    }
  }
  return null;
}

async function tryFetchRemoteUpload(relativePath: string): Promise<Response | null> {
  const remoteUrl = resolveBackendApiUrl(relativePath);
  if (!remoteUrl) return null;

  try {
    const response = await fetch(remoteUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });
    if (!response.ok) return null;

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.startsWith("image/")) return null;

    return response;
  } catch {
    return null;
  }
}

async function fetchRemoteVehicleImageByStorageKey(key: string): Promise<Response | null> {
  const trimmed = key.trim();
  if (!trimmed || trimmed.includes("..")) return null;

  const remoteUrl = resolveBackendApiUrl(`/api/vehicle-images?key=${encodeURIComponent(trimmed)}`);
  if (!remoteUrl) return null;

  try {
    const response = await fetch(remoteUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });
    if (!response.ok) return null;

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (contentType && !contentType.startsWith("image/") && !contentType.includes("svg")) {
      return null;
    }

    return response;
  } catch {
    return null;
  }
}

function redirectToPlaceholder(request: NextRequest, source: string): NextResponse {
  const url = new URL(PLACEHOLDER_PATHNAME, request.nextUrl.origin);
  return NextResponse.redirect(url, {
    status: 302,
    headers: {
      "Cache-Control": REDIRECT_CACHE_CONTROL,
      "X-Vehicle-Images-Source": source,
    },
  });
}

function redirectToPublicR2(publicUrl: string): NextResponse {
  return NextResponse.redirect(publicUrl, {
    status: 302,
    headers: {
      "Cache-Control": REDIRECT_CACHE_CONTROL,
      "X-Vehicle-Images-Source": "redirect-r2",
    },
  });
}

function buildImageResponse(
  body: ArrayBuffer | Uint8Array,
  contentType: string,
  source: string
): NextResponse {
  return new NextResponse(body as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Cache-Control": CACHE_CONTROL_HEADER,
      "X-Content-Type-Options": "nosniff",
      "X-Vehicle-Images-Source": source,
    },
  });
}

export async function GET(request: NextRequest) {
  const started = Date.now();
  const userAgentSummary = summarizeUserAgent(request.headers.get("user-agent"));
  const key = request.nextUrl.searchParams.get("key")?.trim() || "";
  const src = request.nextUrl.searchParams.get("src") || "";

  // ───────────────────── Rota ?key= (R2 / storage_key) ──────────────────────
  if (key) {
    if (key.includes("..")) {
      const res = NextResponse.json(
        { error: "Chave inválida." },
        { status: 400, headers: { "Cache-Control": "no-store" } }
      );
      emitDiagnostic({
        mode: "invalid",
        status: 400,
        source: "key-traversal",
        durationMs: Date.now() - started,
        userAgentSummary,
        paramKey: true,
      });
      return res;
    }

    const publicBase = readPublicR2BaseUrl();
    if (publicBase) {
      const publicUrl = `${publicBase}/${encodeKeyForPublicUrl(key.replace(/^\/+/, ""))}`;
      const res = redirectToPublicR2(publicUrl);
      emitDiagnostic({
        mode: "redirect-r2",
        status: 302,
        source: "r2-public-base",
        durationMs: Date.now() - started,
        userAgentSummary,
        paramKey: true,
      });
      return res;
    }

    if (isFallbackEnabled()) {
      const direct = await readImageFromR2Direct(key);
      if (direct) {
        const res = buildImageResponse(
          new Uint8Array(direct.buffer),
          direct.contentType,
          "bff-direct-r2"
        );
        emitDiagnostic({
          mode: "r2-direct-stream",
          status: 200,
          source: "bff-direct-r2",
          durationMs: Date.now() - started,
          contentLength: direct.buffer.length,
          userAgentSummary,
          paramKey: true,
        });
        return res;
      }

      const remote = await fetchRemoteVehicleImageByStorageKey(key);
      if (remote) {
        const body = await remote.arrayBuffer();
        const contentType = remote.headers.get("content-type") || "application/octet-stream";
        const res = buildImageResponse(new Uint8Array(body), contentType, "r2-storage-key");
        emitDiagnostic({
          mode: "backend-stream",
          status: 200,
          source: "r2-storage-key",
          durationMs: Date.now() - started,
          contentLength: body.byteLength,
          userAgentSummary,
          paramKey: true,
        });
        return res;
      }
    }

    const res = redirectToPlaceholder(request, "blocked-no-public-base");
    emitDiagnostic({
      mode: "blocked",
      status: 302,
      source: "no-public-base",
      durationMs: Date.now() - started,
      userAgentSummary,
      paramKey: true,
    });
    return res;
  }

  // ───────────────────── Rota ?src= (upload legado) ─────────────────────────
  const safePath = getSafeUploadPath(src);
  if (!safePath) {
    const res = NextResponse.json(
      { error: "Imagem inválida." },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
    emitDiagnostic({
      mode: "invalid",
      status: 400,
      source: "src-unsafe",
      durationMs: Date.now() - started,
      userAgentSummary,
      paramSrc: !!src,
    });
    return res;
  }

  if (!isFallbackEnabled()) {
    const res = redirectToPlaceholder(request, "blocked-fallback-off");
    emitDiagnostic({
      mode: "blocked",
      status: 302,
      source: "fallback-off",
      durationMs: Date.now() - started,
      userAgentSummary,
      paramSrc: true,
    });
    return res;
  }

  const localFile = await tryReadLocalUpload(safePath);
  if (localFile) {
    const res = buildImageResponse(
      new Uint8Array(localFile),
      getContentTypeFromPath(safePath),
      "legacy-local-disk"
    );
    emitDiagnostic({
      mode: "local-stream",
      status: 200,
      source: "legacy-local-disk",
      durationMs: Date.now() - started,
      contentLength: localFile.length,
      userAgentSummary,
      paramSrc: true,
    });
    return res;
  }

  const remoteResponse = await tryFetchRemoteUpload(safePath);
  if (remoteResponse) {
    const body = await remoteResponse.arrayBuffer();
    const contentType =
      remoteResponse.headers.get("content-type") || getContentTypeFromPath(safePath);
    const res = buildImageResponse(body, contentType, "legacy-remote-fetch");
    emitDiagnostic({
      mode: "backend-stream",
      status: 200,
      source: "legacy-remote-fetch",
      durationMs: Date.now() - started,
      contentLength: body.byteLength,
      userAgentSummary,
      paramSrc: true,
    });
    return res;
  }

  const res = redirectToPlaceholder(request, "missing-upload");
  emitDiagnostic({
    mode: "redirect-placeholder",
    status: 302,
    source: "missing-upload",
    durationMs: Date.now() - started,
    userAgentSummary,
    paramSrc: true,
  });
  return res;
}
