-- "Use package rates" toggle on a quote. When on, large-vehicle (Alpha) excursion
-- transport gets free mileage (distance-based extra-km waived) — the supplier's
-- 3+-full-day program discount. Default false = bill extra-km. Additive/inert.

ALTER TABLE "quotes" ADD COLUMN "excursionPackageRate" BOOLEAN NOT NULL DEFAULT false;
