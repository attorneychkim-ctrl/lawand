import { eq } from "drizzle-orm";
import { ImapFlow } from "imapflow";

import { naverBookingMailboxCheckpoints } from "@lawand/db";
import type { createDatabaseClient } from "@lawand/db";

import type { DataProtection } from "./crypto.js";
import {
  naverBookingPollIntervalMs,
  parseNaverBookingEmail,
} from "./naver-booking.js";
import type { ConsultationService } from "./service.js";

type Database = ReturnType<typeof createDatabaseClient>["db"];

type WorkerLog = {
  event: string;
  code?: string;
  processed?: number;
  occurredAt: string;
};

function safeErrorCode(error: unknown): string {
  if (
    error instanceof Error &&
    /auth|authentication|login|credential/iu.test(error.message)
  ) {
    return "imap_authentication_failed";
  }
  if (
    error instanceof Error &&
    /^naver_booking_[a-z_]+$/u.test(error.message)
  ) {
    return error.message;
  }
  return "imap_poll_failed";
}

export function createNaverBookingImapWorker(options: {
  db: Database;
  protection: DataProtection;
  service: Pick<ConsultationService, "ingestNaverBooking">;
  user: string;
  appPassword: string;
  mailbox: string;
  now?: () => Date;
  log?: (entry: WorkerLog) => void;
}) {
  const {
    db,
    protection,
    service,
    user,
    appPassword,
    mailbox,
    now = () => new Date(),
    log = (entry) => console.log(JSON.stringify(entry)),
  } = options;
  const mailboxKey = protection
    .fingerprint({ provider: "naver_imap", user, mailbox })
    .toString("hex");
  let stopped = true;
  let timer: NodeJS.Timeout | undefined;
  let currentRun: Promise<void> | undefined;

  async function poll() {
    const client = new ImapFlow({
      host: "imap.naver.com",
      port: 993,
      secure: true,
      auth: { user, pass: appPassword },
      logger: false,
      disableAutoIdle: true,
      tls: { rejectUnauthorized: true },
    });
    try {
      await client.connect();
      const lock = await client.getMailboxLock(mailbox, { readOnly: true });
      try {
        if (!client.mailbox) {
          throw new Error("naver_booking_mailbox_not_selected");
        }
        const currentTime = now();
        const uidValidity = Number(client.mailbox.uidValidity);
        const nextUid = client.mailbox.uidNext;
        const currentLastUid = Math.max(0, nextUid - 1);
        const [checkpoint] = await db
          .select()
          .from(naverBookingMailboxCheckpoints)
          .where(
            eq(naverBookingMailboxCheckpoints.mailboxKey, mailboxKey),
          )
          .limit(1);

        if (!checkpoint) {
          await db.insert(naverBookingMailboxCheckpoints).values({
            mailboxKey,
            uidValidity,
            lastSeenUid: currentLastUid,
            initializedAt: currentTime,
            lastSuccessfulPollAt: currentTime,
            lastErrorCode: null,
            createdAt: currentTime,
            updatedAt: currentTime,
          });
          log({
            event: "naver_booking_imap_checkpoint_initialized",
            occurredAt: currentTime.toISOString(),
          });
          return;
        }

        if (checkpoint.uidValidity !== uidValidity) {
          await db
            .update(naverBookingMailboxCheckpoints)
            .set({
              uidValidity,
              lastSeenUid: currentLastUid,
              initializedAt: currentTime,
              lastSuccessfulPollAt: currentTime,
              lastErrorCode: null,
              updatedAt: currentTime,
            })
            .where(
              eq(naverBookingMailboxCheckpoints.mailboxKey, mailboxKey),
            );
          log({
            event: "naver_booking_imap_uidvalidity_reset",
            occurredAt: currentTime.toISOString(),
          });
          return;
        }

        const firstUid = checkpoint.lastSeenUid + 1;
        const lastUid = currentLastUid;
        let processed = 0;
        if (firstUid <= lastUid) {
          for await (const message of client.fetch(
            `${firstUid}:${lastUid}`,
            {
              source: { maxLength: 1_048_576 },
              internalDate: true,
            },
            { uid: true },
          )) {
            if (!message.source) {
              throw new Error("naver_booking_message_source_missing");
            }
            const fallbackReceivedAt =
              message.internalDate instanceof Date
                ? message.internalDate
                : new Date(message.internalDate ?? currentTime);
            const booking = await parseNaverBookingEmail(message.source, {
              sourceMessageUid: message.uid,
              fallbackReceivedAt,
            });
            if (booking) {
              await service.ingestNaverBooking(booking);
              processed += 1;
            }
          }
        }

        await db
          .update(naverBookingMailboxCheckpoints)
          .set({
            lastSeenUid: lastUid,
            lastSuccessfulPollAt: currentTime,
            lastErrorCode: null,
            updatedAt: currentTime,
          })
          .where(
            eq(naverBookingMailboxCheckpoints.mailboxKey, mailboxKey),
          );
        if (processed > 0) {
          log({
            event: "naver_booking_imap_processed",
            processed,
            occurredAt: currentTime.toISOString(),
          });
        }
      } finally {
        lock.release();
      }
    } catch (error) {
      const currentTime = now();
      const code = safeErrorCode(error);
      await db
        .update(naverBookingMailboxCheckpoints)
        .set({
          lastErrorCode: code,
          updatedAt: currentTime,
        })
        .where(eq(naverBookingMailboxCheckpoints.mailboxKey, mailboxKey))
        .catch(() => undefined);
      log({
        event: "naver_booking_imap_failed",
        code,
        occurredAt: currentTime.toISOString(),
      });
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  function scheduleNext() {
    if (stopped) return;
    timer = setTimeout(() => {
      currentRun = poll().finally(() => {
        currentRun = undefined;
        scheduleNext();
      });
    }, naverBookingPollIntervalMs(now()));
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      currentRun = poll().finally(() => {
        currentRun = undefined;
        scheduleNext();
      });
    },
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await currentRun;
    },
    poll,
  };
}
