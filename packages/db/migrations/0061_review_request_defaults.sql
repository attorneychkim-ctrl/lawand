ALTER TABLE "customer_review_request_templates" ADD COLUMN "preset_key" "review_progress_stage";--> statement-breakpoint
ALTER TABLE "customer_review_request_templates" ADD COLUMN "default_progress_stage" "review_progress_stage" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_review_requests" ADD COLUMN "suggested_practice_area" "review_practice_area" DEFAULT 'other' NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_review_requests" ADD COLUMN "suggested_progress_stage" "review_progress_stage" DEFAULT 'other' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_review_request_templates_owner_preset_uidx" ON "customer_review_request_templates" USING btree ("owner_user_id","preset_key") WHERE "customer_review_request_templates"."preset_key" IS NOT NULL;--> statement-breakpoint
WITH default_templates(preset_key, name, body) AS (
  VALUES
    (
      'consultation'::review_progress_stage,
      '상담을 받은 뒤',
      E'{{고객명}}님, 안녕하세요. 법무법인 로앤 {{담당자명}}입니다. 상담 과정에서 느끼신 점을 편하게 남겨주시면 앞으로의 안내를 더 잘 다듬는 데 도움이 됩니다.\n{{후기작성링크}}'
    ),
    (
      'commencement'::review_progress_stage,
      '개시절차 진행 중',
      E'{{고객명}}님, 안녕하세요. 법무법인 로앤 {{담당자명}}입니다. {{사건번호}} 절차를 함께 진행하며 지금까지의 설명과 진행 과정에서 느끼신 점을 솔직하게 들려주세요.\n{{후기작성링크}}'
    ),
    (
      'discharge'::review_progress_stage,
      '면책결정 이후',
      E'{{고객명}}님, 안녕하세요. 법무법인 로앤 {{담당자명}}입니다. {{사건번호}} 면책결정까지 함께해 주셔서 감사합니다. 실제 과정에서 느끼신 점을 있는 그대로 남겨주시면 감사하겠습니다.\n{{후기작성링크}}'
    ),
    (
      'other'::review_progress_stage,
      '그 밖의 시점',
      E'{{고객명}}님, 안녕하세요. 법무법인 로앤 {{담당자명}}입니다. 로앤과 함께한 과정에서 기억에 남은 점을 편하게 들려주세요. 남겨주신 말씀은 확인 후 소중히 반영하겠습니다.\n{{후기작성링크}}'
    )
)
UPDATE customer_review_request_templates AS template
SET
  preset_key = defaults.preset_key,
  default_progress_stage = defaults.preset_key
FROM default_templates AS defaults
WHERE template.preset_key IS NULL
  AND lower(template.name) = lower(defaults.name)
  AND NOT EXISTS (
    SELECT 1
    FROM customer_review_request_templates AS existing
    WHERE existing.owner_user_id = template.owner_user_id
      AND existing.preset_key = defaults.preset_key
  );--> statement-breakpoint
WITH default_templates(preset_key, name, body) AS (
  VALUES
    (
      'consultation'::review_progress_stage,
      '상담을 받은 뒤',
      E'{{고객명}}님, 안녕하세요. 법무법인 로앤 {{담당자명}}입니다. 상담 과정에서 느끼신 점을 편하게 남겨주시면 앞으로의 안내를 더 잘 다듬는 데 도움이 됩니다.\n{{후기작성링크}}'
    ),
    (
      'commencement'::review_progress_stage,
      '개시절차 진행 중',
      E'{{고객명}}님, 안녕하세요. 법무법인 로앤 {{담당자명}}입니다. {{사건번호}} 절차를 함께 진행하며 지금까지의 설명과 진행 과정에서 느끼신 점을 솔직하게 들려주세요.\n{{후기작성링크}}'
    ),
    (
      'discharge'::review_progress_stage,
      '면책결정 이후',
      E'{{고객명}}님, 안녕하세요. 법무법인 로앤 {{담당자명}}입니다. {{사건번호}} 면책결정까지 함께해 주셔서 감사합니다. 실제 과정에서 느끼신 점을 있는 그대로 남겨주시면 감사하겠습니다.\n{{후기작성링크}}'
    ),
    (
      'other'::review_progress_stage,
      '그 밖의 시점',
      E'{{고객명}}님, 안녕하세요. 법무법인 로앤 {{담당자명}}입니다. 로앤과 함께한 과정에서 기억에 남은 점을 편하게 들려주세요. 남겨주신 말씀은 확인 후 소중히 반영하겠습니다.\n{{후기작성링크}}'
    )
)
INSERT INTO customer_review_request_templates (
  id,
  owner_user_id,
  preset_key,
  name,
  body,
  body_byte_length,
  default_progress_stage,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  staff.id,
  defaults.preset_key,
  defaults.name,
  defaults.body,
  octet_length(convert_to(defaults.body, 'UTF8')),
  defaults.preset_key,
  staff.id,
  staff.id,
  now(),
  now()
FROM staff_users AS staff
CROSS JOIN default_templates AS defaults
WHERE NOT EXISTS (
  SELECT 1
  FROM customer_review_request_templates AS existing
  WHERE existing.owner_user_id = staff.id
    AND existing.preset_key = defaults.preset_key
)
ON CONFLICT DO NOTHING;
