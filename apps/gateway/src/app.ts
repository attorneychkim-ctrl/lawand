import { timingSafeEqual } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";

import {
  consultationSubmissionSchema,
  consultationAssignmentInputSchema,
  createKakaoSkillResponse,
  kakaoHomepageEntryConfirmationSchema,
  kakaoHomepageEntrySubmissionSchema,
  kakaoSkillRequestSchema,
  kakaoSkillUserKey,
  reviewSubmissionSchema,
  selfDiagnosisSubmissionSchema,
  staffCentrexLineUpdateSchema,
  staffExternalAccountUpdateSchema,
  staffInvitationAcceptanceSchema,
  staffInvitationCreationSchema,
  staffInvitationTokenSchema,
  staffLoginSchema,
  staffPasswordChangeSchema,
  staffProfileUpdateSchema,
  centrexBridgeEventSchema,
  centrexBridgeCommandResultSchema,
  messageTemplateCreateSchema,
  messageTemplateUpdateSchema,
  phoneDeskAftercareSaveSchema,
  phoneDeskCallResolutionSchema,
  phoneDeskFollowUpCompletionSchema,
  legalFriendsDirectoryConsultationCreateSchema,
  legalFriendsDirectoryClickToCallSchema,
  legalFriendsDirectoryMessageSendSchema,
  staffConsultationCreateSchema,
  telephonyCallDispositionConfirmationSchema,
  telephonyMessageSendSchema,
} from "@lawand/core";

import {
  StaffAuthError,
  type StaffAuthService,
} from "./auth.js";
import type { ConsultationEventSource } from "./consultation-events.js";
import type { TelephonyInboundEventSource } from "./telephony-inbound-events.js";
import type { TelephonyDeskEventSource } from "./telephony-desk-events.js";
import {
  CENTREX_BRIDGE_COMMAND_NEXT_PATH,
  CENTREX_BRIDGE_COMMAND_RESULT_PREFIX,
  CENTREX_BRIDGE_CLOCK_SKEW_SECONDS,
  CENTREX_BRIDGE_EVENT_PATH,
  CentrexBridgeAuthenticationError,
  type CentrexBridgeKeyMap,
  verifyCentrexBridgeRequest,
} from "./centrex-bridge-auth.js";
import {
  CentrexBridgeIngressError,
  type CentrexBridgeIngressService,
} from "./centrex-bridge-service.js";
import {
  CENTREX_RING_CALLBACK_PREFIX,
  CentrexRingCallbackError,
  type CentrexInboundObserver,
} from "./centrex-inbound-observer.js";
import {
  CentrexBridgeProvisioningError,
  type CentrexBridgeProvisioningService,
} from "./centrex-bridge-provisioning.js";
import type { ConsultationService } from "./service.js";
import {
  ConsultationAssignmentError,
  ConsultationValidationError,
  KakaoHomepageEntryError,
  LegalFriendsInvalidationError,
  SelfDiagnosisUnavailableError,
} from "./service.js";
import type { PublicIntakeProtection } from "./intake-protection.js";
import {
  ReviewSubmissionValidationError,
  type ReviewSubmissionService,
} from "./review-service.js";
import {
  TelephonyCallError,
  type TelephonyService,
} from "./telephony-service.js";

const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGE_TEMPLATE_BODY_BYTES = 320 * 1024;
const SSE_HEARTBEAT_INTERVAL_MS = 20_000;

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

