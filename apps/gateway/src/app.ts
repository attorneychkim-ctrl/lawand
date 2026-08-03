import { timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  consultationSubmissionSchema,
  createKakaoSkillResponse,
  kakaoHomepageEntryConfirmationSchema,
  kakaoHomepageEntrySubmissionSchema,
  kakaoSkillRequestSchema,
  kakaoSkillUserKey,
  reviewSubmissionSchema,
  staffExternalAccountUpdateSchema,
  staffInvitationAcceptanceSchema,
  staffInvitationCreationSchema,
  staffInvitationTokenSchema,
  staffLoginSchema,
} from "@lawand/core";

import {
  StaffAuthError,
  type StaffAuthService,
} from "./auth.js";
import type { ConsultationService } from "./service.js";
import {
  ConsultationAssignmentError,
  ConsultationValidationError,
  KakaoHomepageEntryError,
} from "./service.js";
import type { PublicIntakeProtection } from "./intake-protection.js";
import {
  ReviewSubmissionValidationError,
  type ReviewSubmissionService,
} from "./review-service.js";

const MAX_BODY_BYTES = 64 * 1024;

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
  headers?: Record<string, string>,
) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("payload_too_large");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("invalid_json");
  }
}

function hasHeaderAccess(
  request: IncomingMessage,
  headerName: string,
  expectedKey: string,
): boolean {
  const provided = request.headers[headerName];
  if (typeof provided !== "string") return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expectedKey);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function staffSessionToken(request: IncomingMessage): string | null {
  const provided = request.headers["x-lawand-staff-session"];
  return typeof provided === "string" ? provided : null;
}

function invalidRequestIssues(
  issues: Array<{ path: PropertyKey[]; message: string }>,
) {
  return {
    error: "invalid_request",
    issues: issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  };
}

