import { access, readFile } from "node:fs/promises";
import path from "node:path";

import { NextRequest, NextResponse } from "next/server";

import { resolveBackendApiUrl } from "@/lib/env/backend-api";
import { readImageFromR2Direct } from "@/lib/painel/upload-draft-photos-direct-r2";
import { getSafeUploadPath } from "@/lib/vehicle/vehicle-images-src";

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
    console.warn("[vehicle-images] nenhuma URL remota válida para buscar upload", {
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
          "X-Content-Type-Options": "nosniff",
          "X-Vehicle-Images-Fallback": "placeholder",
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

function buildImageResponse(
  body: ArrayBuffer | Uint8Array,
  contentType: string,
  source?: string,
): NextResponse {
  const normalizedContentType = contentType || "application/octet-stream";
  const headers: Record<string, string> = {
    "Content-Type": normalizedContentType,
    "Cache-Control": CACHE_CONTROL_HEADER,
    "X-Content-Type-Options": "nosniff",
  };
  if (source) headers["X-Vehicle-Images-Source"] = source;

  return new NextResponse(body as unknown as BodyInit, { status: 200, headers });
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

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key")?.trim();
  if (key) {
    const direct = await readImageFromR2Direct(key);
    if (direct) {
      return buildImageResponse(
        new Uint8Array(direct.buffer),
        direct.contentType,
        "bff-direct-r2"
      );
    }

    const remote = await fetchRemoteVehicleImageByStorageKey(key);
    if (remote) {
      const body = await remote.arrayBuffer();
      const contentType = remote.headers.get("content-type") || "application/octet-stream";
      return buildImageResponse(new Uint8Array(body), contentType, "r2-storage-key");
    }
    console.warn("[vehicle-images] ?key= sem origem no backend; fallback placeholder", { key });
    return servePlaceholder();
  }

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
    return buildImageResponse(
      new Uint8Array(localFile),
      getContentTypeFromPath(safePath),
      "legacy-local-disk",
    );
  }

  const remoteResponse = await tryFetchRemoteUpload(safePath);

  if (remoteResponse) {
    const body = await remoteResponse.arrayBuffer();
    const contentType =
      remoteResponse.headers.get("content-type") || getContentTypeFromPath(safePath);

    return buildImageResponse(body, contentType, "legacy-remote-fetch");
  }

  console.warn("[vehicle-images] origem sem ficheiro local nem remoto; fallback placeholder", {
    safePath,
  });
  return servePlaceholder();
}
