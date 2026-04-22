CREATE TABLE "quote_options" (
  "id" UUID NOT NULL,
  "quoteId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "quote_options_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quote_items"
ADD COLUMN "optionId" UUID;

CREATE INDEX "quote_options_quoteId_idx" ON "quote_options"("quoteId");
CREATE INDEX "quote_items_quoteId_optionId_idx" ON "quote_items"("quoteId", "optionId");

ALTER TABLE "quote_options"
ADD CONSTRAINT "quote_options_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "quote_items"
ADD CONSTRAINT "quote_items_optionId_fkey"
FOREIGN KEY ("optionId") REFERENCES "quote_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