function sendSseEvent(
  response: ServerResponse,
  event: string,
  data: unknown,
  id?: string,
) {
  if (id) response.write(`id: ${id}\n`);
  response.write(`event: ${event}\n`);
  response.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function readBody(
  request: IncomingMessage,
  maxBytes = MAX_BODY_BYTES,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      throw new Error("payload_too_large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function parseJson(body: Buffer): unknown {
  try {
    return JSON.parse(body.toString("utf8")) as unknown;
  } catch {
    throw new Error("invalid_json");
  }
}

async function readJson(
  request: IncomingMessage,
  maxBytes = MAX_BODY_BYTES,
): Promise<unknown> {
  return parseJson(await readBody(request, maxBytes));
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

type PagedDateQuery = {
  page: number;
  pageSize: 20 | 50 | 100;
  from?: Date;
  to?: Date;
};

function pagedDateQuery(
  searchParams: URLSearchParams,
): PagedDateQuery | null {
  const pageValue = searchParams.get("page") ?? "1";
  const pageSizeValue =
    searchParams.get("pageSize") ?? searchParams.get("limit") ?? "20";
  if (!/^\d+$/.test(pageValue) || !/^\d+$/.test(pageSizeValue)) {
    return null;
  }
  const page = Number(pageValue);
  const pageSize = Number(pageSizeValue);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !([20, 50, 100] as const).includes(pageSize as 20 | 50 | 100)
  ) {
    return null;
  }

  const fromValue = searchParams.get("from");
  const toValue = searchParams.get("to");
  const from = fromValue ? new Date(fromValue) : undefined;
  const to = toValue ? new Date(toValue) : undefined;
  if (
    (from && Number.isNaN(from.getTime())) ||
    (to && Number.isNaN(to.getTime())) ||
    (from && to && from >= to)
  ) {
    return null;
  }
  return {
    page,
    pageSize: pageSize as 20 | 50 | 100,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

export function createGatewayServer(options?: {
  service?: ConsultationService;
  internalApiKey?: string;
  publicIntakeApiKey?: string;
  authService?: StaffAuthService;
  intakeProtection?: PublicIntakeProtection;
  reviewService?: ReviewSubmissionService;
  telephonyService?: TelephonyService;
  centrexBridgeIngress?: CentrexBridgeIngressService;
  centrexBridgeKeys?: CentrexBridgeKeyMap;
  centrexBridgeProvisioning?: CentrexBridgeProvisioningService;
  centrexInboundObserver?: CentrexInboundObserver;
  consultationEvents?: ConsultationEventSource;
  telephonyInboundEvents?: TelephonyInboundEventSource;
  telephonyDeskEvents?: TelephonyDeskEventSource;
  kakaoSkill?: {
    botId: string;
    secret: string;
  };
}) {
  const seenBridgeNonces = new Map<string, number>();
  const consumeBridgeNonce = (authentication: {
    bridgeId: string;
    authenticationNonceHash: Buffer;
  }) => {
    const current = Date.now();
    for (const [key, expiresAt] of seenBridgeNonces) {
      if (expiresAt > current) break;
      seenBridgeNonces.delete(key);
    }
    const key = `${authentication.bridgeId}:${authentication.authenticationNonceHash.toString("hex")}`;
    if (seenBridgeNonces.has(key)) {
      throw new CentrexBridgeAuthenticationError("invalid_nonce");
    }
    seenBridgeNonces.set(
      key,
      current + CENTREX_BRIDGE_CLOCK_SKEW_SECONDS * 1_000,
    );
  };
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
        request.method === "GET" &&
        url.pathname.startsWith(CENTREX_RING_CALLBACK_PREFIX) &&
        url.pathname.endsWith(".html")
      ) {
        if (
          !options?.centrexInboundObserver ||
          !options.centrexInboundObserver.matchesPath(url.pathname)
        ) {
          sendJson(response, 404, { error: "not_found" });
          return;
        }
        await options.centrexInboundObserver.ingest(url.searchParams);
        sendJson(response, 200, { status: "ok" });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === CENTREX_BRIDGE_EVENT_PATH
      ) {
        if (!options?.centrexBridgeIngress || !options.centrexBridgeKeys) {
          sendJson(response, 503, { error: "service_unavailable" });
          return;
        }
        const body = await readBody(request);
        const authentication = verifyCentrexBridgeRequest({
          headers: request.headers,
          body,
          keys: options.centrexBridgeKeys,
        });
        consumeBridgeNonce(authentication);
        const parsed = centrexBridgeEventSchema.safeParse(parseJson(body));
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const resolvedAuthentication = options.centrexBridgeProvisioning
          ? await options.centrexBridgeProvisioning.resolveAuthentication(
              authentication,
              parsed.data.endpointId,
            )
          : authentication;
        const result = await options.centrexBridgeIngress.ingest(
          parsed.data,
          resolvedAuthentication,
        );
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === CENTREX_BRIDGE_COMMAND_NEXT_PATH
      ) {
        if (!options?.telephonyService || !options.centrexBridgeKeys) {
          sendJson(response, 503, { error: "service_unavailable" });
          return;
        }
        const body = Buffer.alloc(0);
        const authentication = verifyCentrexBridgeRequest({
          headers: request.headers,
          body,
          keys: options.centrexBridgeKeys,
          method: "GET",
          path: url.pathname,
        });
        consumeBridgeNonce(authentication);
        const provisioningCommand = options.centrexBridgeProvisioning
          ? await options.centrexBridgeProvisioning.poll(authentication)
          : null;
        if (
          options.centrexBridgeProvisioning &&
          !provisioningCommand &&
          !options.centrexBridgeProvisioning.isReadyForTelephony(
            authentication.bridgeId,
          )
        ) {
          response.writeHead(204, {
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          });
          response.end();
          return;
        }
        const command = provisioningCommand
          ? provisioningCommand
          : await options.telephonyService.pollInboundAnswerCommand(
              options.centrexBridgeProvisioning
                ? await options.centrexBridgeProvisioning.resolveAuthentication(
                    authentication,
                  )
                : authentication,
            );
        if (!command) {
          response.writeHead(204, {
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          });
          response.end();
          return;
        }
        sendJson(response, 200, command);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith(CENTREX_BRIDGE_COMMAND_RESULT_PREFIX) &&
        url.pathname.endsWith("/result")
      ) {
        if (!options?.telephonyService || !options.centrexBridgeKeys) {
          sendJson(response, 503, { error: "service_unavailable" });
          return;
        }
        const commandId = url.pathname.slice(
          CENTREX_BRIDGE_COMMAND_RESULT_PREFIX.length,
          -"/result".length,
        );
        if (!validUuid(commandId)) {
          sendJson(response, 400, { error: "invalid_command_id" });
          return;
        }
        const body = await readBody(request);
        const authentication = verifyCentrexBridgeRequest({
          headers: request.headers,
          body,
          keys: options.centrexBridgeKeys,
          method: "POST",
          path: url.pathname,
        });
        consumeBridgeNonce(authentication);
        const parsed = centrexBridgeCommandResultSchema.safeParse(
          parseJson(body),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        if (parsed.data.commandId !== commandId) {
          sendJson(response, 409, { error: "command_id_mismatch" });
          return;
        }
        const result =
          options.centrexBridgeProvisioning?.handlesCommand(
            commandId,
            authentication.bridgeId,
          )
            ? await options.centrexBridgeProvisioning.complete(
                commandId,
                parsed.data,
                authentication,
              )
            : await options.telephonyService.completeInboundAnswerCommand(
                commandId,
                parsed.data,
                options.centrexBridgeProvisioning
                  ? await options.centrexBridgeProvisioning.resolveAuthentication(
                      authentication,
                    )
                  : authentication,
              );
        sendJson(response, 200, result);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/v1/consultation-events/stream"
      ) {
        if (
          !options?.consultationEvents ||
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
        await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);

        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-store, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
          "x-content-type-options": "nosniff",
        });
        response.flushHeaders();
        response.write("retry: 3000\n\n");
        sendSseEvent(response, "consultation.sync", {
          reason: "connected",
        });

        const unsubscribe = options.consultationEvents.subscribe(
          (message) => {
            if (response.destroyed || response.writableEnded) return;
            if (message.kind === "sync") {
              sendSseEvent(response, "consultation.sync", {
                reason: "source_reconnected",
              });
              return;
            }
            sendSseEvent(
              response,
              "consultation.changed",
              message.notification,
              message.notification.eventId,
            );
          },
        );
        const heartbeat = setInterval(() => {
          if (!response.destroyed && !response.writableEnded) {
            response.write(": keepalive\n\n");
          }
        }, SSE_HEARTBEAT_INTERVAL_MS);
        heartbeat.unref();

        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
        };
        request.once("aborted", close);
        response.once("close", close);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/v1/telephony-inbound-events/stream"
      ) {
        if (
          !options?.telephonyInboundEvents ||
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
        await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);

        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-store, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
          "x-content-type-options": "nosniff",
        });
        response.flushHeaders();
        response.write("retry: 3000\n\n");
        sendSseEvent(response, "telephony.inbound.sync", {
          reason: "connected",
        });

        const unsubscribe = options.telephonyInboundEvents.subscribe(
          (message) => {
            if (response.destroyed || response.writableEnded) return;
            if (message.kind === "sync") {
              sendSseEvent(response, "telephony.inbound.sync", {
                reason: "source_reconnected",
              });
              return;
            }
            sendSseEvent(
              response,
              "telephony.inbound.changed",
              message.notification,
              message.notification.eventId,
            );
          },
        );
        const heartbeat = setInterval(() => {
          if (!response.destroyed && !response.writableEnded) {
            response.write(": keepalive\n\n");
          }
        }, SSE_HEARTBEAT_INTERVAL_MS);
        heartbeat.unref();

        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
        };
        request.once("aborted", close);
        response.once("close", close);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/v1/phone-desk/events/stream"
      ) {
        if (
          !options?.telephonyDeskEvents ||
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
        await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);

        response.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-store, no-transform",
          connection: "keep-alive",
          "x-accel-buffering": "no",
          "x-content-type-options": "nosniff",
        });
        response.flushHeaders();
        response.write("retry: 3000\n\n");
        sendSseEvent(response, "telephony.desk.sync", {
          reason: "connected",
        });

        const unsubscribe = options.telephonyDeskEvents.subscribe(
          (message) => {
            if (response.destroyed || response.writableEnded) return;
            if (message.kind === "sync") {
              sendSseEvent(response, "telephony.desk.sync", {
                reason: "source_reconnected",
              });
              return;
            }
            sendSseEvent(
              response,
              "telephony.desk.changed",
              message.notification,
            );
          },
        );
        const heartbeat = setInterval(() => {
          if (!response.destroyed && !response.writableEnded) {
            response.write(": keepalive\n\n");
          }
        }, SSE_HEARTBEAT_INTERVAL_MS);
        heartbeat.unref();

        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          clearInterval(heartbeat);
          unsubscribe();
        };
        request.once("aborted", close);
        response.once("close", close);
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
        url.pathname === "/v1/staff-auth/profile"
      ) {
        const sessionToken = staffSessionToken(request);
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        const actor =
          await options!.authService!.authenticateSession(sessionToken);
        const profile = await options!.authService!.getStaffProfile(actor);
        sendJson(response, 200, { profile });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/staff-auth/password"
      ) {
        const sessionToken = staffSessionToken(request);
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        const parsed = staffPasswordChangeSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const actor =
          await options!.authService!.authenticateSession(sessionToken);
        await options!.authService!.changePassword(actor, parsed.data);
        sendJson(response, 200, { changed: true });
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
        url.pathname.endsWith("/profile")
      ) {
        const sessionToken = staffSessionToken(request);
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        const staffUserId = url.pathname.slice(
          "/v1/staff-auth/users/".length,
          -"/profile".length,
        );
        if (!validUuid(staffUserId)) {
          sendJson(response, 400, { error: "invalid_staff_user_id" });
          return;
        }
        const parsed = staffProfileUpdateSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const actor =
          await options!.authService!.authenticateSession(sessionToken);
        const profile = await options!.authService!.updateStaffProfile(
          actor,
          staffUserId,
          parsed.data,
        );
        sendJson(response, 200, { profile });
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/staff-auth/users/") &&
        url.pathname.endsWith("/centrex-line")
      ) {
        const sessionToken = staffSessionToken(request);
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        const staffUserId = url.pathname.slice(
          "/v1/staff-auth/users/".length,
          -"/centrex-line".length,
        );
        if (!validUuid(staffUserId)) {
          sendJson(response, 400, { error: "invalid_staff_user_id" });
          return;
        }
        const parsed = staffCentrexLineUpdateSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const actor =
          await options!.authService!.authenticateSession(sessionToken);
        const result =
          await options!.authService!.updateCentrexLineNumber(
            actor,
            staffUserId,
            parsed.data,
          );
        sendJson(response, 200, result);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/staff-auth/users/") &&
        url.pathname.endsWith("/centrex-bridge-reassign")
      ) {
        const sessionToken = staffSessionToken(request);
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        const staffUserId = url.pathname.slice(
          "/v1/staff-auth/users/".length,
          -"/centrex-bridge-reassign".length,
        );
        if (!validUuid(staffUserId)) {
          sendJson(response, 400, { error: "invalid_staff_user_id" });
          return;
        }
        const actor =
          await options!.authService!.authenticateSession(sessionToken);
        const result =
          await options!.authService!.reassignCentrexBridge(
            actor,
            staffUserId,
          );
        sendJson(response, 200, result);
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
        const actor =
          await options!.authService!.authenticateSession(sessionToken);
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
        url.pathname === "/v1/self-diagnoses"
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
        const parsed = selfDiagnosisSubmissionSchema.safeParse(
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
                "자가진단 요청이 짧은 시간에 반복되었습니다. 잠시 후 다시 시도해 주세요.",
            },
            { "retry-after": String(protection.retryAfterSeconds) },
          );
          return;
        }
        const result = await options.service.submitSelfDiagnosis(parsed.data);
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
        url.pathname.startsWith("/v1/telephony-inbound-calls/") &&
        url.pathname.endsWith("/answer")
      ) {
        if (
          !options?.telephonyService ||
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
        const inboundCallId = url.pathname.slice(
          "/v1/telephony-inbound-calls/".length,
          -"/answer".length,
        );
        if (!validUuid(inboundCallId)) {
          sendJson(response, 400, { error: "invalid_inbound_call_id" });
          return;
        }
        const actor = await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        const result = await options.telephonyService.requestInboundAnswer(
          inboundCallId,
          actor,
        );
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/v1/telephony-call-activities"
      ) {
        if (
          !options?.telephonyService ||
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
        sendJson(
          response,
          200,
          await options.telephonyService.getCallActivitySnapshot(actor),
        );
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/v1/telephony-inbound-calls"
      ) {
        if (
          !options?.telephonyService ||
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
        await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        sendJson(
          response,
          200,
          await options.telephonyService.getInboundCallSnapshot(),
        );
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/v1/phone-desk/calls"
      ) {
        if (
          !options?.telephonyService ||
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
        await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        const query = pagedDateQuery(url.searchParams);
        const filter = url.searchParams.get("filter") ?? "all";
        if (
          !query ||
          ![
            "all",
            "inbound",
            "click_to_call",
            "centrex_direct",
            "internal",
            "active",
          ].includes(filter)
        ) {
          sendJson(response, 400, { error: "invalid_list_query" });
          return;
        }
        sendJson(
          response,
          200,
          await options.telephonyService.getPhoneDeskCalls({
            ...query,
            filter: filter as
              | "all"
              | "inbound"
              | "click_to_call"
              | "centrex_direct"
              | "internal"
              | "active",
          }),
        );
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/v1/client-directory"
      ) {
        if (
          !options?.telephonyService ||
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
        sendJson(
          response,
          200,
          await options.telephonyService.searchLegalFriendsClients(
            url.searchParams.get("q") ?? "",
            actor,
            Number(url.searchParams.get("limit") ?? "30"),
          ),
        );
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/staff/consultations"
      ) {
        if (
          !options?.telephonyService ||
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
        const parsed = staffConsultationCreateSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const actor = await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        const result = await options.telephonyService.createStaffConsultation(
          parsed.data,
          actor,
        );
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/client-directory/consultations"
      ) {
        if (
          !options?.telephonyService ||
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
        const parsed = legalFriendsDirectoryConsultationCreateSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const actor = await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        const result =
          await options.telephonyService.createDirectoryConsultation(
            parsed.data,
            actor,
          );
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/client-directory/click-to-call"
      ) {
        if (
          !options?.telephonyService ||
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
        const parsed = legalFriendsDirectoryClickToCallSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const actor = await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        const result =
          await options.telephonyService.requestDirectoryClickToCall(
            parsed.data,
            actor,
          );
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/client-directory/messages"
      ) {
        if (
          !options?.telephonyService ||
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
        const parsed = legalFriendsDirectoryMessageSendSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const actor = await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        const { clientIdx, caseIdx, ...messageInput } = parsed.data;
        const result = await options.telephonyService.requestDirectoryMessage(
          { clientIdx, caseIdx },
          messageInput,
          actor,
        );
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      }

      const phoneDeskAftercareMatch = url.pathname.match(
        /^\/v1\/phone-desk\/calls\/([^/]+)\/aftercare$/,
      );
      if (request.method === "POST" && phoneDeskAftercareMatch) {
        if (
          !options?.telephonyService ||
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
        const callId = phoneDeskAftercareMatch[1];
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        if (!callId || !validUuid(callId)) {
          sendJson(response, 400, { error: "invalid_call_id" });
          return;
        }
        const parsed = phoneDeskAftercareSaveSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const actor = await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        sendJson(
          response,
          200,
          await options.telephonyService.savePhoneDeskAftercare(
            callId,
            parsed.data,
            actor,
          ),
        );
        return;
      }

      const phoneDeskResolutionMatch = url.pathname.match(
        /^\/v1\/phone-desk\/calls\/([^/]+)\/resolve$/,
      );
      if (request.method === "POST" && phoneDeskResolutionMatch) {
        if (
          !options?.telephonyService ||
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
        const callId = phoneDeskResolutionMatch[1];
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        if (!callId || !validUuid(callId)) {
          sendJson(response, 400, { error: "invalid_call_id" });
          return;
        }
        const parsed = phoneDeskCallResolutionSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const actor = await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        sendJson(
          response,
          200,
          await options.telephonyService.resolvePhoneDeskCall(
            callId,
            parsed.data,
            actor,
          ),
        );
        return;
      }

      const phoneDeskCallMatch = url.pathname.match(
        /^\/v1\/phone-desk\/calls\/([^/]+)$/,
      );
      if (request.method === "GET" && phoneDeskCallMatch) {
        if (
          !options?.telephonyService ||
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
        const callId = phoneDeskCallMatch[1];
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        if (!callId || !validUuid(callId)) {
          sendJson(response, 400, { error: "invalid_call_id" });
          return;
        }
        await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        sendJson(
          response,
          200,
          await options.telephonyService.getPhoneDeskCall(callId),
        );
        return;
      }

      const phoneDeskFollowUpMatch = url.pathname.match(
        /^\/v1\/phone-desk\/follow-ups\/([^/]+)\/complete$/,
      );
      if (request.method === "POST" && phoneDeskFollowUpMatch) {
        if (
          !options?.telephonyService ||
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
        const taskId = phoneDeskFollowUpMatch[1];
        if (!sessionToken) {
          sendJson(response, 401, { error: "invalid_session" });
          return;
        }
        if (!taskId || !validUuid(taskId)) {
          sendJson(response, 400, { error: "invalid_follow_up_id" });
          return;
        }
        const parsed = phoneDeskFollowUpCompletionSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const actor = await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        sendJson(
          response,
          200,
          await options.telephonyService.completePhoneDeskFollowUp(
            taskId,
            actor,
          ),
        );
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/v1/messages"
      ) {
        if (
          !options?.telephonyService ||
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
        sendJson(
          response,
          200,
          await options.telephonyService.getMessageHub(actor),
        );
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/v1/messages/thread"
      ) {
        if (
          !options?.telephonyService ||
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
        const threadKey = url.searchParams.get("key") ?? "";
        const actor = await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        sendJson(
          response,
          200,
          await options.telephonyService.getMessageThread(threadKey, actor),
        );
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname === "/v1/message-templates"
      ) {
        if (
          !options?.telephonyService ||
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
        sendJson(
          response,
          200,
          await options.telephonyService.listMessageTemplates(actor),
        );
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname === "/v1/message-templates"
      ) {
        if (
          !options?.telephonyService ||
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
        const parsed = messageTemplateCreateSchema.safeParse(
          await readJson(request, MAX_MESSAGE_TEMPLATE_BODY_BYTES),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        sendJson(
          response,
          201,
          await options.telephonyService.createMessageTemplate(
            parsed.data,
            actor,
          ),
        );
        return;
      }

      if (
        request.method === "DELETE" &&
        url.pathname.startsWith("/v1/message-templates/")
      ) {
        if (
          !options?.telephonyService ||
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
        const templateId = url.pathname.slice(
          "/v1/message-templates/".length,
        );
        if (!validUuid(templateId)) {
          sendJson(response, 400, { error: "invalid_template_id" });
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
        sendJson(
          response,
          200,
          await options.telephonyService.deleteMessageTemplate(
            templateId,
            actor,
          ),
        );
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/message-templates/")
      ) {
        if (
          !options?.telephonyService ||
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
        const templateId = url.pathname.slice(
          "/v1/message-templates/".length,
        );
        if (!validUuid(templateId)) {
          sendJson(response, 400, { error: "invalid_template_id" });
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
        const parsed = messageTemplateUpdateSchema.safeParse(
          await readJson(request, MAX_MESSAGE_TEMPLATE_BODY_BYTES),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        sendJson(
          response,
          200,
          await options.telephonyService.updateMessageTemplate(
            templateId,
            parsed.data,
            actor,
          ),
        );
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/consultations/") &&
        url.pathname.endsWith("/legalfriends/invalidate")
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
          -"/legalfriends/invalidate".length,
        );
        if (!validUuid(consultationId)) {
          sendJson(response, 400, { error: "invalid_consultation_id" });
          return;
        }
        const actor = await options.authService.authorize(
          sessionToken,
          [...consultationAccessRoles],
        );
        const result =
          await options.service.invalidateLegalFriendsCase(
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
        const assignmentBody = await readBody(request);
        const assignmentInput = consultationAssignmentInputSchema.safeParse(
          assignmentBody.length > 0 ? parseJson(assignmentBody) : {},
        );
        if (!assignmentInput.success) {
          sendJson(
            response,
            400,
            invalidRequestIssues(assignmentInput.error.issues),
          );
          return;
        }
        const result = await options.service.assignToSelf(
          consultationId,
          actor,
          assignmentInput.data.legalFriendsHandling,
        );
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/consultations/") &&
        url.pathname.endsWith("/messages")
      ) {
        if (
          !options?.telephonyService ||
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
          -"/messages".length,
        );
        if (!validUuid(consultationId)) {
          sendJson(response, 400, { error: "invalid_consultation_id" });
          return;
        }
        const parsed = telephonyMessageSendSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const actor = await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        const result = await options.telephonyService.requestMessage(
          consultationId,
          parsed.data,
          actor,
        );
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/consultations/") &&
        url.pathname.endsWith("/click-to-call")
      ) {
        if (
          !options?.telephonyService ||
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
          -"/click-to-call".length,
        );
        if (!validUuid(consultationId)) {
          sendJson(response, 400, { error: "invalid_consultation_id" });
          return;
        }
        const actor = await options.authService.authorize(
          sessionToken,
          [...consultationAccessRoles],
        );
        const result = await options.telephonyService.requestClickToCall(
          consultationId,
          actor,
        );
        sendJson(response, result.replayed ? 200 : 201, result);
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/v1/telephony-messages/")
      ) {
        if (
          !options?.telephonyService ||
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
        const messageId = url.pathname.slice(
          "/v1/telephony-messages/".length,
        );
        if (!validUuid(messageId)) {
          sendJson(response, 400, { error: "invalid_message_id" });
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
        sendJson(
          response,
          200,
          await options.telephonyService.getMessage(messageId, actor),
        );
        return;
      }

      if (
        request.method === "POST" &&
        url.pathname.startsWith("/v1/telephony-calls/") &&
        url.pathname.endsWith("/disposition")
      ) {
        if (
          !options?.telephonyService ||
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
        const callId = url.pathname.slice(
          "/v1/telephony-calls/".length,
          -"/disposition".length,
        );
        if (!validUuid(callId)) {
          sendJson(response, 400, { error: "invalid_call_id" });
          return;
        }
        const parsed = telephonyCallDispositionConfirmationSchema.safeParse(
          await readJson(request),
        );
        if (!parsed.success) {
          sendJson(response, 400, invalidRequestIssues(parsed.error.issues));
          return;
        }
        const actor = await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        sendJson(
          response,
          200,
          await options.telephonyService.confirmDisposition(
            callId,
            parsed.data.disposition,
            actor,
          ),
        );
        return;
      }

      if (
        request.method === "GET" &&
        url.pathname.startsWith("/v1/telephony-calls/")
      ) {
        if (
          !options?.telephonyService ||
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
        const callId = url.pathname.slice("/v1/telephony-calls/".length);
        if (!validUuid(callId)) {
          sendJson(response, 400, { error: "invalid_call_id" });
          return;
        }
        const actor = await options.authService.authorize(sessionToken, [
          ...consultationAccessRoles,
        ]);
        sendJson(
          response,
          200,
          await options.telephonyService.getCall(callId, actor),
        );
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
          const query = pagedDateQuery(url.searchParams);
          const filter = url.searchParams.get("filter") ?? "all";
          if (
            !query ||
            !["all", "waiting", "mine", "attention", "today"].includes(
              filter,
            )
          ) {
            sendJson(response, 400, { error: "invalid_list_query" });
            return;
          }
          const result = await options.service.list({
            ...query,
            filter: filter as
              | "all"
              | "waiting"
              | "mine"
              | "attention"
              | "today",
            staffUserId: actor.id,
          });
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
            : error.code === "invalid_current_password"
              ? 400
            : error.code === "centrex_provisioning_unavailable"
              ? 503
              : error.code === "email_already_registered" ||
                  error.code === "legalfriends_id_already_registered" ||
                  error.code === "bootstrap_already_completed" ||
                  error.code === "centrex_verification_failed" ||
                  error.code === "centrex_line_mismatch" ||
                  error.code === "centrex_endpoint_conflict" ||
                  error.code === "centrex_bridge_unassigned" ||
                  error.code === "centrex_bridge_busy" ||
                  error.code === "centrex_bridge_active_call" ||
                  error.code === "centrex_bridge_failed"
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
      if (error instanceof CentrexBridgeProvisioningError) {
        sendJson(response, 409, {
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
      if (error instanceof SelfDiagnosisUnavailableError) {
        sendJson(response, 503, {
          error: "diagnosis_unavailable",
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
      if (error instanceof CentrexBridgeAuthenticationError) {
        sendJson(response, 401, { error: "unauthorized" });
        return;
      }
      if (error instanceof CentrexBridgeIngressError) {
        sendJson(
          response,
          error.code === "endpoint_not_found" ? 404 : 409,
          { error: error.code, message: error.message },
        );
        return;
      }
      if (error instanceof CentrexRingCallbackError) {
        sendJson(
          response,
          error.code === "endpoint_not_found" ? 404 : 400,
          { error: error.code },
        );
        return;
      }
      if (error instanceof TelephonyCallError) {
        const statusCode =
          error.code === "consultation_not_found" ||
          error.code === "directory_target_not_found" ||
          error.code === "call_not_found" ||
          error.code === "aftercare_not_found" ||
          error.code === "follow_up_not_found" ||
          error.code === "inbound_call_not_found" ||
          error.code === "inbound_command_not_found" ||
          error.code === "message_not_found" ||
          error.code === "message_thread_not_found" ||
          error.code === "message_template_not_found"
            ? 404
            : error.code === "call_owned_by_other_staff" ||
                error.code === "inbound_call_owned_by_other_staff" ||
                error.code === "message_owned_by_other_staff" ||
                error.code === "message_template_owned_by_other_staff"
              ? 403
              : error.code === "follow_up_due_invalid" ||
                  error.code === "directory_query_invalid" ||
                  error.code === "message_body_invalid" ||
                  error.code === "message_image_invalid"
                ? 400
              : error.code === "feature_disabled" ||
                  error.code === "mms_feature_disabled" ||
                  error.code === "message_image_upload_failed"
                ? 503
                : 409;
        sendJson(response, statusCode, {
          error: error.code,
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
      if (error instanceof LegalFriendsInvalidationError) {
        sendJson(
          response,
          error.code === "consultation_not_found"
            ? 404
            : error.code === "invalidation_forbidden"
              ? 403
              : 409,
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
