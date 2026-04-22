ALTER TABLE "quotes"
  ADD COLUMN "quoteNumber" TEXT;

CREATE UNIQUE INDEX "quotes_quoteNumber_key" ON "quotes"("quoteNumber");
