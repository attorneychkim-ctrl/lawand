"use client";

import { useEffect, useMemo, useState } from "react";
import {
  REVIEW_GIFT_COUPON_DEFAULT_MESSAGE,
  REVIEW_GIFT_COUPON_MESSAGE_MAX_LENGTH,
} from "@lawand/core";

import type { ReviewGiftCouponDelivery, ReviewManagementDetail } from "../../lib/gateway";

const products = [
  {
    id: "mega_double_americano",
    brand: "메가MGC커피",
    name: "더블 아아 세트",
    price: "4,000원",
    tone: "coffee",
  },
  {
    id: "naverpay_10000",
    brand: "네이버페이 포인트",
    name: "네이버페이 포인트 10,000원",
    price: "10,000원",
    tone: "convenience",
  },
  {
    id: "baemin_30000",
    brand: "배달의민족",
    name: "[배달의민족] 모바일상품권 3만원",
    price: "30,000원",
    tone: "bakery",
  },
] as const;

function formatPhone(value: string | null) {
  if (!value) return "휴대전화 미등록";
  const digits = value.replace(/\D/g, "");
  return /^\d{11}$/.test(digits)
    ? `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`
    : value;
}

function formatSentAt(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ReviewGifticonPanel({
  customer,
  receiptCode,
  submittedPhone,
  recordType,
  recordId,
}: {
  customer: ReviewManagementDetail["linkedCustomer"];
  receiptCode: string | null;
  submittedPhone: string | null;
  recordType: "review" | "submission";
  recordId: string;
}) {
  const [selectedId, setSelectedId] = useState<(typeof products)[number]["id"]>("mega_double_americano");
  const [reason, setReason] = useState("review_thanks");
  const [message, setMessage] = useState(REVIEW_GIFT_COUPON_DEFAULT_MESSAGE);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyFailed, setHistoryFailed] = useState(false);
  const [delivery, setDelivery] = useState<ReviewGiftCouponDelivery | null>(null);
  const [error, setError] = useState("");
  const selected = useMemo(
    () => products.find((product) => product.id === selectedId) ?? products[0],
    [selectedId],
  );
  const recipientPhone = customer?.phone ?? submittedPhone;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/reviews/${recordType}/${recordId}/gift-coupons`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null) as { delivery?: ReviewGiftCouponDelivery | null; message?: string } | null;
        if (!response.ok) throw new Error(body?.message ?? "쿠폰 발송 내역을 불러오지 못했습니다.");
        setDelivery(body?.delivery ?? null);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setHistoryFailed(true);
          setError(caught instanceof Error ? caught.message : "쿠폰 발송 내역을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [recordId, recordType]);

  async function sendCoupon() {
    if (!confirmed || !recipientPhone || !message.trim()) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/reviews/${recordType}/${recordId}/gift-coupons`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ productKey: selectedId, reason, idempotencyKey: crypto.randomUUID(), message, confirmed: true }) });
      const body = await response.json().catch(() => null) as (ReviewGiftCouponDelivery & { message?: string }) | null;
      if (!response.ok) throw new Error(body?.message ?? "쿠폰 발송에 실패했습니다.");
      if (body) setDelivery(body);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "쿠폰 발송에 실패했습니다."); }
    finally { setBusy(false); }
  }

  return (
    <section className="gifticon-review-panel" data-testid="giftishow-commercial-screen">
      <header className="gifticon-panel-heading">
        <div>
          <p className="eyebrow">MOBILE COUPON</p>
          <h2>고객 감사 기프티콘</h2>
          <p>후기 내용의 긍정·부정과 무관하게 정해진 운영 기준으로만 발송합니다.</p>
        </div>
        <span className="gifticon-api-status"><i aria-hidden="true" /> 기프티쇼 비즈 API 승인</span>
      </header>

      {customer ? (
        <div className="gifticon-panel-body">
          <div className="gifticon-steps" aria-label="기프티콘 발송 단계">
            <span className="is-current"><i>1</i> 상품 선택</span>
            <span><i>2</i> 발송 확인</span>
            <span><i>3</i> 결과 기록</span>
          </div>

          <div className="gifticon-recipient-card">
            <div className="gifticon-avatar" aria-hidden="true">{customer.clientName.slice(0, 1)}</div>
            <div><span>수신 고객</span><strong>{customer.clientName}</strong><p>{formatPhone(recipientPhone)}</p></div>
            <dl>
              <div><dt>후기 접수</dt><dd>{receiptCode ?? "이전 홈페이지 후기"}</dd></div>
              <div><dt>연결 사건</dt><dd>{customer.caseNumber ?? customer.caseName ?? `사건 #${customer.caseIdx}`}</dd></div>
              <div><dt>담당자</dt><dd>{customer.staff.map((staff) => staff.name).join(" · ") || "미지정"}</dd></div>
            </dl>
          </div>

          <fieldset className="gifticon-products" disabled={Boolean(delivery)}>
            <legend>발송 상품</legend>
            <div>
              {products.map((product) => (
                <label className={selectedId === product.id ? "is-selected" : undefined} key={product.id}>
                  <input checked={selectedId === product.id} name="gifticon-product" onChange={() => {
                    setSelectedId(product.id);
                    setConfirmed(false);
                  }} type="radio" value={product.id} />
                  <span className={`gifticon-product-art tone-${product.tone}`} aria-hidden="true">
                    <i>LAW&amp;</i><b>MOBILE GIFT</b><small>{product.price}</small>
                  </span>
                  <span className="gifticon-product-copy"><small>{product.brand}</small><strong>{product.name}</strong><b>{product.price}</b></span>
                  <span className="gifticon-product-check" aria-hidden="true">✓</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="gifticon-send-settings">
            <label>
              <span>발송 사유</span>
              <select onChange={(event) => {
                setReason(event.target.value);
                setConfirmed(false);
              }} value={reason}>
                <option value="review_thanks">후기 작성 감사</option>
                <option value="service_recovery">고객 응대 후속 배려</option>
                <option value="event">고객 참여 이벤트</option>
              </select>
            </label>
            <label>
              <span>발신 표기</span>
              <input readOnly value="법무법인 로앤" />
            </label>
            <label className="gifticon-message-preview">
              <span>고객 안내 문구</span>
              <textarea
                disabled={Boolean(delivery) || busy}
                maxLength={REVIEW_GIFT_COUPON_MESSAGE_MAX_LENGTH}
                onChange={(event) => {
                  setMessage(event.target.value);
                  setConfirmed(false);
                }}
                rows={7}
                value={message}
              />
              <small>
                발송 전 자유롭게 수정할 수 있습니다. {message.length}/{REVIEW_GIFT_COUPON_MESSAGE_MAX_LENGTH}자
              </small>
            </label>
          </div>

          {delivery ? (
            <div className={`gifticon-delivery-record is-${delivery.status}`} role="status">
              <span className="gifticon-delivery-icon" aria-hidden="true">✓</span>
              <div>
                <span>{delivery.status === "sent" ? "모바일 쿠폰 발송 완료" : "모바일 쿠폰 발송 결과 확인 중"}</span>
                <strong>{delivery.brandName} · {delivery.goodsName}</strong>
                <p>{formatSentAt(delivery.respondedAt ?? delivery.requestedAt)} 발송{delivery.orderNo ? ` · 주문번호 ${delivery.orderNo}` : ""}</p>
              </div>
              <b>이 후기에는 다시 발송할 수 없습니다.</b>
            </div>
          ) : (
            <div className="gifticon-final-check">
              <div>
                <span>최종 발송 내용</span>
                <strong>{selected.name}</strong>
                <p>{customer.clientName} · {formatPhone(recipientPhone)} · {reason === "review_thanks" ? "후기 작성 감사" : "고객 배려"}</p>
              </div>
              <label>
                <input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" />
                <span>수신자·상품·발송 사유·안내 문구를 확인했고, 긍정적 후기의 대가로 지급하지 않음을 확인했습니다.</span>
              </label>
              <button disabled={!confirmed || !message.trim() || busy || !recipientPhone || historyLoading || historyFailed} onClick={() => void sendCoupon()} type="button">{busy ? "발송 확인 중…" : historyLoading ? "발송 내역 확인 중…" : "모바일 쿠폰 발송"}</button>
              {error ? <small role="alert">{error}</small> : <small>버튼을 누르면 비즈머니가 차감되고 기프티쇼 비즈가 MMS를 발송합니다.</small>}
            </div>
          )}
        </div>
      ) : (
        <div className="gifticon-unlinked">
          <strong>고객 사건을 먼저 연결해 주세요.</strong>
          <p>연결된 고객의 전체 이름과 휴대전화 번호를 다시 확인한 뒤에만 발송 화면이 활성화됩니다.</p>
        </div>
      )}
    </section>
  );
}
