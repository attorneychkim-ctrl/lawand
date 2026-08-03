export type GatewayConfig = {
  databaseUrl: string;
  encryptionKey: string;
  hmacKey: string;
  keyVersion: string;
  internalApiKey: string;
  publicIntakeApiKey: string;
  outboxWorkerEnabled: boolean;
  legalFriendsApiToken: string | null;
  alimtalkWorkerEnabled: boolean;
  solapi: {
    apiKey: string;
    apiSecret: string;
    pfId: string;
    requestTemplateId: string;
    assignmentTemplateId: string;
  } | null;
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
  const solapi = Object.values(solapiValues).every(Boolean)
    ? solapiValues
    : null;
  if (alimtalkWorkerEnabled && !solapi) {
    throw new Error(
      "알림톡 워커를 사용하려면 솔라피 API 키·시크릿·채널·템플릿 설정이 모두 필요합니다.",
    );
  }
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
  return {
    databaseUrl: required("LAWAND_APP_DATABASE_URL"),
    encryptionKey: required("LAWAND_DATA_ENCRYPTION_KEY_V1"),
    hmacKey: required("LAWAND_DATA_HMAC_KEY_V1"),
    keyVersion: required("LAWAND_DATA_KEY_VERSION"),
    internalApiKey: required("LAWAND_INTERNAL_API_KEY"),
    publicIntakeApiKey: required("LAWAND_PUBLIC_INTAKE_API_KEY"),
    outboxWorkerEnabled,
    legalFriendsApiToken,
    alimtalkWorkerEnabled,
    solapi,
    kakaoSkill,
    naverBookingImapEnabled,
    naverBookingImap,
  };
}
