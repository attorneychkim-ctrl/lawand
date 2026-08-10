import { createHash, createHmac, randomUUID } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

import pg from "pg";

const SOURCE_OFFICE_IDX = 56;
const ANONYMIZATION_VERSION = "public-case-v1";
const PROMPT_VERSION = "public-case-copy-v1";
const DEFAULT_GENERATION_MODEL = "gpt-5.6-luna";
const DEFAULT_GENERATION_REASONING_EFFORT = "xhigh";
const MINIMUM_COHORT_SIZE = 5;
const OUTPUT_SCHEMA_PATH = resolve(
  process.cwd(),
  "scripts/schemas/public-case-study.schema.json",
);

const INCOME_TYPE_LABELS = new Map([
  [0, "소득 없음"],
  [1, "급여소득"],
  [2, "사업소득"],
  [3, "급여·사업소득"],
  [4, "연금소득"],
  [5, "생계급여"],
  [6, "변동 급여소득"],
  [100, "기타 소득"],
]);

const RESIDENCE_TYPE_LABELS = new Map([
  [1, "자가 거주"],
  [2, "사택·기숙사 거주"],
  [3, "임차 거주"],
  [4, "친족 소유 주택 무상거주"],
  [5, "친족 외 소유 주택 무상거주"],
  [100, "기타 거주"],
]);

const MARRIAGE_STATE_LABELS = new Map([
  [1, "기혼"],
  [2, "미혼"],
  [3, "이혼"],
]);

const DEBT_REASON_LABELS = new Map([
  [1, "생활비 부족"],
  [2, "교육비 과다 지출"],
  [3, "점포 운영 실패"],
  [4, "주식투자 실패"],
  [5, "병원비 과다 지출"],
  [6, "음식·음주·취미 지출"],
  [7, "타인 채무 보증"],
  [8, "사기 피해"],
  [100, "기타"],
]);

const LIVING_COST_TYPE_LABELS = new Map([
  [0, "추가생계비 없음"],
  [1, "생계비"],
  [2, "주거비"],
  [3, "의료비"],
  [4, "교육비"],
  [5, "식비"],
  [6, "전기·가스·수도료"],
  [7, "교통비·차량유지비"],
  [8, "의복비"],
  [9, "통신비"],
  [100, "기타"],
]);

const ALLOWED_TAGS = new Set([
  "개인회생",
  "파산·면책",
  "급여소득",
  "사업소득",
  "임차거주",
  "자가거주",
  "생활비채무",
  "투자채무",
  "사업실패",
  "의료비채무",
  "사기피해",
  "보증채무",
  "청산가치",
  "가용소득",
  "부양가족",
  "추가생계비",
  "변제계획",
  "인가결정",
]);

function parseArguments() {
  const options = {
    inspectSafeSource: false,
    model: DEFAULT_GENERATION_MODEL,
    practiceArea: "personal_rehabilitation",
    reasoningEffort: DEFAULT_GENERATION_REASONING_EFFORT,
    requireAdditionalLivingCost: false,
    replace: false,
    slug: "personal-rehabilitation-income-liquidation-plan",
  };

  for (const argument of process.argv.slice(2)) {
    if (argument === "--") {
      continue;
    } else if (argument === "--inspect-safe-source") {
      options.inspectSafeSource = true;
    } else if (argument === "--replace") {
      options.replace = true;
    } else if (argument === "--require-additional-living-cost") {
      options.requireAdditionalLivingCost = true;
    } else if (argument.startsWith("--practice-area=")) {
      options.practiceArea = argument.slice("--practice-area=".length);
    } else if (argument.startsWith("--model=")) {
      options.model = argument.slice("--model=".length);
    } else if (argument.startsWith("--reasoning-effort=")) {
      options.reasoningEffort = argument.slice("--reasoning-effort=".length);
    } else if (argument.startsWith("--slug=")) {
      options.slug = argument.slice("--slug=".length);
    } else {
      throw new Error(`알 수 없는 인자입니다: ${argument}`);
    }
  }

  if (
    !["personal_rehabilitation", "personal_bankruptcy"].includes(
      options.practiceArea,
    )
  ) {
    throw new Error("지원하지 않는 사례 분야입니다.");
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(options.slug)) {
    throw new Error("slug는 영문 소문자·숫자·하이픈만 사용할 수 있습니다.");
  }
  if (!/^gpt-5\.6-[a-z0-9-]+$/u.test(options.model)) {
    throw new Error("지원하지 않는 Codex 모델 이름입니다.");
  }
  if (!new Set(["low", "medium", "high", "xhigh"]).has(options.reasoningEffort)) {
    throw new Error("지원하지 않는 추론 강도입니다.");
  }
  return options;
}

