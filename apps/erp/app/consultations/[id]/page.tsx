import Link from "next/link";
import { notFound } from "next/navigation";

import {
  LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID,
  SELF_DIAGNOSIS_COURTS,
  SELF_DIAGNOSIS_INCOME_TYPES,
  SELF_DIAGNOSIS_LIVING_COST_TYPES,
  SELF_DIAGNOSIS_MARRIAGE_STATES,
  SELF_DIAGNOSIS_RESIDENCE_TYPES,
  selfDiagnosisRecordSchema,
  type SelfDiagnosisMatch,
  type SelfDiagnosisRecord,
} from "@lawand/core";

import {
  getConsultation,
  type ConsultationDetail,
} from "../../../lib/gateway";
import { requireStaff } from "../../../lib/session";
import { ClaimConsultationButton } from "../../_components/claim-consultation-button";
import { ConsultationAssigneeTransfer } from "../../_components/consultation-assignee-transfer";
import { ClickToCallButton } from "../../_components/click-to-call-button";
import { ConsultationSoftDeleteButton } from "../../_components/consultation-soft-delete-button";
import { ConsultationGroupPanel } from "../../_components/consultation-group-panel";
import { CopyButton } from "../../_components/copy-button";
import { KakaoEntryInvalidationButton } from "../../_components/kakao-entry-invalidation-button";
import { KakaoEntryPanel } from "../../_components/kakao-entry-panel";
import { LegalFriendsInvalidationButton } from "../../_components/legalfriends-invalidation-button";
import { LegalFriendsReviewClaim } from "../../_components/legalfriends-review-claim";
import { MessageComposeButton } from "../../_components/message-compose-button";
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

function formatCaseDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(new Date(`${value}T00:00:00+09:00`));
}

function formatPhone(value: string) {
  return value.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
}

function formatWon(value: number) {
  if (value >= 100_000_000) {
    const eok = value / 100_000_000;
    return `${Number.isInteger(eok) ? eok : eok.toFixed(1)}억원`;
  }
  if (value >= 10_000) {
    return `${Math.round(value / 10_000).toLocaleString("ko-KR")}만원`;
  }
  return `${value.toLocaleString("ko-KR")}원`;
}

function formatPersonCount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
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

const revivalStateLabels = new Map([
  [5, "상담대기"], [10, "상담완료"], [11, "재상담필요"], [15, "계약"],
  [20, "서류준비"], [21, "부채증명서 발급중"], [22, "부채증명서 발급완료"],
  [25, "신청서 작성 진행중"], [30, "신청서 제출"], [35, "금지명령"],
  [40, "보정기간"], [45, "개시결정"], [50, "채권자 집회기일"], [55, "인가결정"],
]);

const bankruptcyStateLabels = new Map([
  [5, "상담대기"], [10, "상담완료"], [11, "재상담필요"], [15, "계약"],
  [20, "서류준비"], [21, "부채증명서 발급중"], [22, "부채증명서 발급완료"],
  [25, "신청서 작성 진행중"], [30, "신청서 제출"], [40, "보정기간"],
  [100, "파산선고"], [105, "의견청취기일"], [110, "재산환가 및 배당"],
  [115, "파산폐지"], [120, "면책결정"], [125, "면책불허가"],
]);

function directoryCaseTypeLabel(caseType: number) {
  return caseType === 1 ? "개인회생" : caseType === 2 ? "파산면책" : "기타사건";
}

function directoryCaseStateLabel(source: NonNullable<ConsultationDetail["directorySource"]>) {
  const labels = source.caseType === 2 ? bankruptcyStateLabels : revivalStateLabels;
  const state = labels.get(source.caseState) ?? `진행 상태 ${source.caseState}`;
  return [state, source.isClosed ? "종결" : null, source.isRepealed ? "폐지" : null]
    .filter(Boolean)
    .join(" · ");
}

function formatDirectoryPhone(value: string | null) {
  if (!value) return "미등록";
  const digits = value.replace(/\D/g, "");
  return /^010\d{8}$/.test(digits) ? formatPhone(digits) : value;
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
  assigned: "상담 진행",
  contacted: "연락 완료",
  completed: "상담 완료",
  engaged: "계약",
  closed: "종결",
};

const dedupeLabels: Record<
  ConsultationDetail["requests"][number]["dedupeOutcome"],
  string
> = {
  new: "신규 접수",
  exact_duplicate: "동일 내용 재접수",
  identity_enrichment: "고객정보 보강",
  repeat_unassigned: "배정 전 재요청",
  repeat_assigned: "담당 상담 재요청",
  suspected_duplicate: "7일 내 중복 의심",
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
  if (Array.isArray(value)) return value.join(" · ") || "입력 없음";
  if (typeof value === "number") return value.toLocaleString("ko-KR");
  if (typeof value === "boolean") return value ? "있음" : "없음";
  if (typeof value !== "string" || !value) return "입력 없음";
  return value.replace(/\d{4,}(?=원)/g, (amount) =>
    Number(amount).toLocaleString("ko-KR"),
  );
}

function modeLabel(request: ConsultationDetail["requests"][number]) {
  if (request.contactChannel === "kakao_channel") return "카카오 채널 상담";
  if (request.contactChannel === "naver_booking") return "네이버 예약 상담";
  if (request.mode === "self_diagnosis") return "자가진단 상담";
  return request.mode === "detailed" ? "상세 상담" : "빠른 상담";
}

function sourceLabel(request: ConsultationDetail["requests"][number]) {
  const labels: Record<typeof request.source, string> = {
    homepage: "로앤 홈페이지",
    kakao_channel: "카카오 채널",
    homepage_kakao: "홈페이지 카카오 진입",
    naver_booking_email: "네이버 예약",
    erp_phone_desk: "전화데스크 신건상담",
    erp_staff: "상담데스크 직접등록",
    erp_client_directory: "고객찾기 신건상담",
  };
  return labels[request.source];
}

function contactPreferenceLabel(
  request: ConsultationDetail["requests"][number],
) {
  if (request.contactChannel === "kakao_channel") return "카카오 채팅 확인";
  if (request.contactChannel === "naver_booking") {
    return `${formatDate(request.contactWindowStart)} 예약`;
  }
  return request.contactPreference === "as_soon_as_possible"
    ? "가능한 빠른 연락"
    : `${formatDate(request.contactWindowStart)} ~ ${formatDate(
        request.contactWindowEnd,
      )}`;
}

