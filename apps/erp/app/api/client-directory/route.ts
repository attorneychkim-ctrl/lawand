import { NextResponse } from "next/server";

import {
  ConsultationGatewayError,
  searchLegalFriendsClientDirectory,
} from "../../../lib/gateway";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  try {
    return NextResponse.json(await searchLegalFriendsClientDirectory(query));
  } catch (error) {
    if (error instanceof ConsultationGatewayError) {
      return NextResponse.json(
        { error: "client_directory_rejected", message: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      {
        error: "client_directory_unavailable",
        message: "고객 정보를 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
      { status: 502 },
    );
  }
}
