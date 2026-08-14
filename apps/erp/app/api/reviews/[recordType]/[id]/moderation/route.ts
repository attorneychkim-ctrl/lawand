import { NextResponse } from "next/server";

import { reviewModerationSchema } from "@lawand/core";

import { moderateReview, type ReviewRecordType } from "../../../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ recordType: string; id: string }> },
) {
  const { recordType, id } = await context.params;
  if (recordType !== "review" && recordType !== "submission") {
    return NextResponse.json({ error: "invalid_review_type" }, { status: 400 });
  }
  const parsed = reviewModerationSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await moderateReview(recordType as ReviewRecordType, id, parsed.data),
    );
  } catch (error) {
    return NextResponse.json(
      { error: "review_moderation_failed", message: error instanceof Error ? error.message : "공개 상태를 변경하지 못했습니다." },
      { status: 409 },
    );
  }
}
