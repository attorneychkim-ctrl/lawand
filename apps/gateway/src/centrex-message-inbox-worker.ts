import {
  and,
  desc,
  eq,
  inArray,
  lte,
  sql,
} from "drizzle-orm";

import {
  centrexMessageByteLength,
  centrexMessageKind,
  createEventId,
} from "@lawand/core";
import {
  consultationAssignments,
  legalFriendsCaseLinks,
  staffMemberships,
  staffUsers,
  telephonyEndpointCredentials,
  telephonyEndpoints,
  telephonyInboundMessageNotifications,
  telephonyInboundMessages,
  telephonyMessageDirectoryTargets,
  telephonyMessageMailboxStates,
  telephonyMessages,
} from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { CentrexClient, CentrexReceivedMessageRecord } from "./centrex.js";
import { CentrexDeliveryError } from "./centrex.js";
import type { CentrexCredentialVault } from "./centrex-credential-vault.js";
import type { DataProtection } from "./crypto.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];
type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const PROVIDER_CLOCK_SKEW_MS = 5 * 60_000;

export function centrexMailboxPollPage(input: {
  nextPage: number | null;
  pollBackfillNext: boolean | null;
}): number {
  return input.pollBackfillNext && (input.nextPage ?? 1) > 1
    ? (input.nextPage ?? 1)
    : 1;
}

export function centrexMailboxNextCheckpoint(input: {
  requestedPage: number;
  storedNextPage: number | null;
  backfillCompletedAt: Date | null;
  resultPage: number;
  pageSize: number;
  total: number;
  syncedAt: Date;
}) {
  const hasMore =
    input.pageSize > 0 && input.resultPage * input.pageSize < input.total;
  const wasBackfillPage = input.requestedPage > 1;
  const shouldStartOrContinueBackfill =
    !wasBackfillPage && input.backfillCompletedAt === null && hasMore;
  return {
    nextPage: wasBackfillPage
      ? hasMore
        ? input.resultPage + 1
        : 1
      : shouldStartOrContinueBackfill
        ? Math.max(2, input.storedNextPage ?? 1)
        : input.storedNextPage ?? 1,
    pollBackfillNext: wasBackfillPage
      ? false
      : shouldStartOrContinueBackfill,
    backfillCompletedAt:
      wasBackfillPage && !hasMore
        ? input.syncedAt
        : input.backfillCompletedAt,
  };
}

