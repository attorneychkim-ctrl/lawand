import { NextResponse } from "next/server";

import { getReviewNotification, type ReviewRecordType } from "../../../../../../lib/gateway";

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
    const notification = await getReviewNotification(
      recordType as ReviewRecordType,
      id,
    );
    return notification
      ? NextResponse.json(notification)
      : NextResponse.json({ error: "review_notification_not_found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "review_notification_unavailable" }, { status: 502 });
  }
}
