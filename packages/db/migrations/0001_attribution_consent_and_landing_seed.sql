ALTER TABLE "consultation_requests" ADD COLUMN "attribution_notice_version" varchar(50);--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD COLUMN "attribution_consent_agreed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "consultation_requests" ADD CONSTRAINT "consultation_requests_attribution_consent_complete" CHECK ((
        "consultation_requests"."attribution_notice_version" IS NULL
        AND "consultation_requests"."attribution_consent_agreed_at" IS NULL
      ) OR (
        "consultation_requests"."attribution_notice_version" IS NOT NULL
        AND "consultation_requests"."attribution_consent_agreed_at" IS NOT NULL
      ));--> statement-breakpoint
INSERT INTO "marketing_landing_pages"
  ("id", "page_key", "version", "route_path", "intent_key", "template_key", "status", "published_at")
VALUES
  ('eca84d1d-9800-4990-ae4b-c20a5d9e41d7', 'bank-home', 1, '/bank', 'bank-overview', 'home', 'active', '2026-07-27T00:00:00+09:00'),
  ('1ebc703c-b672-468a-8b43-bc7dcaa3b551', 'rehabilitation-hub', 1, '/bank/personal-rehabilitation', 'personal-rehabilitation', 'category-hub', 'active', '2026-07-27T00:00:00+09:00'),
  ('c2bed578-bf7e-4a6f-9219-a29c6ba518a4', 'rehabilitation-eligibility', 1, '/bank/personal-rehabilitation/eligibility', 'rehabilitation-eligibility', 'legal-guide', 'active', '2026-07-27T00:00:00+09:00'),
  ('51298696-fcde-4fd7-a578-acae3e080628', 'rehabilitation-process', 1, '/bank/personal-rehabilitation/process', 'rehabilitation-process', 'legal-guide', 'active', '2026-07-27T00:00:00+09:00'),
  ('e899cc1d-0aaf-47b9-bf9c-9b70df533796', 'rehabilitation-documents', 1, '/bank/personal-rehabilitation/documents', 'rehabilitation-documents', 'legal-guide', 'active', '2026-07-27T00:00:00+09:00'),
  ('55b60c9b-d712-417b-9d2e-d7166bdc782d', 'rehabilitation-repayment', 1, '/bank/personal-rehabilitation/repayment', 'rehabilitation-repayment', 'legal-guide', 'active', '2026-07-27T00:00:00+09:00'),
  ('6f15e008-fdf9-4169-a255-4cea608100f2', 'bankruptcy-hub', 1, '/bank/personal-bankruptcy', 'personal-bankruptcy', 'category-hub', 'active', '2026-07-27T00:00:00+09:00'),
  ('18b4f253-2f04-4f92-8d08-370034f19e1c', 'bankruptcy-eligibility', 1, '/bank/personal-bankruptcy/eligibility', 'bankruptcy-eligibility', 'legal-guide', 'active', '2026-07-27T00:00:00+09:00'),
  ('02899eea-ca25-4475-83aa-025959fd47ef', 'bankruptcy-process', 1, '/bank/personal-bankruptcy/process', 'bankruptcy-process', 'legal-guide', 'active', '2026-07-27T00:00:00+09:00'),
  ('35930a40-f130-4420-b240-0fc4cbfc9f41', 'bankruptcy-documents', 1, '/bank/personal-bankruptcy/documents', 'bankruptcy-documents', 'legal-guide', 'active', '2026-07-27T00:00:00+09:00'),
  ('c2a8abe8-70e6-43b2-bd06-16dfe068336b', 'compare-rehabilitation-bankruptcy', 1, '/bank/compare', 'rehabilitation-bankruptcy-comparison', 'comparison', 'active', '2026-07-27T00:00:00+09:00'),
  ('cbd431b2-5d90-4fb0-a67c-cc9965297327', 'situations-hub', 1, '/bank/situations', 'debt-situations', 'category-hub', 'active', '2026-07-27T00:00:00+09:00'),
  ('48068e57-74f7-48d8-ad55-a83d6ed03c9c', 'collection-and-seizure', 1, '/bank/situations/collection-and-seizure', 'collection-seizure', 'situation-guide', 'active', '2026-07-27T00:00:00+09:00'),
  ('614996a3-c237-44a5-910e-ee61c8a4da33', 'investment-debt', 1, '/bank/situations/investment-debt', 'investment-debt', 'situation-guide', 'active', '2026-07-27T00:00:00+09:00'),
  ('904301f4-c325-4d9c-ac65-44a92766eee7', 'self-employed-rehabilitation', 1, '/bank/situations/self-employed', 'self-employed-rehabilitation', 'situation-guide', 'active', '2026-07-27T00:00:00+09:00'),
  ('c3fe09f5-df89-4418-964e-391a4a1ca3b1', 'consultation-request', 1, '/bank/consultation', 'consultation-request', 'consultation-flow', 'active', '2026-07-27T00:00:00+09:00');
