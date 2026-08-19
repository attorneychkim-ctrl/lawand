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
  primaryKey,
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
  ConsultationAssigneeTransferReason,
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
  "repeat_unassigned",
  "repeat_assigned",
  "suspected_duplicate",
]);

export const contactPreferenceEnum = pgEnum("contact_preference", [
  "as_soon_as_possible",
  "scheduled_window",
]);

export const consultationAssignmentTransferReasonEnum = pgEnum(
  "consultation_assignment_transfer_reason",
  [
    "workload_balance",
    "absence",
    "expertise",
    "manager_adjustment",
    "other",
  ],
);

export const consultationAssignmentTransferStatusEnum = pgEnum(
  "consultation_assignment_transfer_status",
  ["pending", "succeeded", "failed", "needs_confirmation"],
);

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

export const reviewRestrictionReasonEnum = pgEnum(
  "review_restriction_reason",
  [
    "privacy",
    "unverified",
    "abusive_or_manipulated",
    "customer_request",
    "duplicate",
    "other",
  ],
);

export const reviewCustomerLinkSourceEnum = pgEnum(
  "review_customer_link_source",
  ["invitation", "exact_phone", "manual"],
);

export const reviewRequestStatusEnum = pgEnum("review_request_status", [
  "queued",
  "sent",
  "failed",
  "redeemed",
  "cancelled",
]);
export const reviewGiftCouponStatusEnum = pgEnum("review_gift_coupon_status", ["prepared", "sent", "failed", "cancelled", "unknown"]);

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

export const telephonyCallTargetSourceEnum = pgEnum(
  "telephony_call_target_source",
  ["consultation", "legal_friends_directory"],
);

