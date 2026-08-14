import { NextResponse } from "next/server";

import { getReviewDetail, type ReviewRecordType } from "../../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ recordType: string; id: string }> },
) {
  const { recordType, id } = await context.params;
  if (recordType !== "review" && recordType !== "submission") {
    return NextResponse.json({ error: "invalid_review_type" }, { status: 400 });
  }
  try {
    const detail = await getReviewDetail(recordType as ReviewRecordType, id);
    return detail
      ? NextResponse.json(detail)
      : NextResponse.json({ error: "review_not_found" }, { status: 404 });
  } catch {
    return NextResponse.json(
      { error: "review_unavailable", message: "후기를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}
