CREATE TABLE "quote_versions" (
  "id" UUID NOT NULL,
  "quoteId" UUID NOT NULL,
  "versionNumber" INTEGER NOT NULL,
  "label" TEXT,
  "snapshotJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "quote_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "quote_versions_quoteId_versionNumber_key" ON "quote_versions"("quoteId", "versionNumber");
CREATE INDEX "quote_versions_quoteId_createdAt_idx" ON "quote_versions"("quoteId", "createdAt");

ALTER TABLE "quote_versions"
ADD CONSTRAINT "quote_versions_quoteId_fkey"
FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
