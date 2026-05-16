CREATE TABLE "guides" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "fullName" TEXT NOT NULL,
  "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "certifications" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "regions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "specialties" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "email" TEXT,
  "phone" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "guideType" TEXT NOT NULL DEFAULT 'licensed',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "guide_blocked_dates" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "guideId" UUID NOT NULL,
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guide_blocked_dates_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "booking_services"
  ADD COLUMN "guideId" UUID,
  ADD COLUMN "guideConfirmationStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "guideRequiredLanguages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "guideReportingTime" TEXT;

CREATE INDEX "guides_active_fullName_idx" ON "guides"("active", "fullName");
CREATE INDEX "guides_guideType_idx" ON "guides"("guideType");
CREATE INDEX "guide_blocked_dates_guideId_startDate_endDate_idx" ON "guide_blocked_dates"("guideId", "startDate", "endDate");
CREATE INDEX "booking_services_guideId_idx" ON "booking_services"("guideId");
CREATE INDEX "booking_services_operationType_guideConfirmationStatus_idx" ON "booking_services"("operationType", "guideConfirmationStatus");

ALTER TABLE "guide_blocked_dates"
  ADD CONSTRAINT "guide_blocked_dates_guideId_fkey"
  FOREIGN KEY ("guideId") REFERENCES "guides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "booking_services"
  ADD CONSTRAINT "booking_services_guideId_fkey"
  FOREIGN KEY ("guideId") REFERENCES "guides"("id") ON DELETE SET NULL ON UPDATE CASCADE;
