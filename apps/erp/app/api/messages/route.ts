import { NextResponse } from "next/server";

import { getMessageHub } from "../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getMessageHub());
  } catch {
    return NextResponse.json(
      {
        error: "message_hub_unavailable",
        message: "문자 내역을 불러오지 못했습니다.",
      },
      { status: 502 },
    );
  }
}
