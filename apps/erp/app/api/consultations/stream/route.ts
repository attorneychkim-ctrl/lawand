import { NextResponse } from "next/server";

import { openConsultationEventStream } from "../../../../lib/gateway";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  let upstream: Response;
  try {
    upstream = await openConsultationEventStream(request.signal);
  } catch {
    return NextResponse.json(
      { error: "consultation_stream_unavailable" },
      { status: 502 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "consultation_stream_rejected" },
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
