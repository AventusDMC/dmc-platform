CREATE TABLE "quote_scenarios" (
    "id" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "paxCount" INTEGER NOT NULL,
    "totalCost" DOUBLE PRECISION NOT NULL,
    "totalSell" DOUBLE PRECISION NOT NULL,
    "pricePerPax" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quote_scenarios_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "quote_scenarios_quoteId_paxCount_idx" ON "quote_scenarios"("quoteId", "paxCount");

ALTER TABLE "quote_scenarios"
ADD CONSTRAINT "quote_scenarios_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
