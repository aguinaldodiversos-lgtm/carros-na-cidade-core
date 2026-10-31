import { NextRequest, NextResponse } from "next/server";
import { resolveInternalBackendApiUrl } from "@/lib/env/backend-api";
import { applyBffCookies, authenticateBffRequest } from "@/lib/http/bff-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_INPUT_BYTES = 6 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: NextRequest) {
  const auth = await authenticateBffRequest(request);
  if (!auth.ok) return auth.response;

  // Domínios públicos confiáveis. request.nextUrl.origin pode ser um host
  // interno de proxy no Render; não utilizá-lo para autorizar produção.
  const sourceOrigin = request.headers.get("origin");
  const allowedOrigins = new Set(["https://www.carrosnacidade.com", "https://carrosnacidade.com"]);
  if (process.env.NODE_ENV !== "production") allowedOrigins.add(request.nextUrl.origin);
  if (sourceOrigin && !allowedOrigins.has(sourceOrigin)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }
  if (auth.ctx.session.type !== "CNPJ") {
    return NextResponse.json({ error: "Envio disponível apenas para lojistas." }, { status: 403 });
  }

  const form = await request.formData().catch(() => null);
  const kind = form?.get("kind");
  const photo = form?.get("photo");
  if ((kind !== "cover" && kind !== "logo") || !(photo instanceof File)) {
    return NextResponse.json(
      { error: "Selecione uma imagem da fachada ou logotipo." },
      { status: 400 }
    );
  }
  if (!ALLOWED.has(photo.type) || !photo.size || photo.size > MAX_INPUT_BYTES) {
    return NextResponse.json({ error: "Envie JPG, PNG ou WebP de até 6 MB." }, { status: 400 });
  }

  // Não duplicar segredos R2 no frontend. O backend já usa esse armazenamento
  // para fotos reais dos veículos. O upload não grava dados da loja; apenas
  // entrega uma URL, que será validada pelo PUT /api/account/store.
  const backendUrl = resolveInternalBackendApiUrl("/api/account/store/media");
  if (!backendUrl) {
    return NextResponse.json({ error: "Serviço de imagens indisponível." }, { status: 503 });
  }

  const forwarded = new FormData();
  forwarded.set("kind", kind);
  forwarded.set("photo", photo, photo.name);
  try {
    const upstream = await fetch(backendUrl, {
      method: "POST",
      headers: { ...auth.ctx.backendHeaders },
      body: forwarded,
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    const payload = (await upstream.json().catch(() => null)) as {
      success?: boolean;
      url?: string;
      error?: string;
      message?: string;
    } | null;
    if (!upstream.ok || !payload?.url) {
      const error = payload?.error || payload?.message || "Não foi possível enviar a imagem.";
      return applyBffCookies(
        NextResponse.json({ error }, { status: upstream.ok ? 502 : upstream.status }),
        auth.ctx
      );
    }
    return applyBffCookies(
      NextResponse.json({ success: true, url: payload.url }, { status: 201 }),
      auth.ctx
    );
  } catch (error) {
    console.error(
      "[store-media] falha de encaminhamento",
      error instanceof Error ? error.name : "unknown"
    );
    return NextResponse.json(
      { error: "Serviço de imagens temporariamente indisponível." },
      { status: 502 }
    );
  }
}
