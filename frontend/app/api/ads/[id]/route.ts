import { NextRequest, NextResponse } from "next/server";
import { deleteOwnedAd, fetchOwnedAd, patchOwnedAdStatus } from "@/lib/account/backend-account";
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
