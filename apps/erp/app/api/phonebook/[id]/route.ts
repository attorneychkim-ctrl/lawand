import { NextResponse } from "next/server";

import {
  ConsultationGatewayError,
  deactivatePhonebookContact,
  updatePhonebookContact,
  type PhonebookContactInput,
} from "../../../../lib/gateway";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | PhonebookContactInput
    | null;
  if (!body) {
    return NextResponse.json(
      { error: "invalid_request", message: "연락처 내용을 확인해 주세요." },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(await updatePhonebookContact(id, body));
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "phonebook_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "phonebook_unavailable", message: "연락처를 수정하지 못했습니다." },
      { status: 502 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    return NextResponse.json(await deactivatePhonebookContact(id));
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "phonebook_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "phonebook_unavailable", message: "연락처를 삭제하지 못했습니다." },
      { status: 502 },
    );
  }
}
