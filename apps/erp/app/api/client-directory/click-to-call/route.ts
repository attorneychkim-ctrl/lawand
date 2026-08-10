import { NextResponse } from "next/server";

import {
  ConsultationGatewayError,
  requestDirectoryClickToCall,
} from "../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    clientIdx?: unknown;
    caseIdx?: unknown;
  } | null;
  if (
    !body ||
    !Number.isInteger(body.clientIdx) ||
    !Number.isInteger(body.caseIdx)
  ) {
    return NextResponse.json(
      { error: "invalid_request", message: "고객 정보를 다시 선택해 주세요." },
      { status: 400 },
    );
  }
  try {
    const call = await requestDirectoryClickToCall({
      clientIdx: body.clientIdx as number,
      caseIdx: body.caseIdx as number,
    });
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
