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
};

function getSafeUploadPath(raw: string): string | null {
  if (!raw.startsWith("/uploads/")) return null;
  if (raw.includes("..")) return null;
  return raw.replace(/\\/g, "/");
}

function getContentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).replace(".", "").toLowerCase();
  return CONTENT_TYPE_BY_EXT[ext] || "application/octet-stream";
}

async function tryReadLocalUpload(relativePath: string): Promise<Buffer | null> {
  const absolutePath = path.join(process.cwd(), "public", relativePath.replace(/^\/+/, ""));

  try {
    await access(absolutePath);
    return await readFile(absolutePath);
  } catch {
    return null;
  }
}

async function tryFetchRemoteUpload(relativePath: string): Promise<Response | null> {
  const remoteUrl = resolveBackendApiUrl(relativePath);
  if (!remoteUrl) return null;

  try {
    const response = await fetch(remoteUrl, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) return null;
    return response;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("src") || "";
  const safePath = getSafeUploadPath(src.trim());

  if (!safePath) {
    return NextResponse.json({ error: "Imagem inválida." }, { status: 400 });
  }

  const localFile = await tryReadLocalUpload(safePath);
  if (localFile) {
    return new NextResponse(localFile, {
      status: 200,
      headers: {
        "Content-Type": getContentTypeFromPath(safePath),
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      },
    });
  }

  const remoteResponse = await tryFetchRemoteUpload(safePath);
  if (remoteResponse) {
    const body = await remoteResponse.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type":
          remoteResponse.headers.get("content-type") || getContentTypeFromPath(safePath),
        "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      },
    });
  }

  return NextResponse.redirect(new URL("/images/hero.jpeg", request.url), { status: 307 });
}
