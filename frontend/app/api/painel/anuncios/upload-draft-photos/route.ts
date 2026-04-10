import { NextRequest, NextResponse } from "next/server";
import { getBackendApiBaseUrl } from "@/lib/env/backend-api";
import { uploadPublishPhotosToBackendR2 } from "@/lib/painel/upload-ad-images-backend";
import { saveWizardPhotosToPublic } from "@/lib/painel/save-ad-photos";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  applySessionCookiesToResponse,
  getSessionDataFromRequest,
} from "@/services/sessionService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Upload de fotos em modo rascunho — permite que o wizard envie fotos
 * imediatamente ao storage (R2 / local dev) e receba URLs persistíveis
 * antes do submit final. Isso garante que as fotos sobrevivam à navegação
 * entre etapas e recargas de página.
 */
export async function POST(request: NextRequest) {
  try {
    if (!getBackendApiBaseUrl()) {
      return NextResponse.json(
        { ok: false, message: "API do backend não configurada." },
        { status: 500 }
      );
    }

    const session = getSessionDataFromRequest(request);
    const ensured = await ensureSessionWithFreshBackendTokens(session);

    if (!ensured.ok || !ensured.session.accessToken) {
      return NextResponse.json(
        { ok: false, message: "Faça login para enviar fotos." },
        { status: 401 }
      );
    }

    const source = await request.formData();

    let photoUrls: string[] = [];
    try {
      photoUrls = await uploadPublishPhotosToBackendR2(
        source,
        ensured.session.accessToken
      );
    } catch {
      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(
          {
            ok: false,
            message:
              "Falha ao enviar fotos para o armazenamento. Tente novamente.",
          },
          { status: 502 }
        );
      }
      photoUrls = await saveWizardPhotosToPublic(source);
    }

    if (photoUrls.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Nenhuma foto válida foi processada. Use JPG ou PNG (máx. 6 MB).",
        },
        { status: 400 }
      );
    }

    const res = NextResponse.json({ ok: true, urls: photoUrls });
    if (ensured.persistCookies) {
      applySessionCookiesToResponse(res, ensured.persistCookies);
    }
    return res;
  } catch (error) {
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
