-- Operations Execution Lifecycle v1 — adds live-execution tracking on
-- booking_services. Distinct from operationStatus / supplierConfirmationStatus
-- (which are about preparation): executionStatus is what operations teams
-- update while the trip is actually running.

CREATE TYPE "BookingServiceExecutionStatus" AS ENUM (
  'READY',
  'DISPATCHED',
  'IN_PROGRESS',
  'COMPLETED',
  'ISSUE',
  'CANCELLED'
);

CREATE TYPE "BookingServiceIssueType" AS ENUM (
  'DRIVER_DELAY',
  'SUPPLIER_NO_SHOW',
  'FLIGHT_DELAY',
  'ROOM_PROBLEM',
  'GUEST_MISSING',
  'OVERBOOKING',
  'OTHER'
);

CREATE TYPE "BookingServiceIssueSeverity" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL'
);

ALTER TABLE "booking_services"
ADD COLUMN IF NOT EXISTS "executionStatus" "BookingServiceExecutionStatus" NOT NULL DEFAULT 'READY',
ADD COLUMN IF NOT EXISTS "dispatchedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "dispatchNotes" TEXT,
ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "completedBy" UUID,
ADD COLUMN IF NOT EXISTS "issueReportedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "issueType" "BookingServiceIssueType",
ADD COLUMN IF NOT EXISTS "issueSeverity" "BookingServiceIssueSeverity",
ADD COLUMN IF NOT EXISTS "issueNotes" TEXT;

CREATE INDEX IF NOT EXISTS "booking_services_executionStatus_idx"
  ON "booking_services" ("executionStatus");
CREATE INDEX IF NOT EXISTS "booking_services_completedAt_idx"
  ON "booking_services" ("completedAt");
