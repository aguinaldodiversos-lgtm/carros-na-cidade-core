import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authenticateBffRequest, applyBffCookies } from "@/lib/http/bff-session";
import { snapshotPhotoFiles } from "@/lib/painel/upload-draft-photo-snapshots";
import {
  runWizardPhotoUploadPipeline,
  type WizardPipelineError,
} from "@/lib/painel/upload-wizard-photos-pipeline";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PREFIX = "[upload-draft-photos-route]";
const MAX_WIZARD_FILES = 10;

function extractPhotos(source: FormData): File[] {
  return source
    .getAll("photos")
    .filter(
      (file): file is File =>
        typeof File !== "undefined" && file instanceof File && file.size > 0
    );
}

function toSafeHttpStatus(input?: number): number {
  const allowed = new Set([400, 401, 403, 408, 409, 413, 415, 422, 429, 500, 502, 503, 504]);
  if (!input || !allowed.has(input)) return 502;
  return input;
}

function sanitizeErrorForClient(error: WizardPipelineError): Record<string, unknown> {
  return {
    stage: error.stage,
    message: error.message,
    statusCode: error.statusCode,
    code: error.code,
    requestId: error.requestId,
    backendUrl: error.backendUrl,
  };
}

/**
 * Upload de fotos em modo rascunho.
 *
 * Produção:
 * - writer canônico = backend /api/ads/upload-images
 * - fallbacks só entram se explicitamente ativados por env
 */
export async function POST(request: NextRequest) {
  const requestId = randomUUID();

  try {
    const auth = await authenticateBffRequest(request);

    if (!auth.ok) {
      return NextResponse.json(
        {
          ok: false,
          requestId,
          message: "Faça login para enviar fotos.",
        },
        { status: 401 }
      );
    }

    const accessToken = auth.ctx.session.accessToken?.trim();
    if (!accessToken) {
      console.warn(`${LOG_PREFIX} missing access token`, { requestId });

      return NextResponse.json(
        {
          ok: false,
          requestId,
          message: "Sessão inválida. Faça login novamente.",
        },
        { status: 401 }
      );
    }

    const source = await request.formData();
    const photos = extractPhotos(source);

    if (photos.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          requestId,
          message:
            "Nenhuma foto válida enviada. Use JPG, PNG, WebP, HEIC ou HEIF.",
        },
        { status: 400 }
      );
    }

    if (photos.length > MAX_WIZARD_FILES) {
      return NextResponse.json(
        {
          ok: false,
          requestId,
          message: `Envie no máximo ${MAX_WIZARD_FILES} fotos por vez.`,
        },
        { status: 400 }
      );
    }

    const snapshots = await snapshotPhotoFiles(photos);
    const nodeEnv = process.env.NODE_ENV || "development";

    const pipeline = await runWizardPhotoUploadPipeline({
      snapshots,
      userId: auth.ctx.session.id || "anon",
      accessToken,
      requestId,
      forwardHeaders: auth.ctx.backendHeaders,
      nodeEnv,
    });

    const { items, photoUrls, errors, primaryError, strategiesAttempted } = pipeline;

    if (items.length === 0) {
      const status = toSafeHttpStatus(primaryError?.statusCode);
      const body: Record<string, unknown> = {
        ok: false,
        requestId,
        message:
          primaryError?.message ||
          "Falha ao enviar fotos para o armazenamento. Tente novamente.",
      };

      if (nodeEnv !== "production") {
        body.debug = {
          strategiesAttempted,
          errors: errors.map(sanitizeErrorForClient),
        };
      }

      console.error(`${LOG_PREFIX} upload failed`, {
        requestId,
        status,
        strategiesAttempted,
        errors: errors.map((error) => ({
          stage: error.stage,
          code: error.code,
          statusCode: error.statusCode,
          message: error.message,
          backendUrl: error.backendUrl,
          backendRequestId: error.requestId,
        })),
      });

      return NextResponse.json(body, { status });
    }

    console.info(`${LOG_PREFIX} upload ok`, {
      requestId,
      itemCount: items.length,
      urlCount: photoUrls.length,
      strategiesAttempted,
    });

    return applyBffCookies(
      NextResponse.json({
        ok: true,
        requestId,
        urls: photoUrls,
        items,
      }),
      auth.ctx
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro inesperado ao enviar fotos.";

    console.error(`${LOG_PREFIX} unexpected error`, {
      requestId,
      message,
      error,
    });

    return NextResponse.json(
      {
        ok: false,
        requestId,
        message,
      },
      { status: 500 }
    );
  }
}
