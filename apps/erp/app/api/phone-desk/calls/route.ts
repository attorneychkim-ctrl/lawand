import { NextResponse } from "next/server";

import { getPhoneDeskCalls } from "../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getPhoneDeskCalls());
  } catch {
    return NextResponse.json(
      { error: "phone_desk_calls_unavailable" },
      { status: 502 },
    );
  }
}
