import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type {
  AttributionSource,
  PlatformEvent,
  StaffRole,
} from "@lawand/core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const consultationStateEnum = pgEnum("consultation_state", [
  "requested",
  "assigned",
  "contacted",
  "completed",
  "engaged",
  "closed",
]);

export const consultationModeEnum = pgEnum("consultation_mode", [
  "quick",
  "detailed",
  "self_diagnosis",
]);

export const consultationContactChannelEnum = pgEnum(
  "consultation_contact_channel",
  ["phone", "kakao_channel", "naver_booking"],
);

export const dedupeOutcomeEnum = pgEnum("dedupe_outcome", [
  "new",
  "exact_duplicate",
  "identity_enrichment",
  "suspected_duplicate",
]);

export const contactPreferenceEnum = pgEnum("contact_preference", [
  "as_soon_as_possible",
  "scheduled_window",
]);

export const privacyBasisEnum = pgEnum("privacy_basis", [
  "explicit_consent",
  "customer_initiated_channel_message",
  "customer_initiated_channel_entry",
  "customer_initiated_booking",
  "staff_recorded_phone_interaction",
]);

export const kakaoHomepageEntryStatusEnum = pgEnum(
  "kakao_homepage_entry_status",
  ["pending", "confirmed", "invalid"],
);

export const naverBookingEntryStatusEnum = pgEnum(
  "naver_booking_entry_status",
  ["details_pending", "ready", "cancelled"],
);

export const landingPageStatusEnum = pgEnum("landing_page_status", [
  "draft",
  "active",
  "retired",
]);

export const journeyEventTypeEnum = pgEnum("journey_event_type", [
  "page_view",
  "consultation_cta_clicked",
]);

export const outboxStatusEnum = pgEnum("outbox_status", [
  "pending",
  "published",
  "dead",
]);

export const outboxDeliveryAttemptStatusEnum = pgEnum(
  "outbox_delivery_attempt_status",
  ["started", "succeeded", "retry_scheduled", "dead"],
);

export const reviewPracticeAreaEnum = pgEnum("review_practice_area", [
  "personal_rehabilitation",
  "personal_bankruptcy",
  "other",
]);

export const reviewProgressStageEnum = pgEnum("review_progress_stage", [
  "consultation",
  "commencement",
  "discharge",
  "other",
]);

export const reviewPublicationStatusEnum = pgEnum(
  "review_publication_status",
  ["published", "review_required", "withheld"],
);

export const reviewPiiStatusEnum = pgEnum("review_pii_status", [
  "clear",
  "flagged",
  "reviewed",
]);

export const reviewSubmissionStatusEnum = pgEnum("review_submission_status", [
  "pending_review",
  "published",
  "rejected",
  "withdrawn",
]);

export const caseStudyPracticeAreaEnum = pgEnum("case_study_practice_area", [
  "personal_rehabilitation",
  "personal_bankruptcy",
]);

export const caseStudyPublicationStatusEnum = pgEnum(
  "case_study_publication_status",
  ["draft", "preview", "published", "withdrawn"],
);

export const caseStudyReviewStatusEnum = pgEnum("case_study_review_status", [
  "pending",
  "approved",
  "rejected",
]);

export const staffAccountStatusEnum = pgEnum("staff_account_status", [
  "active",
  "disabled",
]);

export const staffRoleEnum = pgEnum("staff_role", [
  "admin",
  "full_time",
  "part_time",
  "separate_accounting",
  "civil_complaint_vendor",
]);

export const telephonyProviderEnum = pgEnum("telephony_provider", [
  "centrex",
]);

export const telephonyEndpointTypeEnum = pgEnum(
  "telephony_endpoint_type",
  ["personal", "representative"],
);

export const telephonyCallDirectionEnum = pgEnum(
  "telephony_call_direction",
  ["outbound", "inbound"],
);

export const telephonyCommandStatusEnum = pgEnum(
  "telephony_command_status",
  ["queued", "dispatching", "succeeded", "failed", "unknown"],
);

export const telephonyMessageKindEnum = pgEnum(
  "telephony_message_kind",
  ["sms", "lms", "mms"],
);

export const telephonyMessageProviderEnum = pgEnum(
  "telephony_message_provider",
  ["centrex", "solapi"],
);

export const telephonyCallOutcomeEnum = pgEnum("telephony_call_outcome", [
  "unknown",
  "answered",
  "no_answer",
  "busy",
  "failed",
  "cancelled",
]);

export const telephonyCallDispositionEnum = pgEnum(
  "telephony_call_disposition",
  [
    "customer_conversation",
    "voicemail",
    "no_answer",
    "rejected",
    "busy",
    "caller_cancelled",
    "callback_required",
  ],
);

export const telephonyAftercareResultEnum = pgEnum(
  "telephony_aftercare_result",
  [
    "consultation_completed",
    "reconsultation_required",
    "no_answer",
    "busy",
    "manager_callback_requested",
    "rejected",
    "public_institution",
    "creditor",
    "wrong_number",
    "other",
  ],
);

export const telephonyFollowUpStateEnum = pgEnum(
  "telephony_follow_up_state",
  ["open", "completed", "cancelled"],
);

export const telephonyInboundCallStateEnum = pgEnum(
  "telephony_inbound_call_state",
  ["ringing", "connected", "ended"],
);

export const telephonyInboundCommandStatusEnum = pgEnum(
  "telephony_inbound_command_status",
  ["queued", "dispatching", "succeeded", "failed", "expired"],
);

export const telephonyBridgeEventTypeEnum = pgEnum(
  "telephony_bridge_event_type",
  [
    "inbound.ringing",
    "inbound.connected",
    "inbound.ended",
    "outbound.ringing",
    "outbound.connected",
    "outbound.ended",
  ],
);

