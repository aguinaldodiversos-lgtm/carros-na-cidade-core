import { NextRequest, NextResponse } from "next/server";
import { activateAd, deleteAd, getAdByIdForUser, getBoostOptions, pauseAd } from "@/services/adService";
import { getSessionUserFromRequest } from "@/services/sessionService";

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
  const session = getSessionUserFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const ad = getAdByIdForUser(params.id, session.id);
  if (!ad) {
    return NextResponse.json({ error: "Anuncio nao encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    ad,
    boost_options: getBoostOptions(),
  });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = getSessionUserFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const body = (await request.json()) as PatchPayload;
  const action = body.action;

  if (action !== "pause" && action !== "activate") {
    return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
  }

  const updated = action === "pause" ? pauseAd(session.id, params.id) : activateAd(session.id, params.id);
  if (!updated) {
    return NextResponse.json({ error: "Anuncio nao encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    ad: updated,
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const session = getSessionUserFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const removed = deleteAd(session.id, params.id);
  if (!removed) {
    return NextResponse.json({ error: "Anuncio nao encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
  });
}