const consultationAccessRoles = [
  "admin",
  "full_time",
  "part_time",
  "separate_accounting",
  "civil_complaint_vendor",
] as const;

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function createGatewayServer(options?: {
  service?: ConsultationService;
  internalApiKey?: string;
  publicIntakeApiKey?: string;
  authService?: StaffAuthService;
  intakeProtection?: PublicIntakeProtection;
  reviewService?: ReviewSubmissionService;
  kakaoSkill?: {
    botId: string;
    secret: string;
  };
}) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://lawand-gateway.local");

      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, {
          service: "lawand-gateway",
          status: "ok",
        });
        return;
      }

      if (
        url.pathname.startsWith("/v1/staff-auth/") &&
        (!options?.internalApiKey ||
          !hasHeaderAccess(
            request,
            "x-lawand-internal-key",
            options.internalApiKey,
          ) ||
          !options.authService)
      ) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/staff-auth/login"
      ) {
        const parsed = staffLoginSchema.safeParse(await readJson(request));
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const result = await options!.authService!.login(parsed.data);
        sendJson(response, 200, result);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/v1/staff-auth/session"
      ) {
        const sessionToken = staffSessionToken(request);
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        const staff =
          await options!.authService!.authenticateSession(sessionToken);
        sendJson(response, 200, { staff });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/staff-auth/logout"
      ) {
        const sessionToken = staffSessionToken(request);
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        await options!.authService!.logout(sessionToken);
        sendJson(response, 200, { loggedOut: true });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/staff-auth/invitations/inspect"
      ) {
        const body = await readJson(request);
        const parsed = staffInvitationTokenSchema.safeParse(
          typeof body === "object" && body !== null
            ? (body as { token?: unknown }).token
            : undefined,
        );
        if (!parsed.success) {
          sendJson(response, 400, { error: "invalid_invitation" });
          return;
        }
        const invitation =
          await options!.authService!.inspectInvitation(parsed.data);
        sendJson(response, 200, { invitation });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/staff-auth/invitations/accept"
      ) {
        const parsed = staffInvitationAcceptanceSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const result =
          await options!.authService!.acceptInvitation(parsed.data);
        sendJson(response, 201, result);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/v1/staff-auth/users"
      ) {
        const sessionToken = staffSessionToken(request);
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        const actor = await options!.authService!.authorize(sessionToken, [
          "admin",
        ]);
        sendJson(response, 200, await options!.authService!.listStaff(actor));
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/staff-auth/users/") &&
        url.pathname.endsWith("/legalfriends-account")
      ) {
        const sessionToken = staffSessionToken(request);
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        const staffUserId = url.pathname.slice(
          "/v1/staff-auth/users/".length,
          -"/legalfriends-account".length,
        );
        if (!validUuid(staffUserId)) {
          sendJson(response, 400, { error: "invalid_staff_user_id" });
          return;
        }
        const parsed = staffExternalAccountUpdateSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const actor = await options!.authService!.authorize(sessionToken, [
          "admin",
        ]);
        const result =
          await options!.authService!.updateLegalFriendsAccount(
            actor,
            staffUserId,
            parsed.data,
          );
        sendJson(response, 200, result);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/staff-auth/invitations"
      ) {
        const sessionToken = staffSessionToken(request);
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        const parsed = staffInvitationCreationSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const actor = await options!.authService!.authorize(sessionToken, [
          "admin",
        ]);
        const invitation = await options!.authService!.createInvitation(
          actor,
          parsed.data,
        );
        sendJson(response, 201, { invitation });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/kakao/homepage-entries"
      ) {
        if (
          !options?.service ||
          !options.publicIntakeApiKey ||
          !hasHeaderAccess(
            request,
            "x-lawand-public-intake-key",
            options.publicIntakeApiKey,
          ) ||
          !options.intakeProtection
        ) {
          sendJson(response, 401, { error: "unauthorized" });
          return;
        }
        const parsed = kakaoHomepageEntrySubmissionSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const protection = options.intakeProtection.checkKakaoEntry({
          clientKey:
            typeof request.headers["x-lawand-client-key"] === "string"
              ? request.headers["x-lawand-client-key"]
              : null,
          idempotencyKey: parsed.data.idempotencyKey,
        });
        if (!protection.allowed) {
          sendJson(
            response,
            429,
            {
              error: "too_many_requests",
              message:
                "카카오 상담 연결이 짧은 시간에 반복되었습니다. 잠시 후 다시 시도해 주세요.",
            },
            { "retry-after": String(protection.retryAfterSeconds) },
          );
          return;
        }
        const receipt = await options.service.submitKakaoHomepageEntry(
          parsed.data,
        );
        sendJson(response, receipt.replayed ? 200 : 201, receipt);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/kakao/consultations"
      ) {
        if (
          !options?.service ||
          !options.kakaoSkill ||
          !hasHeaderAccess(
            request,
            "x-lawand-kakao-skill-key",
            options.kakaoSkill.secret,
          )
        ) {
          sendJson(response, 401, { error: "unauthorized" });
          return;
        }
        const parsed = kakaoSkillRequestSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        if (parsed.data.bot.id !== options.kakaoSkill.botId) {
          sendJson(response, 400, { error: "invalid_bot" });
          return;
        }
        const receipt = await options.service.submitKakao({
          botId: parsed.data.bot.id,
          userKey: kakaoSkillUserKey(parsed.data),
        });
        sendJson(response, 200, createKakaoSkillResponse(receipt));
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/review-submissions"
      ) {
        if (
          !options?.publicIntakeApiKey ||
          !hasHeaderAccess(
            request,
            "x-lawand-public-intake-key",
            options.publicIntakeApiKey,
          )
        ) {
          sendJson(response, 401, { error: "unauthorized" });
          return;
        }
        if (!options.reviewService || !options.intakeProtection) {
          sendJson(response, 503, { error: "service_unavailable" });
          return;
        }
        const parsed = reviewSubmissionSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const protection = options.intakeProtection.check({
          clientKey:
            typeof request.headers["x-lawand-client-key"] === "string"
              ? request.headers["x-lawand-client-key"]
              : null,
          idempotencyKey: parsed.data.idempotencyKey,
          phone: parsed.data.phone,
        });
        if (!protection.allowed) {
          sendJson(
            response,
            429,
            {
              error: "too_many_requests",
              message:
                "후기 제출이 짧은 시간에 반복되었습니다. 잠시 후 다시 시도해 주세요.",
            },
            { "retry-after": String(protection.retryAfterSeconds) },
          );
          return;
        }
        const result = await options.reviewService.submit(parsed.data);
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/consultations"
      ) {
        if (
          !options?.publicIntakeApiKey ||
          !hasHeaderAccess(
            request,
            "x-lawand-public-intake-key",
            options.publicIntakeApiKey,
          )
        ) {
          sendJson(response, 401, { error: "unauthorized" });
          return;
        }
        if (!options.service || !options.intakeProtection) {
          sendJson(response, 503, { error: "service_unavailable" });
          return;
        }
        const parsed = consultationSubmissionSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const protection = options.intakeProtection.check({
          clientKey:
            typeof request.headers["x-lawand-client-key"] === "string"
              ? request.headers["x-lawand-client-key"]
              : null,
          idempotencyKey: parsed.data.idempotencyKey,
          phone: parsed.data.phone,
        });
        if (!protection.allowed) {
          sendJson(
            response,
            429,
            {
              error: "too_many_requests",
              message:
                "상담 요청이 짧은 시간에 반복되었습니다. 잠시 후 다시 시도해 주세요.",
            },
            { "retry-after": String(protection.retryAfterSeconds) },
          );
          return;
        }
        const result = await options.service.submit(parsed.data);
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/consultations/") &&
        (url.pathname.endsWith("/kakao-entry/confirm") ||
          url.pathname.endsWith("/kakao-entry/invalidate"))
      ) {
        if (
          !options?.service ||
          !options.internalApiKey ||
          !hasHeaderAccess(
            request,
            "x-lawand-internal-key",
            options.internalApiKey,
          ) ||
          !options.authService
        ) {
          sendJson(response, 401, { error: "unauthorized" });
          return;
        }
        const sessionToken = staffSessionToken(request);
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        const action = url.pathname.endsWith("/kakao-entry/confirm")
          ? "confirm"
          : "invalidate";
        const suffix =
          action === "confirm"
            ? "/kakao-entry/confirm"
            : "/kakao-entry/invalidate";
        const consultationId = url.pathname.slice(
          "/v1/consultations/".length,
          -suffix.length,
        );
        if (!validUuid(consultationId)) {
          sendJson(response, 400, { error: "invalid_consultation_id" });
          return;
        }
        const actor = await options.authService.authorize(
          sessionToken,
          [...consultationAccessRoles],
        );
        if (action === "confirm") {
          const parsed = kakaoHomepageEntryConfirmationSchema.safeParse(
            await readJson(request),
          );
          if (!parsed.success) {
            sendJson(
              response,
              400,
              invalidRequestIssues(parsed.error.issues),
            );
            return;
          }
          const result = await options.service.confirmKakaoHomepageEntry(
            consultationId,
            parsed.data,
            actor,
          );
          sendJson(response, result.replayed ? 200 : 201, result);
          return;
        }
        const result = await options.service.invalidateKakaoHomepageEntry(
          consultationId,
          actor,
        );
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/consultations/") &&
        url.pathname.endsWith("/assign-to-me")
      ) {
        if (
          !options?.service ||
          !options.internalApiKey ||
          !hasHeaderAccess(
            request,
            "x-lawand-internal-key",
            options.internalApiKey,
          ) ||
          !options.authService
        ) {
          sendJson(response, 401, { error: "unauthorized" });
          return;
        }
        const sessionToken = staffSessionToken(request);
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        const consultationId = url.pathname.slice(
          "/v1/consultations/".length,
          -"/assign-to-me".length,
        );
        if (!validUuid(consultationId)) {
          sendJson(response, 400, { error: "invalid_consultation_id" });
          return;
        }
        const actor = await options.authService.authorize(
          sessionToken,
          [...consultationAccessRoles],
        );
        const result = await options.service.assignToSelf(
          consultationId,
          actor,
        );
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      }

      if (
        request.method === "GET" &&
        (url.pathname === "/v1/consultations" ||
          url.pathname.startsWith("/v1/consultations/"))
      ) {
        if (
          !options?.service ||
          !options.internalApiKey ||
          !hasHeaderAccess(
            request,
            "x-lawand-internal-key",
            options.internalApiKey,
          ) ||
          !options.authService
        ) {
          sendJson(response, 401, { error: "unauthorized" });
          return;
        }
        const sessionToken = staffSessionToken(request);
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        const actor = await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);

        if (url.pathname === "/v1/consultations") {
          const limit = Number(url.searchParams.get("limit") ?? "50");
          const result = await options.service.list(
            Number.isInteger(limit) ? limit : 50,
          );
          await options.authService.recordConsultationAccess(actor, {
            kind: "list",
          });
          sendJson(response, 200, result);
          return;
        }

        const consultationId = url.pathname.slice(
          "/v1/consultations/".length,
        );
        if (!validUuid(consultationId)) {
          sendJson(response, 400, { error: "invalid_consultation_id" });
          return;
        }
        const result = await options.service.detail(consultationId);
        if (!result) {
          sendJson(response, 404, { error: "not_found" });
          return;
        }
        await options.authService.recordConsultationAccess(actor, {
          consultationId,
          kind: "detail",
        });
        sendJson(response, 200, result);
        return;
      }

      sendJson(response, 404, {
        error: "not_found",
      });
    } catch (error) {
      if (error instanceof StaffAuthError) {
        const statusCode =
          error.code === "forbidden"
            ? 403
            : error.code === "email_already_registered" ||
                error.code === "legalfriends_id_already_registered" ||
                error.code === "bootstrap_already_completed"
              ? 409
              : error.code === "staff_not_found"
                ? 404
              : error.code === "invalid_invitation"
                ? 410
                : 401;
        sendJson(response, statusCode, {
          error: error.code,
          message: error.message,
        });
        return;
      }
      if (error instanceof ConsultationValidationError) {
        sendJson(response, 400, {
          error: "invalid_request",
          message: error.message,
        });
        return;
      }
      if (error instanceof ReviewSubmissionValidationError) {
        sendJson(response, 400, {
          error: "invalid_request",
          message: error.message,
        });
        return;
      }
      if (error instanceof ConsultationAssignmentError) {
        sendJson(
          response,
          error.code === "consultation_not_found" ? 404 : 409,
          {
            error: error.code,
            message: error.message,
          },
        );
        return;
      }
      if (error instanceof KakaoHomepageEntryError) {
        sendJson(
          response,
          ["consultation_not_found", "entry_not_found"].includes(error.code)
            ? 404
            : 409,
          {
            error: error.code,
            message: error.message,
          },
        );
        return;
      }
      if (
        error instanceof Error &&
        ["invalid_json", "payload_too_large"].includes(error.message)
      ) {
        sendJson(response, error.message === "payload_too_large" ? 413 : 400, {
          error: error.message,
        });
        return;
      }
      console.error("gateway request failed", error);
      sendJson(response, 500, { error: "internal_error" });
    }
  });
}
