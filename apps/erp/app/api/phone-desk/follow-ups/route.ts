import { NextResponse } from "next/server";

import { getPhoneDeskFollowUps } from "../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getPhoneDeskFollowUps());
  } catch {
    return NextResponse.json(
      { error: "phone_desk_follow_ups_unavailable" },
      { status: 502 },
    );
  }
}
