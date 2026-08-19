CREATE TEMP TABLE "_telephony_inbound_message_dedup" ON COMMIT DROP AS
SELECT "message_id", "canonical_id"
FROM (
	SELECT
		inbound."id" AS "message_id",
		first_value(inbound."id") OVER (
			PARTITION BY
				inbound."endpoint_id",
				inbound."remote_phone_fingerprint",
				inbound."received_at",
				inbound."body_fingerprint"
			ORDER BY
				CASE WHEN inbound."match_strategy" = 'latest_outbound' THEN 0 ELSE 1 END,
				outbound."requested_at" DESC NULLS LAST,
				inbound."fetched_at",
				inbound."created_at",
				inbound."id"
		) AS "canonical_id",
		count(*) OVER (
			PARTITION BY
				inbound."endpoint_id",
				inbound."remote_phone_fingerprint",
				inbound."received_at",
				inbound."body_fingerprint"
		) AS "duplicate_count"
	FROM "telephony_inbound_messages" AS inbound
	LEFT JOIN "telephony_messages" AS outbound
		ON outbound."id" = inbound."matched_outbound_message_id"
) AS ranked
WHERE ranked."duplicate_count" > 1;
--> statement-breakpoint
CREATE UNIQUE INDEX "_telephony_inbound_message_dedup_message_uidx"
	ON "_telephony_inbound_message_dedup" ("message_id");
--> statement-breakpoint
INSERT INTO "telephony_inbound_message_notifications" (
	"inbound_message_id",
	"staff_user_id",
	"reason",
	"read_at",
	"created_at",
	"updated_at"
)
SELECT
	dedup."canonical_id",
	notification."staff_user_id",
	(array_agg(
		notification."reason"
		ORDER BY CASE notification."reason"
			WHEN 'latest_sender' THEN 1
			WHEN 'consultation_assignee' THEN 2
			ELSE 3
		END
	))[1],
	CASE
		WHEN count(notification."read_at") > 0 THEN min(notification."read_at")
		ELSE NULL
	END,
	min(notification."created_at"),
	max(notification."updated_at")
FROM "_telephony_inbound_message_dedup" AS dedup
INNER JOIN "telephony_inbound_message_notifications" AS notification
	ON notification."inbound_message_id" = dedup."message_id"
GROUP BY dedup."canonical_id", notification."staff_user_id"
ON CONFLICT ("inbound_message_id", "staff_user_id") DO UPDATE
SET
	"reason" = excluded."reason",
	"read_at" = excluded."read_at",
	"created_at" = LEAST(
		"telephony_inbound_message_notifications"."created_at",
		excluded."created_at"
	),
	"updated_at" = GREATEST(
		"telephony_inbound_message_notifications"."updated_at",
		excluded."updated_at"
	);
--> statement-breakpoint
DELETE FROM "telephony_inbound_messages" AS inbound
USING "_telephony_inbound_message_dedup" AS dedup
WHERE inbound."id" = dedup."message_id"
	AND dedup."message_id" <> dedup."canonical_id";
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "telephony_inbound_messages"
		GROUP BY
			"endpoint_id",
			"remote_phone_fingerprint",
			"received_at",
			"body_fingerprint"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION 'telephony inbound message deduplication did not converge';
	END IF;
END
$$;
--> statement-breakpoint
CREATE UNIQUE INDEX "telephony_inbound_messages_stable_identity_uidx" ON "telephony_inbound_messages" USING btree ("endpoint_id","remote_phone_fingerprint","received_at","body_fingerprint");
