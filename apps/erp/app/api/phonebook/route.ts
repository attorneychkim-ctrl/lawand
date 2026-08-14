import { NextResponse } from "next/server";

import {
  ConsultationGatewayError,
  createPhonebookContact,
  getPhonebookContacts,
  type PhonebookContactInput,
} from "../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getPhonebookContacts());
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "phonebook_unavailable", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "phonebook_unavailable", message: "전화번호부를 불러오지 못했습니다." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
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
    return NextResponse.json(await createPhonebookContact(body), {
      status: 201,
    });
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "phonebook_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "phonebook_unavailable", message: "연락처를 저장하지 못했습니다." },
      { status: 502 },
    );
  }
}
