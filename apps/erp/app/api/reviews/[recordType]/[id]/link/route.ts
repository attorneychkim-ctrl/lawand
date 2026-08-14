import { NextResponse } from "next/server";

import { reviewCustomerLinkSchema } from "@lawand/core";

import { linkReviewCustomer, type ReviewRecordType } from "../../../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ recordType: string; id: string }> },
) {
  const { recordType, id } = await context.params;
  if (recordType !== "review" && recordType !== "submission") {
    return NextResponse.json({ error: "invalid_review_type" }, { status: 400 });
  }
  const parsed = reviewCustomerLinkSchema.safeParse(
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
      await linkReviewCustomer(recordType as ReviewRecordType, id, parsed.data),
    );
  } catch (error) {
    return NextResponse.json(
      { error: "review_link_failed", message: error instanceof Error ? error.message : "고객을 연결하지 못했습니다." },
      { status: 409 },
    );
  }
}
