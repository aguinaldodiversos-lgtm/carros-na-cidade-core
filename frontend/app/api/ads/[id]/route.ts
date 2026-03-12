import { NextRequest, NextResponse } from "next/server";
import { deleteOwnedAd, fetchOwnedAd, patchOwnedAdStatus } from "@/lib/account/backend-account";
import { getSessionDataFromRequest } from "@/services/sessionService";

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
  const session = getSessionDataFromRequest(request);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const payload = await fetchOwnedAd(session, params.id);
  return NextResponse.json(payload);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = getSessionDataFromRequest(request);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const body = (await request.json()) as PatchPayload;
  const action = body.action;

  if (action !== "pause" && action !== "activate") {
    return NextResponse.json({ error: "Acao invalida" }, { status: 400 });
  }

  const updated = await patchOwnedAdStatus(session, params.id, action);

  return NextResponse.json({
    ad: updated.ad,
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const session = getSessionDataFromRequest(request);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const removed = await deleteOwnedAd(session, params.id);
  return NextResponse.json(removed);
}
