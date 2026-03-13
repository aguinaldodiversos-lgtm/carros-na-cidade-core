// frontend/app/api/fipe/quote/[brandCode]/[modelCode]/[yearCode]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getFipeQuote } from "@/lib/fipe/fipe-provider";

type RouteContext = {
  params: {
    brandCode: string;
    modelCode: string;
    yearCode: string;
  };
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const vehicleType = request.nextUrl.searchParams.get("vehicleType") || "carros";
    const data = await getFipeQuote(
      context.params.brandCode,
      context.params.modelCode,
      context.params.yearCode,
      vehicleType
    );

    return NextResponse.json(
      {
        success: true,
        data,
      },
      {
        headers: {
          "Cache-Control": "s-maxage=3600, stale-while-revalidate=1800",
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Falha ao consultar valor FIPE",
      },
      { status: 500 }
    );
  }
}
