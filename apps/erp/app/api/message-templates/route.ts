import { NextResponse } from "next/server";

import { messageTemplateCreateSchema } from "@lawand/core";

import {
  ConsultationGatewayError,
  createMessageTemplate,
  getMessageTemplates,
} from "../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({
      items: await getMessageTemplates(),
    });
  } catch {
    return NextResponse.json(
      { error: "message_templates_unavailable", message: "문자 템플릿을 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const parsed = messageTemplateCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: parsed.error.issues[0]?.message ?? "입력값을 확인해 주세요." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await createMessageTemplate(parsed.data), {
      status: 201,
    });
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
