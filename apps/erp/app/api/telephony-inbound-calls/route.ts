import { NextResponse } from "next/server";

import { getTelephonyInboundCalls } from "../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getTelephonyInboundCalls());
  } catch {
    return NextResponse.json(
      { error: "telephony_inbound_calls_unavailable" },
      { status: 502 },
    );
  }
}
