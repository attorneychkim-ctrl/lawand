import { NextResponse } from "next/server";

import { reviewRequestBatchSendSchema } from "@lawand/core";

import { sendReviewRequests } from "../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = reviewRequestBatchSendSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await sendReviewRequests(parsed.data));
  } catch (error) {
    return NextResponse.json(
      { error: "review_request_failed", message: error instanceof Error ? error.message : "후기 요청 문자를 보내지 못했습니다." },
      { status: 409 },
    );
  }
}
