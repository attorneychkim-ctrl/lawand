import { NextResponse } from "next/server";
import { getMessageNotification } from "../../../../../lib/gateway";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const value = await getMessageNotification(id);
    return value ? NextResponse.json(value) : NextResponse.json({ error: "not_found" }, { status: 404 });
  } catch { return NextResponse.json({ error: "message_notification_unavailable" }, { status: 502 }); }
}
