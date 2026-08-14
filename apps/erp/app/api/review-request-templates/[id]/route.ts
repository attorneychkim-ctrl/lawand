import { NextResponse } from "next/server";

import { reviewRequestTemplateUpdateSchema } from "@lawand/core";

import { deleteReviewRequestTemplate, updateReviewRequestTemplate } from "../../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const parsed = reviewRequestTemplateUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", message: parsed.error.issues[0]?.message },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await updateReviewRequestTemplate(id, parsed.data));
  } catch (error) {
    return NextResponse.json(
      { error: "review_template_failed", message: error instanceof Error ? error.message : "템플릿을 수정하지 못했습니다." },
      { status: 409 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await deleteReviewRequestTemplate(id));
  } catch (error) {
    return NextResponse.json(
      { error: "review_template_delete_failed", message: error instanceof Error ? error.message : "템플릿을 삭제하지 못했습니다." },
      { status: 409 },
    );
  }
}
