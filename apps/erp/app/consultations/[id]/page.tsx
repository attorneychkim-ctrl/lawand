import Link from "next/link";
import { notFound } from "next/navigation";

import {
  getConsultation,
  type ConsultationDetail,
} from "../../../lib/gateway";
import { requireStaff } from "../../../lib/session";
import { ClaimConsultationButton } from "../../_components/claim-consultation-button";
import { KakaoEntryPanel } from "../../_components/kakao-entry-panel";
import { StaffBar } from "../../_components/staff-bar";

function formatDate(value: string | null) {
  if (!value) return "지정 없음";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(value));
}

function formatPhone(value: string) {
  return value.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
}

const residenceRegionLabels: Record<string, string> = {
  seoul: "서울",
  busan: "부산",
  daegu: "대구",
  incheon: "인천",
  gwangju: "광주",
  daejeon: "대전",
  ulsan: "울산",
  sejong: "세종",
  gyeonggi: "경기",
  gangwon: "강원",
  chungbuk: "충북",
  chungnam: "충남",
  jeonbuk: "전북",
  jeonnam: "전남",
  gyeongbuk: "경북",
  gyeongnam: "경남",
  jeju: "제주",
  overseas_or_other: "해외·기타",
};

function answer(key: string, value: unknown): string {
  if (
    key === "residenceRegion" &&
    typeof value === "string" &&
    residenceRegionLabels[value]
  ) {
    return residenceRegionLabels[value];
  }
  if (key === "scheduledAt" && typeof value === "string") {
    return formatDate(value);
  }
  if (Array.isArray(value)) return value.join(", ") || "입력 없음";
  if (typeof value === "number") return String(value);
  return typeof value === "string" && value ? value : "입력 없음";
}

const answerLabels: Record<string, string> = {
  residenceRegion: "거주 지역",
  topic: "도움 분야",
  urgencies: "현재 단계",
  incomes: "소득 형태",
  unsecuredDebt: "담보 없는 채무",
  securedDebt: "담보부 채무",
  assets: "순재산",
  discharge: "과거 면책",
  dischargeYear: "면책 연도",
  concern: "가장 걱정되는 내용",
  channel: "접수 채널",
  entrySource: "진입 경로",
  messageStorage: "메시지 저장",
  note: "상담 내용 확인",
  bookingNumber: "네이버 예약번호",
  productName: "예약 상품",
  scheduledAt: "예약 상담 시각",
  attendeeCount: "예약 인원",
  option: "예약 옵션",
  customerRequest: "고객 요청사항",
  detailStatus: "상세정보 상태",
};

const stateLabels: Record<string, string> = {
  requested: "신규 접수",
  assigned: "담당 배정",
  contacted: "연락 완료",
  completed: "상담 완료",
  engaged: "계약",
  closed: "종결",
};

type IntegrationRequest = ConsultationDetail["integrationRequests"][number];

function integrationStatus(request: IntegrationRequest | undefined): string {
  if (!request) return "요청 없음";
  if (request.status === "published") {
    return `완료${request.attempts > 0 ? ` · ${request.attempts}회 시도` : ""}`;
  }
  if (request.status === "dead") return "확인 필요";
  if (request.lockedAt) return "처리 중";
  if (request.attempts > 0) {
    return `재시도 예정 · ${formatDate(request.availableAt)}`;
  }
  return "워커 대기";
}

const integrationLabels: Record<string, string> = {
  "alimtalk.consultation.request_notification.requested":
    "상담 요청 접수 알림톡",
  "legalfriends.consultation.registration.requested": "리걸프렌즈 상담 등록",
  "alimtalk.consultation.assignment_notification.requested":
    "담당 배정 알림톡",
};

