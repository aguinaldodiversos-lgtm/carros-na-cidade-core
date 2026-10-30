import { NextRequest } from "next/server";
import { forwardDealerReviewRequest } from "@/lib/account/dealer-review-bff";
export const dynamic = "force-dynamic";
export function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  return forwardDealerReviewRequest(
    request,
    "/api/account/store/reviews/" + encodeURIComponent(params.id),
    "DELETE"
  );
}
