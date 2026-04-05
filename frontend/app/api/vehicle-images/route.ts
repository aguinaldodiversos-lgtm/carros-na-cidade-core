import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { resolveBackendApiUrl } from "@/lib/env/backend-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function getContentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).replace(".", "").toLowerCase();
  return CONTENT_TYPE_BY_EXT[ext] || "application/octet-stream";
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getSafeUploadPath(raw: string): string | null {
  if (!raw) return null;

  const decoded = safeDecodeURIComponent(raw).trim().replace(/\\/g, "/");

  if (!decoded.startsWith("/uploads/")) return null;
  if (decoded.includes("\0")) return null;

  const normalized = path.posix.normalize(decoded);

  if (!normalized.startsWith("/uploads/")) return null;
  if (normalized.includes("..")) return null;

  return normalized;
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
    } catch (error) {
      console.error("[vehicle-images] erro ao ler arquivo local", {
        relativePath,
        absolutePath,
        error,
      });
    }
  }

  console.warn("[vehicle-images] arquivo local não encontrado", {
    relativePath,
    cwd: process.cwd(),
    candidates,
  });

  return null;
}

async function tryFetchRemoteUpload(relativePath: string): Promise<Response | null> {
  const remoteUrl = resolveBackendApiUrl(relativePath);

  if (!remoteUrl) {
    console.warn("[vehicle-images] resolveBackendApiUrl retornou vazio", {
      relativePath,
    });
    return null;
  }

  try {
    const response = await fetch(remoteUrl, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });

    if (!response.ok) {
      console.warn("[vehicle-images] fetch remoto falhou", {
        relativePath,
        remoteUrl,
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();

    if (contentType && !contentType.startsWith("image/")) {
      console.warn("[vehicle-images] resposta remota não é imagem", {
        relativePath,
        remoteUrl,
        contentType,
      });
      return null;
    }

    return response;
  } catch (error) {
    console.error("[vehicle-images] erro no fetch remoto", {
      relativePath,
      remoteUrl,
      error,
    });
    return null;
  }
}

async function servePlaceholder(): Promise<NextResponse> {
  const placeholderCandidates = [
    path.join(process.cwd(), "public", "images", "vehicle-placeholder.svg"),
    path.join(process.cwd(), "..", "public", "images", "vehicle-placeholder.svg"),
  ];

  for (const placeholderPath of placeholderCandidates) {
    try {
      if (!(await fileExists(placeholderPath))) continue;

      const body = await readFile(placeholderPath);

      return new NextResponse(new Uint8Array(body), {
        status: 200,
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": CACHE_CONTROL_HEADER,
        },
      });
    } catch (error) {
      console.error("[vehicle-images] erro ao servir placeholder", {
        placeholderPath,
        error,
      });
    }
  }

  return NextResponse.json(
    { error: "Placeholder não encontrado." },
    {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

function buildImageResponse(body: ArrayBuffer | Uint8Array, contentType: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": CACHE_CONTROL_HEADER,
    },
  });
}

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("src") || "";
  const safePath = getSafeUploadPath(src);

  if (!safePath) {
    return NextResponse.json(
      { error: "Imagem inválida." },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const localFile = await tryReadLocalUpload(safePath);

  if (localFile) {
    return buildImageResponse(new Uint8Array(localFile), getContentTypeFromPath(safePath));
  }

  const remoteResponse = await tryFetchRemoteUpload(safePath);

  if (remoteResponse) {
    const body = await remoteResponse.arrayBuffer();
    const contentType = remoteResponse.headers.get("content-type") || getContentTypeFromPath(safePath);

    return buildImageResponse(body, contentType);
  }

  return servePlaceholder();
}
