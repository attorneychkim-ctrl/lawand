import { NextResponse } from "next/server";

import { messageTemplateUpdateSchema } from "@lawand/core";

import {
  ConsultationGatewayError,
  updateMessageTemplate,
} from "../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const parsed = messageTemplateUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." },
      { status: 400 },
    );
  }
  const { id } = await context.params;
  try {
    return NextResponse.json(await updateMessageTemplate(id, parsed.data));
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "message_template_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "message_template_unavailable", message: "문자 템플릿을 저장하지 못했습니다." },
      { status: 502 },
    );
  }
}
