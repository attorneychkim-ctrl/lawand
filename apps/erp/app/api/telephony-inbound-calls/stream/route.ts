import { NextResponse } from "next/server";

import { openTelephonyInboundEventStream } from "../../../../lib/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  let upstream: Response;
  try {
    upstream = await openTelephonyInboundEventStream(request.signal);
  } catch {
    return NextResponse.json(
      { error: "telephony_inbound_stream_unavailable" },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "telephony_inbound_stream_rejected" },
      { status: upstream.status },
    );
  }

  return new Response(upstream.body, {
    headers: {
      "cache-control": "no-cache, no-store, no-transform",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
      "x-content-type-options": "nosniff",
    },
  });
}
