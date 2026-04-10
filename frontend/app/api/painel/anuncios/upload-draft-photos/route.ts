import { NextRequest, NextResponse } from "next/server";
import { getBackendApiBaseUrl } from "@/lib/env/backend-api";
import { authenticateBffRequest, applyBffCookies } from "@/lib/http/bff-session";
import { uploadPublishPhotosToBackendR2 } from "@/lib/painel/upload-ad-images-backend";
import { saveWizardPhotosToPublic } from "@/lib/painel/save-ad-photos";
import {
  formDataFromSnapshots,
  filesFromSnapshots,
  snapshotPhotoFiles,
} from "@/lib/painel/upload-draft-photo-snapshots";
import {
  isR2ConfiguredInBff,
  uploadDraftPhotosDirectR2,
} from "@/lib/painel/upload-draft-photos-direct-r2";

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
 * antes do submit final.
 *
 * Estratégia de upload (fallback em cascata):
 *  1. Upload direto ao R2 a partir do BFF (se R2_* env vars presentes)
 *  2. Proxy via backend Express (se BACKEND_API_URL / NEXT_PUBLIC_API_URL existir)
 *  3. Gravação local em public/uploads/ads (somente dev)
 *
 * Cada ficheiro é lido uma vez para buffer (`snapshotPhotoFiles`) e recriado
 * como `File` por camada — evita falha quando o primeiro backend lê o stream
 * Undici e os fallbacks recebem ficheiros vazios.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) {
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

    const snapshots = await snapshotPhotoFiles(photos);

    let photoUrls: string[] = [];
    const errors: string[] = [];

    if (isR2ConfiguredInBff()) {
      try {
        photoUrls = await uploadDraftPhotosDirectR2(
          filesFromSnapshots(snapshots),
          auth.ctx.session.id || "anon"
        );
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Erro desconhecido no R2 direto";
        errors.push(`direct-r2: ${msg}`);
        console.error("[upload-draft-photos] Direct R2 failed:", msg);
      }
    }

    if (photoUrls.length === 0 && getBackendApiBaseUrl()) {
      try {
        photoUrls = await uploadPublishPhotosToBackendR2(
          formDataFromSnapshots(snapshots),
          auth.ctx.session.accessToken!
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

    if (photoUrls.length === 0 && process.env.NODE_ENV !== "production") {
      try {
        photoUrls = await saveWizardPhotosToPublic(formDataFromSnapshots(snapshots));
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Erro desconhecido no fallback local";
        errors.push(`local-fs: ${msg}`);
        console.error("[upload-draft-photos] Local fallback failed:", msg);
      }
    }

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

    return applyBffCookies(
      NextResponse.json({ ok: true, urls: photoUrls }),
      auth.ctx
    );
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
