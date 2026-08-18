export type GatewayConfig = {
  databaseUrl: string;
  databaseRequestPoolMax: number;
  databaseListenerPoolMax: number;
  cloudWatchMetricsEnabled: boolean;
  awsRegion: string;
  encryptionKey: string;
  hmacKey: string;
  keyVersion: string;
  internalApiKey: string;
  publicIntakeApiKey: string;
  reviewWriteUrl: string;
  giftishow: {
    authCode: string;
    authToken: string;
    userId: string;
    callbackNo: string;
    bannerId: string;
    templateId: string;
  } | null;
  outboxWorkerEnabled: boolean;
  legalFriendsApiToken: string | null;
  alimtalkWorkerEnabled: boolean;
  solapiApiCredentials: {
    apiKey: string;
    apiSecret: string;
  } | null;
  solapi: {
    apiKey: string;
    apiSecret: string;
    pfId: string;
    requestTemplateId: string;
    assignmentTemplateId: string;
  } | null;
  solapiMmsSender: string | null;
  kakaoSkill: {
    botId: string;
    secret: string;
  } | null;
  naverBookingImapEnabled: boolean;
  naverBookingImap: {
    user: string;
    appPassword: string;
    mailbox: string;
  } | null;
  centrexWorkerEnabled: boolean;
  centrexCredentials: Readonly<Record<string, string>> | null;
  centrexBridgeKeys: Readonly<
    Record<
      string,
      { endpointId: string; secret: Buffer; staffUserId?: string }
    >
  > | null;
  centrexRingCallback: {
    token: string;
    host: string;
    port: number;
    pollIntervalMs: number;
  } | null;
};

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }
  return value;
}

function booleanValue(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) return fallback;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`${name}은 true 또는 false여야 합니다.`);
}

function integerValue(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name}은 ${minimum}부터 ${maximum} 사이의 정수여야 합니다.`,
    );
  }
  return value;
}

function centrexCredentialsValue(): Readonly<Record<string, string>> | null {
  const raw = process.env.LAWAND_CENTREX_CREDENTIALS_JSON?.trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      "LAWAND_CENTREX_CREDENTIALS_JSON은 JSON 객체여야 합니다.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "LAWAND_CENTREX_CREDENTIALS_JSON은 JSON 객체여야 합니다.",
    );
  }
  const credentials: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(key)) {
      throw new Error("센트릭스 credential key 형식이 올바르지 않습니다.");
    }
    if (typeof value !== "string" || !/^[0-9a-fA-F]{128}$/.test(value)) {
      throw new Error(
        `센트릭스 ${key} 자격증명은 SHA-512 128자리 16진수여야 합니다.`,
      );
    }
    credentials[key] = value.toLowerCase();
  }
  return Object.keys(credentials).length > 0 ? credentials : null;
}

function centrexBridgeKeysValue(): Readonly<
  Record<
    string,
    { endpointId: string; secret: Buffer; staffUserId?: string }
  >
> | null {
  const raw = process.env.LAWAND_CENTREX_BRIDGE_KEYS_JSON?.trim();
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(
      "LAWAND_CENTREX_BRIDGE_KEYS_JSON은 JSON 객체여야 합니다.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "LAWAND_CENTREX_BRIDGE_KEYS_JSON은 JSON 객체여야 합니다.",
    );
  }

  const result: Record<
    string,
    { endpointId: string; secret: Buffer; staffUserId?: string }
  > = {};
  for (const [bridgeId, value] of Object.entries(parsed)) {
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$/.test(bridgeId)) {
      throw new Error("센트릭스 bridge ID 형식이 올바르지 않습니다.");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`센트릭스 ${bridgeId} bridge 설정이 올바르지 않습니다.`);
    }
    const entry = value as {
      endpointId?: unknown;
      secret?: unknown;
      staffUserId?: unknown;
    };
    if (
      typeof entry.endpointId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        entry.endpointId,
      )
    ) {
      throw new Error(`센트릭스 ${bridgeId} endpoint ID가 올바르지 않습니다.`);
    }
    if (typeof entry.secret !== "string") {
      throw new Error(`센트릭스 ${bridgeId} bridge secret이 필요합니다.`);
    }
    if (!/^[A-Za-z0-9+/_-]{43}=?$/.test(entry.secret)) {
      throw new Error(
        `센트릭스 ${bridgeId} bridge secret은 base64 32바이트여야 합니다.`,
      );
    }
    const normalizedSecret = entry.secret
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(entry.secret.length / 4) * 4, "=");
    const secret = Buffer.from(normalizedSecret, "base64");
    if (secret.length !== 32) {
      throw new Error(
        `센트릭스 ${bridgeId} bridge secret은 base64 32바이트여야 합니다.`,
      );
    }
    if (
      entry.staffUserId !== undefined &&
      (typeof entry.staffUserId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          entry.staffUserId,
        ))
    ) {
      throw new Error(
        `센트릭스 ${bridgeId} bridge 직원 ID가 올바르지 않습니다.`,
      );
    }
    result[bridgeId] = {
      endpointId: entry.endpointId,
      secret,
      ...(typeof entry.staffUserId === "string"
        ? { staffUserId: entry.staffUserId }
        : {}),
    };
  }
  return Object.keys(result).length > 0 ? result : null;
}

function positiveIntegerValue(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name}은 ${minimum}부터 ${maximum} 사이의 정수여야 합니다.`);
  }
  return value;
}

