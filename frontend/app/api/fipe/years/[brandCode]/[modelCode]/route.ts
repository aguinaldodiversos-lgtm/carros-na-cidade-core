// frontend/app/api/fipe/years/[brandCode]/[modelCode]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getFipeYears } from "@/lib/fipe/fipe-provider";

type RouteContext = {
  params: {
    brandCode: string;
    modelCode: string;
  };
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const vehicleType = request.nextUrl.searchParams.get("vehicleType") || "carros";
    const data = await getFipeYears(
      context.params.brandCode,
      context.params.modelCode,
      vehicleType
    );

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
        error: error instanceof Error ? error.message : "Falha ao carregar anos",
      },
      { status: 500 }
    );
  }
}
