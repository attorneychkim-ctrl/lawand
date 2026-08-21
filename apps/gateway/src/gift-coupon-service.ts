import { sql } from "drizzle-orm";
import { createEventId, type ReviewGiftCouponSend } from "@lawand/core";
import type { createDatabaseClient } from "@lawand/db";
import type { StaffPrincipal } from "./auth.js";
import type { DataProtection } from "./crypto.js";
import { GIFTISHOW_PRODUCTS, GiftishowError, type GiftishowClient } from "./giftishow.js";
import type { ReviewManagementService, ReviewRecordType } from "./review-management-service.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];
export type GiftCouponReason = "review_thanks" | "service_recovery" | "event";

type DeliveryRow = {
  id: string;
  status: string;
  product_key: string;
  brand_name_snapshot: string;
  goods_name_snapshot: string;
  sale_price_snapshot: number | string;
  reason: GiftCouponReason;
  provider_order_no: string | null;
  requested_at: Date | string;
  provider_responded_at: Date | string | null;
};

function serializeDelivery(row: DeliveryRow) {
  return {
    id: row.id,
    status: row.status,
    productKey: row.product_key,
    brandName: row.brand_name_snapshot,
    goodsName: row.goods_name_snapshot,
    salePrice: Number(row.sale_price_snapshot),
    reason: row.reason,
    orderNo: row.provider_order_no,
    requestedAt: new Date(row.requested_at).toISOString(),
    respondedAt: row.provider_responded_at ? new Date(row.provider_responded_at).toISOString() : null,
  };
}

export function createGiftCouponService(options: { db: Database; protection: DataProtection; client: GiftishowClient | null; reviewManagement: ReviewManagementService; now?: () => Date }) {
  const { db, protection, client, reviewManagement, now = () => new Date() } = options;
  async function getActive(recordType: ReviewRecordType, recordId: string) {
    const result = await db.execute(sql`SELECT id,status,product_key,brand_name_snapshot,goods_name_snapshot,sale_price_snapshot,reason,provider_order_no,requested_at,provider_responded_at FROM review_gift_coupon_deliveries WHERE record_type=${recordType} AND record_id=${recordId}::uuid AND status IN ('prepared','sent','unknown') ORDER BY requested_at DESC LIMIT 1`);
    const row = result.rows[0] as DeliveryRow | undefined;
    return row ? serializeDelivery(row) : null;
  }

  async function send(recordType: ReviewRecordType, recordId: string, input: ReviewGiftCouponSend, actor: StaffPrincipal) {
    if (!client) throw new GiftishowError("giftishow_not_configured", "기프티쇼 운영 설정이 완료되지 않았습니다.");
    const replay = await db.execute(sql`SELECT id,status,product_key,brand_name_snapshot,goods_name_snapshot,sale_price_snapshot,reason,provider_order_no,requested_at,provider_responded_at FROM review_gift_coupon_deliveries WHERE idempotency_key = ${input.idempotencyKey}::uuid LIMIT 1`);
    const replayRow = replay.rows[0] as DeliveryRow | undefined;
    if (replayRow) return { ...serializeDelivery(replayRow), replayed: true };
    if (await getActive(recordType, recordId)) {
      throw new GiftishowError("gift_coupon_already_sent", "이 후기에는 이미 모바일 쿠폰을 발송했거나 발송 결과를 확인 중입니다.");
    }
    const detail = await reviewManagement.getDetail(recordType, recordId, actor);
    const customer = detail?.linkedCustomer;
    const phone = (customer?.phone ?? detail?.submittedPhone ?? "").replace(/\D/g, "");
    if (!detail || !customer) throw new GiftishowError("review_customer_unlinked", "고객 사건을 먼저 연결해 주세요.");
    if (!/^01\d{8,9}$/.test(phone)) throw new GiftishowError("recipient_phone_invalid", "수신 휴대전화 번호를 확인해 주세요.");
    const product = await client.product(input.productKey);
    const id = createEventId();
    const requestedAt = now();
    const trId = `lawand_${requestedAt.toISOString().slice(0, 10).replaceAll("-", "")}_${id.replaceAll("-", "").slice(-8)}`;
    const encrypted = protection.encrypt(phone, `review_gift_coupon_deliveries.phone:${id}`);
    try {
      await db.execute(sql`INSERT INTO review_gift_coupon_deliveries (id,idempotency_key,record_type,record_id,requested_by_user_id,directory_client_idx,directory_case_idx,phone_ciphertext,phone_nonce,phone_key_version,phone_fingerprint,product_key,goods_code,brand_name_snapshot,goods_name_snapshot,sale_price_snapshot,reason,tr_id,status,requested_at,created_at,updated_at) VALUES (${id}::uuid,${input.idempotencyKey}::uuid,${recordType},${recordId}::uuid,${actor.id}::uuid,${customer.clientIdx},${customer.caseIdx},${encrypted.ciphertext},${encrypted.nonce},${encrypted.keyVersion},${protection.fingerprint(phone)},${product.key},${product.goodsCode},${product.brandName},${product.goodsName},${product.salePrice},${input.reason},${trId},'prepared',${requestedAt},${requestedAt},${requestedAt})`);
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new GiftishowError("gift_coupon_already_sent", "이 후기에는 이미 모바일 쿠폰을 발송했거나 발송 결과를 확인 중입니다.");
      }
      throw error;
    }
    try {
      const result = await client.send({
        product,
        phoneNo: phone,
        trId,
        message: input.message,
      });
      const respondedAt = now();
      await db.transaction(async (tx) => {
        await tx.execute(sql`UPDATE review_gift_coupon_deliveries SET status='sent', provider_order_no=${result.orderNo}, provider_responded_at=${respondedAt}, updated_at=${respondedAt} WHERE id=${id}::uuid AND status='prepared'`);
        await tx.execute(sql`INSERT INTO staff_audit_logs (id,actor_user_id,action,target_type,target_id,metadata,occurred_at) VALUES (${createEventId()}::uuid,${actor.id}::uuid,'review.gift_coupon.sent','review_gift_coupon_delivery',${id},${JSON.stringify({ recordType, recordId, productKey: product.key, goodsCode: product.goodsCode, reason: input.reason, trId })}::jsonb,${respondedAt})`);
      });
      return { ...serializeDelivery({ id, status: "sent", product_key: product.key, brand_name_snapshot: product.brandName, goods_name_snapshot: product.goodsName, sale_price_snapshot: product.salePrice, reason: input.reason, provider_order_no: result.orderNo, requested_at: requestedAt, provider_responded_at: respondedAt }), replayed: false };
    } catch (error) {
      const providerError = error instanceof GiftishowError ? error : new GiftishowError("gift_coupon_send_failed", "쿠폰 발송에 실패했습니다.");
      let status = providerError.uncertain ? "unknown" : "failed";
      if (providerError.uncertain) {
        try { await client.cancel(trId); status = "cancelled"; } catch { /* 결과 불명은 운영 확인 대상으로 보존 */ }
      }
      const respondedAt = now();
      await db.execute(sql`UPDATE review_gift_coupon_deliveries SET status=${status}::review_gift_coupon_status,last_error_code=${providerError.code},provider_responded_at=${respondedAt},updated_at=${respondedAt} WHERE id=${id}::uuid`);
      throw providerError;
    }
  }
  return { products: GIFTISHOW_PRODUCTS, getActive, send };
}
export type GiftCouponService = ReturnType<typeof createGiftCouponService>;
