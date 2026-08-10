import { NextResponse } from "next/server";

import {
  ConsultationGatewayError,
  requestConsultationClickToCall,
} from "../../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const call = await requestConsultationClickToCall(id);
    return NextResponse.json(call, { status: call.replayed ? 200 : 201 });
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "click_to_call_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "click_to_call_unavailable",
        message: "클릭투콜을 요청하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 502 },
    );
  }
}
