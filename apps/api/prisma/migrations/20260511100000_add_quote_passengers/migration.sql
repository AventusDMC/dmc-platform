CREATE TABLE "quote_passengers" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "quoteId" UUID NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "gender" TEXT,
  "dateOfBirth" TIMESTAMP(3),
  "nationality" TEXT,
  "passportNumber" TEXT,
  "passportExpiry" TIMESTAMP(3),
  "dietaryNotes" TEXT,
  "mobilityNotes" TEXT,
  "emergencyContact" TEXT,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "quote_passengers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quote_passengers_quoteId_lastName_firstName_idx" ON "quote_passengers"("quoteId", "lastName", "firstName");

ALTER TABLE "quote_passengers"
  ADD CONSTRAINT "quote_passengers_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
