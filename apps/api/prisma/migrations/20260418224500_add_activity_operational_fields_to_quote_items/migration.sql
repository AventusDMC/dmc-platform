ALTER TABLE "quote_items"
ADD COLUMN "serviceDate" TIMESTAMP(3),
ADD COLUMN "startTime" TEXT,
ADD COLUMN "pickupTime" TEXT,
ADD COLUMN "pickupLocation" TEXT,
ADD COLUMN "meetingPoint" TEXT,
ADD COLUMN "participantCount" INTEGER,
ADD COLUMN "adultCount" INTEGER,
ADD COLUMN "childCount" INTEGER,
ADD COLUMN "reconfirmationRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reconfirmationDueAt" TIMESTAMP(3);
