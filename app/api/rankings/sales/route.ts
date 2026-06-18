import { NextRequest, NextResponse } from "next/server";
import { serverErrorResponse } from "@/lib/auth/require-admin";
import { fetchXanoSalesRankings } from "@/lib/rankings/xano-sales-rankings";

export async function GET(request: NextRequest) {
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") || 10), 1), 50);
  const period = request.nextUrl.searchParams.get("period") === "all" ? "all" : "week";

  try {
    const rankings = await fetchXanoSalesRankings({
      limit,
      period,
      revalidate: 60,
    });

    return NextResponse.json({
      period,
      limit,
      rankings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "讀取銷售排行失敗";
    return serverErrorResponse(message);
  }
}
