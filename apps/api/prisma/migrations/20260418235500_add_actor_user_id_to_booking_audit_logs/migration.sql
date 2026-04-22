ALTER TABLE "booking_audit_logs"
ADD COLUMN "actorUserId" UUID;

CREATE INDEX "booking_audit_logs_actorUserId_createdAt_idx"
ON "booking_audit_logs"("actorUserId", "createdAt");
