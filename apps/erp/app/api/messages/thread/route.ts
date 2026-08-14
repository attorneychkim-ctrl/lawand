import { NextResponse } from "next/server";

import {
  ConsultationGatewayError,
  getMessageThread,
} from "../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const key = searchParams.get("key") ?? "";
  const cursor = searchParams.get("cursor")?.trim() || undefined;
  const limit = Number(searchParams.get("limit") ?? "50");
  try {
    return NextResponse.json(
      await getMessageThread(key, {
        ...(cursor ? { cursor } : {}),
        ...(Number.isFinite(limit) ? { limit } : {}),
      }),
    );
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "message_thread_unavailable", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "message_thread_unavailable",
        message: "문자 대화를 불러오지 못했습니다.",
      },
      { status: 502 },
    );
  }
}