export function parseCentrexReceivedAt(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    throw new Error("invalid_centrex_received_at");
  }
  const parsed = new Date(`${value.replace(" ", "T")}+09:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("invalid_centrex_received_at");
  }
  return parsed;
}

export function centrexInboundSourceIdentity(
  record: Pick<CentrexReceivedMessageRecord, "source" | "sourceKind">,
): {
  fingerprintInput: unknown;
  matchOutbound: boolean;
} {
  if (record.sourceKind === "phone") {
    return {
      fingerprintInput: record.source,
      matchOutbound: true,
    };
  }
  return {
    fingerprintInput: {
      provider: "centrex",
      sourceKind: "provider_opaque",
      source: record.source,
    },
    matchOutbound: false,
  };
}

function workerFailureCode(error: unknown): string {
  if (error instanceof CentrexDeliveryError) return error.code;
  if (error instanceof Error && /^[a-z0-9_]{3,100}$/.test(error.message)) {
    return error.message;
  }
  return "message_inbox_sync_failed";
}

export function createCentrexMessageInboxWorker(options: {
  db: Database;
  protection: DataProtection;
  centrexClient: CentrexClient;
  credentialVault: CentrexCredentialVault;
  pollIntervalMs?: number;
  now?: () => Date;
}) {
  const {
    db,
    protection,
    centrexClient,
    credentialVault,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    now = () => new Date(),
  } = options;
  let stopped = true;
  let timer: NodeJS.Timeout | undefined;
  let currentRun: Promise<void> | undefined;

  async function nextMailbox() {
    const [mailbox] = await db
      .select({
        endpointId: telephonyEndpoints.id,
        lineNumber: telephonyEndpoints.lineNumber,
        apiLoginId: telephonyEndpoints.apiLoginId,
        credentialKey: telephonyEndpoints.credentialKey,
        nextPage: telephonyMessageMailboxStates.nextPage,
        pollBackfillNext: telephonyMessageMailboxStates.pollBackfillNext,
        backfillCompletedAt:
          telephonyMessageMailboxStates.backfillCompletedAt,
      })
      .from(telephonyEndpoints)
      .innerJoin(
        telephonyEndpointCredentials,
        eq(telephonyEndpointCredentials.endpointId, telephonyEndpoints.id),
      )
      .leftJoin(
        telephonyMessageMailboxStates,
        eq(telephonyMessageMailboxStates.endpointId, telephonyEndpoints.id),
      )
      .where(
        and(
          eq(telephonyEndpoints.provider, "centrex"),
          eq(telephonyEndpoints.endpointType, "representative"),
          eq(telephonyEndpoints.isActive, true),
        ),
      )
      .orderBy(
        sql`GREATEST(
          COALESCE(${telephonyMessageMailboxStates.lastSyncedAt}, '-infinity'::timestamptz),
          COALESCE(${telephonyMessageMailboxStates.lastFailedAt}, '-infinity'::timestamptz)
        ) ASC`,
        telephonyEndpoints.lineNumber,
      )
      .limit(1);
    return mailbox ?? null;
  }

  async function matchOutbound(
    remotePhoneFingerprint: Buffer,
    receivedAt: Date,
    executor: Database | DatabaseTransaction = db,
  ) {
    const [match] = await executor
      .select({
        id: telephonyMessages.id,
        staffUserId: telephonyMessages.staffUserId,
        targetSource: telephonyMessages.targetSource,
        consultationId: telephonyMessages.consultationId,
        directoryClientIdx: telephonyMessageDirectoryTargets.clientIdx,
        directoryCaseIdx: telephonyMessageDirectoryTargets.caseIdx,
        manualContactId: telephonyMessages.manualContactId,
      })
      .from(telephonyMessages)
      .leftJoin(
        telephonyMessageDirectoryTargets,
        eq(
          telephonyMessageDirectoryTargets.telephonyMessageId,
          telephonyMessages.id,
        ),
      )
      .where(
        and(
          eq(telephonyMessages.remotePhoneFingerprint, remotePhoneFingerprint),
          inArray(telephonyMessages.commandStatus, ["succeeded", "unknown"]),
          lte(telephonyMessages.requestedAt, receivedAt),
        ),
      )
      .orderBy(desc(telephonyMessages.requestedAt))
      .limit(1);
    if (!match) return null;
    if (
      match.targetSource === "legal_friends_directory" &&
      (!match.directoryClientIdx || !match.directoryCaseIdx)
    ) {
      return null;
    }
    if (match.targetSource === "consultation" && !match.consultationId) {
      return null;
    }
    if (match.targetSource === "manual" && !match.manualContactId) {
      return null;
    }
    return match;
  }

  async function importRecord(
    endpointId: string,
    record: CentrexReceivedMessageRecord,
    fetchedAt: Date,
  ): Promise<Date | null> {
    const receivedAt = parseCentrexReceivedAt(record.time);
    if (receivedAt.getTime() > fetchedAt.getTime() + PROVIDER_CLOCK_SKEW_MS) {
      throw new Error("centrex_received_at_in_future");
    }
    const bodyByteLength = centrexMessageByteLength(record.message);
    const messageKind = centrexMessageKind(record.message);
    if (messageKind === "too_long") {
      throw new Error("centrex_received_message_too_long");
    }
    const sourceIdentity = centrexInboundSourceIdentity(record);
    const remotePhoneFingerprint = protection.fingerprint(
      sourceIdentity.fingerprintInput,
    );
    const providerIdentityFingerprint = protection.fingerprint({
      provider: "centrex",
      endpointId,
      sequence: record.number,
      time: record.time,
      source: record.source,
      message: record.message,
    });
    const [existing] = await db
      .select({ id: telephonyInboundMessages.id })
      .from(telephonyInboundMessages)
      .where(
        and(
          eq(telephonyInboundMessages.endpointId, endpointId),
          eq(
            telephonyInboundMessages.providerIdentityFingerprint,
            providerIdentityFingerprint,
          ),
        ),
      )
      .limit(1);
    if (existing) return null;

    const inboundMessageId = createEventId();
    const phoneEncrypted = protection.encrypt(
      record.source,
      `telephony_inbound_messages/${inboundMessageId}/remote_phone`,
    );
    const bodyEncrypted = protection.encrypt(
      record.message,
      `telephony_inbound_messages/${inboundMessageId}/body`,
    );
    return db.transaction(async (tx) => {
    const match = sourceIdentity.matchOutbound
      ? await matchOutbound(remotePhoneFingerprint, receivedAt, tx)
      : null;
    const [inserted] = await tx
      .insert(telephonyInboundMessages)
      .values({
        id: inboundMessageId,
        provider: "centrex",
        endpointId,
        providerSequence: record.number,
        providerIdentityFingerprint,
        remotePhoneFingerprint,
        remotePhoneCiphertext: phoneEncrypted.ciphertext,
        remotePhoneNonce: phoneEncrypted.nonce,
        remotePhoneKeyVersion: phoneEncrypted.keyVersion,
        bodyCiphertext: bodyEncrypted.ciphertext,
        bodyNonce: bodyEncrypted.nonce,
        bodyKeyVersion: bodyEncrypted.keyVersion,
        bodyFingerprint: protection.fingerprint(record.message),
        messageKind,
        bodyByteLength,
        matchedOutboundMessageId: match?.id ?? null,
        targetSource: match?.targetSource ?? null,
        consultationId:
          match?.targetSource === "consultation"
            ? match.consultationId
            : null,
        directoryClientIdx:
          match?.targetSource === "legal_friends_directory"
            ? match.directoryClientIdx
            : null,
        directoryCaseIdx:
          match?.targetSource === "legal_friends_directory"
            ? match.directoryCaseIdx
            : null,
        manualContactId:
          match?.targetSource === "manual"
            ? match.manualContactId
            : null,
        matchStrategy: match ? "latest_outbound" : "unmatched",
        receivedAt,
        fetchedAt,
        createdAt: fetchedAt,
        updatedAt: fetchedAt,
      })
      .onConflictDoNothing({
        target: [
          telephonyInboundMessages.endpointId,
          telephonyInboundMessages.providerIdentityFingerprint,
        ],
      })
      .returning({ id: telephonyInboundMessages.id });
    if (!inserted) return null;

    const targets = new Map<string, "latest_sender" | "consultation_assignee" | "unmatched_admin">();
    if (match?.staffUserId) targets.set(match.staffUserId, "latest_sender");
    if (match?.consultationId) {
      const [assignment] = await tx
        .select({ staffUserId: consultationAssignments.assigneeUserId })
        .from(consultationAssignments)
        .where(eq(consultationAssignments.consultationId, match.consultationId))
        .limit(1);
      if (assignment && !targets.has(assignment.staffUserId)) {
        targets.set(assignment.staffUserId, "consultation_assignee");
      }
    }
    if (!match) {
      const admins = await tx
        .selectDistinct({ staffUserId: staffMemberships.userId })
        .from(staffMemberships)
        .innerJoin(staffUsers, eq(staffUsers.id, staffMemberships.userId))
        .where(
          and(
            eq(staffMemberships.isActive, true),
            eq(staffMemberships.role, "admin"),
            eq(staffUsers.status, "active"),
          ),
        );
      for (const admin of admins) {
        targets.set(admin.staffUserId, "unmatched_admin");
      }
    }
    if (targets.size > 0) {
      await tx.insert(telephonyInboundMessageNotifications).values(
        [...targets].map(([staffUserId, reason]) => ({
          inboundMessageId,
          staffUserId,
          reason,
          createdAt: fetchedAt,
          updatedAt: fetchedAt,
        })),
      );
    }
    const [caseLink] = match?.consultationId
      ? await tx
          .select({ caseIdx: legalFriendsCaseLinks.caseIdx })
          .from(legalFriendsCaseLinks)
          .where(eq(legalFriendsCaseLinks.consultationId, match.consultationId))
          .limit(1)
      : [];
    const threadKey =
      match?.targetSource === "legal_friends_directory" && match.directoryCaseIdx
        ? `case:${match.directoryCaseIdx}`
        : match?.targetSource === "manual" && match.manualContactId
          ? `manual:${match.manualContactId}`
          : caseLink?.caseIdx
            ? `case:${caseLink.caseIdx}`
            : match?.consultationId
              ? `consultation:${match.consultationId}`
              : `unmatched:${inboundMessageId}`;
    await tx.execute(sql`select pg_notify('lawand_message_events', ${JSON.stringify({
      eventId: inboundMessageId,
      eventType: "message.received",
      messageId: inboundMessageId,
      threadKey,
      targetUserIds: [...targets.keys()],
      occurredAt: receivedAt.toISOString(),
    })})`);
    return receivedAt;
    });
  }

  async function runOnce(): Promise<boolean> {
    const mailbox = await nextMailbox();
    if (!mailbox) return false;
    const syncedAt = now();
    try {
      const passwordSha512 = await credentialVault.get({
        endpointId: mailbox.endpointId,
        credentialKey: mailbox.credentialKey,
      });
      if (!passwordSha512) throw new Error("credential_not_configured");
      const page = centrexMailboxPollPage(mailbox);
      const result = await centrexClient.getReceivedMessages({
        apiLoginId: mailbox.apiLoginId,
        passwordSha512,
        page,
      });
      let latestImportedAt: Date | null = null;
      let importedCount = 0;
      for (const record of result.records) {
        const importedAt = await importRecord(
          mailbox.endpointId,
          record,
          syncedAt,
        );
        if (importedAt && (!latestImportedAt || importedAt > latestImportedAt)) {
          latestImportedAt = importedAt;
        }
        if (importedAt) importedCount += 1;
      }
      const { nextPage, pollBackfillNext, backfillCompletedAt } =
        centrexMailboxNextCheckpoint({
          requestedPage: page,
          storedNextPage: mailbox.nextPage,
          backfillCompletedAt: mailbox.backfillCompletedAt,
          resultPage: result.page,
          pageSize: result.pageSize,
          total: result.total,
          syncedAt,
        });
      await db
        .insert(telephonyMessageMailboxStates)
        .values({
          endpointId: mailbox.endpointId,
          nextPage,
          pollBackfillNext,
          backfillCompletedAt,
          lastSyncedAt: syncedAt,
          lastFailedAt: null,
          lastErrorCode: null,
          lastImportedMessageAt: latestImportedAt,
          createdAt: syncedAt,
          updatedAt: syncedAt,
        })
        .onConflictDoUpdate({
          target: telephonyMessageMailboxStates.endpointId,
          set: {
            nextPage,
            pollBackfillNext,
            backfillCompletedAt,
            lastSyncedAt: syncedAt,
            lastFailedAt: null,
            lastErrorCode: null,
            ...(latestImportedAt
              ? { lastImportedMessageAt: latestImportedAt }
              : {}),
            updatedAt: syncedAt,
          },
        });
      await db
        .update(telephonyEndpoints)
        .set({
          lastAuthSucceededAt: syncedAt,
          lastAuthFailedAt: null,
          updatedAt: syncedAt,
        })
        .where(eq(telephonyEndpoints.id, mailbox.endpointId));
      if (latestImportedAt) {
        console.log(
          JSON.stringify({
            event: "centrex_message_inbox_imported",
            endpointId: mailbox.endpointId,
            importedCount,
            occurredAt: syncedAt.toISOString(),
          }),
        );
      }
      return true;
    } catch (error) {
      const errorCode = workerFailureCode(error);
      await db
        .insert(telephonyMessageMailboxStates)
        .values({
          endpointId: mailbox.endpointId,
          nextPage: mailbox.nextPage ?? 1,
          lastSyncedAt: null,
          lastFailedAt: syncedAt,
          lastErrorCode: errorCode,
          createdAt: syncedAt,
          updatedAt: syncedAt,
        })
        .onConflictDoUpdate({
          target: telephonyMessageMailboxStates.endpointId,
          set: {
            lastFailedAt: syncedAt,
            lastErrorCode: errorCode,
            updatedAt: syncedAt,
          },
        });
      if (
        error instanceof CentrexDeliveryError &&
        error.code === "authentication_failed"
      ) {
        await db
          .update(telephonyEndpoints)
          .set({ lastAuthFailedAt: syncedAt, updatedAt: syncedAt })
          .where(eq(telephonyEndpoints.id, mailbox.endpointId));
      }
      console.warn(
        JSON.stringify({
          event: "centrex_message_inbox_sync_failed",
          endpointId: mailbox.endpointId,
          errorCode,
          occurredAt: syncedAt.toISOString(),
        }),
      );
      return true;
    }
  }

  async function runCycle() {
    await runOnce();
  }

  function schedule() {
    if (stopped) return;
    timer = setTimeout(() => {
      currentRun = runCycle()
        .catch((error) =>
          console.error("centrex message inbox worker loop failed", error),
        )
        .finally(() => {
          currentRun = undefined;
          schedule();
        });
    }, pollIntervalMs);
  }

  function start() {
    if (!stopped) return;
    stopped = false;
    currentRun = runCycle()
      .catch((error) =>
        console.error("centrex message inbox worker initial run failed", error),
      )
      .finally(() => {
        currentRun = undefined;
        schedule();
      });
  }

  async function stop() {
    stopped = true;
    if (timer) clearTimeout(timer);
    await currentRun;
  }

  return { runOnce, start, stop };
}

export type CentrexMessageInboxWorker = ReturnType<
  typeof createCentrexMessageInboxWorker
>;
