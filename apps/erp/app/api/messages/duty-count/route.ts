import { NextResponse } from "next/server";
import { getMessageDutyCount } from "../../../../lib/gateway";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await getMessageDutyCount()); }
  catch { return NextResponse.json({ error: "message_duty_count_unavailable" }, { status: 502 }); }
}
