CREATE INDEX "consultations_last_requested_idx" ON "consultations" USING btree ("last_requested_at");--> statement-breakpoint
CREATE INDEX "telephony_calls_requested_idx" ON "telephony_calls" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "telephony_inbound_calls_ringing_idx" ON "telephony_inbound_calls" USING btree ("ringing_at");