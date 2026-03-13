// frontend/app/api/fipe/brands/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getFipeBrands } from "@/lib/fipe/fipe-provider";

export async function GET(request: NextRequest) {
  try {
    const vehicleType = request.nextUrl.searchParams.get("vehicleType") || "carros";
    const data = await getFipeBrands(vehicleType);

    return NextResponse.json(
      {
        success: true,
        data,
      },
      {
        headers: {
          "Cache-Control": "s-maxage=86400, stale-while-revalidate=43200",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Falha ao carregar montadoras",
      },
      { status: 500 }
    );
  }
}
