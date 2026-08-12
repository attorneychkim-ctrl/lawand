import { NextResponse } from "next/server";

import { staffConsultationCreateSchema } from "@lawand/core";

import {
  ConsultationGatewayError,
  createStaffConsultation,
  getConsultations,
  type ConsultationListFilter,
  type ListPageSize,
} from "../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = staffConsultationCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid_request",
        message:
          parsed.error.issues[0]?.message ??
          "신규상담 고객정보를 다시 확인해 주세요.",
      },
      { status: 400 },
    );
  }
  try {
    const result = await createStaffConsultation(parsed.data);
    return NextResponse.json(result, {
      status: result.replayed ? 200 : 201,
    });
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "consultation_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "consultation_unavailable",
        message: "신규상담을 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 502 },
    );
  }
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "20");
  const filter = searchParams.get("filter") ?? "all";
  const fromValue = searchParams.get("from");
  const toValue = searchParams.get("to");
  const from = fromValue ? new Date(fromValue) : undefined;
  const to = toValue ? new Date(toValue) : undefined;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    ![20, 50, 100].includes(pageSize) ||
    !["all", "waiting", "mine", "attention", "today"].includes(filter) ||
    (from && Number.isNaN(from.getTime())) ||
    (to && Number.isNaN(to.getTime())) ||
    (from && to && from >= to)
  ) {
    return NextResponse.json(
      { error: "invalid_list_query" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await getConsultations({
        page,
        pageSize: pageSize as ListPageSize,
        filter: filter as ConsultationListFilter,
        from: fromValue ?? undefined,
        to: toValue ?? undefined,
      }),
    );
  } catch {
    return NextResponse.json(
      { error: "consultation_list_unavailable" },
      { status: 502 },
    );
  }
}
