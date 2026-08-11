import { NextResponse } from "next/server";

import {
  ConsultationGatewayError,
  getMessageThread,
} from "../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  try {
    return NextResponse.json(await getMessageThread(key));
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
