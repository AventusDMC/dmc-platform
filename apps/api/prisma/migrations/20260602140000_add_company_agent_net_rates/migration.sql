-- Agent Portal — net-rate mode. GROSS (default) agents see the published sell
-- price and earn commission; NET agents see a net buy rate (cost + handling %)
-- and earn no commission. Display-layer only; the pricing engine is unchanged.

ALTER TABLE "companies" ADD COLUMN "agentRateMode" TEXT NOT NULL DEFAULT 'GROSS';
ALTER TABLE "companies" ADD COLUMN "agentNetHandlingPercent" DOUBLE PRECISION;
