ALTER TABLE "quote_items"
ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "quote_items_quoteId_itineraryId_sortOrder_idx"
ON "quote_items"("quoteId", "itineraryId", "sortOrder");
