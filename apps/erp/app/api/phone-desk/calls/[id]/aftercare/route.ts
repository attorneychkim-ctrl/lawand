import { NextResponse } from "next/server";

import {
  ConsultationGatewayError,
  savePhoneDeskAftercare,
  type PhoneDeskAftercareInput,
} from "../../../../../../lib/gateway";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | PhoneDeskAftercareInput
    | null;
  if (!body) {
    return NextResponse.json(
      { error: "invalid_request", message: "후처리 내용을 확인해 주세요." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await savePhoneDeskAftercare(id, body));
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "aftercare_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "aftercare_unavailable",
        message: "통화 후처리를 저장하지 못했습니다.",
      },
      { status: 502 },
    );
  }
}
