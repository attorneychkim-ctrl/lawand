import { NextResponse } from "next/server";
import { listUnreadMessageNotifications } from "../../../../lib/gateway";

export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await listUnreadMessageNotifications()); }
  catch { return NextResponse.json({ error: "message_notifications_unavailable" }, { status: 502 }); }
}
