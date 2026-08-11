import { NextResponse } from "next/server";

import { getTelephonyCallActivities } from "../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getTelephonyCallActivities());
  } catch {
    return NextResponse.json(
      { error: "telephony_call_activities_unavailable" },
      { status: 502 },
    );
  }
}
