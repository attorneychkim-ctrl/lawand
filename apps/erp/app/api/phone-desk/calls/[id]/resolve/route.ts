import { NextResponse } from "next/server";

import {
  ConsultationGatewayError,
  resolvePhoneDeskCall,
  type PhoneDeskCallResolutionInput,
} from "../../../../../../lib/gateway";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | PhoneDeskCallResolutionInput
    | null;
  if (!body) {
    return NextResponse.json(
      { error: "invalid_request", message: "최종 통화자를 선택해 주세요." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await resolvePhoneDeskCall(id, body));
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "call_resolution_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "call_resolution_unavailable",
        message: "통화 종료 상태를 확정하지 못했습니다.",
      },
      { status: 502 },
    );
  }
}
