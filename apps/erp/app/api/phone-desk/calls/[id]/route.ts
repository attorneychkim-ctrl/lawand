import { NextResponse } from "next/server";

import {
  ConsultationGatewayError,
  getPhoneDeskCall,
} from "../../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await getPhoneDeskCall(id));
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "phone_desk_call_unavailable", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "phone_desk_call_unavailable",
        message: "전화 상세를 불러오지 못했습니다.",
      },
      { status: 502 },
    );
  }
}
