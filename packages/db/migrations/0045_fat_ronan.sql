ALTER TABLE "telephony_messages" ADD COLUMN "image_url_snapshot" text;

UPDATE "telephony_messages" AS "message"
SET "image_url_snapshot" = "template"."image_url"
FROM "message_templates" AS "template"
WHERE "message"."template_id" = "template"."id"
  AND "message"."message_kind" = 'mms'
  AND "message"."image_file_id_snapshot" = "template"."image_file_id";
