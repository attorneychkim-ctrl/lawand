import { NextResponse } from "next/server";

import {
  acknowledgeTelephonyRealtime,
  ConsultationGatewayError,
  type TelephonyRealtimeAck,
} from "../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const input = (await request.json().catch(() => null)) as
    | TelephonyRealtimeAck
    | null;
  if (!input) {
    return NextResponse.json(
      { error: "invalid_realtime_ack" },
      { status: 400 },
    );
  }
  try {
    const result = await acknowledgeTelephonyRealtime(input);
    return NextResponse.json(result, {
      status:
        result.status === "recorded"
          ? 202
          : result.status === "replayed"
            ? 200
            : 410,
    });
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "realtime_ack_rejected" },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "realtime_ack_unavailable" },
      { status: 502 },
    );
  }
}