export const staffOrganizations = pgTable("staff_organizations", {
  key: varchar("key", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
});

export const staffRegions = pgTable("staff_regions", {
  key: varchar("key", { length: 50 }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  ...timestamps,
});

export const staffUsers = pgTable(
  "staff_users",
  {
    id: uuid("id").primaryKey(),
    email: varchar("email", { length: 254 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    status: staffAccountStatusEnum("status").default("active").notNull(),
    failedLoginCount: integer("failed_login_count").default(0).notNull(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    passwordChangedAt: timestamp("password_changed_at", {
      withTimezone: true,
    }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("staff_users_email_uidx").on(table.email),
    check(
      "staff_users_email_normalized",
      sql`${table.email} = lower(btrim(${table.email}))`,
    ),
    check(
      "staff_users_failed_login_nonnegative",
      sql`${table.failedLoginCount} >= 0`,
    ),
  ],
);

export const staffProfiles = pgTable(
  "staff_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    displayName: varchar("display_name", { length: 50 }).notNull(),
    centrexLineNumber: varchar("centrex_line_number", { length: 20 }),
    centrexExtension: varchar("centrex_extension", { length: 20 }),
    ...timestamps,
  },
  (table) => [
    check(
      "staff_profiles_centrex_line_number_format",
      sql`${table.centrexLineNumber} IS NULL OR ${table.centrexLineNumber} ~ '^070[0-9]{8}$'`,
    ),
    check(
      "staff_profiles_centrex_extension_format",
      sql`${table.centrexExtension} IS NULL OR ${table.centrexExtension} ~ '^[0-9]{2,10}$'`,
    ),
    check(
      "staff_profiles_centrex_pair",
      sql`(${table.centrexLineNumber} IS NULL) = (${table.centrexExtension} IS NULL)`,
    ),
  ],
);

export const staffMemberships = pgTable(
  "staff_memberships",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    organizationKey: varchar("organization_key", { length: 50 })
      .notNull()
      .references(() => staffOrganizations.key, { onDelete: "restrict" }),
    regionKey: varchar("region_key", { length: 50 })
      .notNull()
      .references(() => staffRegions.key, { onDelete: "restrict" }),
    department: varchar("department", { length: 100 }).notNull(),
    jobTitle: varchar("job_title", { length: 100 }).notNull(),
    role: staffRoleEnum("role").$type<StaffRole>().notNull(),
    isPrimary: boolean("is_primary").default(true).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    assignedByUserId: uuid("assigned_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
  },
  (table) => [
    uniqueIndex("staff_memberships_user_org_region_uidx").on(
      table.userId,
      table.organizationKey,
      table.regionKey,
    ),
    uniqueIndex("staff_memberships_primary_user_uidx")
      .on(table.userId)
      .where(sql`${table.isPrimary} = true AND ${table.isActive} = true`),
    index("staff_memberships_role_idx").on(table.role),
    index("staff_memberships_org_region_idx").on(
      table.organizationKey,
      table.regionKey,
    ),
  ],
);

export const staffInvitations = pgTable(
  "staff_invitations",
  {
    id: uuid("id").primaryKey(),
    email: varchar("email", { length: 254 }).notNull(),
    displayName: varchar("display_name", { length: 50 }).notNull(),
    organizationKey: varchar("organization_key", { length: 50 })
      .notNull()
      .references(() => staffOrganizations.key, { onDelete: "restrict" }),
    regionKey: varchar("region_key", { length: 50 })
      .notNull()
      .references(() => staffRegions.key, { onDelete: "restrict" }),
    department: varchar("department", { length: 100 }).notNull(),
    jobTitle: varchar("job_title", { length: 100 }).notNull(),
    role: staffRoleEnum("role").$type<StaffRole>().notNull(),
    centrexLineNumber: varchar("centrex_line_number", { length: 20 }),
    centrexExtension: varchar("centrex_extension", { length: 20 }),
    legalFriendsAccountId: varchar("legalfriends_account_id", {
      length: 100,
    }),
    legalFriendsMemberIdx: integer("legalfriends_member_idx"),
    tokenHash: bytea("token_hash").notNull(),
    invitedByUserId: uuid("invited_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("staff_invitations_token_hash_uidx").on(table.tokenHash),
    index("staff_invitations_email_created_idx").on(
      table.email,
      table.createdAt,
    ),
    uniqueIndex("staff_invitations_pending_legalfriends_uidx")
      .on(table.legalFriendsAccountId)
      .where(
        sql`${table.legalFriendsAccountId} IS NOT NULL
          AND ${table.acceptedAt} IS NULL
          AND ${table.revokedAt} IS NULL`,
      ),
    uniqueIndex("staff_invitations_pending_legalfriends_member_idx_uidx")
      .on(table.legalFriendsMemberIdx)
      .where(
        sql`${table.legalFriendsMemberIdx} IS NOT NULL
          AND ${table.acceptedAt} IS NULL
          AND ${table.revokedAt} IS NULL`,
      ),
    check(
      "staff_invitations_email_normalized",
      sql`${table.email} = lower(btrim(${table.email}))`,
    ),
    check(
      "staff_invitations_token_hash_length",
      sql`octet_length(${table.tokenHash}) = 32`,
    ),
    check(
      "staff_invitations_expiry_after_creation",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "staff_invitations_terminal_state",
      sql`${table.acceptedAt} IS NULL OR ${table.revokedAt} IS NULL`,
    ),
    check(
      "staff_invitations_legalfriends_member_idx_positive",
      sql`${table.legalFriendsMemberIdx} IS NULL OR ${table.legalFriendsMemberIdx} > 0`,
    ),
    check(
      "staff_invitations_centrex_line_number_format",
      sql`${table.centrexLineNumber} IS NULL OR ${table.centrexLineNumber} ~ '^070[0-9]{8}$'`,
    ),
    check(
      "staff_invitations_centrex_extension_format",
      sql`${table.centrexExtension} IS NULL OR ${table.centrexExtension} ~ '^[0-9]{2,10}$'`,
    ),
    check(
      "staff_invitations_centrex_pair",
      sql`(${table.centrexLineNumber} IS NULL) = (${table.centrexExtension} IS NULL)`,
    ),
  ],
);

export const staffSessions = pgTable(
  "staff_sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    tokenHash: bytea("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("staff_sessions_token_hash_uidx").on(table.tokenHash),
    index("staff_sessions_user_expires_idx").on(
      table.userId,
      table.expiresAt,
    ),
    check(
      "staff_sessions_token_hash_length",
      sql`octet_length(${table.tokenHash}) = 32`,
    ),
    check(
      "staff_sessions_expiry_after_creation",
      sql`${table.expiresAt} > ${table.createdAt}`,
    ),
    check(
      "staff_sessions_seen_after_creation",
      sql`${table.lastSeenAt} >= ${table.createdAt}`,
    ),
  ],
);

export const staffExternalAccounts = pgTable(
  "staff_external_accounts",
  {
    id: uuid("id").primaryKey(),
    provider: varchar("provider", { length: 50 }).notNull(),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    externalAccountId: varchar("external_account_id", {
      length: 200,
    }).notNull(),
    externalMemberIdx: integer("external_member_idx"),
    isActive: boolean("is_active").default(true).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("staff_external_accounts_active_provider_staff_uidx")
      .on(table.provider, table.staffUserId)
      .where(sql`${table.isActive} = true`),
    uniqueIndex("staff_external_accounts_active_provider_external_uidx")
      .on(table.provider, table.externalAccountId)
      .where(sql`${table.isActive} = true`),
    uniqueIndex(
      "staff_external_accounts_active_provider_member_idx_uidx",
    )
      .on(table.provider, table.externalMemberIdx)
      .where(
        sql`${table.isActive} = true AND ${table.externalMemberIdx} IS NOT NULL`,
      ),
    check(
      "staff_external_accounts_provider_allowed",
      sql`${table.provider} IN ('legalfriends')`,
    ),
    check(
      "staff_external_accounts_external_id_nonempty",
      sql`length(btrim(${table.externalAccountId})) > 0`,
    ),
    check(
      "staff_external_accounts_member_idx_positive",
      sql`${table.externalMemberIdx} IS NULL OR ${table.externalMemberIdx} > 0`,
    ),
  ],
);

export const telephonyEndpoints = pgTable(
  "telephony_endpoints",
  {
    id: uuid("id").primaryKey(),
    provider: telephonyProviderEnum("provider").default("centrex").notNull(),
    endpointType: telephonyEndpointTypeEnum("endpoint_type")
      .default("personal")
      .notNull(),
    label: varchar("label", { length: 100 }).notNull(),
    lineNumber: varchar("line_number", { length: 20 }).notNull(),
    extension: varchar("extension", { length: 20 }).notNull(),
    apiLoginId: varchar("api_login_id", { length: 50 }).notNull(),
    credentialKey: varchar("credential_key", { length: 100 }).notNull(),
    regionKey: varchar("region_key", { length: 50 }).references(
      () => staffRegions.key,
      { onDelete: "restrict" },
    ),
    isActive: boolean("is_active").default(true).notNull(),
    passwordExpiresAt: timestamp("password_expires_at", {
      withTimezone: true,
    }),
    lastAuthSucceededAt: timestamp("last_auth_succeeded_at", {
      withTimezone: true,
    }),
    lastAuthFailedAt: timestamp("last_auth_failed_at", {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telephony_endpoints_active_provider_line_uidx")
      .on(table.provider, table.lineNumber)
      .where(sql`${table.isActive} = true`),
    uniqueIndex("telephony_endpoints_active_provider_login_uidx")
      .on(table.provider, table.apiLoginId)
      .where(sql`${table.isActive} = true`),
    check(
      "telephony_endpoints_label_nonempty",
      sql`length(btrim(${table.label})) > 0`,
    ),
    check(
      "telephony_endpoints_line_number_format",
      sql`${table.lineNumber} ~ '^070[0-9]{8}$'`,
    ),
    check(
      "telephony_endpoints_extension_format",
      sql`${table.extension} ~ '^[0-9]{2,10}$'`,
    ),
    check(
      "telephony_endpoints_api_login_format",
      sql`${table.apiLoginId} ~ '^[0-9]{8,50}$'`,
    ),
    check(
      "telephony_endpoints_credential_key_format",
      sql`${table.credentialKey} ~ '^[a-z0-9][a-z0-9._-]{0,99}$'`,
    ),
  ],
);

export const telephonyEndpointCredentials = pgTable(
  "telephony_endpoint_credentials",
  {
    endpointId: uuid("endpoint_id")
      .primaryKey()
      .references(() => telephonyEndpoints.id, { onDelete: "restrict" }),
    passwordSha512Ciphertext: bytea("password_sha512_ciphertext").notNull(),
    passwordSha512Nonce: bytea("password_sha512_nonce").notNull(),
    passwordSha512KeyVersion: varchar("password_sha512_key_version", {
      length: 50,
    }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    verifiedByUserId: uuid("verified_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    ...timestamps,
  },
  (table) => [
    check(
      "telephony_endpoint_credentials_ciphertext_length",
      sql`octet_length(${table.passwordSha512Ciphertext}) >= 17`,
    ),
    check(
      "telephony_endpoint_credentials_nonce_length",
      sql`octet_length(${table.passwordSha512Nonce}) = 12`,
    ),
    check(
      "telephony_endpoint_credentials_key_version_nonempty",
      sql`length(btrim(${table.passwordSha512KeyVersion})) > 0`,
    ),
  ],
);

export const staffTelephonyBindings = pgTable(
  "staff_telephony_bindings",
  {
    id: uuid("id").primaryKey(),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => telephonyEndpoints.id, { onDelete: "restrict" }),
    isPrimary: boolean("is_primary").default(true).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    assignedByUserId: uuid("assigned_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("staff_telephony_bindings_active_staff_endpoint_uidx")
      .on(table.staffUserId, table.endpointId)
      .where(sql`${table.isActive} = true`),
    uniqueIndex("staff_telephony_bindings_primary_staff_uidx")
      .on(table.staffUserId)
      .where(sql`${table.isActive} = true AND ${table.isPrimary} = true`),
  ],
);

export const staffTelephonyBridgeAssignments = pgTable(
  "staff_telephony_bridge_assignments",
  {
    id: uuid("id").primaryKey(),
    staffUserId: uuid("staff_user_id").references(() => staffUsers.id, {
      onDelete: "restrict",
    }),
    bridgeId: varchar("bridge_id", { length: 80 }).notNull(),
    currentEndpointId: uuid("current_endpoint_id").references(
      () => telephonyEndpoints.id,
      { onDelete: "restrict" },
    ),
    pendingEndpointId: uuid("pending_endpoint_id").references(
      () => telephonyEndpoints.id,
      { onDelete: "restrict" },
    ),
    state: varchar("state", { length: 30 }).default("assigned").notNull(),
    provisioningCommandId: uuid("provisioning_command_id"),
    provisioningExpiresAt: timestamp("provisioning_expires_at", {
      withTimezone: true,
    }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    lastLoginSucceededAt: timestamp("last_login_succeeded_at", {
      withTimezone: true,
    }),
    lastLoginFailedAt: timestamp("last_login_failed_at", {
      withTimezone: true,
    }),
    lastResultCode: varchar("last_result_code", { length: 60 }),
    isActive: boolean("is_active").default(true).notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    assignedByUserId: uuid("assigned_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("staff_telephony_bridge_assignments_staff_uidx")
      .on(table.staffUserId)
      .where(sql`${table.isActive} = true`),
    uniqueIndex("staff_telephony_bridge_assignments_bridge_uidx")
      .on(table.bridgeId)
      .where(sql`${table.isActive} = true`),
    check(
      "staff_telephony_bridge_assignments_bridge_format",
      sql`${table.bridgeId} ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$'`,
    ),
    check(
      "staff_telephony_bridge_assignments_state",
      sql`${table.state} IN ('idle', 'quarantined', 'assigned', 'provisioning', 'connected', 'failed')`,
    ),
    check(
      "staff_telephony_bridge_assignments_ownership",
      sql`(
        ${table.state} = 'idle'
        AND ${table.staffUserId} IS NULL
        AND ${table.currentEndpointId} IS NULL
      ) OR (
        ${table.state} = 'quarantined'
        AND ${table.staffUserId} IS NULL
        AND ${table.currentEndpointId} IS NOT NULL
      ) OR (
        ${table.state} NOT IN ('idle', 'quarantined')
        AND ${table.staffUserId} IS NOT NULL
      )`,
    ),
    check(
      "staff_telephony_bridge_assignments_provisioning",
      sql`(
        ${table.state} = 'provisioning'
        AND ${table.pendingEndpointId} IS NOT NULL
        AND ${table.provisioningCommandId} IS NOT NULL
        AND ${table.provisioningExpiresAt} IS NOT NULL
      ) OR (
        ${table.state} <> 'provisioning'
        AND ${table.pendingEndpointId} IS NULL
        AND ${table.provisioningCommandId} IS NULL
        AND ${table.provisioningExpiresAt} IS NULL
      )`,
    ),
    check(
      "staff_telephony_bridge_assignments_result_code",
      sql`${table.lastResultCode} IS NULL OR ${table.lastResultCode} ~ '^[A-Za-z0-9_.:-]{1,60}$'`,
    ),
  ],
);

export const staffAuditLogs = pgTable(
  "staff_audit_logs",
  {
    id: uuid("id").primaryKey(),
    actorUserId: uuid("actor_user_id").references(() => staffUsers.id, {
      onDelete: "restrict",
    }),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("target_type", { length: 100 }),
    targetId: varchar("target_id", { length: 100 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("staff_audit_logs_actor_occurred_idx").on(
      table.actorUserId,
      table.occurredAt,
    ),
    index("staff_audit_logs_target_occurred_idx").on(
      table.targetType,
      table.targetId,
      table.occurredAt,
    ),
    check(
      "staff_audit_logs_metadata_object",
      sql`jsonb_typeof(${table.metadata}) = 'object'`,
    ),
  ],
);

export const reviewImportBatches = pgTable(
  "review_import_batches",
  {
    id: uuid("id").primaryKey(),
    sourceKey: varchar("source_key", { length: 100 }).notNull(),
    sourceRowCount: integer("source_row_count").notNull(),
    sourceSha256: bytea("source_sha256").notNull(),
    publishedCount: integer("published_count").notNull(),
    reviewRequiredCount: integer("review_required_count").notNull(),
    withheldCount: integer("withheld_count").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("review_import_batches_source_completed_idx").on(
      table.sourceKey,
      table.completedAt,
    ),
    check(
      "review_import_batches_source_hash_length",
      sql`octet_length(${table.sourceSha256}) = 32`,
    ),
    check(
      "review_import_batches_counts_nonnegative",
      sql`${table.sourceRowCount} >= 0
        AND ${table.publishedCount} >= 0
        AND ${table.reviewRequiredCount} >= 0
        AND ${table.withheldCount} >= 0`,
    ),
    check(
      "review_import_batches_counts_match",
      sql`${table.sourceRowCount} = ${table.publishedCount}
        + ${table.reviewRequiredCount}
        + ${table.withheldCount}`,
    ),
    check(
      "review_import_batches_time_order",
      sql`${table.completedAt} >= ${table.startedAt}`,
    ),
  ],
);

export const customerReviews = pgTable(
  "customer_reviews",
  {
    id: uuid("id").primaryKey(),
    sourceKey: varchar("source_key", { length: 100 }).notNull(),
    legacyId: bigint("legacy_id", { mode: "number" }).notNull(),
    legacyContentId: bigint("legacy_content_id", { mode: "number" }),
    legacyUrl: text("legacy_url").notNull(),
    authorDisplay: varchar("author_display", { length: 100 }).notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    practiceArea: reviewPracticeAreaEnum("practice_area").notNull(),
    progressStage: reviewProgressStageEnum("progress_stage").notNull(),
    legacyCategory1: varchar("legacy_category1", { length: 127 }),
    legacyCategory2: varchar("legacy_category2", { length: 127 }),
    experienceKeywords: text("experience_keywords")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    commentCount: integer("comment_count").default(0).notNull(),
    sourceStatus: varchar("source_status", { length: 20 }),
    publicationStatus: reviewPublicationStatusEnum("publication_status")
      .notNull(),
    piiStatus: reviewPiiStatusEnum("pii_status").notNull(),
    piiFlags: text("pii_flags")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    sourceHash: bytea("source_hash").notNull(),
    importBatchId: uuid("import_batch_id")
      .notNull()
      .references(() => reviewImportBatches.id, { onDelete: "restrict" }),
    originalCreatedAt: timestamp("original_created_at", {
      withTimezone: true,
    }).notNull(),
    originalUpdatedAt: timestamp("original_updated_at", {
      withTimezone: true,
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customer_reviews_source_legacy_uidx").on(
      table.sourceKey,
      table.legacyId,
    ),
    index("customer_reviews_public_recent_idx")
      .on(table.originalCreatedAt, table.id)
      .where(sql`${table.publicationStatus} = 'published'`),
    index("customer_reviews_public_area_stage_idx")
      .on(table.practiceArea, table.progressStage, table.originalCreatedAt)
      .where(sql`${table.publicationStatus} = 'published'`),
    index("customer_reviews_keywords_gin_idx").using(
      "gin",
      table.experienceKeywords,
    ),
    index("customer_reviews_import_batch_idx").on(table.importBatchId),
    check(
      "customer_reviews_legacy_id_positive",
      sql`${table.legacyId} > 0`,
    ),
    check(
      "customer_reviews_nonempty_text",
      sql`length(btrim(${table.title})) > 0
        AND length(btrim(${table.content})) > 0
        AND length(btrim(${table.authorDisplay})) > 0`,
    ),
    check(
      "customer_reviews_comment_count_nonnegative",
      sql`${table.commentCount} >= 0`,
    ),
    check(
      "customer_reviews_source_hash_length",
      sql`octet_length(${table.sourceHash}) = 32`,
    ),
    check(
      "customer_reviews_publication_consistent",
      sql`(
        ${table.publicationStatus} = 'published'
        AND ${table.piiStatus} IN ('clear', 'reviewed')
        AND ${table.publishedAt} IS NOT NULL
      ) OR (
        ${table.publicationStatus} <> 'published'
        AND ${table.publishedAt} IS NULL
      )`,
    ),
  ],
);

export const customerReviewSubmissions = pgTable(
  "customer_review_submissions",
  {
    id: uuid("id").primaryKey(),
    publicReceiptCode: varchar("public_receipt_code", { length: 32 }).notNull(),
    source: varchar("source", { length: 50 }).default("homepage").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    authorDisplay: varchar("author_display", { length: 100 }).notNull(),
    practiceArea: reviewPracticeAreaEnum("practice_area").notNull(),
    progressStage: reviewProgressStageEnum("progress_stage").notNull(),
    experienceKeywords: text("experience_keywords")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    phoneFingerprint: bytea("phone_fingerprint").notNull(),
    phoneCiphertext: bytea("phone_ciphertext").notNull(),
    phoneNonce: bytea("phone_nonce").notNull(),
    phoneKeyVersion: varchar("phone_key_version", { length: 50 }).notNull(),
    contentCiphertext: bytea("content_ciphertext").notNull(),
    contentNonce: bytea("content_nonce").notNull(),
    contentKeyVersion: varchar("content_key_version", { length: 50 }).notNull(),
    payloadFingerprint: bytea("payload_fingerprint").notNull(),
    piiStatus: reviewPiiStatusEnum("pii_status").notNull(),
    piiFlags: text("pii_flags")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    status: reviewSubmissionStatusEnum("status")
      .default("pending_review")
      .notNull(),
    privacyNoticeVersion: varchar("privacy_notice_version", {
      length: 50,
    }).notNull(),
    publicationConsentVersion: varchar("publication_consent_version", {
      length: 50,
    }).notNull(),
    consentAgreedAt: timestamp("consent_agreed_at", {
      withTimezone: true,
    }).notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    retentionExpiresAt: timestamp("retention_expires_at", {
      withTimezone: true,
    }).notNull(),
    moderatedAt: timestamp("moderated_at", { withTimezone: true }),
    publishedReviewId: uuid("published_review_id").references(
      () => customerReviews.id,
      { onDelete: "restrict" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customer_review_submissions_receipt_uidx").on(
      table.publicReceiptCode,
    ),
    uniqueIndex("customer_review_submissions_source_idempotency_uidx").on(
      table.source,
      table.idempotencyKey,
    ),
    index("customer_review_submissions_status_submitted_idx").on(
      table.status,
      table.submittedAt,
    ),
    index("customer_review_submissions_phone_submitted_idx").on(
      table.phoneFingerprint,
      table.submittedAt,
    ),
    index("customer_review_submissions_payload_idx").on(
      table.payloadFingerprint,
    ),
    check(
      "customer_review_submissions_nonempty_author",
      sql`length(btrim(${table.authorDisplay})) > 0`,
    ),
    check(
      "customer_review_submissions_phone_fingerprint_length",
      sql`octet_length(${table.phoneFingerprint}) = 32`,
    ),
    check(
      "customer_review_submissions_payload_fingerprint_length",
      sql`octet_length(${table.payloadFingerprint}) = 32`,
    ),
    check(
      "customer_review_submissions_nonce_length",
      sql`octet_length(${table.phoneNonce}) = 12
        AND octet_length(${table.contentNonce}) = 12`,
    ),
    check(
      "customer_review_submissions_keywords_count",
      sql`cardinality(${table.experienceKeywords}) BETWEEN 1 AND 3`,
    ),
    check(
      "customer_review_submissions_keywords_allowed",
      sql`${table.experienceKeywords} <@ ARRAY[
        '친절', '세심', '꼼꼼', '신뢰', '든든', '정확', '빠름', '체계적'
      ]::text[]`,
    ),
    check(
      "customer_review_submissions_retention_order",
      sql`${table.retentionExpiresAt} > ${table.submittedAt}`,
    ),
    check(
      "customer_review_submissions_publication_link",
      sql`(
        ${table.status} = 'published'
        AND ${table.moderatedAt} IS NOT NULL
        AND ${table.publishedReviewId} IS NOT NULL
      ) OR (
        ${table.status} <> 'published'
        AND ${table.publishedReviewId} IS NULL
      )`,
    ),
  ],
);

export const selfDiagnosisCaseProfiles = pgTable(
  "self_diagnosis_case_profiles",
  {
    id: uuid("id").primaryKey(),
    modelVersion: varchar("model_version", { length: 50 }).notNull(),
    sourceOfficeIdx: integer("source_office_idx").notNull(),
    caseType: integer("case_type").notNull(),
    courtIdx: integer("court_idx").notNull(),
    courtName: varchar("court_name", { length: 50 }).notNull(),
    monthlyIncome: bigint("monthly_income", { mode: "number" }).notNull(),
    incomeType: integer("income_type").notNull(),
    residenceType: integer("residence_type").notNull(),
    marriageState: integer("marriage_state").notNull(),
    minorChildCount: integer("minor_child_count").notNull(),
    dependentCount: real("dependent_count").notNull(),
    totalDebt: bigint("total_debt", { mode: "number" }).notNull(),
    liquidationValue: bigint("liquidation_value", { mode: "number" }).notNull(),
    priorityDebt: boolean("priority_debt").notNull(),
    monthlyPayment: bigint("monthly_payment", { mode: "number" }).notNull(),
    paymentCount: integer("payment_count").notNull(),
    estimatedSpend: bigint("estimated_spend", { mode: "number" })
      .default(0)
      .notNull(),
    livingCostType: integer("living_cost_type").default(0).notNull(),
    livingCostCost: bigint("living_cost_cost", { mode: "number" })
      .default(0)
      .notNull(),
    totalPayment: bigint("total_payment", { mode: "number" }).notNull(),
    repaymentRate: real("repayment_rate").notNull(),
    filingDate: date("filing_date", { mode: "string" }),
    prohibitionDate: date("prohibition_date", { mode: "string" }),
    commencementDate: date("commencement_date", { mode: "string" }),
    approvalDate: date("approval_date", { mode: "string" }),
    bankruptcyDate: date("bankruptcy_date", { mode: "string" }),
    dischargeDate: date("discharge_date", { mode: "string" }),
    filingToProhibitionDays: integer("filing_to_prohibition_days"),
    filingToCommencementDays: integer("filing_to_commencement_days"),
    filingToApprovalDays: integer("filing_to_approval_days"),
    filingToBankruptcyDays: integer("filing_to_bankruptcy_days"),
    filingToDischargeDays: integer("filing_to_discharge_days"),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("self_diagnosis_profiles_match_idx").on(
      table.modelVersion,
      table.caseType,
      table.priorityDebt,
      table.courtIdx,
      table.incomeType,
    ),
    index("self_diagnosis_profiles_financial_idx").on(
      table.caseType,
      table.monthlyIncome,
      table.totalDebt,
      table.liquidationValue,
    ),
    check(
      "self_diagnosis_profiles_office_56",
      sql`${table.sourceOfficeIdx} = 56`,
    ),
    check(
      "self_diagnosis_profiles_case_type",
      sql`${table.caseType} IN (1, 2)`,
    ),
    check(
      "self_diagnosis_profiles_nonnegative",
      sql`${table.monthlyIncome} >= 0
        AND ${table.minorChildCount} >= 0
        AND ${table.dependentCount} >= 0
        AND ${table.totalDebt} > 0
        AND ${table.liquidationValue} >= 0
        AND ${table.monthlyPayment} >= 0
        AND ${table.paymentCount} >= 0
        AND ${table.paymentCount} <= 60
        AND ${table.totalPayment} >= 0
        AND ${table.repaymentRate} >= 0`,
    ),
  ],
);

export const publicCaseStudies = pgTable(
  "public_case_studies",
  {
    id: uuid("id").primaryKey(),
    slug: varchar("slug", { length: 160 }).notNull(),
    // 공개 화면에는 렌더링하지 않는 내부 연결 키. 자가진단 카드와 같은 사건을
    // 연결할 때만 서버에서 사용한다.
    sourceCaseIdx: bigint("source_case_idx", { mode: "number" }),
    sourceCaseFingerprint: bytea("source_case_fingerprint").notNull(),
    sourceSnapshotHash: bytea("source_snapshot_hash").notNull(),
    sourceSnapshot: jsonb("source_snapshot").notNull(),
    sourceOfficeIdx: integer("source_office_idx").notNull(),
    practiceArea: caseStudyPracticeAreaEnum("practice_area").notNull(),
    publicationStatus: caseStudyPublicationStatusEnum("publication_status")
      .default("draft")
      .notNull(),
    privacyReviewStatus: caseStudyReviewStatusEnum("privacy_review_status")
      .default("pending")
      .notNull(),
    legalReviewStatus: caseStudyReviewStatusEnum("legal_review_status")
      .default("pending")
      .notNull(),
    publicationBasis: varchar("publication_basis", { length: 100 }),
    title: text("title").notNull(),
    dek: text("dek").notNull(),
    content: jsonb("content").notNull(),
    financialSnapshot: jsonb("financial_snapshot").notNull(),
    timeline: jsonb("timeline").notNull(),
    tags: text("tags")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    cohortSize: integer("cohort_size").notNull(),
    anonymizationVersion: varchar("anonymization_version", {
      length: 50,
    }).notNull(),
    promptVersion: varchar("prompt_version", { length: 50 }).notNull(),
    generationModel: varchar("generation_model", { length: 100 }).notNull(),
    generationReasoningEffort: varchar("generation_reasoning_effort", {
      length: 20,
    }).notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull(),
    privacyReviewedAt: timestamp("privacy_reviewed_at", {
      withTimezone: true,
    }),
    legalReviewedAt: timestamp("legal_reviewed_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("public_case_studies_slug_uidx").on(table.slug),
    uniqueIndex("public_case_studies_source_fingerprint_uidx").on(
      table.sourceCaseFingerprint,
    ),
    index("public_case_studies_visible_idx")
      .on(table.publicationStatus, table.generatedAt)
      .where(sql`${table.publicationStatus} IN ('preview', 'published')`),
    index("public_case_studies_tags_gin_idx").using("gin", table.tags),
    check(
      "public_case_studies_office_56",
      sql`${table.sourceOfficeIdx} = 56`,
    ),
    check(
      "public_case_studies_source_hashes",
      sql`octet_length(${table.sourceCaseFingerprint}) = 32
        AND octet_length(${table.sourceSnapshotHash}) = 32`,
    ),
    check(
      "public_case_studies_safe_snapshot",
      sql`jsonb_typeof(${table.sourceSnapshot}) = 'object'
        AND jsonb_typeof(${table.content}) = 'object'
        AND jsonb_typeof(${table.financialSnapshot}) = 'object'
        AND jsonb_typeof(${table.timeline}) = 'array'`,
    ),
    check(
      "public_case_studies_nonempty_copy",
      sql`length(btrim(${table.slug})) > 0
        AND length(btrim(${table.title})) > 0
        AND length(btrim(${table.dek})) > 0`,
    ),
    check(
      "public_case_studies_anonymity_floor",
      sql`${table.cohortSize} >= 5`,
    ),
    check(
      "public_case_studies_tags_count",
      sql`cardinality(${table.tags}) BETWEEN 2 AND 8`,
    ),
    check(
      "public_case_studies_publication_gate",
      sql`(
        ${table.publicationStatus} = 'published'
        AND ${table.privacyReviewStatus} = 'approved'
        AND ${table.legalReviewStatus} = 'approved'
        AND ${table.publicationBasis} IS NOT NULL
        AND ${table.privacyReviewedAt} IS NOT NULL
        AND ${table.legalReviewedAt} IS NOT NULL
        AND ${table.publishedAt} IS NOT NULL
        AND ${table.withdrawnAt} IS NULL
      ) OR (
        ${table.publicationStatus} IN ('draft', 'preview')
        AND ${table.publishedAt} IS NULL
        AND ${table.withdrawnAt} IS NULL
      ) OR (
        ${table.publicationStatus} = 'withdrawn'
        AND ${table.withdrawnAt} IS NOT NULL
      )`,
    ),
  ],
);

export const marketingLandingPages = pgTable(
  "marketing_landing_pages",
  {
    id: uuid("id").primaryKey(),
    pageKey: varchar("page_key", { length: 100 }).notNull(),
    version: integer("version").notNull(),
    routePath: text("route_path").notNull(),
    intentKey: varchar("intent_key", { length: 100 }).notNull(),
    templateKey: varchar("template_key", { length: 100 }).notNull(),
    status: landingPageStatusEnum("status").default("draft").notNull(),
    copyApprovalId: varchar("copy_approval_id", { length: 100 }),
    contentChecksum: bytea("content_checksum"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("marketing_landing_pages_key_version_uidx").on(
      table.pageKey,
      table.version,
    ),
    uniqueIndex("marketing_landing_pages_active_key_uidx")
      .on(table.pageKey)
      .where(sql`${table.status} = 'active'`),
    uniqueIndex("marketing_landing_pages_active_route_uidx")
      .on(table.routePath)
      .where(sql`${table.status} = 'active'`),
    index("marketing_landing_pages_route_idx").on(table.routePath),
    check("marketing_landing_pages_version_positive", sql`${table.version} > 0`),
    check(
      "marketing_landing_pages_internal_route",
      sql`${table.routePath} LIKE '/%' AND ${table.routePath} NOT LIKE '//%'`,
    ),
  ],
);

export const journeySessions = pgTable(
  "journey_sessions",
  {
    id: uuid("id").primaryKey(),
    firstLandingPageId: uuid("first_landing_page_id").references(
      () => marketingLandingPages.id,
      { onDelete: "set null" },
    ),
    firstLandingPath: text("first_landing_path").notNull(),
    referrerHost: varchar("referrer_host", { length: 253 }),
    adpilotClickId: varchar("adpilot_click_id", { length: 200 }),
    platformClickId: varchar("platform_click_id", { length: 200 }),
    utmSource: varchar("utm_source", { length: 100 }),
    utmMedium: varchar("utm_medium", { length: 100 }),
    utmCampaign: varchar("utm_campaign", { length: 200 }),
    utmTerm: varchar("utm_term", { length: 200 }),
    utmContent: varchar("utm_content", { length: 200 }),
    externalCampaignId: varchar("external_campaign_id", { length: 100 }),
    externalAdGroupId: varchar("external_ad_group_id", { length: 100 }),
    externalKeywordId: varchar("external_keyword_id", { length: 100 }),
    externalCreativeId: varchar("external_creative_id", { length: 100 }),
    matchedKeyword: varchar("matched_keyword", { length: 200 }),
    matchType: varchar("match_type", { length: 16 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("journey_sessions_adpilot_click_idx").on(table.adpilotClickId),
    index("journey_sessions_external_ad_group_idx").on(
      table.externalAdGroupId,
    ),
    index("journey_sessions_started_at_idx").on(table.startedAt),
    check(
      "journey_sessions_internal_landing_path",
      sql`${table.firstLandingPath} LIKE '/%' AND ${table.firstLandingPath} NOT LIKE '//%'`,
    ),
    check(
      "journey_sessions_time_order",
      sql`${table.lastSeenAt} >= ${table.startedAt}`,
    ),
    check(
      "journey_sessions_match_type",
      sql`${table.matchType} IS NULL OR ${table.matchType} IN ('exact', 'phrase', 'broad', 'unknown')`,
    ),
  ],
);

export const journeyEvents = pgTable(
  "journey_events",
  {
    id: uuid("id").primaryKey(),
    journeySessionId: uuid("journey_session_id")
      .notNull()
      .references(() => journeySessions.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    eventType: journeyEventTypeEnum("event_type").notNull(),
    path: text("path").notNull(),
    landingPageId: uuid("landing_page_id").references(
      () => marketingLandingPages.id,
      { onDelete: "set null" },
    ),
    ctaPlacement: varchar("cta_placement", { length: 100 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("journey_events_session_sequence_uidx").on(
      table.journeySessionId,
      table.sequence,
    ),
    index("journey_events_session_occurred_idx").on(
      table.journeySessionId,
      table.occurredAt,
    ),
    check("journey_events_sequence_positive", sql`${table.sequence} > 0`),
    check(
      "journey_events_internal_path",
      sql`${table.path} LIKE '/%' AND ${table.path} NOT LIKE '//%'`,
    ),
    check(
      "journey_events_cta_context",
      sql`(${table.eventType} = 'consultation_cta_clicked' AND ${table.ctaPlacement} IS NOT NULL)
        OR (${table.eventType} = 'page_view' AND ${table.ctaPlacement} IS NULL)`,
    ),
  ],
);

export const consultations = pgTable(
  "consultations",
  {
    id: uuid("id").primaryKey(),
    publicReceiptCode: varchar("public_receipt_code", { length: 32 })
      .notNull(),
    state: consultationStateEnum("state").default("requested").notNull(),
    contactChannel: consultationContactChannelEnum("contact_channel")
      .default("phone")
      .notNull(),
    phoneFingerprint: bytea("phone_fingerprint"),
    anonymousLabel: varchar("anonymous_label", { length: 64 }).notNull(),
    preferredNameCiphertext: bytea("preferred_name_ciphertext"),
    preferredNameNonce: bytea("preferred_name_nonce"),
    preferredNameKeyVersion: varchar("preferred_name_key_version", {
      length: 50,
    }),
    firstRequestedAt: timestamp("first_requested_at", {
      withTimezone: true,
    }).notNull(),
    lastRequestedAt: timestamp("last_requested_at", {
      withTimezone: true,
    }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("consultations_public_receipt_code_uidx").on(
      table.publicReceiptCode,
    ),
    index("consultations_phone_fingerprint_idx").on(table.phoneFingerprint),
    index("consultations_state_last_requested_idx").on(
      table.state,
      table.lastRequestedAt,
    ),
    check(
      "consultations_request_time_order",
      sql`${table.lastRequestedAt} >= ${table.firstRequestedAt}`,
    ),
    check(
      "consultations_name_crypto_complete",
      sql`(
        ${table.preferredNameCiphertext} IS NULL
        AND ${table.preferredNameNonce} IS NULL
        AND ${table.preferredNameKeyVersion} IS NULL
      ) OR (
        ${table.preferredNameCiphertext} IS NOT NULL
        AND ${table.preferredNameNonce} IS NOT NULL
        AND ${table.preferredNameKeyVersion} IS NOT NULL
      )`,
    ),
    check(
      "consultations_phone_fingerprint_length",
      sql`octet_length(${table.phoneFingerprint}) = 32`,
    ),
    check(
      "consultations_contact_channel_identity",
      sql`(${table.contactChannel} = 'phone' AND ${table.phoneFingerprint} IS NOT NULL)
        OR (${table.contactChannel} IN ('kakao_channel', 'naver_booking') AND ${table.phoneFingerprint} IS NULL)`,
    ),
    check(
      "consultations_name_nonce_length",
      sql`${table.preferredNameNonce} IS NULL OR octet_length(${table.preferredNameNonce}) = 12`,
    ),
    check(
      "consultations_closed_state_consistent",
      sql`(${table.state} = 'closed' AND ${table.closedAt} IS NOT NULL)
        OR (${table.state} <> 'closed' AND ${table.closedAt} IS NULL)`,
    ),
  ],
);

export const consultationAssignments = pgTable(
  "consultation_assignments",
  {
    id: uuid("id").primaryKey(),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "restrict" }),
    assigneeUserId: uuid("assignee_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    assigneeMembershipId: uuid("assignee_membership_id")
      .notNull()
      .references(() => staffMemberships.id, { onDelete: "restrict" }),
    assignedByUserId: uuid("assigned_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    assignmentMethod: varchar("assignment_method", { length: 50 })
      .default("self_claim")
      .notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("consultation_assignments_consultation_uidx").on(
      table.consultationId,
    ),
    index("consultation_assignments_assignee_assigned_idx").on(
      table.assigneeUserId,
      table.assignedAt,
    ),
    check(
      "consultation_assignments_method_allowed",
      sql`${table.assignmentMethod} IN ('self_claim', 'phone_desk_conversion')`,
    ),
  ],
);

export const consultationRequests = pgTable(
  "consultation_requests",
  {
    id: uuid("id").primaryKey(),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "restrict" }),
    source: varchar("source", { length: 50 }).default("homepage").notNull(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    mode: consultationModeEnum("mode").notNull(),
    contactChannel: consultationContactChannelEnum("contact_channel")
      .default("phone")
      .notNull(),
    phoneFingerprint: bytea("phone_fingerprint"),
    phoneCiphertext: bytea("phone_ciphertext"),
    phoneNonce: bytea("phone_nonce"),
    phoneKeyVersion: varchar("phone_key_version", { length: 50 }),
    hasProvidedName: boolean("has_provided_name").default(false).notNull(),
    nameCiphertext: bytea("name_ciphertext"),
    nameNonce: bytea("name_nonce"),
    nameKeyVersion: varchar("name_key_version", { length: 50 }),
    intakeCiphertext: bytea("intake_ciphertext").notNull(),
    intakeNonce: bytea("intake_nonce").notNull(),
    intakeKeyVersion: varchar("intake_key_version", { length: 50 }).notNull(),
    payloadFingerprint: bytea("payload_fingerprint").notNull(),
    contactPreference: contactPreferenceEnum("contact_preference").notNull(),
    contactWindowStart: timestamp("contact_window_start", {
      withTimezone: true,
    }),
    contactWindowEnd: timestamp("contact_window_end", {
      withTimezone: true,
    }),
    privacyNoticeVersion: varchar("privacy_notice_version", {
      length: 50,
    }).notNull(),
    privacyBasis: privacyBasisEnum("privacy_basis")
      .default("explicit_consent")
      .notNull(),
    consentAgreedAt: timestamp("consent_agreed_at", {
      withTimezone: true,
    }),
    journeySessionId: uuid("journey_session_id").references(
      () => journeySessions.id,
      { onDelete: "set null" },
    ),
    dedupeOutcome: dedupeOutcomeEnum("dedupe_outcome").notNull(),
    candidateConsultationId: uuid("candidate_consultation_id").references(
      () => consultations.id,
      { onDelete: "restrict" },
    ),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("consultation_requests_source_idempotency_uidx").on(
      table.source,
      table.idempotencyKey,
    ),
    unique("consultation_requests_id_consultation_unique").on(
      table.id,
      table.consultationId,
    ),
    index("consultation_requests_consultation_submitted_idx").on(
      table.consultationId,
      table.submittedAt,
    ),
    index("consultation_requests_phone_submitted_idx").on(
      table.phoneFingerprint,
      table.submittedAt,
    ),
    index("consultation_requests_payload_fingerprint_idx").on(
      table.payloadFingerprint,
    ),
    check(
      "consultation_requests_name_crypto_complete",
      sql`(
        ${table.hasProvidedName} = false
        AND ${table.nameCiphertext} IS NULL
        AND ${table.nameNonce} IS NULL
        AND ${table.nameKeyVersion} IS NULL
      ) OR (
        ${table.hasProvidedName} = true
        AND ${table.nameCiphertext} IS NOT NULL
        AND ${table.nameNonce} IS NOT NULL
        AND ${table.nameKeyVersion} IS NOT NULL
      )`,
    ),
    check(
      "consultation_requests_contact_window_consistent",
      sql`(
        ${table.contactPreference} = 'as_soon_as_possible'
        AND ${table.contactWindowStart} IS NULL
        AND ${table.contactWindowEnd} IS NULL
      ) OR (
        ${table.contactPreference} = 'scheduled_window'
        AND ${table.contactWindowStart} IS NOT NULL
        AND ${table.contactWindowEnd} IS NOT NULL
        AND ${table.contactWindowEnd} > ${table.contactWindowStart}
      )`,
    ),
    check(
      "consultation_requests_phone_crypto_complete",
      sql`(
        ${table.contactChannel} = 'phone'
        AND ${table.phoneFingerprint} IS NOT NULL
        AND ${table.phoneCiphertext} IS NOT NULL
        AND ${table.phoneNonce} IS NOT NULL
        AND ${table.phoneKeyVersion} IS NOT NULL
      ) OR (
        ${table.contactChannel} IN ('kakao_channel', 'naver_booking')
        AND ${table.phoneFingerprint} IS NULL
        AND ${table.phoneCiphertext} IS NULL
        AND ${table.phoneNonce} IS NULL
        AND ${table.phoneKeyVersion} IS NULL
      )`,
    ),
    check(
      "consultation_requests_privacy_basis_consistent",
      sql`(${table.privacyBasis} = 'explicit_consent' AND ${table.consentAgreedAt} IS NOT NULL)
        OR (${table.privacyBasis} IN ('customer_initiated_channel_message', 'customer_initiated_channel_entry', 'customer_initiated_booking', 'staff_recorded_phone_interaction') AND ${table.consentAgreedAt} IS NULL)`,
    ),
    check(
      "consultation_requests_candidate_consistent",
      sql`(${table.dedupeOutcome} = 'suspected_duplicate' AND ${table.candidateConsultationId} IS NOT NULL)
        OR (${table.dedupeOutcome} <> 'suspected_duplicate' AND ${table.candidateConsultationId} IS NULL)`,
    ),
    check(
      "consultation_requests_candidate_is_different",
      sql`${table.candidateConsultationId} IS NULL OR ${table.candidateConsultationId} <> ${table.consultationId}`,
    ),
    check(
      "consultation_requests_fingerprint_lengths",
      sql`(${table.phoneFingerprint} IS NULL OR octet_length(${table.phoneFingerprint}) = 32)
        AND octet_length(${table.payloadFingerprint}) = 32`,
    ),
    check(
      "consultation_requests_nonce_lengths",
      sql`(${table.phoneNonce} IS NULL OR octet_length(${table.phoneNonce}) = 12)
        AND octet_length(${table.intakeNonce}) = 12
        AND (${table.nameNonce} IS NULL OR octet_length(${table.nameNonce}) = 12)`,
    ),
  ],
);

export const kakaoConsultationContacts = pgTable(
  "kakao_consultation_contacts",
  {
    id: uuid("id").primaryKey(),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "restrict" }),
    firstRequestId: uuid("first_request_id")
      .notNull()
      .references(() => consultationRequests.id, { onDelete: "restrict" }),
    botId: varchar("bot_id", { length: 200 }).notNull(),
    userFingerprint: bytea("user_fingerprint").notNull(),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("kakao_consultation_contacts_consultation_uidx").on(
      table.consultationId,
    ),
    uniqueIndex("kakao_consultation_contacts_bot_user_uidx").on(
      table.botId,
      table.userFingerprint,
    ),
    index("kakao_consultation_contacts_last_seen_idx").on(table.lastSeenAt),
    check(
      "kakao_consultation_contacts_fingerprint_length",
      sql`octet_length(${table.userFingerprint}) = 32`,
    ),
    check(
      "kakao_consultation_contacts_seen_order",
      sql`${table.lastSeenAt} >= ${table.firstSeenAt}`,
    ),
  ],
);

export const kakaoHomepageEntries = pgTable(
  "kakao_homepage_entries",
  {
    id: uuid("id").primaryKey(),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "restrict" }),
    firstRequestId: uuid("first_request_id")
      .notNull()
      .references(() => consultationRequests.id, { onDelete: "restrict" }),
    status: kakaoHomepageEntryStatusEnum("status")
      .default("pending")
      .notNull(),
    clickCount: integer("click_count").default(1).notNull(),
    firstClickedAt: timestamp("first_clicked_at", {
      withTimezone: true,
    }).notNull(),
    lastClickedAt: timestamp("last_clicked_at", {
      withTimezone: true,
    }).notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    confirmedByUserId: uuid("confirmed_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    invalidatedAt: timestamp("invalidated_at", { withTimezone: true }),
    invalidatedByUserId: uuid("invalidated_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("kakao_homepage_entries_consultation_uidx").on(
      table.consultationId,
    ),
    uniqueIndex("kakao_homepage_entries_first_request_uidx").on(
      table.firstRequestId,
    ),
    index("kakao_homepage_entries_status_last_clicked_idx").on(
      table.status,
      table.lastClickedAt,
    ),
    check(
      "kakao_homepage_entries_click_count_positive",
      sql`${table.clickCount} > 0`,
    ),
    check(
      "kakao_homepage_entries_click_order",
      sql`${table.lastClickedAt} >= ${table.firstClickedAt}`,
    ),
    check(
      "kakao_homepage_entries_status_consistent",
      sql`(
        ${table.status} = 'pending'
        AND ${table.confirmedAt} IS NULL
        AND ${table.confirmedByUserId} IS NULL
        AND ${table.invalidatedAt} IS NULL
        AND ${table.invalidatedByUserId} IS NULL
      ) OR (
        ${table.status} = 'confirmed'
        AND ${table.confirmedAt} IS NOT NULL
        AND ${table.confirmedByUserId} IS NOT NULL
        AND ${table.invalidatedAt} IS NULL
        AND ${table.invalidatedByUserId} IS NULL
      ) OR (
        ${table.status} = 'invalid'
        AND ${table.confirmedAt} IS NULL
        AND ${table.confirmedByUserId} IS NULL
        AND ${table.invalidatedAt} IS NOT NULL
        AND ${table.invalidatedByUserId} IS NOT NULL
      )`,
    ),
  ],
);

export const naverBookingEntries = pgTable(
  "naver_booking_entries",
  {
    id: uuid("id").primaryKey(),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "restrict" }),
    firstRequestId: uuid("first_request_id")
      .notNull()
      .references(() => consultationRequests.id, { onDelete: "restrict" }),
    businessId: varchar("business_id", { length: 32 }).notNull(),
    bookingNumber: varchar("booking_number", { length: 32 }).notNull(),
    detailsUrl: text("details_url").notNull(),
    status: naverBookingEntryStatusEnum("status")
      .default("details_pending")
      .notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    sourceMessageUid: bigint("source_message_uid", {
      mode: "number",
    }).notNull(),
    sourceReceivedAt: timestamp("source_received_at", {
      withTimezone: true,
    }).notNull(),
    detailsCapturedAt: timestamp("details_captured_at", {
      withTimezone: true,
    }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("naver_booking_entries_consultation_uidx").on(
      table.consultationId,
    ),
    uniqueIndex("naver_booking_entries_first_request_uidx").on(
      table.firstRequestId,
    ),
    uniqueIndex("naver_booking_entries_business_booking_uidx").on(
      table.businessId,
      table.bookingNumber,
    ),
    index("naver_booking_entries_status_scheduled_idx").on(
      table.status,
      table.scheduledAt,
    ),
    check(
      "naver_booking_entries_business_id_format",
      sql`${table.businessId} ~ '^[0-9]+$'`,
    ),
    check(
      "naver_booking_entries_booking_number_format",
      sql`${table.bookingNumber} ~ '^[0-9]+$'`,
    ),
    check(
      "naver_booking_entries_details_url",
      sql`${table.detailsUrl} LIKE 'https://partner.booking.naver.com/bizes/%'`,
    ),
    check(
      "naver_booking_entries_status_consistent",
      sql`(
        ${table.status} = 'details_pending'
        AND ${table.detailsCapturedAt} IS NULL
        AND ${table.cancelledAt} IS NULL
      ) OR (
        ${table.status} = 'ready'
        AND ${table.detailsCapturedAt} IS NOT NULL
        AND ${table.cancelledAt} IS NULL
      ) OR (
        ${table.status} = 'cancelled'
        AND ${table.cancelledAt} IS NOT NULL
      )`,
    ),
  ],
);

export const naverBookingMailboxCheckpoints = pgTable(
  "naver_booking_mailbox_checkpoints",
  {
    mailboxKey: varchar("mailbox_key", { length: 64 }).primaryKey(),
    uidValidity: bigint("uid_validity", { mode: "number" }).notNull(),
    lastSeenUid: bigint("last_seen_uid", { mode: "number" }).notNull(),
    initializedAt: timestamp("initialized_at", {
      withTimezone: true,
    }).notNull(),
    lastSuccessfulPollAt: timestamp("last_successful_poll_at", {
      withTimezone: true,
    }).notNull(),
    lastErrorCode: varchar("last_error_code", { length: 80 }),
    ...timestamps,
  },
  (table) => [
    check(
      "naver_booking_mailbox_checkpoints_uid_validity_positive",
      sql`${table.uidValidity} > 0`,
    ),
    check(
      "naver_booking_mailbox_checkpoints_last_seen_uid_nonnegative",
      sql`${table.lastSeenUid} >= 0`,
    ),
  ],
);

export const consultationAttributions = pgTable(
  "consultation_attributions",
  {
    id: uuid("id").primaryKey(),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "restrict" }),
    requestId: uuid("request_id").notNull(),
    journeySessionId: uuid("journey_session_id")
      .notNull()
      .references(() => journeySessions.id, { onDelete: "restrict" }),
    landingPageId: uuid("landing_page_id").references(
      () => marketingLandingPages.id,
      { onDelete: "set null" },
    ),
    landingPageKeySnapshot: varchar("landing_page_key_snapshot", {
      length: 100,
    }),
    landingPageVersionSnapshot: varchar("landing_page_version_snapshot", {
      length: 50,
    }),
    submittedFromPath: text("submitted_from_path").notNull(),
    ctaPath: text("cta_path"),
    ctaPlacement: varchar("cta_placement", { length: 100 }),
    ctaClickedAt: timestamp("cta_clicked_at", { withTimezone: true }),
    sourceSnapshot: jsonb("source_snapshot")
      .$type<AttributionSource>()
      .notNull(),
    attributionModel: varchar("attribution_model", { length: 50 })
      .default("submission_session_v1")
      .notNull(),
    attributedAt: timestamp("attributed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("consultation_attributions_request_uidx").on(table.requestId),
    index("consultation_attributions_consultation_idx").on(
      table.consultationId,
    ),
    index("consultation_attributions_session_idx").on(table.journeySessionId),
    check(
      "consultation_attributions_internal_submit_path",
      sql`${table.submittedFromPath} LIKE '/%' AND ${table.submittedFromPath} NOT LIKE '//%'`,
    ),
    check(
      "consultation_attributions_cta_complete",
      sql`(
        ${table.ctaPath} IS NULL
        AND ${table.ctaPlacement} IS NULL
        AND ${table.ctaClickedAt} IS NULL
      ) OR (
        ${table.ctaPath} IS NOT NULL
        AND ${table.ctaPlacement} IS NOT NULL
        AND ${table.ctaClickedAt} IS NOT NULL
        AND ${table.ctaPath} LIKE '/%'
        AND ${table.ctaPath} NOT LIKE '//%'
      )`,
    ),
    check(
      "consultation_attributions_source_object",
      sql`jsonb_typeof(${table.sourceSnapshot}) = 'object'`,
    ),
    foreignKey({
      columns: [table.requestId, table.consultationId],
      foreignColumns: [
        consultationRequests.id,
        consultationRequests.consultationId,
      ],
      name: "consultation_attribution_request_consultation_fk",
    }).onDelete("cascade"),
  ],
);

export const consultationStatusHistory = pgTable(
  "consultation_status_history",
  {
    id: uuid("id").primaryKey(),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "restrict" }),
    fromState: consultationStateEnum("from_state"),
    toState: consultationStateEnum("to_state").notNull(),
    reason: varchar("reason", { length: 200 }),
    actorType: varchar("actor_type", { length: 50 }).notNull(),
    actorId: varchar("actor_id", { length: 100 }),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("consultation_status_history_consultation_changed_idx").on(
      table.consultationId,
      table.changedAt,
    ),
    check(
      "consultation_status_history_actual_change",
      sql`${table.fromState} IS NULL OR ${table.fromState} <> ${table.toState}`,
    ),
  ],
);

export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuid("id").primaryKey(),
    aggregateType: varchar("aggregate_type", { length: 100 }).notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: varchar("event_type", { length: 100 }).notNull(),
    eventVersion: integer("event_version").notNull(),
    correlationId: uuid("correlation_id").notNull(),
    causationId: uuid("causation_id"),
    payload: jsonb("payload").$type<PlatformEvent>().notNull(),
    status: outboxStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    availableAt: timestamp("available_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: varchar("locked_by", { length: 100 }),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("outbox_events_pending_idx")
      .on(table.availableAt, table.createdAt)
      .where(sql`${table.status} = 'pending'`),
    index("outbox_events_aggregate_idx").on(
      table.aggregateType,
      table.aggregateId,
    ),
    check("outbox_events_version_positive", sql`${table.eventVersion} > 0`),
    check("outbox_events_attempts_nonnegative", sql`${table.attempts} >= 0`),
    check(
      "outbox_events_published_consistent",
      sql`(${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL)
        OR (${table.status} <> 'published' AND ${table.publishedAt} IS NULL)`,
    ),
    check(
      "outbox_events_lease_consistent",
      sql`(
        ${table.status} = 'pending'
        AND ${table.lockedAt} IS NOT NULL
        AND ${table.lockedBy} IS NOT NULL
      ) OR (
        ${table.lockedAt} IS NULL
        AND ${table.lockedBy} IS NULL
      )`,
    ),
    check(
      "outbox_events_payload_object",
      sql`jsonb_typeof(${table.payload}) = 'object'`,
    ),
    check(
      "outbox_events_envelope_consistent",
      sql`${table.payload}->>'eventId' = ${table.id}::text
        AND ${table.payload}->>'eventType' = ${table.eventType}
        AND (${table.payload}->>'eventVersion')::integer = ${table.eventVersion}
        AND ${table.payload}->>'correlationId' = ${table.correlationId}::text`,
    ),
  ],
);

export const outboxDeliveryAttempts = pgTable(
  "outbox_delivery_attempts",
  {
    id: uuid("id").primaryKey(),
    outboxEventId: uuid("outbox_event_id")
      .notNull()
      .references(() => outboxEvents.id, { onDelete: "restrict" }),
    attemptNumber: integer("attempt_number").notNull(),
    workerId: varchar("worker_id", { length: 100 }).notNull(),
    status: outboxDeliveryAttemptStatusEnum("status")
      .default("started")
      .notNull(),
    httpStatus: integer("http_status"),
    errorCode: varchar("error_code", { length: 100 }),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("outbox_delivery_attempts_event_number_uidx").on(
      table.outboxEventId,
      table.attemptNumber,
    ),
    index("outbox_delivery_attempts_event_started_idx").on(
      table.outboxEventId,
      table.startedAt,
    ),
    check(
      "outbox_delivery_attempts_number_positive",
      sql`${table.attemptNumber} > 0`,
    ),
    check(
      "outbox_delivery_attempts_http_status_valid",
      sql`${table.httpStatus} IS NULL OR (${table.httpStatus} >= 100 AND ${table.httpStatus} <= 599)`,
    ),
    check(
      "outbox_delivery_attempts_finished_consistent",
      sql`(
        ${table.status} = 'started'
        AND ${table.finishedAt} IS NULL
      ) OR (
        ${table.status} <> 'started'
        AND ${table.finishedAt} IS NOT NULL
      )`,
    ),
  ],
);

export const messageTemplates = pgTable(
  "message_templates",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id").references(() => staffUsers.id, {
      onDelete: "restrict",
    }),
    name: varchar("name", { length: 80 }).notNull(),
    body: text("body").notNull(),
    bodyByteLength: integer("body_byte_length").notNull(),
    imageFileId: varchar("image_file_id", { length: 100 }),
    imageUrl: text("image_url"),
    imageOriginalName: varchar("image_original_name", { length: 100 }),
    imageByteLength: integer("image_byte_length"),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    isActive: boolean("is_active").default(true).notNull(),
    createdByUserId: uuid("created_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    updatedByUserId: uuid("updated_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("message_templates_owner_name_lower_uidx").on(
      table.ownerUserId,
      sql`lower(${table.name})`,
    ),
    index("message_templates_active_name_idx").on(
      table.ownerUserId,
      table.isActive,
      table.name,
    ),
    check(
      "message_templates_name_nonempty",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "message_templates_body_nonempty",
      sql`length(btrim(${table.body})) > 0`,
    ),
    check(
      "message_templates_body_byte_length",
      sql`${table.bodyByteLength} >= 1 AND ${table.bodyByteLength} <= 720`,
    ),
    check(
      "message_templates_owner_audit_consistent",
      sql`(
        ${table.ownerUserId} IS NULL
        AND ${table.createdByUserId} IS NULL
        AND ${table.updatedByUserId} IS NULL
      ) OR (
        ${table.ownerUserId} IS NOT NULL
        AND ${table.createdByUserId} = ${table.ownerUserId}
        AND ${table.updatedByUserId} = ${table.ownerUserId}
      )`,
    ),
    check(
      "message_templates_image_metadata_complete",
      sql`(
        ${table.imageFileId} IS NULL
        AND ${table.imageUrl} IS NULL
        AND ${table.imageOriginalName} IS NULL
        AND ${table.imageByteLength} IS NULL
        AND ${table.imageWidth} IS NULL
        AND ${table.imageHeight} IS NULL
      ) OR (
        ${table.imageFileId} IS NOT NULL
        AND ${table.imageUrl} IS NOT NULL
        AND ${table.imageOriginalName} IS NOT NULL
        AND ${table.imageByteLength} BETWEEN 1 AND 204800
        AND ${table.imageWidth} BETWEEN 1 AND 1500
        AND ${table.imageHeight} BETWEEN 1 AND 1440
      )`,
    ),
  ],
);

export const telephonyMessages = pgTable(
  "telephony_messages",
  {
    id: uuid("id").primaryKey(),
    provider: telephonyMessageProviderEnum("provider")
      .default("centrex")
      .notNull(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => telephonyEndpoints.id, { onDelete: "restrict" }),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "restrict" }),
    consultationRequestId: uuid("consultation_request_id")
      .notNull()
      .references(() => consultationRequests.id, { onDelete: "restrict" }),
    templateId: uuid("template_id").references(() => messageTemplates.id, {
      onDelete: "restrict",
    }),
    templateNameSnapshot: varchar("template_name_snapshot", { length: 80 }),
    imageFileIdSnapshot: varchar("image_file_id_snapshot", { length: 100 }),
    imageOriginalNameSnapshot: varchar("image_original_name_snapshot", {
      length: 100,
    }),
    outboxEventId: uuid("outbox_event_id")
      .notNull()
      .references(() => outboxEvents.id, { onDelete: "restrict" }),
    idempotencyKey: uuid("idempotency_key").notNull(),
    remotePhoneFingerprint: bytea("remote_phone_fingerprint").notNull(),
    bodyCiphertext: bytea("body_ciphertext").notNull(),
    bodyNonce: bytea("body_nonce").notNull(),
    bodyKeyVersion: varchar("body_key_version", { length: 50 }).notNull(),
    bodyFingerprint: bytea("body_fingerprint").notNull(),
    messageKind: telephonyMessageKindEnum("message_kind").notNull(),
    bodyByteLength: integer("body_byte_length").notNull(),
    commandStatus: telephonyCommandStatusEnum("command_status")
      .default("queued")
      .notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    providerRespondedAt: timestamp("provider_responded_at", {
      withTimezone: true,
    }),
    providerCode: varchar("provider_code", { length: 20 }),
    providerRemainingCount: integer("provider_remaining_count"),
    lastErrorCode: varchar("last_error_code", { length: 100 }),
    lastErrorMessage: text("last_error_message"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telephony_messages_outbox_event_uidx").on(
      table.outboxEventId,
    ),
    uniqueIndex("telephony_messages_idempotency_key_uidx").on(
      table.idempotencyKey,
    ),
    index("telephony_messages_consultation_requested_idx").on(
      table.consultationId,
      table.requestedAt,
    ),
    index("telephony_messages_status_requested_idx").on(
      table.commandStatus,
      table.requestedAt,
    ),
    check(
      "telephony_messages_remote_phone_fingerprint_length",
      sql`octet_length(${table.remotePhoneFingerprint}) = 32`,
    ),
    check(
      "telephony_messages_body_ciphertext_length",
      sql`octet_length(${table.bodyCiphertext}) >= 17`,
    ),
    check(
      "telephony_messages_body_nonce_length",
      sql`octet_length(${table.bodyNonce}) = 12`,
    ),
    check(
      "telephony_messages_body_key_version_nonempty",
      sql`length(btrim(${table.bodyKeyVersion})) > 0`,
    ),
    check(
      "telephony_messages_body_fingerprint_length",
      sql`octet_length(${table.bodyFingerprint}) = 32`,
    ),
    check(
      "telephony_messages_kind_byte_length",
      sql`(
        ${table.messageKind} = 'sms'
        AND ${table.bodyByteLength} >= 1
        AND ${table.bodyByteLength} <= 80
      ) OR (
        ${table.messageKind} = 'lms'
        AND ${table.bodyByteLength} >= 81
        AND ${table.bodyByteLength} <= 720
      ) OR (
        ${table.messageKind} = 'mms'
        AND ${table.bodyByteLength} >= 1
        AND ${table.bodyByteLength} <= 720
      )`,
    ),
    check(
      "telephony_messages_provider_kind",
      sql`(
        ${table.provider} = 'centrex'
        AND ${table.messageKind} IN ('sms', 'lms')
      ) OR (
        ${table.provider} = 'solapi'
        AND ${table.messageKind} = 'mms'
      )`,
    ),
    check(
      "telephony_messages_image_snapshot_pair",
      sql`(
        ${table.messageKind} = 'mms'
        AND ${table.imageFileIdSnapshot} IS NOT NULL
        AND ${table.imageOriginalNameSnapshot} IS NOT NULL
      ) OR (
        ${table.messageKind} <> 'mms'
        AND ${table.imageFileIdSnapshot} IS NULL
        AND ${table.imageOriginalNameSnapshot} IS NULL
      )`,
    ),
    check(
      "telephony_messages_template_snapshot_pair",
      sql`(${table.templateId} IS NULL) = (${table.templateNameSnapshot} IS NULL)`,
    ),
    check(
      "telephony_messages_dispatch_time_order",
      sql`${table.dispatchedAt} IS NULL OR ${table.dispatchedAt} >= ${table.requestedAt}`,
    ),
    check(
      "telephony_messages_provider_response_time_order",
      sql`${table.providerRespondedAt} IS NULL OR ${table.providerRespondedAt} >= ${table.requestedAt}`,
    ),
    check(
      "telephony_messages_provider_remaining_nonnegative",
      sql`${table.providerRemainingCount} IS NULL OR ${table.providerRemainingCount} >= 0`,
    ),
    check(
      "telephony_messages_error_pair",
      sql`(${table.lastErrorCode} IS NULL AND ${table.lastErrorMessage} IS NULL)
        OR (${table.lastErrorCode} IS NOT NULL AND ${table.lastErrorMessage} IS NOT NULL)`,
    ),
  ],
);

export const telephonyCalls = pgTable(
  "telephony_calls",
  {
    id: uuid("id").primaryKey(),
    provider: telephonyProviderEnum("provider").default("centrex").notNull(),
    direction: telephonyCallDirectionEnum("direction")
      .default("outbound")
      .notNull(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => telephonyEndpoints.id, { onDelete: "restrict" }),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "restrict" }),
    consultationRequestId: uuid("consultation_request_id")
      .notNull()
      .references(() => consultationRequests.id, { onDelete: "restrict" }),
    outboxEventId: uuid("outbox_event_id")
      .notNull()
      .references(() => outboxEvents.id, { onDelete: "restrict" }),
    remotePhoneFingerprint: bytea("remote_phone_fingerprint").notNull(),
    commandStatus: telephonyCommandStatusEnum("command_status")
      .default("queued")
      .notNull(),
    outcome: telephonyCallOutcomeEnum("outcome").default("unknown").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    providerRespondedAt: timestamp("provider_responded_at", {
      withTimezone: true,
    }),
    providerStatus: varchar("provider_status", { length: 30 }),
    providerStartedAt: timestamp("provider_started_at", {
      withTimezone: true,
    }),
    providerEndedAt: timestamp("provider_ended_at", {
      withTimezone: true,
    }),
    providerDurationSeconds: integer("provider_duration_seconds"),
    providerBillableSeconds: integer("provider_billable_seconds"),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    disposition: telephonyCallDispositionEnum("disposition"),
    dispositionConfirmedAt: timestamp("disposition_confirmed_at", {
      withTimezone: true,
    }),
    dispositionConfirmedByUserId: uuid(
      "disposition_confirmed_by_user_id",
    ).references(() => staffUsers.id, { onDelete: "restrict" }),
    lastErrorCode: varchar("last_error_code", { length: 100 }),
    lastErrorMessage: text("last_error_message"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telephony_calls_outbox_event_uidx").on(table.outboxEventId),
    index("telephony_calls_consultation_requested_idx").on(
      table.consultationId,
      table.requestedAt,
    ),
    index("telephony_calls_staff_requested_idx").on(
      table.staffUserId,
      table.requestedAt,
    ),
    index("telephony_calls_command_status_requested_idx").on(
      table.commandStatus,
      table.requestedAt,
    ),
    uniqueIndex("telephony_calls_endpoint_provider_started_uidx")
      .on(table.endpointId, table.providerStartedAt)
      .where(sql`${table.providerStartedAt} IS NOT NULL`),
    check(
      "telephony_calls_remote_phone_fingerprint_length",
      sql`octet_length(${table.remotePhoneFingerprint}) = 32`,
    ),
    check(
      "telephony_calls_dispatch_time_order",
      sql`${table.dispatchedAt} IS NULL OR ${table.dispatchedAt} >= ${table.requestedAt}`,
    ),
    check(
      "telephony_calls_provider_response_time_order",
      sql`${table.providerRespondedAt} IS NULL OR ${table.providerRespondedAt} >= ${table.requestedAt}`,
    ),
    check(
      "telephony_calls_error_pair",
      sql`(${table.lastErrorCode} IS NULL AND ${table.lastErrorMessage} IS NULL)
        OR (${table.lastErrorCode} IS NOT NULL AND ${table.lastErrorMessage} IS NOT NULL)`,
    ),
    check(
      "telephony_calls_provider_duration_nonnegative",
      sql`${table.providerDurationSeconds} IS NULL OR ${table.providerDurationSeconds} >= 0`,
    ),
    check(
      "telephony_calls_provider_billable_nonnegative",
      sql`${table.providerBillableSeconds} IS NULL OR ${table.providerBillableSeconds} >= 0`,
    ),
    check(
      "telephony_calls_provider_time_order",
      sql`${table.providerEndedAt} IS NULL
        OR ${table.providerStartedAt} IS NULL
        OR ${table.providerEndedAt} >= ${table.providerStartedAt}`,
    ),
    check(
      "telephony_calls_reconciliation_complete",
      sql`${table.reconciledAt} IS NULL OR (
        ${table.providerStatus} IS NOT NULL
        AND ${table.providerStartedAt} IS NOT NULL
        AND ${table.providerEndedAt} IS NOT NULL
        AND ${table.providerDurationSeconds} IS NOT NULL
        AND ${table.providerBillableSeconds} IS NOT NULL
      )`,
    ),
    check(
      "telephony_calls_disposition_confirmation_pair",
      sql`(
        ${table.disposition} IS NULL
        AND ${table.dispositionConfirmedAt} IS NULL
        AND ${table.dispositionConfirmedByUserId} IS NULL
      ) OR (
        ${table.disposition} IS NOT NULL
        AND ${table.dispositionConfirmedAt} IS NOT NULL
        AND ${table.dispositionConfirmedByUserId} IS NOT NULL
      )`,
    ),
    check(
      "telephony_calls_disposition_after_reconciliation",
      sql`${table.disposition} IS NULL OR ${table.reconciledAt} IS NOT NULL`,
    ),
  ],
);

export const telephonyInboundCalls = pgTable(
  "telephony_inbound_calls",
  {
    id: uuid("id").primaryKey(),
    provider: telephonyProviderEnum("provider").default("centrex").notNull(),
    direction: telephonyCallDirectionEnum("direction")
      .default("inbound")
      .notNull(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => telephonyEndpoints.id, { onDelete: "restrict" }),
    bridgeId: varchar("bridge_id", { length: 80 }).notNull(),
    providerCallId: varchar("provider_call_id", { length: 100 }).notNull(),
    remotePhoneCiphertext: bytea("remote_phone_ciphertext").notNull(),
    remotePhoneNonce: bytea("remote_phone_nonce").notNull(),
    remotePhoneKeyVersion: varchar("remote_phone_key_version", {
      length: 50,
    }).notNull(),
    remotePhoneFingerprint: bytea("remote_phone_fingerprint").notNull(),
    remotePhoneMasked: varchar("remote_phone_masked", { length: 20 }).notNull(),
    incomingLineLast4: varchar("incoming_line_last4", { length: 4 }).notNull(),
    state: telephonyInboundCallStateEnum("state").default("ringing").notNull(),
    ringingAt: timestamp("ringing_at", { withTimezone: true }).notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    providerEndCause: varchar("provider_end_cause", { length: 30 }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telephony_inbound_calls_endpoint_provider_call_uidx").on(
      table.endpointId,
      table.providerCallId,
    ),
    index("telephony_inbound_calls_state_last_event_idx").on(
      table.direction,
      table.state,
      table.lastEventAt,
    ),
    index("telephony_inbound_calls_phone_ringing_idx").on(
      table.remotePhoneFingerprint,
      table.ringingAt,
    ),
    check(
      "telephony_inbound_calls_bridge_id_format",
      sql`${table.bridgeId} ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$'`,
    ),
    check(
      "telephony_inbound_calls_provider_call_id_format",
      sql`${table.providerCallId} ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'`,
    ),
    check(
      "telephony_inbound_calls_phone_crypto",
      sql`octet_length(${table.remotePhoneNonce}) = 12
        AND octet_length(${table.remotePhoneFingerprint}) = 32
        AND octet_length(${table.remotePhoneCiphertext}) >= 17`,
    ),
    check(
      "telephony_inbound_calls_masked_phone",
      sql`${table.remotePhoneMasked} ~ '^\\*\\*\\*[0-9]{4}$'`,
    ),
    check(
      "telephony_inbound_calls_line_last4",
      sql`${table.incomingLineLast4} ~ '^[0-9]{4}$'`,
    ),
    check(
      "telephony_inbound_calls_state_times",
      sql`(
        ${table.state} = 'ringing'
        AND ${table.connectedAt} IS NULL
        AND ${table.endedAt} IS NULL
        AND ${table.providerEndCause} IS NULL
      ) OR (
        ${table.state} = 'connected'
        AND ${table.connectedAt} IS NOT NULL
        AND ${table.endedAt} IS NULL
        AND ${table.providerEndCause} IS NULL
      ) OR (
        ${table.state} = 'ended'
        AND ${table.endedAt} IS NOT NULL
        AND ${table.providerEndCause} IS NOT NULL
      )`,
    ),
    check(
      "telephony_inbound_calls_time_order",
      sql`(${table.connectedAt} IS NULL OR ${table.connectedAt} >= ${table.ringingAt})
        AND (${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.ringingAt})
        AND ${table.lastEventAt} >= ${table.ringingAt}`,
    ),
  ],
);

export const telephonyCallObservationLinks = pgTable(
  "telephony_call_observation_links",
  {
    observedCallId: uuid("observed_call_id")
      .primaryKey()
      .references(() => telephonyInboundCalls.id, { onDelete: "restrict" }),
    telephonyCallId: uuid("telephony_call_id")
      .notNull()
      .references(() => telephonyCalls.id, { onDelete: "restrict" }),
    matchMethod: varchar("match_method", { length: 50 }).notNull(),
    timeDeltaMs: integer("time_delta_ms").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("telephony_call_observation_links_call_uidx").on(
      table.telephonyCallId,
    ),
    index("telephony_call_observation_links_linked_idx").on(table.linkedAt),
    check(
      "telephony_call_observation_links_method",
      sql`${table.matchMethod} = 'endpoint_phone_time_v1'`,
    ),
    check(
      "telephony_call_observation_links_time_delta",
      sql`${table.timeDeltaMs} BETWEEN -5000 AND 120000`,
    ),
  ],
);

export const telephonyCallAftercare = pgTable(
  "telephony_call_aftercare",
  {
    id: uuid("id").primaryKey(),
    observedCallId: uuid("observed_call_id").references(
      () => telephonyInboundCalls.id,
      { onDelete: "restrict" },
    ),
    telephonyCallId: uuid("telephony_call_id").references(
      () => telephonyCalls.id,
      { onDelete: "restrict" },
    ),
    consultationId: uuid("consultation_id").references(
      () => consultations.id,
      { onDelete: "restrict" },
    ),
    result: telephonyAftercareResultEnum("result").notNull(),
    otherTextCiphertext: bytea("other_text_ciphertext"),
    otherTextNonce: bytea("other_text_nonce"),
    otherTextKeyVersion: varchar("other_text_key_version", { length: 50 }),
    memoCiphertext: bytea("memo_ciphertext"),
    memoNonce: bytea("memo_nonce"),
    memoKeyVersion: varchar("memo_key_version", { length: 50 }),
    confirmedByUserId: uuid("confirmed_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telephony_call_aftercare_observed_uidx")
      .on(table.observedCallId)
      .where(sql`${table.observedCallId} IS NOT NULL`),
    uniqueIndex("telephony_call_aftercare_command_uidx")
      .on(table.telephonyCallId)
      .where(sql`${table.telephonyCallId} IS NOT NULL`),
    index("telephony_call_aftercare_consultation_idx").on(
      table.consultationId,
      table.confirmedAt,
    ),
    check(
      "telephony_call_aftercare_source_present",
      sql`${table.observedCallId} IS NOT NULL OR ${table.telephonyCallId} IS NOT NULL`,
    ),
    check(
      "telephony_call_aftercare_other_text_crypto",
      sql`(
        ${table.result} = 'other'
        AND ${table.otherTextCiphertext} IS NOT NULL
        AND ${table.otherTextNonce} IS NOT NULL
        AND ${table.otherTextKeyVersion} IS NOT NULL
      ) OR (
        ${table.result} <> 'other'
        AND ${table.otherTextCiphertext} IS NULL
        AND ${table.otherTextNonce} IS NULL
        AND ${table.otherTextKeyVersion} IS NULL
      )`,
    ),
    check(
      "telephony_call_aftercare_memo_crypto",
      sql`(
        ${table.memoCiphertext} IS NULL
        AND ${table.memoNonce} IS NULL
        AND ${table.memoKeyVersion} IS NULL
      ) OR (
        ${table.memoCiphertext} IS NOT NULL
        AND ${table.memoNonce} IS NOT NULL
        AND ${table.memoKeyVersion} IS NOT NULL
      )`,
    ),
    check(
      "telephony_call_aftercare_nonce_lengths",
      sql`(${table.otherTextNonce} IS NULL OR octet_length(${table.otherTextNonce}) = 12)
        AND (${table.memoNonce} IS NULL OR octet_length(${table.memoNonce}) = 12)`,
    ),
  ],
);

export const telephonyFollowUpTasks = pgTable(
  "telephony_follow_up_tasks",
  {
    id: uuid("id").primaryKey(),
    aftercareId: uuid("aftercare_id")
      .notNull()
      .references(() => telephonyCallAftercare.id, { onDelete: "restrict" }),
    assigneeUserId: uuid("assignee_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    state: telephonyFollowUpStateEnum("state").default("open").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    completedByUserId: uuid("completed_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telephony_follow_up_tasks_open_aftercare_uidx")
      .on(table.aftercareId)
      .where(sql`${table.state} = 'open'`),
    index("telephony_follow_up_tasks_open_due_idx")
      .on(table.dueAt, table.assigneeUserId)
      .where(sql`${table.state} = 'open'`),
    check(
      "telephony_follow_up_tasks_state_times",
      sql`(
        ${table.state} = 'open'
        AND ${table.completedAt} IS NULL
        AND ${table.completedByUserId} IS NULL
        AND ${table.cancelledAt} IS NULL
      ) OR (
        ${table.state} = 'completed'
        AND ${table.completedAt} IS NOT NULL
        AND ${table.completedByUserId} IS NOT NULL
        AND ${table.cancelledAt} IS NULL
      ) OR (
        ${table.state} = 'cancelled'
        AND ${table.completedAt} IS NULL
        AND ${table.completedByUserId} IS NULL
        AND ${table.cancelledAt} IS NOT NULL
      )`,
    ),
  ],
);

export const telephonyInboundEvents = pgTable(
  "telephony_inbound_events",
  {
    id: uuid("id").primaryKey(),
    inboundCallId: uuid("inbound_call_id")
      .notNull()
      .references(() => telephonyInboundCalls.id, { onDelete: "restrict" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => telephonyEndpoints.id, { onDelete: "restrict" }),
    bridgeId: varchar("bridge_id", { length: 80 }).notNull(),
    direction: telephonyCallDirectionEnum("direction")
      .default("inbound")
      .notNull(),
    eventType: telephonyBridgeEventTypeEnum("event_type").notNull(),
    providerCallId: varchar("provider_call_id", { length: 100 }).notNull(),
    providerChannelId: varchar("provider_channel_id", { length: 100 }),
    providerEndCause: varchar("provider_end_cause", { length: 30 }),
    eventFingerprint: bytea("event_fingerprint").notNull(),
    authenticationNonceHash: bytea("authentication_nonce_hash").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("telephony_inbound_events_bridge_nonce_uidx").on(
      table.bridgeId,
      table.authenticationNonceHash,
    ),
    index("telephony_inbound_events_call_occurred_idx").on(
      table.inboundCallId,
      table.occurredAt,
    ),
    check(
      "telephony_inbound_events_hash_lengths",
      sql`octet_length(${table.eventFingerprint}) = 32
        AND octet_length(${table.authenticationNonceHash}) = 32`,
    ),
    check(
      "telephony_inbound_events_details",
      sql`(
        ${table.direction} = 'inbound'
        AND (${table.eventType})::text = 'inbound.ringing'
        AND ${table.providerChannelId} IS NULL
        AND ${table.providerEndCause} IS NULL
      ) OR (
        ${table.direction} = 'inbound'
        AND (${table.eventType})::text = 'inbound.connected'
        AND ${table.providerEndCause} IS NULL
      ) OR (
        ${table.direction} = 'inbound'
        AND (${table.eventType})::text = 'inbound.ended'
        AND ${table.providerChannelId} IS NULL
        AND ${table.providerEndCause} IS NOT NULL
      ) OR (
        ${table.direction} = 'outbound'
        AND (${table.eventType})::text = 'outbound.ringing'
        AND ${table.providerChannelId} IS NULL
        AND ${table.providerEndCause} IS NULL
      ) OR (
        ${table.direction} = 'outbound'
        AND (${table.eventType})::text = 'outbound.connected'
        AND ${table.providerEndCause} IS NULL
      ) OR (
        ${table.direction} = 'outbound'
        AND (${table.eventType})::text = 'outbound.ended'
        AND ${table.providerChannelId} IS NULL
        AND ${table.providerEndCause} IS NOT NULL
      )`,
    ),
  ],
);

export const telephonyInboundCommands = pgTable(
  "telephony_inbound_commands",
  {
    id: uuid("id").primaryKey(),
    inboundCallId: uuid("inbound_call_id")
      .notNull()
      .references(() => telephonyInboundCalls.id, { onDelete: "restrict" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => telephonyEndpoints.id, { onDelete: "restrict" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    bridgeId: varchar("bridge_id", { length: 80 }).notNull(),
    commandType: varchar("command_type", { length: 30 })
      .default("answer")
      .notNull(),
    providerCallId: varchar("provider_call_id", { length: 100 }).notNull(),
    status: telephonyInboundCommandStatusEnum("status")
      .default("queued")
      .notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    firstDispatchedAt: timestamp("first_dispatched_at", {
      withTimezone: true,
    }),
    lastDispatchedAt: timestamp("last_dispatched_at", {
      withTimezone: true,
    }),
    dispatchAttempts: integer("dispatch_attempts").default(0).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    resultCode: varchar("result_code", { length: 60 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telephony_inbound_commands_active_call_uidx")
      .on(table.inboundCallId, table.commandType)
      .where(sql`${table.status} IN ('queued', 'dispatching')`),
    index("telephony_inbound_commands_bridge_dispatch_idx").on(
      table.bridgeId,
      table.endpointId,
      table.status,
      table.requestedAt,
    ),
    index("telephony_inbound_commands_call_requested_idx").on(
      table.inboundCallId,
      table.requestedAt,
    ),
    check(
      "telephony_inbound_commands_bridge_id_format",
      sql`${table.bridgeId} ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$'`,
    ),
    check(
      "telephony_inbound_commands_provider_call_id_format",
      sql`${table.providerCallId} ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'`,
    ),
    check(
      "telephony_inbound_commands_type",
      sql`${table.commandType} = 'answer'`,
    ),
    check(
      "telephony_inbound_commands_time_order",
      sql`${table.expiresAt} > ${table.requestedAt}
        AND (${table.firstDispatchedAt} IS NULL OR ${table.firstDispatchedAt} >= ${table.requestedAt})
        AND (${table.lastDispatchedAt} IS NULL OR ${table.lastDispatchedAt} >= ${table.firstDispatchedAt})
        AND (${table.completedAt} IS NULL OR ${table.completedAt} >= ${table.requestedAt})`,
    ),
    check(
      "telephony_inbound_commands_attempts_nonnegative",
      sql`${table.dispatchAttempts} >= 0`,
    ),
    check(
      "telephony_inbound_commands_status_details",
      sql`(
        ${table.status} = 'queued'
        AND ${table.firstDispatchedAt} IS NULL
        AND ${table.lastDispatchedAt} IS NULL
        AND ${table.dispatchAttempts} = 0
        AND ${table.completedAt} IS NULL
        AND ${table.resultCode} IS NULL
      ) OR (
        ${table.status} = 'dispatching'
        AND ${table.firstDispatchedAt} IS NOT NULL
        AND ${table.lastDispatchedAt} IS NOT NULL
        AND ${table.dispatchAttempts} > 0
        AND ${table.completedAt} IS NULL
        AND ${table.resultCode} IS NULL
      ) OR (
        ${table.status} IN ('succeeded', 'failed')
        AND ${table.firstDispatchedAt} IS NOT NULL
        AND ${table.lastDispatchedAt} IS NOT NULL
        AND ${table.dispatchAttempts} > 0
        AND ${table.completedAt} IS NOT NULL
        AND ${table.resultCode} IS NOT NULL
      ) OR (
        ${table.status} = 'expired'
        AND ${table.completedAt} IS NOT NULL
        AND ${table.resultCode} IS NOT NULL
      )`,
    ),
  ],
);

export const alimtalkDeliveries = pgTable(
  "alimtalk_deliveries",
  {
    id: uuid("id").primaryKey(),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "restrict" }),
    requestId: uuid("request_id")
      .notNull()
      .references(() => consultationRequests.id, { onDelete: "restrict" }),
    outboxEventId: uuid("outbox_event_id")
      .notNull()
      .references(() => outboxEvents.id, { onDelete: "restrict" }),
    templatePurpose: varchar("template_purpose", {
      length: 50,
    }).notNull(),
    providerGroupId: varchar("provider_group_id", { length: 100 }).notNull(),
    providerMessageId: varchar("provider_message_id", {
      length: 100,
    }).notNull(),
    providerStatusCode: varchar("provider_status_code", {
      length: 20,
    }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("alimtalk_deliveries_outbox_uidx").on(table.outboxEventId),
    uniqueIndex("alimtalk_deliveries_message_uidx").on(
      table.providerMessageId,
    ),
    index("alimtalk_deliveries_consultation_accepted_idx").on(
      table.consultationId,
      table.acceptedAt,
    ),
    check(
      "alimtalk_deliveries_template_purpose_allowed",
      sql`${table.templatePurpose} IN ('consultation_requested', 'consultation_assigned')`,
    ),
    check(
      "alimtalk_deliveries_status_nonempty",
      sql`length(btrim(${table.providerStatusCode})) > 0`,
    ),
  ],
);

export const legalFriendsCaseLinks = pgTable(
  "legalfriends_case_links",
  {
    consultationId: uuid("consultation_id")
      .primaryKey()
      .references(() => consultations.id, { onDelete: "restrict" }),
    outboxEventId: uuid("outbox_event_id")
      .notNull()
      .references(() => outboxEvents.id, { onDelete: "restrict" }),
    caseIdx: varchar("case_idx", { length: 100 }).notNull(),
    managerExternalAccountId: varchar("manager_external_account_id", {
      length: 200,
    }).notNull(),
    caseCreatedAt: timestamp("case_created_at", {
      withTimezone: true,
    }).notNull(),
    managerAssignedAt: timestamp("manager_assigned_at", {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("legalfriends_case_links_outbox_uidx").on(
      table.outboxEventId,
    ),
    uniqueIndex("legalfriends_case_links_case_idx_uidx").on(table.caseIdx),
  ],
);