function reviewWriteUrlValue(): string {
  const raw =
    process.env.LAWAND_REVIEW_WRITE_URL?.trim() ||
    "https://lawandfirm.com/bank/reviews/write";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("LAWAND_REVIEW_WRITE_URL은 유효한 절대 URL이어야 합니다.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  ) {
    throw new Error(
      "LAWAND_REVIEW_WRITE_URL은 운영에서 HTTPS 절대 URL이어야 합니다.",
    );
  }
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function giftishowValue(): GatewayConfig["giftishow"] {
  const values = {
    authCode: process.env.LAWAND_GIFTISHOW_AUTH_CODE?.trim() || "",
    authToken: process.env.LAWAND_GIFTISHOW_AUTH_TOKEN?.trim() || "",
    userId: process.env.LAWAND_GIFTISHOW_USER_ID?.trim() || "",
    callbackNo: process.env.LAWAND_GIFTISHOW_CALLBACK_NO?.replace(/\D/g, "") || "",
    bannerId: process.env.LAWAND_GIFTISHOW_BANNER_ID?.trim() || "",
    templateId: process.env.LAWAND_GIFTISHOW_TEMPLATE_ID?.trim() || "",
  };
  if (Object.values(values).every(Boolean)) {
    if (!/^\d{8,11}$/.test(values.callbackNo)) throw new Error("기프티쇼 발신번호 형식이 올바르지 않습니다.");
    return values;
  }
  if (Object.values(values).some(Boolean)) throw new Error("기프티쇼 설정 6개를 모두 입력해야 합니다.");
  return null;
}

function centrexRingCallbackValue(): GatewayConfig["centrexRingCallback"] {
  if (!booleanValue("LAWAND_CENTREX_RING_CALLBACK_ENABLED", false)) {
    return null;
  }
  const token = required("LAWAND_CENTREX_RING_CALLBACK_TOKEN").trim();
  const host = required("LAWAND_CENTREX_RING_CALLBACK_HOST").trim();
  const port = positiveIntegerValue(
    "LAWAND_CENTREX_RING_CALLBACK_PORT",
    80,
    1,
    65_535,
  );
  const pollIntervalSeconds = positiveIntegerValue(
    "LAWAND_CENTREX_INBOUND_HISTORY_POLL_SECONDS",
    15,
    5,
    300,
  );
  if (!/^[A-Za-z0-9_-]{32,96}$/.test(token)) {
    throw new Error(
      "LAWAND_CENTREX_RING_CALLBACK_TOKEN은 URL-safe 32~96자리여야 합니다.",
    );
  }
  const parts = host.split(".");
  if (
    parts.length !== 4 ||
    parts.some((part) => {
      const value = Number(part);
      return !/^(0|[1-9][0-9]{0,2})$/.test(part) || value > 255;
    })
  ) {
    throw new Error(
      "LAWAND_CENTREX_RING_CALLBACK_HOST는 공인 IPv4 형식이어야 합니다.",
    );
  }
  return {
    token,
    host,
    port,
    pollIntervalMs: pollIntervalSeconds * 1_000,
  };
}

export function readGatewayConfig(): GatewayConfig {
  const outboxWorkerEnabled = booleanValue(
    "LAWAND_OUTBOX_WORKER_ENABLED",
    false,
  );
  const legalFriendsApiToken =
    process.env.LAWAND_LEGALFRIENDS_API_TOKEN?.trim() || null;
  if (outboxWorkerEnabled && !legalFriendsApiToken) {
    throw new Error(
      "outbox 워커를 사용하려면 리걸프렌즈 API 토큰이 필요합니다.",
    );
  }
  const alimtalkWorkerEnabled = booleanValue(
    "LAWAND_ALIMTALK_WORKER_ENABLED",
    false,
  );
  const solapiValues = {
    apiKey: process.env.LAWAND_SOLAPI_API_KEY?.trim() || "",
    apiSecret: process.env.LAWAND_SOLAPI_API_SECRET?.trim() || "",
    pfId: process.env.LAWAND_SOLAPI_PF_ID?.trim() || "",
    requestTemplateId:
      process.env.LAWAND_SOLAPI_REQUEST_TEMPLATE_ID?.trim() || "",
    assignmentTemplateId:
      process.env.LAWAND_SOLAPI_ASSIGNMENT_TEMPLATE_ID?.trim() || "",
  };
  const solapiApiCredentials =
    solapiValues.apiKey && solapiValues.apiSecret
      ? {
          apiKey: solapiValues.apiKey,
          apiSecret: solapiValues.apiSecret,
        }
      : null;
  const solapi = Object.values(solapiValues).every(Boolean)
    ? solapiValues
    : null;
  if (alimtalkWorkerEnabled && !solapi) {
    throw new Error(
      "알림톡 워커를 사용하려면 솔라피 API 키·시크릿·채널·템플릿 설정이 모두 필요합니다.",
    );
  }
  const solapiMmsSenderValue =
    process.env.LAWAND_SOLAPI_MMS_SENDER?.replace(/\D/g, "") || "";
  if (solapiMmsSenderValue && !/^0\d{8,10}$/.test(solapiMmsSenderValue)) {
    throw new Error(
      "LAWAND_SOLAPI_MMS_SENDER는 사전 등록된 국내 발신번호여야 합니다.",
    );
  }
  const solapiMmsSender = solapiMmsSenderValue || null;
  const kakaoSkillValues = {
    botId: process.env.LAWAND_KAKAO_CHATBOT_BOT_ID?.trim() || "",
    secret: process.env.LAWAND_KAKAO_CHATBOT_SKILL_SECRET?.trim() || "",
  };
  const kakaoSkill = Object.values(kakaoSkillValues).every(Boolean)
    ? kakaoSkillValues
    : null;
  if (
    Object.values(kakaoSkillValues).some(Boolean) &&
    !Object.values(kakaoSkillValues).every(Boolean)
  ) {
    throw new Error(
      "카카오 챗봇 스킬을 사용하려면 봇 ID와 스킬 시크릿을 함께 설정해야 합니다.",
    );
  }
  const naverBookingImapEnabled = booleanValue(
    "LAWAND_NAVER_BOOKING_IMAP_ENABLED",
    false,
  );
  const naverBookingImapValues = {
    user: process.env.LAWAND_NAVER_BOOKING_IMAP_USER?.trim() || "",
    appPassword:
      process.env.LAWAND_NAVER_BOOKING_IMAP_APP_PASSWORD?.trim() || "",
    mailbox:
      process.env.LAWAND_NAVER_BOOKING_IMAP_MAILBOX?.trim() ||
      "네이버예약",
  };
  const naverBookingImap =
    naverBookingImapValues.user && naverBookingImapValues.appPassword
      ? naverBookingImapValues
      : null;
  if (naverBookingImapEnabled && !naverBookingImap) {
    throw new Error(
      "네이버 예약 IMAP 수집을 사용하려면 계정과 애플리케이션 비밀번호가 필요합니다.",
    );
  }
  const centrexWorkerEnabled = booleanValue(
    "LAWAND_CENTREX_WORKER_ENABLED",
    false,
  );
  const centrexCredentials = centrexCredentialsValue();
  const centrexBridgeKeys = centrexBridgeKeysValue();
  const centrexRingCallback = centrexRingCallbackValue();
  const databaseRequestPoolMax = integerValue(
    "LAWAND_DB_REQUEST_POOL_MAX",
    20,
    5,
    100,
  );
  const databaseListenerPoolMax = integerValue(
    "LAWAND_DB_LISTENER_POOL_MAX",
    // 상담·후기·문자·전화 인바운드·전화 데스크 이벤트가 각각
    // 영구 LISTEN 연결을 하나씩 점유한다.
    5,
    5,
    20,
  );
  return {
    databaseUrl: required("LAWAND_APP_DATABASE_URL"),
    databaseRequestPoolMax,
    databaseListenerPoolMax,
    cloudWatchMetricsEnabled: booleanValue(
      "LAWAND_CLOUDWATCH_METRICS_ENABLED",
      process.env.NODE_ENV === "production",
    ),
    awsRegion: process.env.AWS_REGION?.trim() || "ap-northeast-2",
    encryptionKey: required("LAWAND_DATA_ENCRYPTION_KEY_V1"),
    hmacKey: required("LAWAND_DATA_HMAC_KEY_V1"),
    keyVersion: required("LAWAND_DATA_KEY_VERSION"),
    internalApiKey: required("LAWAND_INTERNAL_API_KEY"),
    publicIntakeApiKey: required("LAWAND_PUBLIC_INTAKE_API_KEY"),
    reviewWriteUrl: reviewWriteUrlValue(),
    giftishow: giftishowValue(),
    outboxWorkerEnabled,
    legalFriendsApiToken,
    alimtalkWorkerEnabled,
    solapiApiCredentials,
    solapi,
    solapiMmsSender,
    kakaoSkill,
    naverBookingImapEnabled,
    naverBookingImap,
    centrexWorkerEnabled,
    centrexCredentials,
    centrexBridgeKeys,
    centrexRingCallback,
  };
}
