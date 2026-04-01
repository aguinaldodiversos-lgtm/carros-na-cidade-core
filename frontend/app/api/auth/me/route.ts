import { NextRequest, NextResponse } from "next/server";
import {
  applyPrivateNoStoreHeaders,
  applyUnauthorizedWithSessionCleanup,
  getSessionUserFromRequest,
} from "@/services/sessionService";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = getSessionUserFromRequest(request);
  if (!session) {
    return applyPrivateNoStoreHeaders(applyUnauthorizedWithSessionCleanup(request));
  }

  return applyPrivateNoStoreHeaders(
    NextResponse.json({
      user: session,
    })
  );
}
