import { NextRequest, NextResponse } from "next/server";
import { authenticateBffRequest, applyBffCookies } from "@/lib/http/bff-session";
import { snapshotPhotoFiles } from "@/lib/painel/upload-draft-photo-snapshots";
import { runWizardPhotoUploadPipeline } from "@/lib/painel/upload-wizard-photos-pipeline";

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
            "Nenhuma foto válida enviada. Use JPG ou PNG (máx. 10 MB por ficheiro).",
        },
        { status: 400 }
      );
    }

    const snapshots = await snapshotPhotoFiles(photos);

    const nodeEnv = process.env.NODE_ENV || "development";
    const pipeline = await runWizardPhotoUploadPipeline({
      snapshots,
      userId: auth.ctx.session.id || "anon",
      accessToken: auth.ctx.session.accessToken!,
      forwardHeaders: auth.ctx.backendHeaders,
      nodeEnv,
    });

    const { photoUrls, errors, strategiesAttempted } = pipeline;

    if (photoUrls.length === 0) {
      const detail =
        nodeEnv !== "production" && errors.length > 0
          ? ` (${errors.map((e) => `${e.stage}: ${e.message}`).join("; ")})`
          : "";
      const body: Record<string, unknown> = {
        ok: false,
        message: `Falha ao enviar fotos para o armazenamento. Tente novamente.${detail}`,
      };
      if (nodeEnv !== "production") {
        body.debug = {
          strategiesAttempted,
          errors,
        };
      }
      return NextResponse.json(body, { status: 502 });
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
