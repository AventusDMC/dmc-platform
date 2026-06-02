-- Agent Portal — commission rate (%) the agent company earns on the sell
-- value of its bookings. Nullable; backward-compatible.

ALTER TABLE "companies" ADD COLUMN "agentCommissionPercent" DOUBLE PRECISION;