function privacyBasisLabel(
  request: ConsultationDetail["requests"][number],
) {
  if (request.privacyBasis === "explicit_consent") {
    return `명시적 동의 · ${formatDate(request.consentAgreedAt)}`;
  }
  if (request.privacyBasis === "customer_initiated_channel_message") {
    return "고객이 먼저 보낸 카카오 메시지";
  }
  if (request.privacyBasis === "customer_initiated_channel_entry") {
    return "고객이 홈페이지 카카오 버튼을 선택";
  }
  if (request.privacyBasis === "staff_recorded_phone_interaction") {
    return "직원이 고객과의 전화 통화를 기록";
  }
  return "고객이 네이버 예약을 직접 신청";
}

function readSelfDiagnosisRecord(
  intake: Record<string, unknown>,
): SelfDiagnosisRecord | null {
  const parsed = selfDiagnosisRecordSchema.safeParse(intake.selfDiagnosis);
  return parsed.success ? parsed.data : null;
}

function matchSimilarityLabel(value: SelfDiagnosisMatch["similarity"]) {
  return value === "very_close"
    ? "매우 가까움"
    : value === "close"
      ? "가까움"
      : "참고 범위";
}

function incomeLabel(value: number, caseType?: number) {
  if (caseType === 2 && value === 0) return "소득형태 기록 없음";
  return (
    SELF_DIAGNOSIS_INCOME_TYPES.find((entry) => entry.value === value)?.label ??
    "기타"
  );
}

function residenceTypeLabel(value: number) {
  return (
    SELF_DIAGNOSIS_RESIDENCE_TYPES.find((entry) => entry.value === value)
      ?.label ?? `코드 ${value}`
  );
}

function marriageLabel(value: number) {
  return (
    SELF_DIAGNOSIS_MARRIAGE_STATES.find((entry) => entry.value === value)
      ?.label ?? "기타"
  );
}

function livingCostLabel(match: SelfDiagnosisMatch) {
  if (match.livingCostType === 0) return "추가 인정 없음";
  const label =
    SELF_DIAGNOSIS_LIVING_COST_TYPES.find(
      (entry) => entry.value === match.livingCostType,
    )?.label ?? `코드 ${match.livingCostType}`;
  return match.livingCostCost > 0
    ? `${label} · ${formatWon(match.livingCostCost)}`
    : `${label} · 금액 기록 없음`;
}

function matchTimeline(match: SelfDiagnosisMatch) {
  return (
    match.caseType === 1
      ? [
          { date: match.filingDate, label: "신청서 접수" },
          { date: match.prohibitionDate, label: "금지결정" },
          { date: match.commencementDate, label: "개시결정" },
          { date: match.approvalDate, label: "인가결정" },
        ]
      : [
          { date: match.filingDate, label: "신청서 접수" },
          { date: match.bankruptcyDate, label: "파산선고" },
          { date: match.dischargeDate, label: "면책허가" },
        ]
  ).filter((event): event is { date: string; label: string } => event.date !== null);
}

function SelfDiagnosisOverview({ record }: { record: SelfDiagnosisRecord }) {
  const court = SELF_DIAGNOSIS_COURTS.find(
    (entry) => entry.idx === record.courtIdx,
  )?.name;
  const recommendation =
    record.recommendation === "personal_rehabilitation"
      ? "개인회생 유사사례"
      : "개인파산·면책 검토";
  const reasonLabels: Record<SelfDiagnosisRecord["recommendationReason"], string> = {
    similar_rehabilitation_cases: "회생 제약을 충족한 유사사건을 비교했습니다.",
    dependent_adjustment_needed:
      "부양가족 인정 범위를 조정한 시나리오로 비교했습니다.",
    income_below_one_person_living_cost:
      "월소득이 1인 기준 생계비 이하로 확인됐습니다.",
    repayment_constraints_not_met:
      "가용소득·청산가치 기준상 회생 변제 제약을 충족하기 어려웠습니다.",
  };

  return (
    <section className="diagnosis-overview" aria-labelledby="diagnosis-overview-title">
      <header className="diagnosis-overview-heading">
        <div>
          <p className="section-kicker">SELF-DIAGNOSIS SNAPSHOT</p>
          <h4 id="diagnosis-overview-title">자가진단 입력·판정</h4>
          <p>{reasonLabels[record.recommendationReason]}</p>
        </div>
        <span className="diagnosis-recommendation">{recommendation}</span>
      </header>
      <dl className="diagnosis-key-metrics">
        <div>
          <dt>월소득</dt>
          <dd>{formatWon(record.monthlyIncome)}</dd>
        </div>
        <div>
          <dt>총채무</dt>
          <dd>{formatWon(record.unsecuredDebt + record.securedDebt)}</dd>
        </div>
        <div>
          <dt>청산가치</dt>
          <dd>{formatWon(record.liquidationValue)}</dd>
        </div>
        <div>
          <dt>가용소득 참고액</dt>
          <dd>{formatWon(record.availableMonthlyIncome)}</dd>
        </div>
        <div>
          <dt>기준 생계비</dt>
          <dd>{formatWon(record.referenceLivingCost)}</dd>
        </div>
        <div>
          <dt>최소 필요 총변제액</dt>
          <dd>{formatWon(record.minimumRequiredTotalPayment)}</dd>
        </div>
      </dl>
      <dl className="diagnosis-facts">
        <div><dt>거주·법원</dt><dd>{residenceRegionLabels[record.residenceRegion]} · {court}</dd></div>
        <div><dt>소득·거주형태</dt><dd>{incomeLabel(record.incomeType)} · {residenceTypeLabel(record.residenceType)}</dd></div>
        <div><dt>혼인·자녀</dt><dd>{marriageLabel(record.marriageState)} · 미성년 자녀 {record.minorChildCount}명</dd></div>
        <div><dt>비교 가구원</dt><dd>본인 포함 {record.adjustedDependentCount + 1}명 · 우선권채권 {record.priorityDebt ? "있음" : "없음"}</dd></div>
      </dl>
      <p className="diagnosis-model-note">
        비교 모델 {record.modelVersion} · 고객 화면에 유사사례 {record.matchedCaseCount}건 표시
      </p>
    </section>
  );
}