function readEnvironment() {
  const path = resolve(process.cwd(), ".env.development.local");
  return new Map(
    readFileSync(path, "utf8")
      .split(/\r?\n/u)
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value, unit) {
  return Math.max(0, Math.round(number(value) / unit) * unit);
}

function sha256(value) {
  return createHash("sha256").update(value).digest();
}

function sourceFingerprint(hmacKey, caseIdx) {
  return createHmac("sha256", hmacKey)
    .update(`${ANONYMIZATION_VERSION}:${SOURCE_OFFICE_IDX}:${caseIdx}`)
    .digest();
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function collectDirectIdentifiers(row) {
  const career = object(row.career);
  const residence = object(row.residence_detail);
  const education = object(row.final_education);
  const litigation = object(row.litigation_exp);
  const values = [
    row.case_number,
    row.client_name,
    row.client_phone,
    row.statement_phone,
    education.school,
    object(residence.free_type).owner,
    object(residence.pay_type).leaseholder,
    ...array(career.list).flatMap((item) => {
      const entry = object(item);
      return [entry.company];
    }),
    ...array(litigation.list).flatMap((item) => {
      const entry = object(item);
      return [entry.case_num];
    }),
  ];

  return [...new Set(values)]
    .filter((value) => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => value.length >= 2)
    .sort((left, right) => right.length - left.length);
}

function maskRelationshipNames(value) {
  const safeWords = new Set([
    "건강",
    "관계",
    "급여",
    "명의",
    "부양",
    "사업",
    "생계",
    "소득",
    "재산",
    "주거",
    "직장",
    "채무",
  ]);

  return value.replace(
    /(배우자|부친|모친|자녀|아들|딸|채권자|보증인|임대인|임차인|지인|친구|형제|자매)(\s*[:：]?\s*)([가-힣]{2,4})/gu,
    (match, relation, separator, candidate) =>
      safeWords.has(candidate)
        ? match
        : `${relation}${separator}[관계인 이름 비공개]`,
  );
}

function sanitizeFreeText(input, directIdentifiers) {
  if (typeof input !== "string" || input.trim() === "") return "";
  let value = input.normalize("NFC").replaceAll("\0", " ");

  for (const identifier of directIdentifiers) {
    value = value.replace(
      new RegExp(escapeRegExp(identifier), "giu"),
      "[직접 식별정보 비공개]",
    );
  }

  value = maskRelationshipNames(value)
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/gu, "[이메일 비공개]")
    .replace(/(?:https?:\/\/|www\.)\S+/giu, "[링크 비공개]")
    .replace(/\b\d{6}-?[1-4]\d{6}\b/gu, "[주민번호 비공개]")
    .replace(/(?:\+82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}/gu, "[전화번호 비공개]")
    .replace(/\b\d{2,4}[- ]\d{2,4}[- ]\d{4}\b/gu, "[전화번호 비공개]")
    .replace(/\b\d{4}[가-힣]{1,4}\d{2,10}\b/gu, "[사건번호 비공개]")
    .replace(/(?:주식회사|\(주\)|㈜)\s*[가-힣A-Za-z0-9_-]+/gu, "[직장명 비공개]")
    .replace(/(직장|회사|근무처|사업장|상호)\s*[:：]?\s*[^,.;\n]{2,30}/gu, "$1 [직장명 비공개]")
    .replace(/[가-힣A-Za-z0-9_-]{2,20}(?:은행|저축은행|카드|캐피탈|보험)/gu, "[금융기관 비공개]")
    .replace(/\b(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}\b/gu, "[시점 일반화]")
    .replace(/\b(?:19|20)\d{2}년\s*\d{1,2}월(?:\s*\d{1,2}일)?/gu, "[시점 일반화]")
    .replace(/\d[\d,]*(?:\.\d+)?\s*(?:원|만원|억원)/gu, "[금액 일반화]")
    .replace(/\b\d{5,}\b/gu, "[번호 비공개]")
    .replace(/[ \t]+/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

  return value;
}

function broadFacts(input, directIdentifiers) {
  const sanitized = sanitizeFreeText(input, directIdentifiers);
  if (!sanitized) return [];
  const rules = [
    [
      /예.?적금|자동차|오토바이|임차보증금|보험/u,
      "예금·차량·임차보증금 등 재산 항목을 확인한 기록이 있음",
    ],
    [
      /월세|주거비/u,
      "임차 거주와 주거비 부담을 확인한 기록이 있음",
    ],
    [
      /이직|퇴사|권고사직|아르바이트|배달/u,
      "직업 변동 이력이 있어 현재 소득의 계속성을 확인할 필요가 있었음",
    ],
    [
      /생활비|카드값|돌려막기|비상금대출/u,
      "생활비와 기존 결제·상환 부담이 겹치며 채무가 늘어난 경위가 기록됨",
    ],
    [
      /최근.{0,20}대출|대출금.{0,20}사용/u,
      "최근 차입의 사용처와 경위를 확인할 필요가 있었음",
    ],
    [
      /게임|취미|배달음식|소비/u,
      "소비지출 관리가 채무 발생 경위의 한 부분으로 진술됨",
    ],
    [
      /부양가족\s*(?:없음|0)/u,
      "별도 피부양자가 없다는 자료를 확인한 기록이 있음",
    ],
    [
      /보정/u,
      "법원 보정 과정에서 제출 자료를 보완한 기록이 있음",
    ],
    [
      /성실.{0,20}(?:갚|변제)|채무.{0,20}(?:갚|변제)/u,
      "인가 후 변제계획을 수행하려는 의사가 진술됨",
    ],
  ];

  return rules
    .filter(([pattern]) => pattern.test(sanitized))
    .map(([, fact]) => fact)
    .slice(0, 6);
}

function generalizeIndustry(value) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  const categories = [
    [/제조|공장|생산/u, "제조업"],
    [/건설|토목|인테리어/u, "건설업"],
    [/운수|운송|택배|물류|배송/u, "운수·물류업"],
    [/숙박|호텔/u, "숙박업"],
    [/음식|식당|요식|카페/u, "음식점업"],
    [/도소매|도매|소매|유통|판매/u, "도소매업"],
    [/보건|병원|의료|복지|요양/u, "보건·사회복지업"],
    [/교육|학원|학교/u, "교육서비스업"],
    [/정보|통신|소프트웨어|개발|it/u, "정보통신업"],
    [/금융|보험/u, "금융·보험업"],
    [/공공|공무/u, "공공서비스"],
    [/농업|임업|어업/u, "농림어업"],
    [/부동산/u, "부동산업"],
    [/서비스/u, "서비스업"],
  ];
  return categories.find(([pattern]) => pattern.test(normalized))?.[1] ?? null;
}

function employmentSummary(row) {
  const careerItems = array(object(row.career).list).map(object);
  const current =
    careerItems.find((item) => !String(item.end_dt ?? "").trim()) ??
    careerItems.at(-1) ??
    {};
  const industry = generalizeIndustry(current.business);
  const isSelfEmployment = Boolean(current.is_self_employment);
  const incomeType = number(row.income_type);
  const start = Date.parse(String(current.start_dt ?? ""));
  const endValue = String(current.end_dt ?? "").trim();
  const end = endValue ? Date.parse(endValue) : Date.now();
  const months =
    Number.isFinite(start) && Number.isFinite(end) && end >= start
      ? Math.floor((end - start) / 2_629_746_000)
      : null;
  const continuity =
    months === null
      ? "근속기간 비공개"
      : months < 12
        ? "근속 1년 미만"
        : months < 36
          ? "근속 1~3년"
          : "근속 3년 이상";

  return {
    continuity,
    employmentType:
      incomeType === 0
        ? "소득 활동 없음"
        : incomeType === 1 || incomeType === 6
        ? "근로"
        : incomeType === 2
          ? "자영업"
          : incomeType === 3
            ? "근로·사업 병행"
            : isSelfEmployment
              ? "자영업"
              : "근로 형태",
    industry: industry ?? "업종 비공개",
  };
}

function parseEventDate(value) {
  if (typeof value !== "string") return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function firstEvent(history, matcher) {
  return array(history)
    .map(object)
    .filter((item) => typeof item.text === "string" && matcher(item.text))
    .map((item) => parseEventDate(item.date))
    .filter(Boolean)
    .sort((left, right) => left.getTime() - right.getTime())[0] ?? null;
}

function elapsedDays(start, end) {
  if (!start || !end || end < start) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function buildTimeline(row) {
  const history = row.progress_history;
  const filing = firstEvent(history, (text) => text === "신청서접수");
  if (!filing) throw new Error("신청서 접수일이 없는 후보입니다.");

  const events =
    number(row.case_type) === 1
      ? [
          {
            description: "채무·재산·소득과 진술 자료를 정리해 법원에 신청했습니다.",
            label: "신청서 접수",
            when: filing,
          },
          {
            description: "법원이 추심·강제집행의 중지 필요성을 별도로 판단한 단계입니다.",
            label: "금지명령",
            when: firstEvent(
              history,
              (text) => text.startsWith("금지명령(") && !text.includes("기각"),
            ),
          },
          {
            description: "신청자격과 제출 자료를 심사한 뒤 개인회생절차가 시작됐습니다.",
            label: "개시결정",
            when: firstEvent(history, (text) => text === "개인회생절차개시결정"),
          },
          {
            description: "법원이 변제계획의 요건과 수행 가능성을 심사해 인가했습니다.",
            label: "변제계획 인가",
            when: firstEvent(history, (text) => text === "변제계획인가결정"),
          },
        ]
      : [
          {
            description: "채무·재산·소득과 진술 자료를 정리해 법원에 신청했습니다.",
            label: "신청서 접수",
            when: filing,
          },
          {
            description: "법원이 지급불능 상태와 재산 관계를 살펴 파산을 선고했습니다.",
            label: "파산선고",
            when: firstEvent(
              history,
              (text) => text.includes("파산선고") && !text.includes("기각"),
            ),
          },
          {
            description: "면책불허가 사유와 비면책채권을 별도로 심사한 결과입니다.",
            label: "면책허가",
            when: firstEvent(
              history,
              (text) => text.includes("면책허가결정") && !text.includes("불허가"),
            ),
          },
        ];

  return events
    .filter((event) => event.when)
    .map((event) => {
      const days = elapsedDays(filing, event.when);
      return {
        description: event.description,
        elapsedDays: days ?? 0,
        label: event.label,
        timing:
          event.when === filing
            ? "신청서 접수일"
            : `접수 후 ${days?.toLocaleString("ko-KR") ?? "확인 필요"}일`,
      };
    });
}

function financialSnapshot(row) {
  return {
    additionalLivingCost: roundMoney(row.living_cost_cost, 100_000),
    estimatedMonthlySpend: roundMoney(row.estimated_spend, 100_000),
    liquidationValue: roundMoney(row.liquidation_value, 1_000_000),
    monthlyIncome: roundMoney(row.monthly_income, 100_000),
    monthlyPayment: roundMoney(row.monthly_payment, 100_000),
    paymentCount: Math.max(0, Math.min(60, Math.round(number(row.payment_count)))),
    repaymentRatePercent: Math.max(0, Math.round(number(row.repayment_rate))),
    securedDebt: roundMoney(row.secured_debt, 1_000_000),
    totalDebt: roundMoney(row.total_debt, 1_000_000),
    totalPayment: roundMoney(row.total_payment, 1_000_000),
    unsecuredDebt: roundMoney(row.unsecured_debt, 1_000_000),
  };
}

function deterministicTags(row) {
  const tags = [
    number(row.case_type) === 1 ? "개인회생" : "파산·면책",
    number(row.case_type) === 1 ? "변제계획" : null,
    number(row.case_type) === 1 ? "청산가치" : null,
    number(row.case_type) === 1 ? "인가결정" : null,
    number(row.income_type) === 1 ? "급여소득" : null,
    number(row.income_type) === 2 ? "사업소득" : null,
    number(row.residence_type) === 1 ? "자가거주" : null,
    number(row.residence_type) === 3 ? "임차거주" : null,
    number(row.dependent_count) > 1 ? "부양가족" : null,
    number(row.living_cost_type) > 0 ? "추가생계비" : null,
  ];
  const reasonTags = new Map([
    [1, "생활비채무"],
    [3, "사업실패"],
    [4, "투자채무"],
    [5, "의료비채무"],
    [7, "보증채무"],
    [8, "사기피해"],
  ]);
  for (const code of array(row.debt_reasons).map(number)) {
    tags.push(reasonTags.get(code) ?? null);
  }
  return [...new Set(tags.filter((tag) => tag && ALLOWED_TAGS.has(tag)))].slice(
    0,
    8,
  );
}

function buildSafeSource(row) {
  const directIdentifiers = collectDirectIdentifiers(row);
  const memoFacts = broadFacts(row.memo, directIdentifiers);
  const statementFacts = broadFacts(
    `${row.debt_reason ?? ""}\n${row.want ?? ""}`,
    directIdentifiers,
  );
  const figures = financialSnapshot(row);
  const timeline = buildTimeline(row);
  const debtReasonLabels = array(row.debt_reasons)
    .map(number)
    .map((code) => DEBT_REASON_LABELS.get(code))
    .filter(Boolean);
  const snapshot = {
    anonymization: {
      dates: "원 날짜 제거 후 신청서 접수 기준 실제 경과일로 변환",
      directIdentifiers: "이름·전화·사건번호·직장명·주소 미포함",
      money: "월 금액 10만원, 총액 100만원 단위 반올림",
      version: ANONYMIZATION_VERSION,
    },
    case: {
      cohortSize: number(row.cohort_size),
      practiceArea:
        number(row.case_type) === 1
          ? "personal_rehabilitation"
          : "personal_bankruptcy",
    },
    employment: {
      ...employmentSummary(row),
      incomeType: INCOME_TYPE_LABELS.get(number(row.income_type)) ?? "기타 소득",
    },
    family: {
      marriageState:
        MARRIAGE_STATE_LABELS.get(number(row.marriage_state)) ?? "혼인상태 비공개",
      minorChildren: Math.max(0, Math.round(number(row.child_count))),
      recognizedHouseholdSize: Math.max(
        1,
        Math.round(number(row.dependent_count)),
      ),
    },
    figures,
    housing: {
      residenceType:
        RESIDENCE_TYPE_LABELS.get(number(row.residence_type)) ?? "기타 거주",
    },
    notes: {
      memoFacts,
      statementFacts,
    },
    plan: {
      debtReasons: debtReasonLabels.length > 0 ? debtReasonLabels : ["기타"],
      livingCostType:
        LIVING_COST_TYPE_LABELS.get(number(row.living_cost_type)) ?? "기타",
      priorityDebt: Boolean(row.priority_debt),
    },
    timeline,
  };

  const serialized = stableJson(snapshot);
  assertNoDirectIdentifiers(serialized, directIdentifiers);
  assertNoSensitivePatterns(serialized, "비식별 원천 스냅샷");
  return { directIdentifiers, figures, snapshot, timeline };
}

function assertNoDirectIdentifiers(value, directIdentifiers) {
  const normalized = value.toLowerCase();
  const leaked = directIdentifiers.find(
    (identifier) =>
      identifier.length >= 2 && normalized.includes(identifier.toLowerCase()),
  );
  if (leaked) {
    throw new Error("직접 식별정보가 비식별 결과에 남았습니다.");
  }
}

function assertNoSensitivePatterns(value, label) {
  const patterns = [
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/u,
    /\b\d{6}-?[1-4]\d{6}\b/u,
    /(?:\+82[- ]?)?0?1[016789][- ]?\d{3,4}[- ]?\d{4}/u,
    /\b\d{4}[가-힣]{1,4}\d{2,10}\b/u,
    /\b(?:19|20)\d{2}[./-]\d{1,2}[./-]\d{1,2}\b/u,
    /(?:https?:\/\/|www\.)\S+/iu,
  ];
  if (patterns.some((pattern) => pattern.test(value))) {
    throw new Error(`${label}에서 공개 금지 패턴이 감지됐습니다.`);
  }
}

function generationPrompt(snapshot) {
  const personalRehabilitationRules =
    snapshot.case.practiceArea === "personal_rehabilitation"
      ? `- 개인회생의 가용소득은 합리적으로 예상되는 소득에서 세금·사회보험료, 법원이 정하는 채무자와 피부양자의 생계비, 필요한 영업비용 등을 공제한 나머지입니다(채무자회생법 제579조).
- 변제계획의 인가에서는 공정·형평성과 수행 가능성, 청산가치 보장 등을 심사합니다(제614조). 청산가치 보장은 변제기간의 명목 합계가 아니라 인가 시점으로 할인한 변제액의 현재가치와 파산 시 배당가치를 비교하는 구조입니다.
- 이 스냅샷에는 명목 총변제액만 있으므로 현재가치를 임의 계산하거나 '명목 총액이 청산가치보다 크므로 요건을 충족했다'고 단정하지 마세요. 실제 인가결정이 있었다는 사실과 현가 비교 원칙을 구분해 설명하세요.
- 청산가치 보장에 필요한 총변제액은 단순히 월 변제금×납부횟수로 나온 명목 합계가 아니라, 인가 시점 기준으로 할인한 변제액의 현재가치로 비교한다는 점을 독자가 오해하지 않게 분명히 쓰세요. 명목 합계는 참고 수치일 뿐입니다.
- 변제기간은 원칙적으로 3년을 넘지 않지만, 청산가치 보장 등 특별한 사정이 있으면 5년 이내가 될 수 있습니다(제611조).`
      : `- 파산·면책에서는 채무자가 지급불능 상태인지, 재산을 어떻게 정리할지, 면책을 제한하는 사정이나 비면책채권이 있는지를 각각 확인합니다.
- 파산선고와 면책허가는 서로 다른 절차 단계입니다. 파산선고나 신청 접수만으로 모든 채무가 즉시 사라진다고 쓰지 마세요.
- 이 사건의 청산가치는 파산절차에서 재산을 처분해 채권자에게 배당할 수 있는 재산 가치를 이해하기 위한 참고 수치입니다. 개인회생처럼 월 변제금과 납부횟수를 현재가치로 할인해 비교하는 변제계획 설명을 적용하지 마세요.`;

  return `당신은 법무법인 로앤 홈페이지의 '사례로 이해하기' 편집자입니다.

대상 독자는 개인회생 또는 파산·면책을 고민하며 처음 절차를 알아보는 의뢰인입니다. 법률용어를 먼저 쉬운 말로 풀고, 객관성을 유지하면서 실제 사건에서 무엇을 확인했는지 설명하세요.

아래 JSON은 이름·전화·사건번호·직장명·주소와 달력 날짜를 코드에서 제거한 단일 사건의 안전한 편집용 스냅샷입니다. 금액은 일반화했고, 절차에는 신청서 접수일부터 실제로 지난 일수만 포함합니다. JSON에 없는 사실은 추측하거나 만들지 마세요. 메모 사실은 필요한 맥락만 자기 문장으로 요약하고 원문 표현을 그대로 옮기지 마세요.

<safe_case_snapshot>
${JSON.stringify(snapshot, null, 2)}
</safe_case_snapshot>

법률 설명 기준은 다음과 같습니다.
${personalRehabilitationRules}
- 미성년 자녀 수와 생계비 산정에서 인정되는 가구원 수는 자동으로 같지 않습니다. 실제 부양 여부와 소득·재산 등 자료를 법원이 심사합니다.
- 신청 접수만으로 추심이 자동 중단되거나, 인가만으로 남은 채무가 곧바로 면책되는 것은 아닙니다.
- 추가생계비 금액이 0보다 크면, livingCostType과 반올림된 금액을 변제금 계산의 핵심 쟁점으로 다루세요. 기록상 별도 반영된 항목이라는 사실과, 같은 지출이라도 자동 인정되는 것이 아니라 필요성·계속성·증빙을 법원이 심사한다는 점을 함께 설명하세요.

작성 규칙:
1. '성공', '탕감 보장', '무조건', '최대', 성공률·우월성·결과 보장 표현을 쓰지 마세요.
2. 정확한 지역·법원·날짜·나이·성별·회사·학교·금융기관·사건번호·전화·주소를 만들거나 노출하지 마세요.
3. 반올림된 금액은 반드시 '약'으로 표현하세요. 채무·소득·재산 하나만으로 절차가 정해진다고 쓰지 마세요.
4. 예상 지출과 월 변제금의 관계를 쉬운 산식처럼 설명하되, 원천 숫자가 반올림됐고 세부 공제항목은 공개하지 않았음을 밝혀 주세요.
5. 로앤에 대한 표현은 lawandNote 한 곳에서만 담백하게 한 번 사용하세요. 숫자와 자료의 일관성을 확인하고 의뢰인이 이해할 수 있게 설명하는 태도를 보여주되 과장하지 마세요.
6. 결과보다 출발 상황, 쟁점, 계산, 절차, 다른 사건에서 달라질 수 있는 점의 순서를 지키세요.
7. 최종 응답은 지정된 JSON 스키마만 출력하고 도구를 사용하지 마세요.`;
}

function runCodex(snapshot, options) {
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "lawand-case-copy-"));
  const outputPath = join(temporaryDirectory, "result.json");
  try {
    const result = spawnSync(
      "codex",
      [
        "exec",
        "--ephemeral",
        "--ignore-user-config",
        "--ignore-rules",
        "--skip-git-repo-check",
        "--sandbox",
        "read-only",
        "--cd",
        temporaryDirectory,
        "--model",
        options.model,
        "--config",
        `model_reasoning_effort="${options.reasoningEffort}"`,
        "--output-schema",
        OUTPUT_SCHEMA_PATH,
        "--output-last-message",
        outputPath,
        "-",
      ],
      {
        encoding: "utf8",
        input: generationPrompt(snapshot),
        maxBuffer: 10 * 1024 * 1024,
        timeout: 10 * 60 * 1_000,
      },
    );

    if (result.error) throw result.error;
    if (result.status !== 0) {
      const diagnostic = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
        .trim()
        .slice(-4_000);
      throw new Error(`Codex CLI 생성에 실패했습니다.\n${diagnostic}`);
    }

    const generated = JSON.parse(readFileSync(outputPath, "utf8"));
    generated.tags = normalizeGeneratedTags(generated.tags, snapshot);
    return generated;
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

function normalizeGeneratedTags(generatedTags, snapshot) {
  const accepted = array(generatedTags).filter(
    (tag) => typeof tag === "string" && ALLOWED_TAGS.has(tag),
  );
  const fallback = [
    snapshot.case.practiceArea === "personal_rehabilitation"
      ? "개인회생"
      : "파산·면책",
    snapshot.case.practiceArea === "personal_rehabilitation"
      ? "변제계획"
      : null,
    snapshot.case.practiceArea === "personal_rehabilitation"
      ? "청산가치"
      : null,
  ].filter(Boolean);
  return [...new Set([...accepted, ...fallback])].slice(0, 6);
}

function assertRequiredExplanations(generated, safe) {
  if (
    safe.snapshot.case.practiceArea === "personal_rehabilitation" &&
    !String(generated.liquidationValueNote ?? "").includes("현재가치")
  ) {
    throw new Error("청산가치 현재가치 설명이 생성 본문에 없습니다.");
  }

  if (safe.figures.additionalLivingCost > 0) {
    const additionalLivingCostNarrative = [
      generated.calculation,
      ...array(generated.keyIssues).map((issue) => object(issue).body),
    ].join(" ");
    if (!additionalLivingCostNarrative.includes("추가생계비")) {
      throw new Error("추가생계비 설명이 생성 본문의 핵심 쟁점에 없습니다.");
    }
  }
}

async function candidates(
  database,
  practiceArea,
  requireAdditionalLivingCost,
) {
  const caseType = practiceArea === "personal_rehabilitation" ? 1 : 2;
  const result = await database.query(
    `
      WITH eligible AS (
        SELECT
          c.*,
          m.memo,
          s.phone AS statement_phone,
          s.final_education,
          s.career,
          s.litigation_exp,
          s.residence_detail,
          s.debt_reason,
          s.want,
          floor(c.monthly_income / 500000)::integer AS income_bucket,
          floor(c.total_debt / 10000000)::integer AS debt_bucket,
          floor(c.liquidation_value / 10000000)::integer AS liquidation_bucket
        FROM "CB"."TblCBCase" c
        LEFT JOIN "CB"."TblCaseMemo" m
          ON m."Case_idx" = c."Case_idx"
        LEFT JOIN LATERAL (
          SELECT statement.*
          FROM "CB"."TblMoClientStatement" statement
          WHERE statement."Case_idx" = c."Case_idx"
          ORDER BY statement.update_dt DESC, statement.idx DESC
          LIMIT 1
        ) s ON true
        WHERE c."Office_idx" = $1
          AND c.case_type = $2
          AND c.total_debt > 0
          AND c.total_debt > c.liquidation_value
          AND (
            NOT $4::boolean
            OR COALESCE(c.living_cost_cost, 0) > 0
          )
          AND c.progress_history IS NOT NULL
          AND c.dependent_count = floor(c.dependent_count)
          AND c.child_count BETWEEN 0 AND 4
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(c.progress_history) event
            WHERE event->>'text' = '신청서접수'
          )
          AND (
            (
              c.case_type = 2
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(c.progress_history) event
                WHERE event->>'text' LIKE '%파산선고%'
                  AND event->>'text' NOT LIKE '%기각%'
              )
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(c.progress_history) event
                WHERE event->>'text' LIKE '%면책허가결정%'
                  AND event->>'text' NOT LIKE '%불허가%'
              )
            )
            OR (
              c.monthly_income > c.monthly_payment
              AND c.monthly_payment > 0
              AND c.payment_count = 36
              AND c.estimated_spend > 0
              AND c.total_payment >= c.liquidation_value
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(c.progress_history) event
                WHERE event->>'text' = '개인회생절차개시결정'
              )
              AND EXISTS (
                SELECT 1
                FROM jsonb_array_elements(c.progress_history) event
                WHERE event->>'text' = '변제계획인가결정'
              )
            )
          )
      ), grouped AS (
        SELECT
          eligible.*,
          count(*) OVER (
            PARTITION BY
              case_type,
              income_bucket,
              debt_bucket,
              liquidation_bucket,
              income_type,
              residence_type,
              marriage_state,
              child_count,
              dependent_count
          )::integer AS cohort_size
        FROM eligible
      )
      SELECT *
      FROM grouped
      WHERE cohort_size >= $3
      ORDER BY
        CASE
          WHEN $4::boolean THEN COALESCE(living_cost_cost, 0)
          ELSE 0
        END DESC,
        cohort_size DESC,
        CASE WHEN debt_reasons @> '[1]'::jsonb THEN 0 ELSE 1 END,
        CASE
          WHEN jsonb_typeof(career->'list') = 'array'
            AND jsonb_array_length(career->'list') > 0 THEN 0
          ELSE 1
        END,
        CASE WHEN length(btrim(debt_reason)) >= 30 THEN 0 ELSE 1 END,
        CASE WHEN length(memo) BETWEEN 100 AND 4000 THEN 0 ELSE 1 END,
        abs((monthly_income - estimated_spend) - monthly_payment),
        md5("Case_idx"::text)
    `,
    [
      SOURCE_OFFICE_IDX,
      caseType,
      MINIMUM_COHORT_SIZE,
      requireAdditionalLivingCost,
    ],
  );
  return result.rows;
}

function chooseCandidate(rows) {
  const safeCandidates = [];
  for (const row of rows) {
    try {
      const safe = buildSafeSource(row);
      const noteCount =
        safe.snapshot.notes.memoFacts.length +
        safe.snapshot.notes.statementFacts.length;
      safeCandidates.push({
        row,
        safe,
        score:
          (safe.snapshot.employment.industry === "업종 비공개" ? 0 : 10) +
          Math.min(noteCount, 6) +
          Math.min(number(row.cohort_size), 20) / 10,
      });
    } catch {
      // 다른 안전한 후보를 계속 찾는다.
    }
  }
  safeCandidates.sort((left, right) => right.score - left.score);
  if (safeCandidates.length > 0) return safeCandidates[0];
  throw new Error("비식별 기준을 통과한 후보가 없습니다.");
}

async function storeCaseStudy({
  database,
  generated,
  options,
  row,
  safe,
  sourceCaseFingerprint,
}) {
  const existing = await database.query(
    `SELECT id, publication_status
     FROM public_case_studies
     WHERE source_case_fingerprint = $1 OR slug = $2`,
    [sourceCaseFingerprint, options.slug],
  );
  if (existing.rowCount > 0 && !options.replace) {
    throw new Error("같은 원천 또는 slug의 사례가 이미 있습니다. --replace가 필요합니다.");
  }
  if (
    existing.rows.some((item) =>
      ["published", "withdrawn"].includes(item.publication_status),
    )
  ) {
    throw new Error("공개 또는 철회된 사례는 생성 스크립트로 덮어쓸 수 없습니다.");
  }

  const generatedAt = new Date();
  const id = existing.rows[0]?.id ?? randomUUID();
  const serializedSnapshot = stableJson(safe.snapshot);
  const sourceSnapshotHash = sha256(serializedSnapshot);
  const tags = [
    ...new Set([...deterministicTags(row), ...generated.tags]),
  ].filter((tag) => ALLOWED_TAGS.has(tag)).slice(0, 8);

  assertNoDirectIdentifiers(JSON.stringify(generated), safe.directIdentifiers);
  assertNoSensitivePatterns(JSON.stringify(generated), "생성 본문");
  assertRequiredExplanations(generated, safe);
  if (tags.length < 2) throw new Error("공개 태그가 부족합니다.");

  await database.query("BEGIN");
  try {
    await database.query(
      `
        INSERT INTO public_case_studies (
          id,
          slug,
          source_case_idx,
          source_case_fingerprint,
          source_snapshot_hash,
          source_snapshot,
          source_office_idx,
          practice_area,
          publication_status,
          privacy_review_status,
          legal_review_status,
          publication_basis,
          title,
          dek,
          content,
          financial_snapshot,
          timeline,
          tags,
          cohort_size,
          anonymization_version,
          prompt_version,
          generation_model,
          generation_reasoning_effort,
          generated_at,
          created_at,
          updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6::jsonb, $7, $8, 'preview', 'pending',
          'pending', NULL, $9, $10, $11::jsonb, $12::jsonb, $13::jsonb,
          $14, $15, $16, $17, $18, $19, $20, $20, $20
        )
        ON CONFLICT (id) DO UPDATE SET
          slug = EXCLUDED.slug,
          source_case_idx = EXCLUDED.source_case_idx,
          source_case_fingerprint = EXCLUDED.source_case_fingerprint,
          source_snapshot_hash = EXCLUDED.source_snapshot_hash,
          source_snapshot = EXCLUDED.source_snapshot,
          practice_area = EXCLUDED.practice_area,
          publication_status = 'preview',
          privacy_review_status = 'pending',
          legal_review_status = 'pending',
          publication_basis = NULL,
          title = EXCLUDED.title,
          dek = EXCLUDED.dek,
          content = EXCLUDED.content,
          financial_snapshot = EXCLUDED.financial_snapshot,
          timeline = EXCLUDED.timeline,
          tags = EXCLUDED.tags,
          cohort_size = EXCLUDED.cohort_size,
          anonymization_version = EXCLUDED.anonymization_version,
          prompt_version = EXCLUDED.prompt_version,
          generation_model = EXCLUDED.generation_model,
          generation_reasoning_effort = EXCLUDED.generation_reasoning_effort,
          generated_at = EXCLUDED.generated_at,
          privacy_reviewed_at = NULL,
          legal_reviewed_at = NULL,
          published_at = NULL,
          withdrawn_at = NULL,
          updated_at = EXCLUDED.updated_at
      `,
      [
        id,
        options.slug,
        number(row.Case_idx),
        sourceCaseFingerprint,
        sourceSnapshotHash,
        JSON.stringify(safe.snapshot),
        SOURCE_OFFICE_IDX,
        options.practiceArea,
        generated.title,
        generated.dek,
        JSON.stringify(generated),
        JSON.stringify(safe.figures),
        JSON.stringify(safe.timeline),
        tags,
        number(row.cohort_size),
        ANONYMIZATION_VERSION,
        PROMPT_VERSION,
        options.model,
        options.reasoningEffort,
        generatedAt,
      ],
    );
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  }

  return { id, tags };
}

async function main() {
  const options = parseArguments();
  const environment = readEnvironment();
  const databaseUrl = environment.get("LAWAND_MIGRATION_DATABASE_URL");
  const hmacKey = environment.get("LAWAND_DATA_HMAC_KEY_V1");
  if (!databaseUrl || !hmacKey) {
    throw new Error("DB 연결정보와 HMAC 키가 필요합니다.");
  }

  const database = new pg.Client({ connectionString: databaseUrl });
  await database.connect();
  try {
    const rows = await candidates(
      database,
      options.practiceArea,
      options.requireAdditionalLivingCost,
    );
    if (rows.length === 0) throw new Error("공개 후보가 없습니다.");
    const existing = await database.query(
      `SELECT slug, source_case_fingerprint, publication_status
       FROM public_case_studies`,
    );
    const existingBySlug = existing.rows.find(
      (item) => item.slug === options.slug,
    );
    if (
      existingBySlug &&
      ["published", "withdrawn"].includes(existingBySlug.publication_status)
    ) {
      throw new Error("공개 또는 철회된 사례는 생성 스크립트로 덮어쓸 수 없습니다.");
    }
    if (
      existingBySlug &&
      !options.replace &&
      !options.inspectSafeSource
    ) {
      throw new Error(
        "같은 slug의 사례가 이미 있습니다. 재생성하려면 --replace가 필요합니다.",
      );
    }

    const existingFingerprintHexes = new Set(
      existing.rows.map((item) =>
        Buffer.from(item.source_case_fingerprint).toString("hex"),
      ),
    );
    const fingerprintedRows = rows.map((row) => ({
      ...row,
      sourceCaseFingerprint: sourceFingerprint(hmacKey, row.Case_idx),
    }));
    const selectableRows = existingBySlug
      ? fingerprintedRows.filter(
          (row) =>
            row.sourceCaseFingerprint.toString("hex") ===
            Buffer.from(existingBySlug.source_case_fingerprint).toString("hex"),
        )
      : fingerprintedRows.filter(
          (row) =>
            !existingFingerprintHexes.has(
              row.sourceCaseFingerprint.toString("hex"),
            ),
        );
    if (selectableRows.length === 0) {
      throw new Error(
        existingBySlug
          ? "기존 초안의 원천 사건이 현재 후보 기준을 통과하지 못했습니다."
          : "아직 사용하지 않은 공개 후보가 없습니다.",
      );
    }
    const selected = chooseCandidate(selectableRows);

    if (options.inspectSafeSource) {
      process.stdout.write(`${JSON.stringify(selected.safe.snapshot, null, 2)}\n`);
      return;
    }

    const generated = runCodex(selected.safe.snapshot, options);
    const stored = await storeCaseStudy({
      database,
      generated,
      options,
      row: selected.row,
      safe: selected.safe,
      sourceCaseFingerprint: selected.row.sourceCaseFingerprint,
    });

    process.stdout.write(
      `${JSON.stringify({
        cohortSize: number(selected.row.cohort_size),
        generationModel: options.model,
        generationReasoningEffort: options.reasoningEffort,
        id: stored.id,
        publicationStatus: "preview",
        slug: options.slug,
        tags: stored.tags,
      }, null, 2)}\n`,
    );
  } finally {
    await database.end();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