export const telephonyMessageTargetSourceEnum = pgEnum(
  "telephony_message_target_source",
  ["consultation", "legal_friends_directory", "manual"],
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
    "internal_completed",
    "internal_follow_up",
    "internal_no_answer",
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

export const telephonyCallScopeEnum = pgEnum("telephony_call_scope", [
  "external",
  "internal",
]);

export const telephonyCallRootStateEnum = pgEnum(
  "telephony_call_root_state",
  ["ringing", "connected", "transferring", "needs_confirmation", "ended"],
);

export const telephonyCallLegKindEnum = pgEnum("telephony_call_leg_kind", [
  "customer",
  "consultation",
  "internal",
]);

export const telephonyCallLegStateEnum = pgEnum("telephony_call_leg_state", [
  "ringing",
  "connected",
  "ended",
]);

export const telephonyCallPartyKindEnum = pgEnum(
  "telephony_call_party_kind",
  ["external", "internal", "unknown"],
);

export const telephonyCallCorrelationStatusEnum = pgEnum(
  "telephony_call_correlation_status",
  ["pending", "confirmed", "needs_confirmation", "rejected"],
);

export const telephonyCallRelationTypeEnum = pgEnum(
  "telephony_call_relation_type",
  [
    "transfer_attempted",
    "transfer_completed",
    "transfer_returned",
    "transfer_unresolved",
    "call_picked_up",
    "staff_resolved",
  ],
);

export const telephonyProviderIdentifierRoleEnum = pgEnum(
  "telephony_provider_identifier_role",
  ["root", "channel", "source"],
);

export const telephonyCallObservationTypeEnum = pgEnum(
  "telephony_call_observation_type",
  ["ringing", "channels", "ended"],
);

export const telephonyChannelKindEnum = pgEnum("telephony_channel_kind", [
  "sip",
  "pjsip",
  "local",
  "local_xfer",
  "other",
  "none",
]);

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
    publicNumber: varchar("public_number", { length: 20 }),
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
      "telephony_endpoints_public_number_scope",
      sql`(
        ${table.endpointType} = 'personal'
        AND ${table.publicNumber} IS NULL
      ) OR (
        ${table.endpointType} = 'representative'
        AND (
          ${table.publicNumber} IS NULL
          OR ${table.publicNumber} ~ '^0[0-9]{8,10}$'
        )
      )`,
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
    legacyId: bigint("legacy_id", { mode: "number" }),
    legacyContentId: bigint("legacy_content_id", { mode: "number" }),
    legacyUrl: text("legacy_url"),
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
    sourceHash: bytea("source_hash"),
    importBatchId: uuid("import_batch_id")
      .references(() => reviewImportBatches.id, { onDelete: "restrict" }),
    originalCreatedAt: timestamp("original_created_at", {
      withTimezone: true,
    }).notNull(),
    originalUpdatedAt: timestamp("original_updated_at", {
      withTimezone: true,
    }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    restrictionReason: reviewRestrictionReasonEnum("restriction_reason"),
    restrictionNote: varchar("restriction_note", { length: 500 }),
    restrictedByUserId: uuid("restricted_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    restrictedAt: timestamp("restricted_at", { withTimezone: true }),
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
      sql`${table.legacyId} IS NULL OR ${table.legacyId} > 0`,
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
      sql`${table.sourceHash} IS NULL OR octet_length(${table.sourceHash}) = 32`,
    ),
    check(
      "customer_reviews_source_provenance",
      sql`(
        ${table.importBatchId} IS NOT NULL
        AND ${table.legacyId} IS NOT NULL
        AND ${table.legacyUrl} IS NOT NULL
        AND ${table.sourceHash} IS NOT NULL
      ) OR (
        ${table.importBatchId} IS NULL
        AND ${table.legacyId} IS NULL
        AND ${table.legacyContentId} IS NULL
        AND ${table.legacyUrl} IS NULL
        AND ${table.sourceHash} IS NULL
      )`,
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
    check(
      "customer_reviews_restriction_consistent",
      sql`(
        ${table.publicationStatus} = 'withheld'
        AND (
          (
            ${table.importBatchId} IS NOT NULL
            AND ${table.restrictionReason} IS NULL
            AND ${table.restrictionNote} IS NULL
            AND ${table.restrictedAt} IS NULL
            AND ${table.restrictedByUserId} IS NULL
          ) OR (
            ${table.restrictionReason} IS NOT NULL
            AND ${table.restrictedAt} IS NOT NULL
            AND ${table.restrictedByUserId} IS NOT NULL
          )
        )
      ) OR (
        ${table.publicationStatus} <> 'withheld'
        AND ${table.restrictionReason} IS NULL
        AND ${table.restrictionNote} IS NULL
        AND ${table.restrictedAt} IS NULL
        AND ${table.restrictedByUserId} IS NULL
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
    moderatedByUserId: uuid("moderated_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    decisionReason: reviewRestrictionReasonEnum("decision_reason"),
    decisionNote: varchar("decision_note", { length: 500 }),
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
        AND ${table.moderatedByUserId} IS NOT NULL
        AND ${table.publishedReviewId} IS NOT NULL
        AND ${table.decisionReason} IS NULL
        AND ${table.decisionNote} IS NULL
      ) OR (
        ${table.status} IN ('rejected', 'withdrawn')
        AND ${table.moderatedAt} IS NOT NULL
        AND ${table.moderatedByUserId} IS NOT NULL
        AND ${table.publishedReviewId} IS NULL
        AND ${table.decisionReason} IS NOT NULL
      ) OR (
        ${table.status} = 'pending_review'
        AND ${table.moderatedAt} IS NULL
        AND ${table.moderatedByUserId} IS NULL
        AND ${table.publishedReviewId} IS NULL
        AND ${table.decisionReason} IS NULL
        AND ${table.decisionNote} IS NULL
      )`,
    ),
  ],
);

export const customerReviewLinks = pgTable(
  "customer_review_links",
  {
    id: uuid("id").primaryKey(),
    reviewId: uuid("review_id").references(() => customerReviews.id, {
      onDelete: "restrict",
    }),
    submissionId: uuid("submission_id").references(
      () => customerReviewSubmissions.id,
      { onDelete: "restrict" },
    ),
    directoryClientIdx: integer("directory_client_idx").notNull(),
    directoryCaseIdx: integer("directory_case_idx").notNull(),
    source: reviewCustomerLinkSourceEnum("source").notNull(),
    linkedByUserId: uuid("linked_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customer_review_links_review_uidx")
      .on(table.reviewId)
      .where(sql`${table.reviewId} IS NOT NULL`),
    uniqueIndex("customer_review_links_submission_uidx")
      .on(table.submissionId)
      .where(sql`${table.submissionId} IS NOT NULL`),
    index("customer_review_links_directory_idx").on(
      table.directoryClientIdx,
      table.directoryCaseIdx,
    ),
    check(
      "customer_review_links_subject_present",
      sql`${table.reviewId} IS NOT NULL OR ${table.submissionId} IS NOT NULL`,
    ),
    check(
      "customer_review_links_directory_positive",
      sql`${table.directoryClientIdx} > 0 AND ${table.directoryCaseIdx} > 0`,
    ),
    check(
      "customer_review_links_actor_consistent",
      sql`(${table.source} = 'manual' AND ${table.linkedByUserId} IS NOT NULL)
        OR (${table.source} <> 'manual' AND ${table.linkedByUserId} IS NULL)`,
    ),
  ],
);

export const customerReviewLinkManagers = pgTable(
  "customer_review_link_managers",
  {
    id: uuid("id").primaryKey(),
    linkId: uuid("link_id")
      .notNull()
      .references(() => customerReviewLinks.id, { onDelete: "cascade" }),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    externalMemberIdx: integer("external_member_idx").notNull(),
    position: integer("position").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("customer_review_link_managers_link_staff_uidx").on(
      table.linkId,
      table.staffUserId,
    ),
    index("customer_review_link_managers_staff_idx").on(
      table.staffUserId,
      table.linkId,
    ),
    check(
      "customer_review_link_managers_values_positive",
      sql`${table.externalMemberIdx} > 0 AND ${table.position} BETWEEN 1 AND 3`,
    ),
  ],
);

export const customerReviewReplies = pgTable(
  "customer_review_replies",
  {
    id: uuid("id").primaryKey(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => customerReviews.id, { onDelete: "restrict" }),
    content: text("content").notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    updatedByUserId: uuid("updated_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customer_review_replies_review_uidx").on(table.reviewId),
    check(
      "customer_review_replies_content_length",
      sql`length(btrim(${table.content})) BETWEEN 2 AND 3000`,
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
    softDeletedAt: timestamp("soft_deleted_at", { withTimezone: true }),
    softDeletedByUserId: uuid("soft_deleted_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("consultations_public_receipt_code_uidx").on(
      table.publicReceiptCode,
    ),
    index("consultations_phone_fingerprint_idx").on(table.phoneFingerprint),
    index("consultations_last_requested_idx").on(table.lastRequestedAt),
    index("consultations_soft_deleted_at_idx").on(table.softDeletedAt),
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
        OR ${table.contactChannel} = 'kakao_channel'
        OR (${table.contactChannel} = 'naver_booking' AND ${table.phoneFingerprint} IS NULL)`,
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
    check(
      "consultations_soft_delete_consistent",
      sql`(${table.softDeletedAt} IS NULL AND ${table.softDeletedByUserId} IS NULL)
        OR (${table.softDeletedAt} IS NOT NULL AND ${table.softDeletedByUserId} IS NOT NULL AND ${table.state} = 'closed')`,
    ),
  ],
);

export const consultationGroups = pgTable(
  "consultation_groups",
  {
    id: uuid("id").primaryKey(),
    canonicalConsultationId: uuid("canonical_consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "restrict" }),
    phoneFingerprint: bytea("phone_fingerprint"),
    status: varchar("status", { length: 20 }).default("active").notNull(),
    mergedIntoGroupId: uuid("merged_into_group_id"),
    createdReason: varchar("created_reason", { length: 40 }).notNull(),
    createdByUserId: uuid("created_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    firstRequestedAt: timestamp("first_requested_at", {
      withTimezone: true,
    }).notNull(),
    lastRequestedAt: timestamp("last_requested_at", {
      withTimezone: true,
    }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("consultation_groups_canonical_uidx")
      .on(table.canonicalConsultationId)
      .where(sql`${table.status} = 'active'`),
    index("consultation_groups_phone_last_requested_idx").on(
      table.phoneFingerprint,
      table.lastRequestedAt,
    ),
    index("consultation_groups_merged_into_idx").on(table.mergedIntoGroupId),
    foreignKey({
      columns: [table.mergedIntoGroupId],
      foreignColumns: [table.id],
      name: "consultation_groups_merged_into_group_id_fk",
    }).onDelete("restrict"),
    check(
      "consultation_groups_status_allowed",
      sql`${table.status} IN ('active', 'merged')`,
    ),
    check(
      "consultation_groups_merge_consistent",
      sql`(${table.status} = 'active' AND ${table.mergedIntoGroupId} IS NULL)
        OR (${table.status} = 'merged' AND ${table.mergedIntoGroupId} IS NOT NULL AND ${table.mergedIntoGroupId} <> ${table.id})`,
    ),
    check(
      "consultation_groups_reason_allowed",
      sql`${table.createdReason} IN ('automatic_phone_7d', 'manual_link', 'manual_split')`,
    ),
    check(
      "consultation_groups_actor_consistent",
      sql`(${table.createdReason} = 'automatic_phone_7d' AND ${table.createdByUserId} IS NULL)
        OR (${table.createdReason} IN ('manual_link', 'manual_split') AND ${table.createdByUserId} IS NOT NULL)`,
    ),
    check(
      "consultation_groups_request_time_order",
      sql`${table.lastRequestedAt} >= ${table.firstRequestedAt}`,
    ),
    check(
      "consultation_groups_phone_fingerprint_length",
      sql`${table.phoneFingerprint} IS NULL OR octet_length(${table.phoneFingerprint}) = 32`,
    ),
  ],
);

export const consultationGroupMembers = pgTable(
  "consultation_group_members",
  {
    consultationId: uuid("consultation_id")
      .primaryKey()
      .references(() => consultations.id, { onDelete: "restrict" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => consultationGroups.id, { onDelete: "restrict" }),
    linkMethod: varchar("link_method", { length: 40 }).notNull(),
    linkedByUserId: uuid("linked_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("consultation_group_members_group_idx").on(table.groupId),
    check(
      "consultation_group_members_method_allowed",
      sql`${table.linkMethod} IN ('automatic_phone_7d', 'manual_link', 'manual_split')`,
    ),
    check(
      "consultation_group_members_actor_consistent",
      sql`(${table.linkMethod} = 'automatic_phone_7d' AND ${table.linkedByUserId} IS NULL)
        OR (${table.linkMethod} IN ('manual_link', 'manual_split') AND ${table.linkedByUserId} IS NOT NULL)`,
    ),
  ],
);

export const consultationGroupEvents = pgTable(
  "consultation_group_events",
  {
    id: uuid("id").primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => consultationGroups.id, { onDelete: "restrict" }),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "restrict" }),
    eventType: varchar("event_type", { length: 40 }).notNull(),
    actorUserId: uuid("actor_user_id").references(() => staffUsers.id, {
      onDelete: "restrict",
    }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("consultation_group_events_group_occurred_idx").on(
      table.groupId,
      table.occurredAt,
    ),
    index("consultation_group_events_consultation_idx").on(
      table.consultationId,
    ),
    check(
      "consultation_group_events_type_allowed",
      sql`${table.eventType} IN ('created', 'linked', 'unlinked', 'canonical_changed', 'merged')`,
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
      sql`${table.assignmentMethod} IN ('self_claim', 'phone_desk_conversion', 'transfer')`,
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
    createdByUserId: uuid("created_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
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
        (
          ${table.phoneFingerprint} IS NOT NULL
          AND ${table.phoneCiphertext} IS NOT NULL
          AND ${table.phoneNonce} IS NOT NULL
          AND ${table.phoneKeyVersion} IS NOT NULL
        ) OR (
          ${table.phoneFingerprint} IS NULL
          AND ${table.phoneCiphertext} IS NULL
          AND ${table.phoneNonce} IS NULL
          AND ${table.phoneKeyVersion} IS NULL
        )
      )
        AND (${table.contactChannel} <> 'phone' OR ${table.phoneFingerprint} IS NOT NULL)
        AND (${table.contactChannel} <> 'naver_booking' OR ${table.phoneFingerprint} IS NULL)`,
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

export const consultationDirectorySources = pgTable(
  "consultation_directory_sources",
  {
    consultationId: uuid("consultation_id")
      .primaryKey()
      .references(() => consultations.id, { onDelete: "restrict" }),
    consultationRequestId: uuid("consultation_request_id")
      .notNull(),
    directoryClientIdx: integer("directory_client_idx").notNull(),
    directoryCaseIdx: integer("directory_case_idx").notNull(),
    relationship: varchar("relationship", { length: 20 }).notNull(),
    snapshotCiphertext: bytea("snapshot_ciphertext").notNull(),
    snapshotNonce: bytea("snapshot_nonce").notNull(),
    snapshotKeyVersion: varchar("snapshot_key_version", { length: 50 })
      .notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("consultation_directory_sources_request_uidx").on(
      table.consultationRequestId,
    ),
    index("consultation_directory_sources_client_case_idx").on(
      table.directoryClientIdx,
      table.directoryCaseIdx,
    ),
    foreignKey({
      columns: [table.consultationRequestId, table.consultationId],
      foreignColumns: [
        consultationRequests.id,
        consultationRequests.consultationId,
      ],
      name: "consultation_directory_sources_request_consultation_fk",
    }).onDelete("restrict"),
    check(
      "consultation_directory_sources_ids_positive",
      sql`${table.directoryClientIdx} > 0 AND ${table.directoryCaseIdx} > 0`,
    ),
    check(
      "consultation_directory_sources_relationship_allowed",
      sql`${table.relationship} IN ('customer', 'referrer')`,
    ),
    check(
      "consultation_directory_sources_crypto",
      sql`octet_length(${table.snapshotNonce}) = 12
        AND octet_length(${table.snapshotCiphertext}) >= 17`,
    ),
  ],
);

export const consultationLegalFriendsHandlings = pgTable(
  "consultation_legalfriends_handlings",
  {
    consultationId: uuid("consultation_id")
      .primaryKey()
      .references(() => consultations.id, { onDelete: "restrict" }),
    mode: varchar("mode", { length: 32 }).notNull(),
    directoryClientIdx: integer("directory_client_idx"),
    directoryCaseIdx: integer("directory_case_idx"),
    decidedByUserId: uuid("decided_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("consultation_legalfriends_handlings_directory_idx").on(
      table.directoryClientIdx,
      table.directoryCaseIdx,
    ),
    check(
      "consultation_legalfriends_handlings_mode_allowed",
      sql`${table.mode} IN ('existing_case', 'new_matter', 'shared_contact')`,
    ),
    check(
      "consultation_legalfriends_handlings_directory_consistent",
      sql`(${table.mode} = 'existing_case'
        AND ${table.directoryClientIdx} IS NOT NULL
        AND ${table.directoryClientIdx} > 0
        AND ${table.directoryCaseIdx} IS NOT NULL
        AND ${table.directoryCaseIdx} > 0)
        OR (${table.mode} IN ('new_matter', 'shared_contact')
          AND ${table.directoryClientIdx} IS NULL
          AND ${table.directoryCaseIdx} IS NULL)`,
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

export const consultationAssignmentTransfers = pgTable(
  "consultation_assignment_transfers",
  {
    id: uuid("id").primaryKey(),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultations.id, { onDelete: "restrict" }),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => consultationAssignments.id, {
        onDelete: "restrict",
      }),
    previousAssigneeUserId: uuid("previous_assignee_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    previousAssigneeMembershipId: uuid("previous_assignee_membership_id")
      .notNull()
      .references(() => staffMemberships.id, { onDelete: "restrict" }),
    targetAssigneeUserId: uuid("target_assignee_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    targetAssigneeMembershipId: uuid("target_assignee_membership_id")
      .notNull()
      .references(() => staffMemberships.id, { onDelete: "restrict" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    reason: consultationAssignmentTransferReasonEnum("reason")
      .$type<ConsultationAssigneeTransferReason>()
      .notNull(),
    targetManagerExternalAccountId: varchar(
      "target_manager_external_account_id",
      { length: 200 },
    ).notNull(),
    targetManagerMemberIdx: integer("target_manager_member_idx").notNull(),
    outboxEventId: uuid("outbox_event_id")
      .notNull()
      .references(() => outboxEvents.id, { onDelete: "restrict" }),
    status: consultationAssignmentTransferStatusEnum("status")
      .default("pending")
      .notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("consultation_assignment_transfers_outbox_uidx").on(
      table.outboxEventId,
    ),
    uniqueIndex("consultation_assignment_transfers_pending_uidx")
      .on(table.consultationId)
      .where(sql`${table.status} = 'pending'`),
    index("consultation_assignment_transfers_consultation_requested_idx").on(
      table.consultationId,
      table.requestedAt,
    ),
    check(
      "consultation_assignment_transfers_distinct_assignee",
      sql`${table.previousAssigneeUserId} <> ${table.targetAssigneeUserId}`,
    ),
    check(
      "consultation_assignment_transfers_target_manager_nonempty",
      sql`length(btrim(${table.targetManagerExternalAccountId})) > 0`,
    ),
    check(
      "consultation_assignment_transfers_target_member_positive",
      sql`${table.targetManagerMemberIdx} > 0`,
    ),
    check(
      "consultation_assignment_transfers_status_consistent",
      sql`(${table.status} = 'pending' AND ${table.finishedAt} IS NULL)
        OR (${table.status} <> 'pending' AND ${table.finishedAt} IS NOT NULL)`,
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
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => staffUsers.id, {
        onDelete: "restrict",
      }),
    name: varchar("name", { length: 80 }).notNull(),
    body: text("body").notNull(),
    bodyByteLength: integer("body_byte_length").notNull(),
    autoSendTrigger: varchar("auto_send_trigger", { length: 40 }),
    imageFileId: varchar("image_file_id", { length: 100 }),
    imageUrl: text("image_url"),
    imageOriginalName: varchar("image_original_name", { length: 100 }),
    imageByteLength: integer("image_byte_length"),
    imageWidth: integer("image_width"),
    imageHeight: integer("image_height"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    updatedByUserId: uuid("updated_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("message_templates_owner_name_lower_uidx").on(
      table.ownerUserId,
      sql`lower(${table.name})`,
    ),
    uniqueIndex("message_templates_owner_auto_send_trigger_uidx")
      .on(table.ownerUserId, table.autoSendTrigger)
      .where(sql`${table.autoSendTrigger} IS NOT NULL`),
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
      "message_templates_auto_send_trigger_valid",
      sql`${table.autoSendTrigger} IS NULL OR ${table.autoSendTrigger} IN ('consultation_assigned', 'no_answer', 'busy', 'manager_callback_requested', 'rejected')`,
    ),
    check(
      "message_templates_owner_audit_consistent",
      sql`${table.createdByUserId} = ${table.ownerUserId}
        AND ${table.updatedByUserId} = ${table.ownerUserId}`,
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

export const telephonyMessageManualContacts = pgTable(
  "telephony_message_manual_contacts",
  {
    id: uuid("id").primaryKey(),
    phoneFingerprint: bytea("phone_fingerprint").notNull(),
    phoneCiphertext: bytea("phone_ciphertext").notNull(),
    phoneNonce: bytea("phone_nonce").notNull(),
    phoneKeyVersion: varchar("phone_key_version", { length: 50 }).notNull(),
    displayNameCiphertext: bytea("display_name_ciphertext").notNull(),
    displayNameNonce: bytea("display_name_nonce").notNull(),
    displayNameKeyVersion: varchar("display_name_key_version", {
      length: 50,
    }).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telephony_message_manual_contacts_phone_uidx").on(
      table.phoneFingerprint,
    ),
    check(
      "telephony_message_manual_contacts_crypto",
      sql`octet_length(${table.phoneFingerprint}) = 32
        AND octet_length(${table.phoneCiphertext}) >= 17
        AND octet_length(${table.phoneNonce}) = 12
        AND length(btrim(${table.phoneKeyVersion})) > 0
        AND octet_length(${table.displayNameCiphertext}) >= 17
        AND octet_length(${table.displayNameNonce}) = 12
        AND length(btrim(${table.displayNameKeyVersion})) > 0`,
    ),
  ],
);

export const telephonyPhonebookContacts = pgTable(
  "telephony_phonebook_contacts",
  {
    id: uuid("id").primaryKey(),
    displayNameCiphertext: bytea("display_name_ciphertext").notNull(),
    displayNameNonce: bytea("display_name_nonce").notNull(),
    displayNameKeyVersion: varchar("display_name_key_version", {
      length: 50,
    }).notNull(),
    originalPhoneFingerprint: bytea("original_phone_fingerprint").notNull(),
    originalPhoneCiphertext: bytea("original_phone_ciphertext").notNull(),
    originalPhoneNonce: bytea("original_phone_nonce").notNull(),
    originalPhoneKeyVersion: varchar("original_phone_key_version", {
      length: 50,
    }).notNull(),
    connectedPhoneFingerprint: bytea("connected_phone_fingerprint"),
    connectedPhoneCiphertext: bytea("connected_phone_ciphertext"),
    connectedPhoneNonce: bytea("connected_phone_nonce"),
    connectedPhoneKeyVersion: varchar("connected_phone_key_version", {
      length: 50,
    }),
    isActive: boolean("is_active").default(true).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    updatedByUserId: uuid("updated_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    deactivatedByUserId: uuid("deactivated_by_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telephony_phonebook_contacts_active_original_phone_uidx")
      .on(table.originalPhoneFingerprint)
      .where(sql`${table.isActive} = true`),
    uniqueIndex("telephony_phonebook_contacts_active_connected_phone_uidx")
      .on(table.connectedPhoneFingerprint)
      .where(
        sql`${table.isActive} = true AND ${table.connectedPhoneFingerprint} IS NOT NULL`,
      ),
    index("telephony_phonebook_contacts_active_updated_idx").on(
      table.isActive,
      table.updatedAt,
    ),
    check(
      "telephony_phonebook_contacts_display_name_crypto",
      sql`octet_length(${table.displayNameCiphertext}) >= 17
        AND octet_length(${table.displayNameNonce}) = 12
        AND length(btrim(${table.displayNameKeyVersion})) > 0`,
    ),
    check(
      "telephony_phonebook_contacts_original_phone_crypto",
      sql`octet_length(${table.originalPhoneFingerprint}) = 32
        AND octet_length(${table.originalPhoneCiphertext}) >= 17
        AND octet_length(${table.originalPhoneNonce}) = 12
        AND length(btrim(${table.originalPhoneKeyVersion})) > 0`,
    ),
    check(
      "telephony_phonebook_contacts_connected_phone_crypto",
      sql`(
        ${table.connectedPhoneFingerprint} IS NULL
        AND ${table.connectedPhoneCiphertext} IS NULL
        AND ${table.connectedPhoneNonce} IS NULL
        AND ${table.connectedPhoneKeyVersion} IS NULL
      ) OR (
        octet_length(${table.connectedPhoneFingerprint}) = 32
        AND octet_length(${table.connectedPhoneCiphertext}) >= 17
        AND octet_length(${table.connectedPhoneNonce}) = 12
        AND length(btrim(${table.connectedPhoneKeyVersion})) > 0
        AND ${table.connectedPhoneFingerprint} <> ${table.originalPhoneFingerprint}
      )`,
    ),
    check(
      "telephony_phonebook_contacts_active_state",
      sql`(
        ${table.isActive} = true
        AND ${table.deactivatedAt} IS NULL
        AND ${table.deactivatedByUserId} IS NULL
      ) OR (
        ${table.isActive} = false
        AND ${table.deactivatedAt} IS NOT NULL
        AND ${table.deactivatedByUserId} IS NOT NULL
      )`,
    ),
  ],
);

export const customerReviewRequestTemplates = pgTable(
  "customer_review_request_templates",
  {
    id: uuid("id").primaryKey(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    presetKey: reviewProgressStageEnum("preset_key"),
    name: varchar("name", { length: 80 }).notNull(),
    body: text("body").notNull(),
    bodyByteLength: integer("body_byte_length").notNull(),
    defaultProgressStage: reviewProgressStageEnum("default_progress_stage")
      .default("other")
      .notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    updatedByUserId: uuid("updated_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customer_review_request_templates_owner_name_lower_uidx")
      .on(table.ownerUserId, sql`lower(${table.name})`)
      .where(sql`${table.deletedAt} IS NULL`),
    uniqueIndex("customer_review_request_templates_owner_preset_uidx")
      .on(table.ownerUserId, table.presetKey)
      .where(sql`${table.presetKey} IS NOT NULL`),
    check(
      "customer_review_request_templates_name_nonempty",
      sql`length(btrim(${table.name})) > 0`,
    ),
    check(
      "customer_review_request_templates_body_nonempty",
      sql`length(btrim(${table.body})) > 0`,
    ),
    check(
      "customer_review_request_templates_body_byte_length",
      sql`${table.bodyByteLength} BETWEEN 1 AND 500`,
    ),
    check(
      "customer_review_request_templates_link_variable",
      sql`position('{{후기작성링크}}' in ${table.body}) > 0`,
    ),
    check(
      "customer_review_request_templates_owner_audit_consistent",
      sql`${table.createdByUserId} = ${table.ownerUserId}
        AND ${table.updatedByUserId} = ${table.ownerUserId}`,
    ),
    check(
      "customer_review_request_templates_preset_active",
      sql`${table.presetKey} IS NULL OR ${table.deletedAt} IS NULL`,
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
    senderNumberSnapshot: varchar("sender_number_snapshot", { length: 20 }),
    replyMailboxEndpointId: uuid("reply_mailbox_endpoint_id").references(
      () => telephonyEndpoints.id,
      { onDelete: "restrict" },
    ),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    targetSource: telephonyMessageTargetSourceEnum("target_source")
      .default("consultation")
      .notNull(),
    consultationId: uuid("consultation_id").references(
      () => consultations.id,
      { onDelete: "restrict" },
    ),
    consultationRequestId: uuid("consultation_request_id").references(
      () => consultationRequests.id,
      { onDelete: "restrict" },
    ),
    manualContactId: uuid("manual_contact_id").references(
      () => telephonyMessageManualContacts.id,
      { onDelete: "restrict" },
    ),
    templateId: uuid("template_id").references(() => messageTemplates.id, {
      onDelete: "set null",
    }),
    templateNameSnapshot: varchar("template_name_snapshot", { length: 80 }),
    imageFileIdSnapshot: varchar("image_file_id_snapshot", { length: 100 }),
    imageUrlSnapshot: text("image_url_snapshot"),
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
    index("telephony_messages_requested_idx").on(table.requestedAt),
    index("telephony_messages_manual_contact_requested_idx").on(
      table.manualContactId,
      table.requestedAt,
    ),
    index("telephony_messages_reply_mailbox_remote_requested_idx").on(
      table.replyMailboxEndpointId,
      table.remotePhoneFingerprint,
      table.requestedAt,
    ),
    check(
      "telephony_messages_sender_number_snapshot_format",
      sql`${table.senderNumberSnapshot} IS NULL OR ${table.senderNumberSnapshot} ~ '^0[0-9]{8,10}$'`,
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
      sql`${table.templateId} IS NULL OR ${table.templateNameSnapshot} IS NOT NULL`,
    ),
    check(
      "telephony_messages_target_reference",
      sql`(
        ${table.targetSource} = 'consultation'
        AND ${table.consultationId} IS NOT NULL
        AND ${table.consultationRequestId} IS NOT NULL
        AND ${table.manualContactId} IS NULL
      ) OR (
        ${table.targetSource} = 'legal_friends_directory'
        AND ${table.consultationId} IS NULL
        AND ${table.consultationRequestId} IS NULL
        AND ${table.manualContactId} IS NULL
      ) OR (
        ${table.targetSource} = 'manual'
        AND ${table.consultationId} IS NULL
        AND ${table.consultationRequestId} IS NULL
        AND ${table.manualContactId} IS NOT NULL
      )`,
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

export const telephonyMessageDirectoryTargets = pgTable(
  "telephony_message_directory_targets",
  {
    telephonyMessageId: uuid("telephony_message_id")
      .primaryKey()
      .references(() => telephonyMessages.id, { onDelete: "restrict" }),
    clientIdx: integer("client_idx").notNull(),
    caseIdx: integer("case_idx").notNull(),
    clientNameCiphertext: bytea("client_name_ciphertext").notNull(),
    clientNameNonce: bytea("client_name_nonce").notNull(),
    clientNameKeyVersion: varchar("client_name_key_version", {
      length: 50,
    }).notNull(),
    phoneCiphertext: bytea("phone_ciphertext").notNull(),
    phoneNonce: bytea("phone_nonce").notNull(),
    phoneKeyVersion: varchar("phone_key_version", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("telephony_message_directory_targets_client_case_idx").on(
      table.clientIdx,
      table.caseIdx,
    ),
    check(
      "telephony_message_directory_targets_ids_positive",
      sql`${table.clientIdx} > 0 AND ${table.caseIdx} > 0`,
    ),
    check(
      "telephony_message_directory_targets_crypto",
      sql`octet_length(${table.clientNameNonce}) = 12
        AND octet_length(${table.clientNameCiphertext}) >= 17
        AND octet_length(${table.phoneNonce}) = 12
        AND octet_length(${table.phoneCiphertext}) >= 17`,
    ),
  ],
);

export const customerReviewRequests = pgTable(
  "customer_review_requests",
  {
    id: uuid("id").primaryKey(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    directoryClientIdx: integer("directory_client_idx").notNull(),
    directoryCaseIdx: integer("directory_case_idx").notNull(),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "restrict" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => customerReviewRequestTemplates.id, {
        onDelete: "restrict",
      }),
    suggestedPracticeArea: reviewPracticeAreaEnum("suggested_practice_area")
      .default("other")
      .notNull(),
    suggestedProgressStage: reviewProgressStageEnum(
      "suggested_progress_stage",
    )
      .default("other")
      .notNull(),
    telephonyMessageId: uuid("telephony_message_id").references(
      () => telephonyMessages.id,
      { onDelete: "restrict" },
    ),
    status: reviewRequestStatusEnum("status").default("queued").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedSubmissionId: uuid("redeemed_submission_id").references(
      () => customerReviewSubmissions.id,
      { onDelete: "restrict" },
    ),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 100 }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("customer_review_requests_idempotency_uidx").on(
      table.idempotencyKey,
    ),
    uniqueIndex("customer_review_requests_message_uidx")
      .on(table.telephonyMessageId)
      .where(sql`${table.telephonyMessageId} IS NOT NULL`),
    uniqueIndex("customer_review_requests_submission_uidx")
      .on(table.redeemedSubmissionId)
      .where(sql`${table.redeemedSubmissionId} IS NOT NULL`),
    index("customer_review_requests_target_requested_idx").on(
      table.directoryClientIdx,
      table.directoryCaseIdx,
      table.requestedAt,
    ),
    index("customer_review_requests_staff_requested_idx").on(
      table.requestedByUserId,
      table.requestedAt,
    ),
    check(
      "customer_review_requests_directory_positive",
      sql`${table.directoryClientIdx} > 0 AND ${table.directoryCaseIdx} > 0`,
    ),
    check(
      "customer_review_requests_expiry_order",
      sql`${table.expiresAt} > ${table.requestedAt}`,
    ),
    check(
      "customer_review_requests_status_consistent",
      sql`(
        ${table.status} = 'queued'
        AND ${table.telephonyMessageId} IS NULL
        AND ${table.sentAt} IS NULL
        AND ${table.redeemedSubmissionId} IS NULL
        AND ${table.redeemedAt} IS NULL
        AND ${table.failedAt} IS NULL
        AND ${table.lastErrorCode} IS NULL
      ) OR (
        ${table.status} = 'sent'
        AND ${table.telephonyMessageId} IS NOT NULL
        AND ${table.sentAt} IS NOT NULL
        AND ${table.redeemedSubmissionId} IS NULL
        AND ${table.redeemedAt} IS NULL
        AND ${table.failedAt} IS NULL
        AND ${table.lastErrorCode} IS NULL
      ) OR (
        ${table.status} = 'redeemed'
        AND ${table.telephonyMessageId} IS NOT NULL
        AND ${table.sentAt} IS NOT NULL
        AND ${table.redeemedSubmissionId} IS NOT NULL
        AND ${table.redeemedAt} IS NOT NULL
        AND ${table.failedAt} IS NULL
        AND ${table.lastErrorCode} IS NULL
      ) OR (
        ${table.status} = 'failed'
        AND ${table.telephonyMessageId} IS NULL
        AND ${table.sentAt} IS NULL
        AND ${table.redeemedSubmissionId} IS NULL
        AND ${table.redeemedAt} IS NULL
        AND ${table.failedAt} IS NOT NULL
        AND ${table.lastErrorCode} IS NOT NULL
      ) OR (
        ${table.status} = 'cancelled'
        AND ${table.redeemedSubmissionId} IS NULL
        AND ${table.redeemedAt} IS NULL
      )`,
    ),
  ],
);

export const reviewGiftCouponDeliveries = pgTable("review_gift_coupon_deliveries", {
  id: uuid("id").primaryKey(),
  idempotencyKey: uuid("idempotency_key").notNull(),
  recordType: varchar("record_type", { length: 20 }).notNull(),
  recordId: uuid("record_id").notNull(),
  requestedByUserId: uuid("requested_by_user_id").notNull().references(() => staffUsers.id, { onDelete: "restrict" }),
  directoryClientIdx: integer("directory_client_idx").notNull(),
  directoryCaseIdx: integer("directory_case_idx").notNull(),
  phoneCiphertext: bytea("phone_ciphertext").notNull(),
  phoneNonce: bytea("phone_nonce").notNull(),
  phoneKeyVersion: varchar("phone_key_version", { length: 50 }).notNull(),
  phoneFingerprint: bytea("phone_fingerprint").notNull(),
  productKey: varchar("product_key", { length: 50 }).notNull(),
  goodsCode: varchar("goods_code", { length: 20 }).notNull(),
  brandNameSnapshot: varchar("brand_name_snapshot", { length: 100 }).notNull(),
  goodsNameSnapshot: varchar("goods_name_snapshot", { length: 200 }).notNull(),
  salePriceSnapshot: integer("sale_price_snapshot").notNull(),
  reason: varchar("reason", { length: 40 }).notNull(),
  trId: varchar("tr_id", { length: 25 }).notNull(),
  providerOrderNo: varchar("provider_order_no", { length: 30 }),
  status: reviewGiftCouponStatusEnum("status").default("prepared").notNull(),
  lastErrorCode: varchar("last_error_code", { length: 100 }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  providerRespondedAt: timestamp("provider_responded_at", { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex("review_gift_coupon_idempotency_uidx").on(table.idempotencyKey),
  uniqueIndex("review_gift_coupon_tr_id_uidx").on(table.trId),
  uniqueIndex("review_gift_coupon_one_active_per_review_uidx").on(table.recordType, table.recordId).where(sql`${table.status} IN ('prepared', 'sent', 'unknown')`),
  index("review_gift_coupon_requested_idx").on(table.requestedAt),
  check("review_gift_coupon_record_type", sql`${table.recordType} IN ('review', 'submission')`),
  check("review_gift_coupon_reason", sql`${table.reason} IN ('review_thanks', 'service_recovery', 'event')`),
  check("review_gift_coupon_directory_positive", sql`${table.directoryClientIdx} > 0 AND ${table.directoryCaseIdx} > 0`),
  check("review_gift_coupon_crypto", sql`octet_length(${table.phoneNonce}) = 12 AND octet_length(${table.phoneCiphertext}) >= 17 AND octet_length(${table.phoneFingerprint}) = 32`),
  check("review_gift_coupon_price_positive", sql`${table.salePriceSnapshot} > 0`),
]);

export const telephonyInboundMessages = pgTable(
  "telephony_inbound_messages",
  {
    id: uuid("id").primaryKey(),
    provider: telephonyMessageProviderEnum("provider")
      .default("centrex")
      .notNull(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => telephonyEndpoints.id, { onDelete: "restrict" }),
    providerSequence: varchar("provider_sequence", { length: 50 }).notNull(),
    providerIdentityFingerprint: bytea(
      "provider_identity_fingerprint",
    ).notNull(),
    remotePhoneFingerprint: bytea("remote_phone_fingerprint").notNull(),
    remotePhoneCiphertext: bytea("remote_phone_ciphertext").notNull(),
    remotePhoneNonce: bytea("remote_phone_nonce").notNull(),
    remotePhoneKeyVersion: varchar("remote_phone_key_version", {
      length: 50,
    }).notNull(),
    bodyCiphertext: bytea("body_ciphertext").notNull(),
    bodyNonce: bytea("body_nonce").notNull(),
    bodyKeyVersion: varchar("body_key_version", { length: 50 }).notNull(),
    bodyFingerprint: bytea("body_fingerprint").notNull(),
    messageKind: telephonyMessageKindEnum("message_kind").notNull(),
    bodyByteLength: integer("body_byte_length").notNull(),
    matchedOutboundMessageId: uuid("matched_outbound_message_id").references(
      () => telephonyMessages.id,
      { onDelete: "restrict" },
    ),
    targetSource: telephonyMessageTargetSourceEnum("target_source"),
    consultationId: uuid("consultation_id").references(
      () => consultations.id,
      { onDelete: "restrict" },
    ),
    directoryClientIdx: integer("directory_client_idx"),
    directoryCaseIdx: integer("directory_case_idx"),
    manualContactId: uuid("manual_contact_id").references(
      () => telephonyMessageManualContacts.id,
      { onDelete: "restrict" },
    ),
    matchStrategy: varchar("match_strategy", { length: 30 })
      .default("unmatched")
      .notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telephony_inbound_messages_provider_identity_uidx").on(
      table.endpointId,
      table.providerIdentityFingerprint,
    ),
    uniqueIndex("telephony_inbound_messages_stable_identity_uidx").on(
      table.endpointId,
      table.remotePhoneFingerprint,
      table.receivedAt,
      table.bodyFingerprint,
    ),
    index("telephony_inbound_messages_endpoint_received_idx").on(
      table.endpointId,
      table.receivedAt,
    ),
    index("telephony_inbound_messages_remote_received_idx").on(
      table.remotePhoneFingerprint,
      table.receivedAt,
    ),
    index("telephony_inbound_messages_case_received_idx").on(
      table.directoryCaseIdx,
      table.receivedAt,
    ),
    index("telephony_inbound_messages_consultation_received_idx").on(
      table.consultationId,
      table.receivedAt,
    ),
    index("telephony_inbound_messages_manual_contact_received_idx").on(
      table.manualContactId,
      table.receivedAt,
    ),
    index("telephony_inbound_messages_received_idx").on(table.receivedAt),
    check(
      "telephony_inbound_messages_provider",
      sql`${table.provider} = 'centrex'`,
    ),
    check(
      "telephony_inbound_messages_provider_identity_length",
      sql`octet_length(${table.providerIdentityFingerprint}) = 32`,
    ),
    check(
      "telephony_inbound_messages_remote_phone_crypto",
      sql`octet_length(${table.remotePhoneFingerprint}) = 32
        AND octet_length(${table.remotePhoneCiphertext}) >= 17
        AND octet_length(${table.remotePhoneNonce}) = 12
        AND length(btrim(${table.remotePhoneKeyVersion})) > 0`,
    ),
    check(
      "telephony_inbound_messages_body_crypto",
      sql`octet_length(${table.bodyFingerprint}) = 32
        AND octet_length(${table.bodyCiphertext}) >= 17
        AND octet_length(${table.bodyNonce}) = 12
        AND length(btrim(${table.bodyKeyVersion})) > 0`,
    ),
    check(
      "telephony_inbound_messages_kind_byte_length",
      sql`(
        ${table.messageKind} = 'sms'
        AND ${table.bodyByteLength} BETWEEN 1 AND 80
      ) OR (
        ${table.messageKind} = 'lms'
        AND ${table.bodyByteLength} BETWEEN 81 AND 720
      )`,
    ),
    check(
      "telephony_inbound_messages_match_reference",
      sql`(
        ${table.matchStrategy} = 'unmatched'
        AND ${table.matchedOutboundMessageId} IS NULL
        AND ${table.targetSource} IS NULL
        AND ${table.consultationId} IS NULL
        AND ${table.directoryClientIdx} IS NULL
        AND ${table.directoryCaseIdx} IS NULL
        AND ${table.manualContactId} IS NULL
      ) OR (
        ${table.matchStrategy} IN ('latest_outbound', 'reply_mailbox_latest_outbound')
        AND ${table.matchedOutboundMessageId} IS NOT NULL
        AND ${table.targetSource} = 'consultation'
        AND ${table.consultationId} IS NOT NULL
        AND ${table.directoryClientIdx} IS NULL
        AND ${table.directoryCaseIdx} IS NULL
        AND ${table.manualContactId} IS NULL
      ) OR (
        ${table.matchStrategy} IN ('latest_outbound', 'reply_mailbox_latest_outbound')
        AND ${table.matchedOutboundMessageId} IS NOT NULL
        AND ${table.targetSource} = 'legal_friends_directory'
        AND ${table.consultationId} IS NULL
        AND ${table.directoryClientIdx} > 0
        AND ${table.directoryCaseIdx} > 0
        AND ${table.manualContactId} IS NULL
      ) OR (
        ${table.matchStrategy} IN ('latest_outbound', 'reply_mailbox_latest_outbound')
        AND ${table.matchedOutboundMessageId} IS NOT NULL
        AND ${table.targetSource} = 'manual'
        AND ${table.consultationId} IS NULL
        AND ${table.directoryClientIdx} IS NULL
        AND ${table.directoryCaseIdx} IS NULL
        AND ${table.manualContactId} IS NOT NULL
      )`,
    ),
    check(
      "telephony_inbound_messages_fetch_time_order",
      sql`${table.fetchedAt} >= ${table.receivedAt} - interval '5 minutes'`,
    ),
  ],
);

export const telephonyInboundMessageNotifications = pgTable(
  "telephony_inbound_message_notifications",
  {
    inboundMessageId: uuid("inbound_message_id")
      .notNull()
      .references(() => telephonyInboundMessages.id, { onDelete: "cascade" }),
    staffUserId: uuid("staff_user_id")
      .notNull()
      .references(() => staffUsers.id, { onDelete: "cascade" }),
    reason: varchar("reason", { length: 30 }).notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.inboundMessageId, table.staffUserId] }),
    index("telephony_inbound_message_notifications_staff_unread_idx").on(
      table.staffUserId,
      table.readAt,
      table.createdAt,
    ),
    check(
      "telephony_inbound_message_notifications_reason",
      sql`${table.reason} IN ('latest_sender', 'consultation_assignee', 'unmatched_admin')`,
    ),
  ],
);

export const telephonyMessageMailboxStates = pgTable(
  "telephony_message_mailbox_states",
  {
    endpointId: uuid("endpoint_id")
      .primaryKey()
      .references(() => telephonyEndpoints.id, { onDelete: "restrict" }),
    nextPage: integer("next_page").default(1).notNull(),
    pollBackfillNext: boolean("poll_backfill_next").default(false).notNull(),
    backfillCompletedAt: timestamp("backfill_completed_at", {
      withTimezone: true,
    }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastFailedAt: timestamp("last_failed_at", { withTimezone: true }),
    lastErrorCode: varchar("last_error_code", { length: 100 }),
    lastImportedMessageAt: timestamp("last_imported_message_at", {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (table) => [
    index("telephony_message_mailbox_states_sync_idx").on(
      table.lastSyncedAt,
    ),
    check(
      "telephony_message_mailbox_states_next_page_positive",
      sql`${table.nextPage} > 0`,
    ),
    check(
      "telephony_message_mailbox_states_error_pair",
      sql`(${table.lastFailedAt} IS NULL AND ${table.lastErrorCode} IS NULL)
        OR (${table.lastFailedAt} IS NOT NULL AND ${table.lastErrorCode} IS NOT NULL)`,
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
    targetSource: telephonyCallTargetSourceEnum("target_source")
      .default("consultation")
      .notNull(),
    consultationId: uuid("consultation_id").references(() => consultations.id, {
      onDelete: "restrict",
    }),
    consultationRequestId: uuid("consultation_request_id").references(
      () => consultationRequests.id,
      { onDelete: "restrict" },
    ),
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
    index("telephony_calls_requested_idx").on(table.requestedAt),
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
      "telephony_calls_target_reference",
      sql`(
        ${table.targetSource} = 'consultation'
        AND ${table.consultationId} IS NOT NULL
        AND ${table.consultationRequestId} IS NOT NULL
      ) OR (
        ${table.targetSource} = 'legal_friends_directory'
        AND ${table.consultationId} IS NULL
        AND ${table.consultationRequestId} IS NULL
      )`,
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

export const telephonyCallDirectoryTargets = pgTable(
  "telephony_call_directory_targets",
  {
    telephonyCallId: uuid("telephony_call_id")
      .primaryKey()
      .references(() => telephonyCalls.id, { onDelete: "restrict" }),
    clientIdx: integer("client_idx").notNull(),
    caseIdx: integer("case_idx").notNull(),
    clientNameCiphertext: bytea("client_name_ciphertext").notNull(),
    clientNameNonce: bytea("client_name_nonce").notNull(),
    clientNameKeyVersion: varchar("client_name_key_version", {
      length: 50,
    }).notNull(),
    phoneCiphertext: bytea("phone_ciphertext").notNull(),
    phoneNonce: bytea("phone_nonce").notNull(),
    phoneKeyVersion: varchar("phone_key_version", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("telephony_call_directory_targets_client_case_idx").on(
      table.clientIdx,
      table.caseIdx,
    ),
    check(
      "telephony_call_directory_targets_ids_positive",
      sql`${table.clientIdx} > 0 AND ${table.caseIdx} > 0`,
    ),
    check(
      "telephony_call_directory_targets_crypto",
      sql`octet_length(${table.clientNameNonce}) = 12
        AND octet_length(${table.clientNameCiphertext}) >= 17
        AND octet_length(${table.phoneNonce}) = 12
        AND octet_length(${table.phoneCiphertext}) >= 17`,
    ),
  ],
);

export const telephonyCallRoots = pgTable(
  "telephony_call_roots",
  {
    id: uuid("id").primaryKey(),
    provider: telephonyProviderEnum("provider").default("centrex").notNull(),
    scope: telephonyCallScopeEnum("scope").notNull(),
    direction: telephonyCallDirectionEnum("direction"),
    state: telephonyCallRootStateEnum("state").default("ringing").notNull(),
    correlationStatus: telephonyCallCorrelationStatusEnum(
      "correlation_status",
    )
      .default("confirmed")
      .notNull(),
    originalEndpointId: uuid("original_endpoint_id")
      .notNull()
      .references(() => telephonyEndpoints.id, { onDelete: "restrict" }),
    currentEndpointId: uuid("current_endpoint_id").references(
      () => telephonyEndpoints.id,
      { onDelete: "restrict" },
    ),
    finalEndpointId: uuid("final_endpoint_id").references(
      () => telephonyEndpoints.id,
      { onDelete: "restrict" },
    ),
    finalStaffUserId: uuid("final_staff_user_id").references(
      () => staffUsers.id,
      { onDelete: "restrict" },
    ),
    remotePhoneCiphertext: bytea("remote_phone_ciphertext"),
    remotePhoneNonce: bytea("remote_phone_nonce"),
    remotePhoneKeyVersion: varchar("remote_phone_key_version", { length: 50 }),
    remotePhoneFingerprint: bytea("remote_phone_fingerprint"),
    remotePhoneMasked: varchar("remote_phone_masked", { length: 20 }),
    originalLineLast4: varchar("original_line_last4", { length: 4 }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    index("telephony_call_roots_state_last_event_idx").on(
      table.scope,
      table.state,
      table.lastEventAt,
    ),
    index("telephony_call_roots_phone_started_idx").on(
      table.remotePhoneFingerprint,
      table.startedAt,
    ),
    index("telephony_call_roots_current_endpoint_idx").on(
      table.currentEndpointId,
      table.state,
    ),
    check(
      "telephony_call_roots_scope_direction",
      sql`(${table.scope} = 'external' AND ${table.direction} IS NOT NULL)
        OR (${table.scope} = 'internal' AND ${table.direction} IS NULL)`,
    ),
    check(
      "telephony_call_roots_remote_party",
      sql`(
        ${table.scope} = 'external'
        AND ${table.remotePhoneCiphertext} IS NOT NULL
        AND ${table.remotePhoneNonce} IS NOT NULL
        AND ${table.remotePhoneKeyVersion} IS NOT NULL
        AND ${table.remotePhoneFingerprint} IS NOT NULL
        AND ${table.remotePhoneMasked} IS NOT NULL
        AND ${table.originalLineLast4} IS NOT NULL
        AND octet_length(${table.remotePhoneCiphertext}) >= 17
        AND octet_length(${table.remotePhoneNonce}) = 12
        AND octet_length(${table.remotePhoneFingerprint}) = 32
        AND ${table.remotePhoneMasked} ~ '^\\*\\*\\*[0-9]{4}$'
        AND ${table.originalLineLast4} ~ '^[0-9]{4}$'
      ) OR (
        ${table.scope} = 'internal'
        AND ${table.remotePhoneCiphertext} IS NULL
        AND ${table.remotePhoneNonce} IS NULL
        AND ${table.remotePhoneKeyVersion} IS NULL
        AND ${table.remotePhoneFingerprint} IS NULL
        AND ${table.remotePhoneMasked} IS NULL
        AND ${table.originalLineLast4} IS NULL
      )`,
    ),
    check(
      "telephony_call_roots_time_order",
      sql`(${table.connectedAt} IS NULL OR ${table.connectedAt} >= ${table.startedAt})
        AND (${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt})
        AND ${table.lastEventAt} >= ${table.startedAt}`,
    ),
    check(
      "telephony_call_roots_end_state",
      sql`(${table.state} = 'ended' AND ${table.endedAt} IS NOT NULL)
        OR (${table.state} <> 'ended')`,
    ),
  ],
);

export const telephonyCallLegs = pgTable(
  "telephony_call_legs",
  {
    id: uuid("id").primaryKey(),
    rootId: uuid("root_id")
      .notNull()
      .references(() => telephonyCallRoots.id, { onDelete: "restrict" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => telephonyEndpoints.id, { onDelete: "restrict" }),
    staffUserId: uuid("staff_user_id").references(() => staffUsers.id, {
      onDelete: "restrict",
    }),
    bridgeId: varchar("bridge_id", { length: 80 }).notNull(),
    kind: telephonyCallLegKindEnum("kind").notNull(),
    direction: telephonyCallDirectionEnum("direction").notNull(),
    state: telephonyCallLegStateEnum("state").default("ringing").notNull(),
    remotePartyKind: telephonyCallPartyKindEnum("remote_party_kind").notNull(),
    remoteExtension: varchar("remote_extension", { length: 10 }),
    providerCallId: varchar("provider_call_id", { length: 100 }).notNull(),
    providerChannelId: varchar("provider_channel_id", { length: 100 }),
    providerEndCause: varchar("provider_end_cause", { length: 30 }),
    correlationStatus: telephonyCallCorrelationStatusEnum(
      "correlation_status",
    )
      .default("confirmed")
      .notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telephony_call_legs_endpoint_provider_uidx").on(
      table.endpointId,
      table.providerCallId,
    ),
    index("telephony_call_legs_root_state_idx").on(
      table.rootId,
      table.kind,
      table.state,
    ),
    index("telephony_call_legs_staff_last_event_idx").on(
      table.staffUserId,
      table.lastEventAt,
    ),
    check(
      "telephony_call_legs_bridge_id_format",
      sql`${table.bridgeId} ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$'`,
    ),
    check(
      "telephony_call_legs_provider_ids",
      sql`${table.providerCallId} ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'
        AND (${table.providerChannelId} IS NULL OR ${table.providerChannelId} ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$')`,
    ),
    check(
      "telephony_call_legs_remote_extension",
      sql`(${table.remotePartyKind} = 'external' AND ${table.remoteExtension} IS NULL)
        OR (${table.remotePartyKind} <> 'external' AND (${table.remoteExtension} IS NULL OR ${table.remoteExtension} ~ '^[0-9]{2,10}$'))`,
    ),
    check(
      "telephony_call_legs_state_times",
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
      "telephony_call_legs_time_order",
      sql`(${table.connectedAt} IS NULL OR ${table.connectedAt} >= ${table.startedAt})
        AND (${table.endedAt} IS NULL OR ${table.endedAt} >= ${table.startedAt})
        AND ${table.lastEventAt} >= ${table.startedAt}`,
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
    callRootId: uuid("call_root_id").references(() => telephonyCallRoots.id, {
      onDelete: "restrict",
    }),
    callLegId: uuid("call_leg_id").references(() => telephonyCallLegs.id, {
      onDelete: "restrict",
    }),
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
    index("telephony_inbound_calls_ringing_idx").on(table.ringingAt),
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
    callRootId: uuid("call_root_id").references(() => telephonyCallRoots.id, {
      onDelete: "restrict",
    }),
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
    uniqueIndex("telephony_call_aftercare_root_uidx")
      .on(table.callRootId)
      .where(sql`${table.callRootId} IS NOT NULL`),
    index("telephony_call_aftercare_consultation_idx").on(
      table.consultationId,
      table.confirmedAt,
    ),
    check(
      "telephony_call_aftercare_source_present",
      sql`num_nonnulls(${table.observedCallId}, ${table.telephonyCallId}, ${table.callRootId}) = 1`,
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

/**
 * provider 식별자는 통화 root/leg와 향후 녹취 메타데이터를 잇는 안정적인 원장이다.
 * 식별자 자체는 브라우저와 실시간 알림 payload에 노출하지 않는다.
 */
export const telephonyCallProviderIdentifiers = pgTable(
  "telephony_call_provider_identifiers",
  {
    id: uuid("id").primaryKey(),
    rootId: uuid("root_id")
      .notNull()
      .references(() => telephonyCallRoots.id, { onDelete: "restrict" }),
    legId: uuid("leg_id")
      .notNull()
      .references(() => telephonyCallLegs.id, { onDelete: "restrict" }),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => telephonyEndpoints.id, { onDelete: "restrict" }),
    provider: telephonyProviderEnum("provider").default("centrex").notNull(),
    role: telephonyProviderIdentifierRoleEnum("role").notNull(),
    providerValue: varchar("provider_value", { length: 100 }).notNull(),
    firstObservedAt: timestamp("first_observed_at", {
      withTimezone: true,
    }).notNull(),
    lastObservedAt: timestamp("last_observed_at", {
      withTimezone: true,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("telephony_call_provider_identifiers_endpoint_role_uidx").on(
      table.endpointId,
      table.role,
      table.providerValue,
    ),
    index("telephony_call_provider_identifiers_provider_value_idx").on(
      table.provider,
      table.providerValue,
    ),
    index("telephony_call_provider_identifiers_root_leg_idx").on(
      table.rootId,
      table.legId,
    ),
    check(
      "telephony_call_provider_identifiers_value_format",
      sql`${table.providerValue} ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'`,
    ),
    check(
      "telephony_call_provider_identifiers_not_sentinel",
      sql`upper(${table.providerValue}) NOT IN ('0', 'NIL', 'NONE', 'NULL', 'UNKNOWN')`,
    ),
    check(
      "telephony_call_provider_identifiers_time_order",
      sql`${table.lastObservedAt} >= ${table.firstObservedAt}`,
    ),
  ],
);

export const telephonyCallRelations = pgTable(
  "telephony_call_relations",
  {
    id: uuid("id").primaryKey(),
    rootId: uuid("root_id")
      .notNull()
      .references(() => telephonyCallRoots.id, { onDelete: "restrict" }),
    fromLegId: uuid("from_leg_id").references(() => telephonyCallLegs.id, {
      onDelete: "restrict",
    }),
    toLegId: uuid("to_leg_id").references(() => telephonyCallLegs.id, {
      onDelete: "restrict",
    }),
    relationType: telephonyCallRelationTypeEnum("relation_type").notNull(),
    correlationStatus: telephonyCallCorrelationStatusEnum(
      "correlation_status",
    ).notNull(),
    correlationKey: varchar("correlation_key", { length: 220 }).notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("telephony_call_relations_correlation_key_uidx").on(
      table.correlationKey,
    ),
    index("telephony_call_relations_root_occurred_idx").on(
      table.rootId,
      table.occurredAt,
    ),
    check(
      "telephony_call_relations_key_nonempty",
      sql`length(btrim(${table.correlationKey})) > 0`,
    ),
  ],
);

export const telephonyCallObservations = pgTable(
  "telephony_call_observations",
  {
    id: uuid("id").primaryKey(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => telephonyEndpoints.id, { onDelete: "restrict" }),
    bridgeId: varchar("bridge_id", { length: 80 }).notNull(),
    rootId: uuid("root_id").references(() => telephonyCallRoots.id, {
      onDelete: "restrict",
    }),
    legId: uuid("leg_id").references(() => telephonyCallLegs.id, {
      onDelete: "restrict",
    }),
    observationType: telephonyCallObservationTypeEnum(
      "observation_type",
    ).notNull(),
    direction: telephonyCallDirectionEnum("direction"),
    partyKind: telephonyCallPartyKindEnum("party_kind"),
    providerCallId: varchar("provider_call_id", { length: 100 }).notNull(),
    relatedProviderCallId: varchar("related_provider_call_id", { length: 100 }),
    sourceProviderCallId: varchar("source_provider_call_id", { length: 100 }),
    contextProviderCallId: varchar("context_provider_call_id", { length: 100 }),
    remotePartyFingerprint: bytea("remote_party_fingerprint"),
    remotePartyMasked: varchar("remote_party_masked", { length: 20 }),
    incomingLineLast4: varchar("incoming_line_last4", { length: 4 }),
    agentExtension: varchar("agent_extension", { length: 10 }).notNull(),
    channelKind: telephonyChannelKindEnum("channel_kind").notNull(),
    relatedChannelKind: telephonyChannelKindEnum(
      "related_channel_kind",
    ).notNull(),
    providerEndCause: varchar("provider_end_cause", { length: 30 }),
    correlationStatus: telephonyCallCorrelationStatusEnum(
      "correlation_status",
    )
      .default("pending")
      .notNull(),
    eventFingerprint: bytea("event_fingerprint").notNull(),
    authenticationNonceHash: bytea("authentication_nonce_hash").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("telephony_call_observations_bridge_nonce_uidx").on(
      table.bridgeId,
      table.authenticationNonceHash,
    ),
    index("telephony_call_observations_provider_call_idx").on(
      table.providerCallId,
      table.occurredAt,
    ),
    index("telephony_call_observations_root_occurred_idx").on(
      table.rootId,
      table.occurredAt,
    ),
    check(
      "telephony_call_observations_bridge_id_format",
      sql`${table.bridgeId} ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{2,79}$'`,
    ),
    check(
      "telephony_call_observations_provider_ids",
      sql`${table.providerCallId} ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$'
        AND (${table.relatedProviderCallId} IS NULL OR ${table.relatedProviderCallId} ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$')
        AND (${table.sourceProviderCallId} IS NULL OR ${table.sourceProviderCallId} ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$')
        AND (${table.contextProviderCallId} IS NULL OR ${table.contextProviderCallId} ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,99}$')`,
    ),
    check(
      "telephony_call_observations_source_not_sentinel",
      sql`${table.sourceProviderCallId} IS NULL OR upper(${table.sourceProviderCallId}) NOT IN ('0', 'NIL', 'NONE', 'NULL', 'UNKNOWN')`,
    ),
    check(
      "telephony_call_observations_hash_lengths",
      sql`octet_length(${table.eventFingerprint}) = 32
        AND octet_length(${table.authenticationNonceHash}) = 32
        AND (${table.remotePartyFingerprint} IS NULL OR octet_length(${table.remotePartyFingerprint}) = 32)`,
    ),
    check(
      "telephony_call_observations_remote_party",
      sql`(
        ${table.remotePartyFingerprint} IS NULL
        AND ${table.remotePartyMasked} IS NULL
      ) OR (
        ${table.remotePartyFingerprint} IS NOT NULL
        AND ${table.remotePartyMasked} ~ '^\\*\\*\\*[0-9]{2,4}$'
      )`,
    ),
    check(
      "telephony_call_observations_line_extension",
      sql`(${table.incomingLineLast4} IS NULL OR ${table.incomingLineLast4} ~ '^[0-9]{2,4}$')
        AND ${table.agentExtension} ~ '^[0-9]{2,10}$'`,
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
