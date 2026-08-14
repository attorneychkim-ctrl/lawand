import { NextResponse } from "next/server";

import { reviewReplyUpsertSchema } from "@lawand/core";

import { upsertReviewReply } from "../../../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ recordType: string; id: string }> },
) {
  const { recordType, id } = await context.params;
  if (recordType !== "review") {
    return NextResponse.json(
      { error: "review_not_published", message: "공개 원장으로 전환한 뒤 답글을 남길 수 있습니다." },
      { status: 409 },
    );
  }
  const parsed = reviewReplyUpsertSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await upsertReviewReply(id, parsed.data));
  } catch (error) {
    return NextResponse.json(
      { error: "review_reply_failed", message: error instanceof Error ? error.message : "답글을 저장하지 못했습니다." },
      { status: 409 },
    );
  }
}
