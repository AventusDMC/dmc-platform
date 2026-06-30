/**
 * Booking Operations V2 — build-time route opt-in flag.
 *
 * Mirrors the Quote Builder V2 flag pattern
 * (apps/admin-web/app/quotes/[id]/quote-readiness.ts:446 reads
 * NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT). Default OFF: when unset/!= 'true',
 * the V2 ops routes 404 and Classic stays the only operations surface.
 *
 * This flag ONLY gates route reachability. Round 1 is read-only and consumes
 * existing GET endpoints, so there is no backend flag and no behavior change.
 */
export function isOpsV2Enabled(): boolean {
  return process.env.NEXT_PUBLIC_OPS_V2_DEFAULT === 'true';
}
