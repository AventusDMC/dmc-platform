-- Per-supplier negotiated transport discount. Applied at pricing time to
-- transport (vehicle-rate) lines only: cost = rate * (1 - pct/100). One place to
-- edit per supplier. Default 0 = no discount, so this is backward-compatible and
-- inert until a supplier's percent is set.

ALTER TABLE "suppliers" ADD COLUMN "transportDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
