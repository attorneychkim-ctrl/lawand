import { NextResponse } from "next/server";

import {
  ConsultationGatewayError,
  getReviews,
  type ReviewListFilter,
} from "../../../lib/gateway";

export const dynamic = "force-dynamic";

const filters = new Set<ReviewListFilter>([
  "all",
  "reply_needed",
  "pending",
  "published",
  "restricted",
  "mine",
]);

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const filterValue = params.get("filter") ?? "all";
  const pageValue = Number(params.get("page") ?? "1");
  if (
    !filters.has(filterValue as ReviewListFilter) ||
    !Number.isSafeInteger(pageValue) ||
    pageValue < 1
  ) {
    return NextResponse.json(
      { error: "invalid_review_query", message: "후기 조회 조건을 확인해 주세요." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await getReviews({
        page: pageValue,
        filter: filterValue as ReviewListFilter,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "reviews_unavailable",
        message:
          error instanceof ConsultationGatewayError
            ? error.message
            : "후기 목록을 불러오지 못했습니다.",
      },
      { status: error instanceof ConsultationGatewayError ? error.status : 502 },
    );
  }
}
