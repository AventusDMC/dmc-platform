ALTER TABLE "booking_services"
ADD COLUMN "startTime" TEXT,
ADD COLUMN "pickupTime" TEXT,
ADD COLUMN "pickupLocation" TEXT,
ADD COLUMN "meetingPoint" TEXT,
ADD COLUMN "participantCount" INTEGER,
ADD COLUMN "adultCount" INTEGER,
ADD COLUMN "childCount" INTEGER,
ADD COLUMN "supplierReference" TEXT,
ADD COLUMN "reconfirmationRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reconfirmationDueAt" TIMESTAMP(3);
