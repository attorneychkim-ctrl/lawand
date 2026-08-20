import { NextResponse } from "next/server";

import { getPhoneDeskFollowUpDuty } from "../../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getPhoneDeskFollowUpDuty());
  } catch {
    return NextResponse.json(
      { error: "phone_desk_follow_up_duty_unavailable" },
      { status: 502 },
    );
  }
}
