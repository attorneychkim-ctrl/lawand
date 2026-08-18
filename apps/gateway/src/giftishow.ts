export const GIFTISHOW_PRODUCTS = [
  {
    key: "mega_double_americano",
    goodsCode: "G00005791119",
    brandName: "메가MGC커피",
    goodsName: "더블 아아 세트",
    salePrice: 4_000,
  },
  {
    key: "naverpay_10000",
    goodsCode: "G00002071061",
    brandName: "네이버페이 포인트",
    goodsName: "네이버페이 포인트 10,000원",
    salePrice: 10_000,
  },
  {
    key: "baemin_30000",
    goodsCode: "G00005790951",
    brandName: "배달의민족",
    goodsName: "[배달의민족] 모바일상품권 3만원",
    salePrice: 30_000,
  },
] as const;

export type GiftishowProductKey = (typeof GIFTISHOW_PRODUCTS)[number]["key"];

export type GiftishowConfig = {
  authCode: string;
  authToken: string;
  userId: string;
  callbackNo: string;
  bannerId: string;
  templateId: string;
};

export class GiftishowError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly uncertain = false,
  ) {
    super(message);
  }
}

type ApiEnvelope = {
  code?: string;
  message?: string | null;
  balance?: string | number;
  result?: unknown;
};

function nestedEnvelope(value: unknown): ApiEnvelope {
  let current = value as ApiEnvelope;
  for (let depth = 0; depth < 3; depth += 1) {
    if (current?.code && current.code !== "0000") {
      throw new GiftishowError(current.code, current.message || `기프티쇼 오류 (${current.code})`);
    }
    if (!current?.result || typeof current.result !== "object") return current;
    const child = current.result as ApiEnvelope;
    if (!("code" in child)) return current;
    current = child;
  }
  return current;
}

export function createGiftishowClient(config: GiftishowConfig, fetcher = fetch) {
  async function request(path: string, apiCode: string, values: Record<string, string>, timeoutMs = 8_000) {
    const body = new URLSearchParams({
      api_code: apiCode,
      custom_auth_code: config.authCode,
      custom_auth_token: config.authToken,
      dev_yn: "N",
      ...values,
    });
    let response: Response;
    try {
      response = await fetcher(`https://bizapi.giftishow.com${path}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new GiftishowError(
        "provider_response_unknown",
        error instanceof Error ? error.message : "기프티쇼 응답을 확인하지 못했습니다.",
        true,
      );
    }
    const payload = (await response.json().catch(() => null)) as ApiEnvelope | null;
    if (!response.ok || !payload) {
      throw new GiftishowError(`provider_http_${response.status}`, "기프티쇼 API 응답이 올바르지 않습니다.");
    }
    return nestedEnvelope(payload);
  }

  return {
    async product(productKey: GiftishowProductKey) {
      const expected = GIFTISHOW_PRODUCTS.find((item) => item.key === productKey);
      if (!expected) throw new GiftishowError("product_not_allowed", "승인되지 않은 상품입니다.");
      const envelope = await request(`/bizApi/goods/${expected.goodsCode}`, "0111", {
        goods_code: expected.goodsCode,
      });
      const detail = (envelope.result as { goodsDetail?: Record<string, unknown> } | undefined)?.goodsDetail;
      if (!detail) throw new GiftishowError("product_detail_missing", "상품 상세정보가 없습니다.");
      if (
        detail.goodsCode !== expected.goodsCode ||
        detail.brandName !== expected.brandName ||
        detail.goodsName !== expected.goodsName ||
        Number(detail.salePrice) !== expected.salePrice ||
        detail.goodsStateCd !== "SALE"
      ) {
        throw new GiftishowError("product_contract_changed", "상품 정보가 승인된 기준과 달라 발송을 중단했습니다.");
      }
      return { ...expected, imageUrl: String(detail.goodsImgS || ""), limitDay: Number(detail.limitDay || 0) };
    },
    async balance() {
      const envelope = await request("/bizApi/bizmoney", "0301", { user_id: config.userId });
      const balance = Number(envelope.balance ?? (envelope.result as { balance?: unknown } | undefined)?.balance);
      if (!Number.isSafeInteger(balance) || balance < 0) {
        throw new GiftishowError("balance_invalid", "비즈머니 잔액 응답이 올바르지 않습니다.");
      }
      return balance;
    },
    async send(input: { product: (typeof GIFTISHOW_PRODUCTS)[number]; phoneNo: string; trId: string; message: string }) {
      const envelope = await request("/bizApi/send", "0204", {
        goods_code: input.product.goodsCode,
        mms_msg: input.message,
        mms_title: "법무법인 로앤",
        callback_no: config.callbackNo,
        phone_no: input.phoneNo,
        tr_id: input.trId,
        template_id: config.templateId,
        banner_id: config.bannerId,
        user_id: config.userId,
        gubun: "N",
      }, 15_000);
      const result = envelope.result as { orderNo?: unknown } | undefined;
      if (typeof result?.orderNo !== "string" || !result.orderNo) {
        throw new GiftishowError("order_number_missing", "발송 주문번호가 없습니다.");
      }
      return { orderNo: result.orderNo };
    },
    async cancel(trId: string) {
      await request("/bizApi/cancel", "0202", { tr_id: trId, user_id: config.userId });
    },
  };
}

export type GiftishowClient = ReturnType<typeof createGiftishowClient>;
