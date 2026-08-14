import { NextResponse } from "next/server";

import { getReviewDutyCount } from "../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getReviewDutyCount());
  } catch {
    return NextResponse.json(
      { error: "review_duty_count_unavailable" },
      { status: 502 },
    );
  }
}