export default async function ConsultationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await requireStaff();
  let consultation;
  try {
    consultation = await getConsultation(id);
  } catch {
    throw new Error("상담 상세를 불러오지 못했습니다.");
  }
  if (!consultation) notFound();
  const legalFriendsRequest = consultation.integrationRequests.find(
    (request) => request.eventType.startsWith("legalfriends."),
  );
  const assignmentAlimtalkRequest = consultation.integrationRequests.find(
    (request) =>
      request.eventType ===
      "alimtalk.consultation.assignment_notification.requested",
  );

  return (
    <>
      <StaffBar staff={staff} />
      <main className="erp-shell detail-shell">
      <Link className="back-link" href="/">
        ← 상담 목록
      </Link>
      <header className="detail-header">
        <div>
          <p className="eyebrow">{consultation.publicReceiptCode}</p>
          <h1>{consultation.displayName}</h1>
          <p>
            최초 접수 {formatDate(consultation.firstRequestedAt)} · 최근 요청{" "}
            {formatDate(consultation.lastRequestedAt)}
          </p>
        </div>
        <div className="detail-actions">
          <span className="state-badge">
            {stateLabels[consultation.state] ?? consultation.state}
          </span>
          {consultation.state === "requested" &&
          consultation.kakaoEntry?.status !== "pending" ? (
            <ClaimConsultationButton consultationId={consultation.id} />
          ) : null}
        </div>
      </header>

      {consultation.kakaoEntry ? (
        <KakaoEntryPanel
          consultationId={consultation.id}
          entry={consultation.kakaoEntry}
        />
      ) : null}

      {consultation.naverBooking ? (
        <section className="assignment-panel" aria-labelledby="naver-title">
          <div>
            <p className="eyebrow">NAVER BOOKING</p>
            <h2 id="naver-title">
              {formatDate(consultation.naverBooking.scheduledAt)} 예약
            </h2>
            <p>
              예약번호 {consultation.naverBooking.bookingNumber} ·{" "}
              {consultation.naverBooking.status === "details_pending"
                ? "이름·전화번호 상세 확인 필요"
                : consultation.naverBooking.status === "ready"
                  ? "상세정보 반영 완료"
                  : "예약 취소"}
            </p>
          </div>
          <div className="assignment-meta">
            <a
              className="back-link"
              href={consultation.naverBooking.detailsUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              네이버 예약 상세 열기 ↗
            </a>
            <span>
              메일 감지 {formatDate(consultation.naverBooking.sourceReceivedAt)}
            </span>
          </div>
        </section>
      ) : null}

      {consultation.assignment ? (
        <section className="assignment-panel" aria-labelledby="assignment-title">
          <div>
            <p className="eyebrow">ASSIGNMENT</p>
            <h2 id="assignment-title">
              {consultation.assignment.displayName} 담당
            </h2>
            <p>
              {consultation.assignment.organization.name} ·{" "}
              {consultation.assignment.region.name} ·{" "}
              {consultation.assignment.department} ·{" "}
              {consultation.assignment.jobTitle}
            </p>
          </div>
          <div className="assignment-meta">
            <span>{formatDate(consultation.assignment.assignedAt)} 배정</span>
            {consultation.contactChannel !== "phone" ? (
              <span>
                {consultation.contactChannel === "kakao_channel"
                  ? "전화번호 미수집"
                  : "네이버 예약 상세정보 확인 필요"}{" "}
                · 리걸프렌즈·알림톡 보류
              </span>
            ) : (
              <>
                <span>
                  리걸프렌즈 등록 {integrationStatus(legalFriendsRequest)}
                </span>
                <span>
                  담당 배정 알림톡{" "}
                  {integrationStatus(assignmentAlimtalkRequest)}
                </span>
              </>
            )}
          </div>
        </section>
      ) : null}

      {consultation.integrationRequests.length > 0 ? (
        <section className="erp-panel integration-ledger">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">DELIVERY LEDGER</p>
              <h2>외부 연동 실행 원장</h2>
            </div>
          </div>
          <div className="integration-list">
            {consultation.integrationRequests.map((request) => (
              <article key={request.id}>
                <div>
                  <h3>
                    {integrationLabels[request.eventType] ?? request.eventType}
                  </h3>
                  <p>
                    {integrationStatus(request)} · 총 {request.attempts}회 시도
                    {request.publishedAt
                      ? ` · ${formatDate(request.publishedAt)} 완료`
                      : ""}
                  </p>
                  {request.eventType.startsWith("legalfriends.") &&
                  consultation.legalFriendsCase ? (
                    <p>
                      리걸프렌즈 사건 {consultation.legalFriendsCase.caseIdx} ·{" "}
                      {consultation.legalFriendsCase.managerAssignedAt
                        ? `담당자 ${consultation.legalFriendsCase.managerExternalAccountId} 지정 완료`
                        : `신건 등록 완료 · 담당자 ${consultation.legalFriendsCase.managerExternalAccountId} 변경 대기`}
                    </p>
                  ) : null}
                  {request.eventType.startsWith("alimtalk.") &&
                  request.providerDelivery ? (
                    <p>
                      솔라피 메시지 상태{" "}
                      {request.providerDelivery.statusCode} · 메시지{" "}
                      {request.providerDelivery.messageId}
                    </p>
                  ) : null}
                  {request.lastError ? (
                    <p className="integration-error">{request.lastError}</p>
                  ) : null}
                </div>
                {request.deliveryAttempts.length > 0 ? (
                  <details>
                    <summary>시도 이력 보기</summary>
                    <ol>
                      {request.deliveryAttempts.map((attempt) => (
                        <li key={attempt.attemptNumber}>
                          {attempt.attemptNumber}차 ·{" "}
                          {formatDate(attempt.startedAt)} · {attempt.status}
                          {attempt.httpStatus
                            ? ` · HTTP ${attempt.httpStatus}`
                            : ""}
                          {attempt.errorCode ? ` · ${attempt.errorCode}` : ""}
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="request-stack" aria-label="상담 요청 이력">
        {consultation.requests.map((request, index) => (
          <article className="erp-panel request-card" key={request.id}>
            <div className="panel-heading">
              <div>
                <p className="request-index">
                  요청 {consultation.requests.length - index}
                </p>
                <h2>
                  {request.contactChannel !== "phone"
                    ? request.contactChannel === "kakao_channel"
                      ? "카카오 채널"
                      : "네이버 예약"
                    : request.mode === "detailed"
                      ? "상세 상황"
                      : "빠른 상담"}{" "}
                  요청
                </h2>
              </div>
              <time dateTime={request.submittedAt}>
                {formatDate(request.submittedAt)}
              </time>
            </div>

            {request.dedupeOutcome === "suspected_duplicate" ? (
              <div className="warning-banner">
                같은 전화번호의 7일 내 다른 접수입니다.
                {request.candidateReceiptCode
                  ? ` 비교 후보: ${request.candidateReceiptCode}`
                  : ""}
              </div>
            ) : null}

            <div className="detail-grid">
              <section>
                <h3>연락 정보</h3>
                <dl className="data-list">
                  <div>
                    <dt>이름·호칭</dt>
                    <dd>{request.name ?? "익명"}</dd>
                  </div>
                  <div>
                    <dt>휴대전화</dt>
                    <dd>
                      {request.phone
                        ? formatPhone(request.phone)
                        : "010-0000-0000 · 미수집"}
                    </dd>
                  </div>
                  <div>
                    <dt>연락 희망</dt>
                    <dd>
                      {request.contactChannel !== "phone"
                        ? request.contactChannel === "kakao_channel"
                          ? "카카오 채팅방"
                          : `${formatDate(request.contactWindowStart)} 예약`
                        : request.contactPreference ===
                            "as_soon_as_possible"
                        ? "가능한 빨리"
                        : `${formatDate(request.contactWindowStart)} ~ ${formatDate(request.contactWindowEnd)}`}
                    </dd>
                  </div>
                  <div>
                    <dt>중복 판정</dt>
                    <dd>{request.dedupeOutcome}</dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3>상담 내용</h3>
                <dl className="data-list">
                  {Object.entries(request.intake).map(([key, value]) => (
                    <div key={key}>
                      <dt>{answerLabels[key] ?? key}</dt>
                      <dd>{answer(key, value)}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>

            <details className="attribution-details">
              <summary>유입 정보 보기</summary>
              <dl className="data-list">
                <div>
                  <dt>상담 고지</dt>
                  <dd>
                    {request.privacyNoticeVersion} ·{" "}
                    {request.privacyBasis === "explicit_consent"
                      ? `명시적 동의 ${formatDate(request.consentAgreedAt)}`
                      : request.privacyBasis ===
                          "customer_initiated_channel_message"
                        ? "고객이 먼저 보낸 카카오 메시지"
                        : request.privacyBasis ===
                            "customer_initiated_channel_entry"
                          ? "고객이 홈페이지 카카오톡 버튼을 선택"
                          : "고객이 네이버 예약을 직접 신청"}
                  </dd>
                </div>
                <div>
                  <dt>유입 분석</dt>
                  <dd>
                    {request.attribution
                      ? `${request.attribution.firstLandingPageKey ?? "미등록 랜딩"} v${request.attribution.firstLandingPageVersion ?? "-"}`
                      : "유입 정보 기록 없음"}
                  </dd>
                </div>
                {request.attribution ? (
                  <>
                    <div>
                      <dt>상담 CTA</dt>
                      <dd>
                        {request.attribution.ctaPath ?? "직접 진입"} ·{" "}
                        {request.attribution.ctaPlacement ?? "-"}
                      </dd>
                    </div>
                    <div>
                      <dt>광고 식별자</dt>
                      <dd className="code-value">
                        {Object.keys(request.attribution.source).length
                          ? JSON.stringify(request.attribution.source)
                          : "직접·자연 유입"}
                      </dd>
                    </div>
                  </>
                ) : null}
              </dl>
            </details>
          </article>
        ))}
      </section>
      </main>
    </>
  );
}
