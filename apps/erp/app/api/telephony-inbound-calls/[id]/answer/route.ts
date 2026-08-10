import { NextResponse } from "next/server";

import {
  answerTelephonyInboundCall,
  ConsultationGatewayError,
} from "../../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await answerTelephonyInboundCall(id));
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "answer_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "answer_unavailable",
        message: "전화 받기 요청을 전달하지 못했습니다.",
      },
      { status: 502 },
    );
  }
}
