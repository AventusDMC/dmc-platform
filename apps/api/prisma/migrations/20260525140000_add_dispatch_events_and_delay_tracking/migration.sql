-- Operational Simulation & Stability Testing v1
-- Adds:
--   * dispatch_events table — append-only event stream powering the operational
--     replay log shown on /operations/simulation and (later) inline event
--     history per booking. Logged from supplier assignment, transport resource
--     assignment, and execution-state transitions.
--   * GUIDE_LATE issue type — surfaces the "Guide Late" simulation scenario
--     using a typed enum value instead of OTHER+notes.
--   * delayMinutes on booking_services — explicit per-service delay marker
--     set by simulation scenarios or by the operator. Used to render the
--     "Delayed Xm" badge on the dispatch card and the new "Delayed
--     operations" dashboard counter.

CREATE TYPE "DispatchEventType" AS ENUM (
  'SIMULATION_SCENARIO_APPLIED',
  'ISSUE_RAISED',
  'ISSUE_ESCALATED',
  'ISSUE_RESOLVED',
  'DISPATCHED',
  'STARTED',
  'COMPLETED',
  'CANCELLED',
  'DELAYED',
  'REASSIGNED_SUPPLIER',
  'REASSIGNED_DRIVER',
  'REASSIGNED_VEHICLE',
  'REASSIGNED_GUIDE',
  'NOTE_ADDED'
);

CREATE TYPE "DispatchEventSeverity" AS ENUM (
  'INFO',
  'WARNING',
  'CRITICAL'
);

CREATE TABLE "dispatch_events" (
  "id" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "bookingServiceId" UUID,
  "eventType" "DispatchEventType" NOT NULL,
  "severity" "DispatchEventSeverity",
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actor" TEXT,
  "payload" JSONB,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "dispatch_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dispatch_events_bookingId_occurredAt_idx"
  ON "dispatch_events" ("bookingId", "occurredAt");
CREATE INDEX "dispatch_events_bookingServiceId_occurredAt_idx"
  ON "dispatch_events" ("bookingServiceId", "occurredAt");
CREATE INDEX "dispatch_events_eventType_idx"
  ON "dispatch_events" ("eventType");
CREATE INDEX "dispatch_events_occurredAt_idx"
  ON "dispatch_events" ("occurredAt");

ALTER TABLE "dispatch_events"
  ADD CONSTRAINT "dispatch_events_bookingId_fkey"
  FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dispatch_events"
  ADD CONSTRAINT "dispatch_events_bookingServiceId_fkey"
  FOREIGN KEY ("bookingServiceId") REFERENCES "booking_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "BookingServiceIssueType" ADD VALUE IF NOT EXISTS 'GUIDE_LATE';

ALTER TABLE "booking_services" ADD COLUMN IF NOT EXISTS "delayMinutes" INTEGER;
CREATE INDEX IF NOT EXISTS "booking_services_delayMinutes_idx" ON "booking_services" ("delayMinutes");
