import { NextRequest, NextResponse } from "next/server";
import { getBackendApiBaseUrl } from "@/lib/env/backend-api";
import { uploadPublishPhotosToBackendR2 } from "@/lib/painel/upload-ad-images-backend";
import { saveWizardPhotosToPublic } from "@/lib/painel/save-ad-photos";
import {
  isR2ConfiguredInBff,
  uploadDraftPhotosDirectR2,
} from "@/lib/painel/upload-draft-photos-direct-r2";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  applySessionCookiesToResponse,
  getSessionDataFromRequest,
} from "@/services/sessionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractPhotos(source: FormData): File[] {
  return source
    .getAll("photos")
    .filter(
      (f): f is File =>
        typeof File !== "undefined" && f instanceof File && f.size > 0
    );
}

/**
 * Upload de fotos em modo rascunho — permite que o wizard envie fotos
 * imediatamente ao storage (R2 / local dev) e receba URLs persistíveis
 * antes do submit final. Isso garante que as fotos sobrevivam à navegação
 * entre etapas e recargas de página.
 *
 * Estratégia de upload (fallback em cascata):
 *  1. Upload direto ao R2 a partir do BFF (se R2_* env vars presentes)
 *  2. Proxy via backend Express (se BACKEND_API_URL / NEXT_PUBLIC_API_URL existir)
 *  3. Gravação local em public/uploads/ads (somente dev)
 */
export async function POST(request: NextRequest) {
  try {
    const session = getSessionDataFromRequest(request);
    const ensured = await ensureSessionWithFreshBackendTokens(session);

    if (!ensured.ok || !ensured.session.accessToken) {
      return NextResponse.json(
        { ok: false, message: "Faça login para enviar fotos." },
        { status: 401 }
      );
    }

    const source = await request.formData();
    const photos = extractPhotos(source);

    if (photos.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Nenhuma foto válida enviada. Use JPG ou PNG (máx. 6 MB).",
        },
        { status: 400 }
      );
    }

    let photoUrls: string[] = [];
    const errors: string[] = [];

    // --- Layer 1: Direct R2 upload from BFF (fastest, no backend dependency) ---
    if (isR2ConfiguredInBff()) {
      try {
        photoUrls = await uploadDraftPhotosDirectR2(
          photos,
          ensured.session.id || "anon"
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Erro desconhecido no R2 direto";
        errors.push(`direct-r2: ${msg}`);
        console.error("[upload-draft-photos] Direct R2 failed:", msg);
      }
    }

    // --- Layer 2: Proxy through Express backend ---
    if (photoUrls.length === 0 && getBackendApiBaseUrl()) {
      try {
        photoUrls = await uploadPublishPhotosToBackendR2(
          source,
          ensured.session.accessToken
        );
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : "Erro desconhecido no proxy backend";
        errors.push(`backend-proxy: ${msg}`);
        console.error("[upload-draft-photos] Backend proxy failed:", msg);
      }
    }

    // --- Layer 3: Local filesystem (development only) ---
    if (photoUrls.length === 0 && process.env.NODE_ENV !== "production") {
      try {
        photoUrls = await saveWizardPhotosToPublic(source);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Erro desconhecido no fallback local";
        errors.push(`local-fs: ${msg}`);
        console.error("[upload-draft-photos] Local fallback failed:", msg);
      }
    }

    // --- All layers exhausted ---
    if (photoUrls.length === 0) {
      const detail =
        process.env.NODE_ENV !== "production" && errors.length > 0
          ? ` (${errors.join("; ")})`
          : "";
      return NextResponse.json(
        {
          ok: false,
          message: `Falha ao enviar fotos para o armazenamento. Tente novamente.${detail}`,
        },
        { status: 502 }
      );
    }

    const res = NextResponse.json({ ok: true, urls: photoUrls });
    if (ensured.persistCookies) {
      applySessionCookiesToResponse(res, ensured.persistCookies);
    }
    return res;
  } catch (error) {
    console.error("[upload-draft-photos] Unexpected error:", error);
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Erro ao enviar fotos.",
      },
      { status: 500 }
    );
  }
}
