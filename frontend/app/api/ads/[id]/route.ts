import { NextRequest, NextResponse } from "next/server";
import {
  BackendApiError,
  deleteOwnedAd,
  fetchOwnedAd,
  patchOwnedAdStatus,
  updateOwnedAd,
  type UpdateOwnedAdPayload,
} from "@/lib/account/backend-account";
import { authenticateBffRequest, applyBffCookies } from "@/lib/http/bff-session";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    id: string;
  };
};

type PatchPayload = {
  action?: "pause" | "activate";
};

/**
 * Campos que a edição de conteúdo aceita. Campos estruturais
 * (brand/model/year/city/state) e `status`/`advertiser_id` NÃO são repassados —
 * o backend já os recusa, mas filtramos aqui para deixar o contrato explícito
 * e evitar payloads enganosos.
 */
function pickEditablePayload(raw: unknown): UpdateOwnedAdPayload {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const payload: UpdateOwnedAdPayload = {};

  if (typeof body.title === "string") payload.title = body.title;
  if (typeof body.description === "string" || body.description === null) {
    payload.description = body.description as string | null;
  }
  if (body.price !== undefined && body.price !== null && body.price !== "") {
    payload.price = Number(body.price);
  }
  if (body.mileage !== undefined && body.mileage !== null && body.mileage !== "") {
    payload.mileage = Number(body.mileage);
  }

  return payload;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const payload = await fetchOwnedAd(auth.ctx.session, params.id);
    return applyBffCookies(NextResponse.json(payload), auth.ctx);
  } catch (error) {
    console.error("[GET /api/ads/:id]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Falha ao buscar anuncio." }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as PatchPayload;
    const action = body.action;

    if (action !== "pause" && action !== "activate") {
      return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
    }

    const updated = await patchOwnedAdStatus(auth.ctx.session, params.id, action);
    return applyBffCookies(NextResponse.json({ ad: updated.ad }), auth.ctx);
  } catch (error) {
    console.error("[PATCH /api/ads/:id]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Falha ao atualizar anuncio." }, { status: 502 });
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const raw = await request.json().catch(() => ({}));
    const payload = pickEditablePayload(raw);

    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: "Nenhum campo editável foi enviado." }, { status: 400 });
    }

    const updated = await updateOwnedAd(auth.ctx.session, params.id, payload);
    return applyBffCookies(NextResponse.json(updated), auth.ctx);
  } catch (error) {
    // Propaga status/mensagem/código do backend (403/404/409/400) para a UI
    // exibir o motivo certo (sem dono → 404; terceiro → 403; status travado →
    // 409; payload inválido → 400). Demais falhas viram 502 genérico.
    if (error instanceof BackendApiError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status >= 400 && error.status < 600 ? error.status : 502 }
      );
    }
    console.error("[PUT /api/ads/:id]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Falha ao atualizar anuncio." }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const auth = await authenticateBffRequest(request);
    if (!auth.ok) return auth.response;

    const removed = await deleteOwnedAd(auth.ctx.session, params.id);
    return applyBffCookies(NextResponse.json(removed), auth.ctx);
  } catch (error) {
    console.error("[DELETE /api/ads/:id]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Falha ao remover anuncio." }, { status: 502 });
  }
}
