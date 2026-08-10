import { NextResponse } from "next/server";

import {
  completePhoneDeskFollowUp,
  ConsultationGatewayError,
} from "../../../../../../lib/gateway";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await completePhoneDeskFollowUp(id));
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "follow_up_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "follow_up_unavailable",
        message: "재통화 업무를 완료하지 못했습니다.",
      },
      { status: 502 },
    );
  }
}
