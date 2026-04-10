import { NextRequest, NextResponse } from "next/server";
import { deleteOwnedAd, fetchOwnedAd, patchOwnedAdStatus } from "@/lib/account/backend-account";
import { ensureSessionWithFreshBackendTokens } from "@/lib/session/ensure-backend-session";
import {
  applySessionCookiesToResponse,
  getSessionDataFromRequest,
} from "@/services/sessionService";

export const dynamic = "force-dynamic";

type Params = {
  params: {
    id: string;
  };
};

type PatchPayload = {
  action?: "pause" | "activate";
};

function withCookies(res: NextResponse, persistCookies?: import("@/services/sessionService").SessionData) {
  if (persistCookies) applySessionCookiesToResponse(res, persistCookies);
  return res;
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const session = getSessionDataFromRequest(request);
    const ensured = await ensureSessionWithFreshBackendTokens(session);

    if (!ensured.ok || !ensured.session.accessToken) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const payload = await fetchOwnedAd(ensured.session, params.id);
    return withCookies(NextResponse.json(payload), ensured.persistCookies);
  } catch (error) {
    console.error("[GET /api/ads/:id]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Falha ao buscar anuncio." }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = getSessionDataFromRequest(request);
    const ensured = await ensureSessionWithFreshBackendTokens(session);

    if (!ensured.ok || !ensured.session.accessToken) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const body = (await request.json()) as PatchPayload;
    const action = body.action;

    if (action !== "pause" && action !== "activate") {
      return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
    }

    const updated = await patchOwnedAdStatus(ensured.session, params.id, action);
    return withCookies(NextResponse.json({ ad: updated.ad }), ensured.persistCookies);
  } catch (error) {
    console.error("[PATCH /api/ads/:id]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Falha ao atualizar anuncio." }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = getSessionDataFromRequest(request);
    const ensured = await ensureSessionWithFreshBackendTokens(session);

    if (!ensured.ok || !ensured.session.accessToken) {
      return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
    }

    const removed = await deleteOwnedAd(ensured.session, params.id);
    return withCookies(NextResponse.json(removed), ensured.persistCookies);
  } catch (error) {
    console.error("[DELETE /api/ads/:id]", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Falha ao remover anuncio." }, { status: 502 });
  }
}
