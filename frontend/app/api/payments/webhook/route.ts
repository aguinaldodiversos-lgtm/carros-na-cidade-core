import { NextRequest, NextResponse } from "next/server";
import { forwardPaymentWebhookToBackend } from "@/lib/account/backend-account";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const forwarded = await forwardPaymentWebhookToBackend(rawBody, {
    "content-type": request.headers.get("content-type") || "application/json",
    "x-signature": request.headers.get("x-signature") || "",
    "x-request-id": request.headers.get("x-request-id") || "",
  });

  return new NextResponse(forwarded.body, {
    status: forwarded.status,
    headers: {
      "Content-Type": forwarded.contentType,
    },
  });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