function SelfDiagnosisMatches({
  requestId,
  matches,
}: {
  requestId: string;
  matches: SelfDiagnosisMatch[] | null;
}) {
  const titleId = `self-diagnosis-matches-${requestId}`;
  return (
    <section className="self-diagnosis-match-panel" aria-labelledby={titleId}>
      <header className="self-diagnosis-match-heading">
        <div>
          <p className="section-kicker">CASES SHOWN TO CLIENT</p>
          <h4 id={titleId}>의뢰인이 실제로 본 유사사례</h4>
          <p>
            결과 화면에 표시한 순서와 비교값을 그대로 보관한 비식별 스냅샷입니다.
          </p>
        </div>
        <span className="count-badge">
          {matches ? `${matches.length}건` : "이전 접수"}
        </span>
      </header>

      {matches ? (
        <div className="self-diagnosis-match-grid">
          {matches.map((match) => (
            <article className="self-diagnosis-match-card" key={match.rank}>
              <header className="match-card-heading">
                <div>
                  <span>유사사례 {String(match.rank).padStart(2, "0")}</span>
                  <strong>{match.caseType === 1 ? "개인회생" : "개인파산·면책"}</strong>
                </div>
                <small>{matchSimilarityLabel(match.similarity)}</small>
              </header>

              <div className="match-card-finance">
                <div>
                  <span>{match.caseType === 1 ? "월 변제금" : "절차 결과"}</span>
                  <strong>
                    {match.caseType === 1
                      ? formatWon(match.monthlyPayment)
                      : "파산·면책"}
                  </strong>
                  <small>
                    {match.caseType === 1
                      ? `${match.paymentCount}개월 변제`
                      : "월 변제금 없음"}
                  </small>
                </div>
                <div>
                  <span>총채무</span>
                  <strong>{formatWon(match.totalDebt)}</strong>
                  <small>{match.courtName}</small>
                </div>
              </div>

              <dl className="match-card-facts">
                <div><dt>월소득</dt><dd>{match.caseType === 2 && match.monthlyIncome === 0 ? "원천 기록 없음" : formatWon(match.monthlyIncome)}</dd></div>
                <div><dt>청산가치</dt><dd>{formatWon(match.liquidationValue)}</dd></div>
                <div><dt>소득·혼인</dt><dd>{incomeLabel(match.incomeType, match.caseType)} · {marriageLabel(match.marriageState)}</dd></div>
                <div><dt>거주형태</dt><dd>{residenceTypeLabel(match.residenceType)}</dd></div>
                <div><dt>자녀·가구원</dt><dd>미성년 {match.minorChildCount}명 · 인정 {formatPersonCount(match.dependentCount)}명</dd></div>
                {match.caseType === 1 ? (
                  <>
                    <div><dt>예상 지출</dt><dd>{formatWon(match.estimatedSpend)}</dd></div>
                    <div><dt>추가생계비</dt><dd>{livingCostLabel(match)}</dd></div>
                    <div><dt>총변제·변제율</dt><dd>{formatWon(match.totalPayment)} · {match.repaymentRate}%</dd></div>
                  </>
                ) : null}
              </dl>

              <ol className="self-diagnosis-match-timeline" aria-label="사건 진행일">
                {matchTimeline(match).map((event) => (
                  <li key={event.label}>
                    <span>{event.label}</span>
                    <time dateTime={event.date}>{formatCaseDate(event.date)}</time>
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
      ) : (
        <p className="self-diagnosis-match-empty">
          이 요청은 유사사례 카드 보관 기능 적용 전 접수됐거나 카드 스냅샷을 읽지
          못했습니다. 자가진단 입력·판정값은 위에서 확인할 수 있습니다.
        </p>
      )}
    </section>
  );
}

type IntegrationRequest = ConsultationDetail["integrationRequests"][number];

const integrationLabels: Record<string, string> = {
  "alimtalk.consultation.request_notification.requested": "접수 알림톡",
  "legalfriends.consultation.registration.requested": "리걸프렌즈 사건 등록",
  "legalfriends.consultation.invalidation.requested": "리걸프렌즈 무효 처리",
  "legalfriends.consultation.manager_change.requested": "리걸프렌즈 담당자 변경",
  "alimtalk.consultation.assignment_notification.requested": "담당 배정 알림톡",
};

function legalFriendsManagerLabel(externalAccountId: string) {
  return externalAccountId ===
    LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID
    ? "무효"
    : externalAccountId;
}

const assignmentTransferReasonLabels: Record<
  ConsultationDetail["assignmentTransfers"][number]["reason"],
  string
> = {
  workload_balance: "업무 분배",
  absence: "부재",
  expertise: "전문 분야",
  manager_adjustment: "관리자 조정",
  other: "기타",
};

function integrationTone(request: IntegrationRequest) {
  if (request.status === "published") return "success";
  if (request.status === "dead") return "danger";
  if (request.attempts > 0) return "warning";
  return "pending";
}

function integrationStatus(request: IntegrationRequest | undefined): string {
  if (!request) return "요청 없음";
  if (request.status === "published") return "완료";
  if (request.status === "dead") return "확인 필요";
  if (request.lockedAt) return "처리 중";
  if (request.attempts > 0) return "재시도 예정";
  return "처리 대기";
}

function nextAction(consultation: ConsultationDetail) {
  const latestTransfer = consultation.assignmentTransfers[0];
  if (latestTransfer?.status === "pending") {
    return {
      title: `${latestTransfer.targetAssigneeDisplayName} 담당자로 변경 중입니다`,
      description:
        "리걸프렌즈 변경이 성공하면 ERP 담당자도 자동으로 확정됩니다.",
    };
  }
  if (
    latestTransfer?.status === "failed" ||
    latestTransfer?.status === "needs_confirmation"
  ) {
    return {
      title: "리걸프렌즈 담당자 변경을 확인해 주세요",
      description:
        "ERP 담당자는 기존 상태로 유지했습니다. 리걸프렌즈 상태를 확인한 뒤 다시 동기화할 수 있습니다.",
    };
  }
  if (
    consultation.legalFriendsCase?.managerExternalAccountId ===
    LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID
  ) {
    return {
      title: "리걸프렌즈 무효 처리가 완료됐습니다",
      description: "사건 담당자가 사내 무효 계정으로 변경됐고 기존 상담·실행 원장은 보존됩니다.",
    };
  }
  if (consultation.requiresLegalFriendsReview) {
    return {
      title: "기존 고객의 이번 문의 성격을 확인해 주세요",
      description:
        "기존 사건 문의·새 사건·공유 연락처 중 하나를 선택해야 담당 배정할 수 있습니다.",
    };
  }
  if (consultation.kakaoEntry?.status === "pending") {
    if (consultation.kakaoEntry.nameProvided) {
      return {
        title: "입력한 이름으로 카카오 채팅을 확인해 주세요",
        description:
          "채팅방의 이름이 맞으면 상담하기를 누르세요. 채팅 확인과 본인 담당 배정이 함께 처리됩니다.",
      };
    }
    return {
      title: "카카오 채팅을 확인해 주세요",
      description: "채널 관리자에서 실제 메시지를 찾은 뒤 표시명을 반영해야 담당 배정할 수 있습니다.",
    };
  }
  if (consultation.naverBooking?.status === "details_pending") {
    return {
      title: "네이버 예약 상세를 확인해 주세요",
      description: "예약 상세에서 고객 연락정보와 요청사항을 확인한 뒤 상담을 준비해 주세요.",
    };
  }
  if (consultation.state === "requested") {
    return {
      title: "담당자를 배정해 주세요",
      description: "상담하기를 누르면 본인에게 배정되고 전화·카카오 접수는 리걸프렌즈 신건 등록이 시작됩니다.",
    };
  }
  if (consultation.state === "assigned") {
    return {
      title: "고객에게 연락할 차례입니다",
      description: "접수 내용과 자가진단 결과를 먼저 확인한 뒤 고객 상황을 이어서 들어 주세요.",
    };
  }
  if (consultation.state === "contacted") {
    return {
      title: "상담 결과를 정리해 주세요",
      description: "연락 결과와 다음 약속을 확인하고 상담 상태를 이어서 관리해 주세요.",
    };
  }
  return {
    title: `${stateLabels[consultation.state] ?? consultation.state} 상태입니다`,
    description: "요청 이력과 외부 연동 원장에서 현재 처리 결과를 확인할 수 있습니다.",
  };
}

const telephonyDispositionLabels = {
  customer_conversation: "고객과 상담함",
  voicemail: "음성사서함 연결",
  no_answer: "받지 않음",
  rejected: "수신 거절",
  busy: "통화 중",
  caller_cancelled: "발신 취소",
  callback_required: "재상담 필요",
} satisfies Record<
  NonNullable<ConsultationDetail["telephonyCalls"][number]["disposition"]>,
  string
>;

const phoneAftercareLabels = {
  consultation_completed: "상담완료",
  reconsultation_required: "재상담필요",
  no_answer: "부재 및 무응답",
  busy: "통화중",
  manager_callback_requested: "담당자 연결 요청",
  rejected: "거절",
  public_institution: "법원 등 관공서",
  creditor: "채권자 등",
  wrong_number: "잘못 걸린 전화",
  internal_completed: "내선 통화 완료",
  internal_follow_up: "내부 확인 필요",
  internal_no_answer: "내선 미연결",
  other: "기타",
} satisfies Record<
  NonNullable<ConsultationDetail["telephonyCalls"][number]["aftercareResult"]>,
  string
>;

function telephonyStatusLabel(
  call: ConsultationDetail["telephonyCalls"][number],
) {
  if (call.aftercareResult) return phoneAftercareLabels[call.aftercareResult];
  if (call.disposition) return telephonyDispositionLabels[call.disposition];
  if (call.reconciledAt) {
    return call.outcome === "answered" ? "연결 확인" : "결과 입력 필요";
  }
  return {
    queued: "발신 대기",
    dispatching: "연결 중",
    succeeded: "종료 확인 중",
    failed: "발신 실패",
    unknown: "확인 필요",
  }[call.commandStatus];
}

function telephonyStatusTone(
  call: ConsultationDetail["telephonyCalls"][number],
) {
  if (call.aftercareResult) {
    return [
      "reconsultation_required",
      "no_answer",
      "busy",
      "manager_callback_requested",
      "rejected",
    ].includes(call.aftercareResult)
      ? "danger"
      : "success";
  }
  if (call.disposition || call.outcome === "answered") return "success";
  if (
    call.reconciledAt ||
    call.commandStatus === "failed" ||
    call.commandStatus === "unknown"
  ) {
    return "danger";
  }
  return "pending";
}

function telephonyResultDetail(
  call: ConsultationDetail["telephonyCalls"][number],
) {
  if (!call.reconciledAt) return null;
  if (call.outcome === "answered") {
    return `센트릭스 연결 ${call.providerBillableSeconds ?? 0}초 · 호출 ${call.providerRingSeconds ?? 0}초`;
  }
  return `센트릭스 미연결 · 상태 ${call.providerStatus ?? "확인 불가"}`;
}

function messageStatusLabel(
  message: ConsultationDetail["telephonyMessages"][number],
) {
  return {
    queued: "발송 대기",
    dispatching: "발송 중",
    succeeded: "발송 완료",
    failed: "발송 실패",
    unknown: "확인 필요",
  }[message.commandStatus];
}

export default async function ConsultationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await requireStaff();
  let consultation: ConsultationDetail | null;
  try {
    consultation = await getConsultation(id);
  } catch {
    throw new Error("상담 상세를 불러오지 못했습니다.");
  }
  if (!consultation) notFound();

  const latestRequest = consultation.requests[0];
  const isSoftDeleted = Boolean(consultation.softDeletedAt);
  const latestPhone = consultation.phone;
  const latestRegion = latestRequest?.intake.residenceRegion;
  const action = nextAction(consultation);
  const canClaim =
    consultation.state === "requested" &&
    !consultation.requiresLegalFriendsReview &&
    (consultation.kakaoEntry?.status !== "pending" ||
      consultation.kakaoEntry.nameProvided);
  const canClickToCall =
    !isSoftDeleted &&
    Boolean(latestPhone) &&
    consultation.assignment?.assigneeUserId === staff.id &&
    consultation.assignmentTransfers[0]?.status !== "pending";
  const canSendMessage = canClickToCall;
  const latestMyCall = consultation.telephonyCalls.find(
    (call) => call.staffUserId === staff.id,
  );
  const legalFriendsInvalidated =
    consultation.legalFriendsCase?.managerExternalAccountId ===
    LEGALFRIENDS_INVALID_MANAGER_EXTERNAL_ACCOUNT_ID;
  const invalidationRequest = consultation.integrationRequests.find(
    (request) =>
      request.eventType ===
      "legalfriends.consultation.invalidation.requested",
  );
  const invalidationStatus = legalFriendsInvalidated
    ? "invalidated"
    : invalidationRequest?.status === "pending"
      ? "pending"
      : invalidationRequest
        ? "failed"
        : "ready";
  const canInvalidateLegalFriendsCase =
    !isSoftDeleted &&
    (Boolean(consultation.legalFriendsCase) ||
      consultation.kakaoEntry?.status === "confirmed") &&
    (consultation.assignment?.assigneeUserId === staff.id ||
      staff.roles.includes("admin")) &&
    consultation.assignmentTransfers[0]?.status !== "pending";
  const canChangeAssignee =
    Boolean(consultation.assignment) &&
    Boolean(consultation.legalFriendsCase) &&
    !legalFriendsInvalidated &&
    consultation.state !== "closed" &&
    (consultation.assignment?.assigneeUserId === staff.id ||
      staff.roles.includes("admin")) &&
    consultation.assignmentOptions.some(
      (option) =>
        option.userId !== consultation.assignment?.assigneeUserId,
    );

  return (
    <>
      <StaffBar staff={staff} />
      <main className={`erp-shell detail-shell${canClaim ? " has-mobile-action" : ""}${isSoftDeleted ? " is-soft-deleted" : ""}`}>
        <Link className="page-back-link" href="/">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m15 5-7 7 7 7" /></svg>
          상담 목록
        </Link>

        <header className="consultation-hero">
          <div className="consultation-hero-main">
            <div className="consultation-hero-labels">
              <span className="receipt-code">{consultation.publicReceiptCode}</span>
              <span className={`state-badge is-${consultation.state}`}>
                {stateLabels[consultation.state] ?? consultation.state}
              </span>
              {isSoftDeleted ? (
                <span className="flag-badge is-danger">삭제됨</span>
              ) : null}
              {consultation.existingCustomer ? (
                <span className="flag-badge is-existing">기존고객</span>
              ) : null}
              {consultation.requiresLegalFriendsReview ? (
                <span className="flag-badge is-attention">기존 사건 확인</span>
              ) : null}
              {consultation.legalFriendsHandling?.mode === "new_matter" ? (
                <span className="flag-badge is-info">기존고객 · 새 사건</span>
              ) : null}
              {consultation.legalFriendsHandling?.mode === "shared_contact" ? (
                <span className="flag-badge is-info">공유 연락처</span>
              ) : null}
              {consultation.legalFriendsHandling?.mode === "existing_case" ? (
                <span className="flag-badge is-positive">기존 사건 연결</span>
              ) : null}
              {legalFriendsInvalidated ? (
                <span className="flag-badge is-neutral">리걸프렌즈 무효</span>
              ) : null}
              {consultation.directorySource?.relationship === "referrer" ? (
                <span className="flag-badge is-info">소개 상담</span>
              ) : null}
            </div>
            <h1 className={isSoftDeleted ? "soft-delete-blur" : undefined}>
              {consultation.displayName}
            </h1>
            <p>
              최초 접수 {formatDate(consultation.firstRequestedAt)} · 최근 요청 {formatDate(consultation.lastRequestedAt)}
            </p>
          </div>
          <div className="detail-actions">
            {canSendMessage ? (
              <MessageComposeButton
                consultationId={consultation.id}
                customerName={consultation.displayName}
                receiptCode={consultation.publicReceiptCode}
                staffName={staff.displayName}
              />
            ) : null}
            {canClickToCall ? (
              <ClickToCallButton
                consultationId={consultation.id}
                initialCall={latestMyCall ?? null}
                staffName={staff.displayName}
              />
            ) : null}
            {canInvalidateLegalFriendsCase ? (
              <LegalFriendsInvalidationButton
                consultationId={consultation.id}
                status={invalidationStatus}
              />
            ) : null}
            {!isSoftDeleted && consultation.kakaoEntry?.status === "pending" ? (
              <KakaoEntryInvalidationButton
                consultationId={consultation.kakaoEntry.consultationId}
              />
            ) : null}
            {canClaim ? (
              <ClaimConsultationButton consultationId={consultation.id} />
            ) : null}
            {!isSoftDeleted && consultation.staffCreated && staff.roles.includes("admin") ? (
              <ConsultationSoftDeleteButton consultationId={consultation.id} />
            ) : null}
          </div>
        </header>

        {isSoftDeleted ? (
          <div className="soft-delete-notice" role="status">
            <strong>삭제된 신규등록 상담입니다.</strong>
            <span>
              {formatDate(consultation.softDeletedAt)}에 소프트삭제되어 고객정보와 업무 내용을 블러 처리했습니다.
            </span>
          </div>
        ) : null}

        <div className="consultation-command-grid">
          <section className="erp-panel customer-summary-card" aria-labelledby="customer-summary-title">
            <header className="card-heading">
              <div>
                <p className="section-kicker">CLIENT SUMMARY</p>
                <h2 id="customer-summary-title">고객 핵심정보</h2>
              </div>
              <span className="count-badge">요청 {consultation.requests.length}회</span>
            </header>

            <div className="primary-contact">
              <div>
                <span>휴대전화</span>
                {latestPhone ? (
                  <a href={`tel:${latestPhone}`}>{formatPhone(latestPhone)}</a>
                ) : (
                  <strong>미수집</strong>
                )}
              </div>
              {latestPhone ? (
                <div className="primary-contact-actions">
                  <CopyButton value={formatPhone(latestPhone)} />
                </div>
              ) : null}
            </div>

            {latestRequest ? (
              <dl className="summary-facts">
                <div><dt>접수 경로</dt><dd>{sourceLabel(latestRequest)}</dd></div>
                <div><dt>상담 유형</dt><dd>{modeLabel(latestRequest)}</dd></div>
                <div><dt>거주 지역</dt><dd>{typeof latestRegion === "string" ? residenceRegionLabels[latestRegion] ?? latestRegion : "미기록"}</dd></div>
                <div><dt>연락 희망</dt><dd>{contactPreferenceLabel(latestRequest)}</dd></div>
                <div><dt>중복 판정</dt><dd>{dedupeLabels[latestRequest.dedupeOutcome]}</dd></div>
                <div><dt>접수 시각</dt><dd>{formatDate(latestRequest.submittedAt)}</dd></div>
              </dl>
            ) : null}

            {latestRequest?.dedupeOutcome === "suspected_duplicate" ? (
              <div className="inline-alert is-warning">
                <strong>중복 가능성 확인</strong>
                <span>
                  같은 전화번호의 7일 내 다른 접수입니다.
                  {latestRequest.candidateReceiptCode
                    ? ` 비교 대상 ${latestRequest.candidateReceiptCode}`
                    : ""}
                </span>
              </div>
            ) : null}
          </section>

          <aside className="erp-panel workflow-card" aria-labelledby="workflow-title">
            <header className="card-heading">
              <div>
                <p className="section-kicker">NEXT ACTION</p>
                <h2 id="workflow-title">처리 현황</h2>
              </div>
            </header>
            <div className="next-action-card">
              <span className="next-action-dot" />
              <div>
                <strong>{action.title}</strong>
                <p>{action.description}</p>
              </div>
            </div>
            <dl className="workflow-assignment">
              <div>
                <dt>담당자</dt>
                <dd className="workflow-assignment-value">
                  <span>{consultation.assignment?.displayName ?? "미배정"}</span>
                  {consultation.assignment ? (
                    <ConsultationAssigneeTransfer
                      canChange={canChangeAssignee}
                      consultationId={consultation.id}
                      currentAssigneeDisplayName={
                        consultation.assignment.displayName
                      }
                      currentAssigneeUserId={
                        consultation.assignment.assigneeUserId
                      }
                      latestTransfer={consultation.assignmentTransfers[0] ?? null}
                      options={consultation.assignmentOptions}
                      key={
                        consultation.assignmentTransfers[0]
                          ? `${consultation.assignmentTransfers[0].id}:${consultation.assignmentTransfers[0].status}`
                          : "no-transfer"
                      }
                    />
                  ) : null}
                </dd>
              </div>
              {consultation.assignment ? (
                <div>
                  <dt>배정 시각</dt>
                  <dd>{formatDate(consultation.assignment.assignedAt)}</dd>
                </div>
              ) : null}
            </dl>
            {consultation.assignmentTransfers.some(
              (transfer) => transfer.status === "succeeded",
            ) ? (
              <details className="assignment-transfer-history">
                <summary>담당자 변경 이력</summary>
                <ol>
                  {consultation.assignmentTransfers
                    .filter((transfer) => transfer.status === "succeeded")
                    .map((transfer) => (
                      <li key={transfer.id}>
                        <strong>
                          {transfer.previousAssigneeDisplayName} → {transfer.targetAssigneeDisplayName}
                        </strong>
                        <span>
                          {assignmentTransferReasonLabels[transfer.reason]} · {formatDate(transfer.finishedAt ?? transfer.requestedAt)}
                        </span>
                      </li>
                    ))}
                </ol>
              </details>
            ) : null}
            <div className="workflow-integrations">
              <h3>자동화 상태</h3>
              {consultation.integrationRequests.length ? (
                consultation.integrationRequests.map((request) => (
                  <div key={request.id}>
                    <span className={`status-dot is-${integrationTone(request)}`} />
                    <span>{integrationLabels[request.eventType] ?? request.eventType}</span>
                    <strong>{integrationStatus(request)}</strong>
                  </div>
                ))
              ) : (
                <p>이 접수에는 실행할 외부 연동이 없습니다.</p>
              )}
            </div>
          </aside>
        </div>

        {consultation.requiresLegalFriendsReview ? (
          <LegalFriendsReviewClaim
            consultationId={consultation.id}
            matches={consultation.legalFriendsMatches}
          />
        ) : null}

        {consultation.directorySource ? (
          <section className="detail-section directory-source-panel" aria-labelledby="directory-source-title">
            <header className="detail-section-heading">
              <div>
                <p className="section-kicker">LEGALFRIENDS CONTEXT</p>
                <h2 id="directory-source-title">
                  {consultation.directorySource.relationship === "referrer"
                    ? "소개자와 기존 사건"
                    : "기존 고객과 사건"}
                </h2>
                <p>
                  {consultation.directorySource.relationship === "referrer"
                    ? `${consultation.directorySource.clientName ?? "기존 고객"} 고객이 소개한 상담입니다.`
                    : consultation.legalFriendsHandling?.mode === "existing_case"
                      ? "이번 요청을 선택한 기존 사건 문의로 연결했습니다. 리걸프렌즈 신건은 만들지 않습니다."
                      : "고객찾기에서 선택한 기존 고객의 새 상담입니다."}
                </p>
              </div>
              <a
                className="secondary-button directory-source-link"
                href="https://www.legalfriends.co.kr"
                rel="noreferrer"
                target="_blank"
              >
                리걸프렌즈에서 확인
              </a>
            </header>
            <div className="directory-source-alert">
              <strong>상담 전 확인</strong>
              <span>기존 수임료·계약 범위·상담 메모는 아래 Case ID로 리걸프렌즈 사건을 찾아 확인해 주세요.</span>
            </div>
            <dl className="directory-source-facts">
              <div><dt>{consultation.directorySource.relationship === "referrer" ? "소개자" : "기존 고객"}</dt><dd>{consultation.directorySource.clientName ?? "이름 미확인"}</dd></div>
              <div><dt>기존 전화</dt><dd>{formatDirectoryPhone(consultation.directorySource.phone)}</dd></div>
              <div><dt>기존 담당</dt><dd>{consultation.directorySource.staffNames.join(" · ") || "미지정"}</dd></div>
              <div><dt>사건 유형·상태</dt><dd>{directoryCaseTypeLabel(consultation.directorySource.caseType)} · {directoryCaseStateLabel(consultation.directorySource)}</dd></div>
              <div><dt>사건번호</dt><dd>{consultation.directorySource.caseNumber || "미등록"}</dd></div>
              <div><dt>사건명</dt><dd>{consultation.directorySource.caseName || "미등록"}</dd></div>
              <div><dt>법원</dt><dd>{consultation.directorySource.courtName || "미등록"}</dd></div>
              <div><dt>기존 거주지</dt><dd>{consultation.directorySource.residenceRegion ? residenceRegionLabels[consultation.directorySource.residenceRegion] : "미등록"}</dd></div>
              <div><dt>Case ID</dt><dd className="code-value directory-case-id"><span>{consultation.directorySource.caseIdx}</span><CopyButton value={String(consultation.directorySource.caseIdx)} /></dd></div>
              <div><dt>기존 사건 등록</dt><dd>{formatCaseDate(consultation.directorySource.caseCreatedOn)}</dd></div>
              <div><dt>기존 사건 갱신</dt><dd>{formatCaseDate(consultation.directorySource.caseUpdatedOn)}</dd></div>
            </dl>
          </section>
        ) : null}

        {consultation.telephonyMessages.length > 0 ? (
          <section className="detail-section message-ledger" aria-labelledby="message-ledger-title">
            <header className="detail-section-heading">
              <div>
                <p className="section-kicker">MESSAGE LEDGER</p>
                <h2 id="message-ledger-title">고객 문자 발송 내역</h2>
                <p>실제 보낸 문구와 템플릿, 이미지 첨부 여부, 발송 결과를 함께 보관합니다.</p>
              </div>
              <span className="count-badge">최근 {consultation.telephonyMessages.length}건</span>
            </header>
            <div className="message-ledger-list">
              {consultation.telephonyMessages.map((message) => (
                <article className="message-ledger-row" key={message.id}>
                  <div className="message-ledger-copy">
                    <strong>{message.templateName ?? "직접 입력"} · {message.messageKind.toUpperCase()}</strong>
                    <span>{message.staffDisplayName} · {formatDate(message.requestedAt)}</span>
                    <p>{message.body}</p>
                    {message.imageAttached ? <small>이미지 첨부 · {message.imageName}</small> : null}
                  </div>
                  <span className={`telephony-call-status is-${message.commandStatus === "succeeded" ? "success" : message.commandStatus === "failed" || message.commandStatus === "unknown" ? "danger" : "pending"}`}>
                    {messageStatusLabel(message)}
                  </span>
                  {message.lastErrorMessage ? <p className="message-ledger-error">{message.lastErrorMessage}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {consultation.telephonyCalls.length > 0 ? (
          <section className="detail-section telephony-ledger" aria-labelledby="telephony-ledger-title">
            <header className="detail-section-heading">
              <div>
                <p className="section-kicker">CALL LEDGER</p>
                <h2 id="telephony-ledger-title">센트릭스 발신 원장</h2>
                <p>발신 명령, 센트릭스 통화 이력, 담당자가 확인한 실제 결과를 함께 보관합니다.</p>
              </div>
              <span className="count-badge">최근 {consultation.telephonyCalls.length}건</span>
            </header>
            <div className="telephony-call-list">
              {consultation.telephonyCalls.map((call) => (
                <article className="telephony-call-row" key={call.id}>
                  <div>
                    <strong>내선 {call.endpoint.extension}</strong>
                    <span>{call.staffDisplayName} · {formatDate(call.requestedAt)}</span>
                    {telephonyResultDetail(call) ? (
                      <span>{telephonyResultDetail(call)}</span>
                    ) : null}
                  </div>
                  <span className={`telephony-call-status is-${telephonyStatusTone(call)}`}>
                    {telephonyStatusLabel(call)}
                  </span>
                  {call.lastErrorMessage ? <p>{call.lastErrorMessage}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {consultation.kakaoEntry ? (
          <KakaoEntryPanel
            consultationId={consultation.kakaoEntry.consultationId}
            displayName={consultation.displayName.replace(
              /_[23456789A-HJ-NP-Z]{8}_플친$/u,
              "",
            )}
            entry={consultation.kakaoEntry}
            nameProvided={consultation.kakaoEntry.nameProvided}
          />
        ) : null}

        <ConsultationGroupPanel
          consultationId={consultation.id}
          group={consultation.group}
          nameMismatch={consultation.nameMismatch}
          requestCount={consultation.requests.length}
        />

        {consultation.naverBooking ? (
          <section className="channel-action-panel is-naver" aria-labelledby="naver-title">
            <div>
              <p className="section-kicker">NAVER BOOKING</p>
              <h2 id="naver-title">{formatDate(consultation.naverBooking.scheduledAt)} 예약</h2>
              <p>
                예약번호 {consultation.naverBooking.bookingNumber} · {consultation.naverBooking.status === "details_pending" ? "상세 확인 필요" : consultation.naverBooking.status === "ready" ? "상세정보 반영 완료" : "예약 취소"}
              </p>
            </div>
            <div className="channel-action-meta">
              <a href={consultation.naverBooking.detailsUrl} rel="noopener noreferrer" target="_blank">
                네이버 예약 상세 열기
                <span aria-hidden="true">↗</span>
              </a>
              <small>메일 감지 {formatDate(consultation.naverBooking.sourceReceivedAt)}</small>
            </div>
          </section>
        ) : null}

        <section className="detail-section" aria-labelledby="request-history-title">
          <header className="detail-section-heading">
            <div>
              <p className="section-kicker">REQUEST HISTORY</p>
              <h2 id="request-history-title">상담 요청 이력</h2>
              <p>가장 최근 요청을 먼저 보여줍니다. 이전 요청도 같은 고객 흐름에서 확인할 수 있습니다.</p>
            </div>
            <span className="count-badge">{consultation.requests.length}건</span>
          </header>

          <div className="request-history">
            {consultation.requests.map((request, index) => {
              const diagnosis =
                request.mode === "self_diagnosis"
                  ? readSelfDiagnosisRecord(request.intake)
                  : null;
              const intakeEntries = Object.entries(request.intake).filter(
                ([key]) => key !== "selfDiagnosis",
              );
              return (
                <details className="request-history-item" key={request.id} open={index === 0}>
                  <summary>
                    <span className="request-number">요청 {consultation.requests.length - index}</span>
                    <span className="request-summary-main">
                      <strong>{modeLabel(request)}</strong>
                      <small>{sourceLabel(request)} · {request.consultationReceiptCode} · {dedupeLabels[request.dedupeOutcome]}</small>
                    </span>
                    <time dateTime={request.submittedAt}>{formatDate(request.submittedAt)}</time>
                    <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 9 5 5 5-5" /></svg>
                  </summary>

                  <div className="request-history-body">
                    {request.dedupeOutcome === "suspected_duplicate" ? (
                      <div className="inline-alert is-warning">
                        <strong>7일 내 중복 의심</strong>
                        <span>{request.candidateReceiptCode ? `비교 대상 ${request.candidateReceiptCode}` : "같은 전화번호의 다른 접수를 확인해 주세요."}</span>
                      </div>
                    ) : null}

                    <div className="request-contact-strip">
                      <div><span>이름·호칭</span><strong>{request.name ?? "익명"}</strong></div>
                      <div><span>휴대전화</span><strong>{request.phone ? formatPhone(request.phone) : "미수집"}</strong></div>
                      <div><span>연락 희망</span><strong>{contactPreferenceLabel(request)}</strong></div>
                    </div>

                    {intakeEntries.length ? (
                      <section className="request-intake" aria-label="상담 내용">
                        <h3>고객이 남긴 내용</h3>
                        <dl className="data-list">
                          {intakeEntries.map(([key, value]) => (
                            <div key={key}>
                              <dt>{answerLabels[key] ?? key}</dt>
                              <dd>{answer(key, value)}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                    ) : null}

                    {diagnosis ? (
                      <>
                        <SelfDiagnosisOverview record={diagnosis} />
                        <SelfDiagnosisMatches
                          requestId={request.id}
                          matches={diagnosis.matchedCases ?? null}
                        />
                      </>
                    ) : request.mode === "self_diagnosis" ? (
                      <SelfDiagnosisMatches requestId={request.id} matches={null} />
                    ) : null}

                    <details className="attribution-details">
                      <summary>개인정보 고지·유입 정보</summary>
                      <dl className="data-list">
                        <div><dt>상담 고지</dt><dd>{request.privacyNoticeVersion} · {privacyBasisLabel(request)}</dd></div>
                        <div><dt>유입 분석</dt><dd>{request.attribution ? `${request.attribution.firstLandingPageKey ?? "미등록 랜딩"} v${request.attribution.firstLandingPageVersion ?? "-"}` : "유입 정보 기록 없음"}</dd></div>
                        {request.attribution ? (
                          <>
                            <div><dt>상담 CTA</dt><dd>{request.attribution.ctaPath ?? "직접 진입"} · {request.attribution.ctaPlacement ?? "-"}</dd></div>
                            <div><dt>광고 식별자</dt><dd className="code-value">{Object.keys(request.attribution.source).length ? JSON.stringify(request.attribution.source) : "직접·자연 유입"}</dd></div>
                          </>
                        ) : null}
                      </dl>
                    </details>
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        {consultation.integrationRequests.length > 0 ? (
          <section className="detail-section" aria-labelledby="integration-ledger-title">
            <header className="detail-section-heading">
              <div>
                <p className="section-kicker">DELIVERY LEDGER</p>
                <h2 id="integration-ledger-title">외부 연동 실행 원장</h2>
                <p>알림톡과 리걸프렌즈 등록의 실제 처리 결과와 재시도 이력을 확인합니다.</p>
              </div>
            </header>
            <div className="integration-list">
              {consultation.integrationRequests.map((request) => (
                <article className="integration-card" key={request.id}>
                  <div className="integration-card-main">
                    <span className={`integration-icon is-${integrationTone(request)}`}>
                      <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m5 12 4 4L19 6" /></svg>
                    </span>
                    <div>
                      <h3>{integrationLabels[request.eventType] ?? request.eventType}</h3>
                      <p>
                        {request.publishedAt
                          ? `${formatDate(request.publishedAt)} 완료`
                          : request.status === "dead"
                            ? "수동 확인이 필요합니다"
                            : `다음 처리 ${formatDate(request.availableAt)}`}
                      </p>
                    </div>
                  </div>
                  <span className={`integration-status is-${integrationTone(request)}`}>
                    {integrationStatus(request)}
                  </span>
                  {request.lastError ? <p className="integration-error">{request.lastError}</p> : null}
                  <details className="integration-details">
                    <summary>실행 세부정보</summary>
                    <dl>
                      <div><dt>총 시도</dt><dd>{request.attempts}회</dd></div>
                      {request.eventType.startsWith("legalfriends.") && consultation.legalFriendsCase ? (
                        <div><dt>리걸프렌즈 사건</dt><dd>{consultation.legalFriendsCase.caseIdx} · 담당 {legalFriendsManagerLabel(consultation.legalFriendsCase.managerExternalAccountId)}</dd></div>
                      ) : null}
                      {request.providerDelivery ? (
                        <div><dt>솔라피 메시지</dt><dd>{request.providerDelivery.statusCode} · {request.providerDelivery.messageId}</dd></div>
                      ) : null}
                    </dl>
                    {request.deliveryAttempts.length ? (
                      <ol>
                        {request.deliveryAttempts.map((attempt) => (
                          <li key={attempt.attemptNumber}>
                            {attempt.attemptNumber}차 · {formatDate(attempt.startedAt)} · {attempt.status}
                            {attempt.httpStatus ? ` · HTTP ${attempt.httpStatus}` : ""}
                            {attempt.errorCode ? ` · ${attempt.errorCode}` : ""}
                          </li>
                        ))}
                      </ol>
                    ) : null}
                  </details>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <p className="security-note">
          이 페이지의 개인정보 조회는 직원 계정과 상담번호 기준으로 감사 기록에 남습니다.
        </p>
      </main>
    </>
  );
}
