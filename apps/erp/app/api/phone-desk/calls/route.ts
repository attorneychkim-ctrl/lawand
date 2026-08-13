import { NextResponse } from "next/server";

import {
  getPhoneDeskCalls,
  type ListPageSize,
  type PhoneDeskListFilter,
} from "../../../../lib/gateway";

export const dynamic = "force-dynamic";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("pageSize") ?? "20");
  const filter = searchParams.get("filter") ?? "all";
  const assigneeUserId = searchParams.get("assigneeUserId") ?? undefined;
  const fromValue = searchParams.get("from");
  const toValue = searchParams.get("to");
  const search = searchParams.get("q")?.trim() ?? "";
  const includeFollowUps = searchParams.get("includeFollowUps") === "1";
  const isPhoneSearch = Boolean(search) && /^[0-9() +.-]+$/.test(search);
  const searchDigits = search.replace(/[^0-9]/g, "");
  const compactSearchName = search.replace(/\s/g, "");
  const from = fromValue ? new Date(fromValue) : undefined;
  const to = toValue ? new Date(toValue) : undefined;
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    ![20, 50, 100].includes(pageSize) ||
    ![
      "all",
      "inbound",
      "click_to_call",
      "centrex_direct",
      "internal",
      "active",
    ].includes(filter) ||
    (assigneeUserId !== undefined && !uuidPattern.test(assigneeUserId)) ||
    (from && Number.isNaN(from.getTime())) ||
    (to && Number.isNaN(to.getTime())) ||
    (from && to && from >= to)
    || (from && to && to.getTime() - from.getTime() > 31 * 24 * 60 * 60_000)
    || (search && (
      (isPhoneSearch && (searchDigits.length < 4 || searchDigits.length > 15))
      || (!isPhoneSearch && (compactSearchName.length < 2 || compactSearchName.length > 30))
    ))
  ) {
    return NextResponse.json(
      { error: "invalid_list_query" },
      { status: 400 },
    );
  }
  try {
    return NextResponse.json(
      await getPhoneDeskCalls({
        page,
        pageSize: pageSize as ListPageSize,
        filter: filter as PhoneDeskListFilter,
        ...(assigneeUserId ? { assigneeUserId } : {}),
        from: fromValue ?? undefined,
        to: toValue ?? undefined,
        ...(search ? { search } : {}),
        includeFollowUps,
      }),
    );
  } catch {
    return NextResponse.json(
      { error: "phone_desk_calls_unavailable" },
      { status: 502 },
    );
  }
}
