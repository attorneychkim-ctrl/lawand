import { NextResponse } from "next/server";

import {
  getConsultations,
  type ConsultationListFilter,
  type ListPageSize,
} from "../../../lib/gateway";

export const dynamic = "force-dynamic";

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
