-- Route Standards Cleanup Phase v1 — canonicalization + review workflow.
-- Adds three new columns to route_standards:
--   * canonicalRouteCode: the operator-facing FROM_TO short form (AMM_PET,
--     PET_WR, etc.). Original routeCode column stays unchanged so legacy
--     quote items / vouchers / dispatch references still resolve.
--   * reviewStatus: AUTO_BOOTSTRAP | REVIEW_REQUIRED | VERIFIED | CANONICALIZED.
--   * suspiciousDurationFlag: set by sanity validation when the inherited
--     duration looks like an excursion-day length rather than realistic
--     transfer movement timing.
-- Two new indexes back the refinement dashboard's "by canonical code" and
-- "by review status" lookups.
ALTER TABLE "route_standards" ADD COLUMN "canonicalRouteCode" TEXT;
ALTER TABLE "route_standards" ADD COLUMN "reviewStatus" TEXT;
ALTER TABLE "route_standards" ADD COLUMN "suspiciousDurationFlag" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "route_standards_canonicalRouteCode_idx" ON "route_standards"("canonicalRouteCode");
CREATE INDEX "route_standards_reviewStatus_idx" ON "route_standards"("reviewStatus");
