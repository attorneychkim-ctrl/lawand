import { NextResponse } from "next/server";

import { reviewRequestTemplateCreateSchema } from "@lawand/core";

import { createReviewRequestTemplate, getReviewRequestTemplates } from "../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ items: await getReviewRequestTemplates() });
  } catch {
    return NextResponse.json({ error: "review_templates_unavailable" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const parsed = reviewRequestTemplateCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await createReviewRequestTemplate(parsed.data), { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "review_template_failed", message: error instanceof Error ? error.message : "템플릿을 만들지 못했습니다." },
      { status: 409 },
    );
  }
}
