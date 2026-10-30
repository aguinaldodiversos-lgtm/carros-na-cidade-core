import { NextRequest } from "next/server";
import { forwardDealerReviewRequest } from "@/lib/account/dealer-review-bff";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  return forwardDealerReviewRequest(
    request, "/api/public/dealers/" + encodeURIComponent(params.slug) + "/reviews", "POST",
    { rating: Number(raw.rating), body: String(raw.body ?? "") }
  );
}
