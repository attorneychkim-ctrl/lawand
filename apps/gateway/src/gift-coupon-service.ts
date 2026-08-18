import { sql } from "drizzle-orm";
import { createEventId } from "@lawand/core";
import type { createDatabaseClient } from "@lawand/db";
import type { StaffPrincipal } from "./auth.js";
import type { DataProtection } from "./crypto.js";
import { GIFTISHOW_PRODUCTS, GiftishowError, type GiftishowClient, type GiftishowProductKey } from "./giftishow.js";
import type { ReviewManagementService, ReviewRecordType } from "./review-management-service.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];
export type GiftCouponReason = "review_thanks" | "service_recovery" | "event";

export function createGiftCouponService(options: { db: Database; protection: DataProtection; client: GiftishowClient | null; reviewManagement: ReviewManagementService; now?: () => Date }) {
  const { db, protection, client, reviewManagement, now = () => new Date() } = options;
  async function send(recordType: ReviewRecordType, recordId: string, input: { productKey: GiftishowProductKey; reason: GiftCouponReason; idempotencyKey: string; confirmed: true }, actor: StaffPrincipal) {
    if (!client) throw new GiftishowError("giftishow_not_configured", "기프티쇼 운영 설정이 완료되지 않았습니다.");
    const replay = await db.execute(sql`SELECT id, status, provider_order_no FROM review_gift_coupon_deliveries WHERE idempotency_key = ${input.idempotencyKey}::uuid LIMIT 1`);
    const replayRow = replay.rows[0] as { id: string; status: string; provider_order_no: string | null } | undefined;
    if (replayRow) return { id: replayRow.id, status: replayRow.status, orderNo: replayRow.provider_order_no, replayed: true };
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
    await db.execute(sql`INSERT INTO review_gift_coupon_deliveries (id,idempotency_key,record_type,record_id,requested_by_user_id,directory_client_idx,directory_case_idx,phone_ciphertext,phone_nonce,phone_key_version,phone_fingerprint,product_key,goods_code,brand_name_snapshot,goods_name_snapshot,sale_price_snapshot,reason,tr_id,status,requested_at,created_at,updated_at) VALUES (${id}::uuid,${input.idempotencyKey}::uuid,${recordType},${recordId}::uuid,${actor.id}::uuid,${customer.clientIdx},${customer.caseIdx},${encrypted.ciphertext},${encrypted.nonce},${encrypted.keyVersion},${protection.fingerprint(phone)},${product.key},${product.goodsCode},${product.brandName},${product.goodsName},${product.salePrice},${input.reason},${trId},'prepared',${requestedAt},${requestedAt},${requestedAt})`);
    const message = `${customer.clientName}님, 소중한 후기를 남겨주셔서 감사합니다. 후기의 내용이나 평가와 관계없이 로앤의 고객 감사 운영 기준에 따라 모바일 쿠폰을 보내드립니다.`;
    try {
      const result = await client.send({ product, phoneNo: phone, trId, message });
      const respondedAt = now();
      await db.transaction(async (tx) => {
        await tx.execute(sql`UPDATE review_gift_coupon_deliveries SET status='sent', provider_order_no=${result.orderNo}, provider_responded_at=${respondedAt}, updated_at=${respondedAt} WHERE id=${id}::uuid AND status='prepared'`);
        await tx.execute(sql`INSERT INTO staff_audit_logs (id,actor_user_id,action,target_type,target_id,metadata,occurred_at) VALUES (${createEventId()}::uuid,${actor.id}::uuid,'review.gift_coupon.sent','review_gift_coupon_delivery',${id},${JSON.stringify({ recordType, recordId, productKey: product.key, goodsCode: product.goodsCode, reason: input.reason, trId })}::jsonb,${respondedAt})`);
      });
      return { id, status: "sent", orderNo: result.orderNo, replayed: false };
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
  return { products: GIFTISHOW_PRODUCTS, send };
}
export type GiftCouponService = ReturnType<typeof createGiftCouponService>;
