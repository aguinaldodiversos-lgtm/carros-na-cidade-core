import { NextRequest } from "next/server";
import { forwardDealerReviewRequest } from "@/lib/account/dealer-review-bff";
export const dynamic = "force-dynamic";
export function GET(request: NextRequest) {
  return forwardDealerReviewRequest(request, "/api/account/store/reviews", "GET");
}
