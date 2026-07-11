# ERP V2 — Launch Readiness Refresh

**Date:** 2026-07-07
**Status:** Documentation only. No code, schema, flag, or environment change accompanies this
report. It refreshes the V2 launch-readiness picture based on completed work to date.

---

## 1. Current posture

- Still **building / testing** — **not** in real live operations yet.
- Strategy: **V2-first for launch**, with **Classic kept as fallback / reference only**.
- Only one surface is *broadly* production-live today (Product Catalog V2, read-only,
  internal-only). Everything else is pilot, flag-gated, or staging.

## 2. Completed milestones

- **Quote Builder V2** — rolled out (V2 is the default builder; Classic retained as fallback).
- **Booking Creation V2** — built and **production pilot accepted** (broad enablement OFF).
- **Operations V2** — workspace + read-only tabs (operations / passengers / finance /
  documents / activity).
- **Passenger / Rooming** — MVP through PR-3 privacy hardening, staging-validated.
- **Supplier Voucher Packet V2** — **S1–S7 complete and staging-validated**
  (S1 schema, S2 grouping panel, S3 generate, S4 PDF render, S5 Download-PDF UI,
  S6 stale/regenerate, S7 send-preview/readiness). **Actual supplier packet send is not
  built.**
- **Product Catalog V2** — **live in production, internal-only, read-only, polished UI**
  (backend aggregator → internal-first role gate → table/layout polish).
- **Roles / PII hardening** — explicit allowlists (no role coalescence; `agent_admin` blocked
  where required), PII/pricing redaction, finance-access gating.
- **Voucher-send safety** — Resend HTTP only (SMTP blocked), production send fail-closed,
  recipient allowlist limited to `ziad@axisdmc.com`.

## 3. Current production / staging state (honest)

- **Product Catalog V2** — **live in production, internal-only** (admin / operations /
  super_admin / finance can view; agent / viewer / agent_admin blocked). Read-only.
- **Supplier Voucher Packet V2** — **staging only; production fail-closed** (both packet flags
  OFF/unset in production). The S1 schema migration is applied to the production database
  (additive, dormant). **Actual packet send is not built or enabled.**
- **Booking Creation V2** — broad production enablement **OFF** (pilot accepted only).
- **Passenger / Rooming** — production **edit** flag **OFF** (read-only / PII-gated in prod).
- **Voucher-send** — production send flag OFF; **allowlist `ziad@axisdmc.com` only**; supplier
  broad email **not started**.
- **Operations V2** — treated as live per current state; the read-only Booking Ops V2 command
  center was last recorded staging-only (production flag OFF) — **verify the production flag
  before counting it as launch-live.**
- **Production flags default fail-closed** across the board.

## 4. Remaining blockers (before a broad V2-first launch)

1. **Finance V2 gap / Classic dependency** — a read-only finance tab exists in Operations V2,
   but the full finance workflow is still Classic. Must be resolved or formally accepted as a
   documented Classic dependency.
2. **Supplier / contract data cleanup** — Product Catalog V2 warnings now expose real gaps
   (missing emails/rates, expired/unverified contracts). Blocks quoting accuracy and any future
   supplier packet send.
3. **Staff UAT not yet done** — no structured cross-surface user acceptance pass.
4. **Operations V2 production-state verification** — confirm the production flag state (last
   recorded staging-only).
5. **Passenger / Rooming production edit still OFF** — editing in production still requires
   Classic.

## 5. Must-have before V2-first live launch

- Resolve **or** formally accept the Finance V2 / Classic dependency (documented fallback).
- **Supplier data cleanup** pass driven by Product Catalog V2 warnings (emails, rates, expired
  contracts) to an agreed threshold.
- **Staff UAT sign-off** on Quote Builder V2, Booking Creation V2, Operations V2,
  Passenger / Rooming (read), and Product Catalog V2.
- **Production-flag audit** confirming every flag matches the intended launch state
  (fail-closed elsewhere).
- Confirmed **Classic fallback path** for every V2 surface.

## 6. Should-have before staff testing

- Confirm the Operations V2 production flag state (staging vs production).
- A short "known Classic-only areas" reference for testers (finance ops, edits).
- Product Catalog V2 warnings triaged into a supplier-cleanup worklist.
- A staging test-data plan so UAT exercises real flows without touching production.

## 7. Post-launch items (explicitly later)

- **Supplier Voucher Packet V2 — actual send** (built on S7 readiness) — **kept allowlist-gated
  to `ziad@axisdmc.com`, staging-first; not a broad rollout.**
- **Supplier broad email rollout** — **post-launch only**, after data cleanup and an explicit
  allowlist-widening decision (not now).
- Product Catalog V2 widen-out to external roles (with redaction) — deliberate, later.
- Booking Creation V2 broad production enablement — after pilot confidence + finance
  resolution.
- Passenger / Rooming production edit enablement (internal-first, staged) — later.
- Product Catalog V2 performance / pagination for larger production datasets.

## 8. Recommended next 5 tasks (in order)

1. **Structured staff UAT pass** across the live / pilot V2 surfaces (Quote Builder V2,
   Booking Creation V2 pilot, Operations V2, Passenger / Rooming read, Product Catalog V2) on
   staging plus the internal-live production Catalog — surface gaps before any broad launch.
   *(testing; no new production enablement)*
2. **Finance V2 readiness audit** — map exactly what finance is V2 vs Classic-only; document the
   dependency; scope a read-only Finance V2 gap-closure if required. *(analysis / plan)*
3. **Supplier data cleanup using the live Product Catalog V2 warnings** — triage
   MISSING_EMAIL / MISSING_RATES / EXPIRED_CONTRACT / UNVERIFIED_HOTEL_CONTRACT and clean the
   data in Classic (data hygiene, not new code). *(data readiness)*
4. **Production-flag & fail-closed audit** — verify Operations V2, Booking-Creation broad,
   Passenger / Rooming edit, voucher-send, and packet flags all match the intended launch
   state. *(verification; no changes)*
5. **Supplier Voucher Packet V2 — actual send design (plan only)** — design the real send on
   top of S7 readiness, **keeping the allowlist `ziad@axisdmc.com` and staging-only**;
   explicitly no allowlist widening and no broad rollout. *(design / plan)*

## 9. Risks

- **Finance dependency on Classic** undermines a clean V2-first story if not addressed or
  accepted.
- **Dirty supplier / contract data**, now visible via Product Catalog V2, erodes trust and
  blocks packet send; cleanup is manual and time-consuming.
- **Flag drift** — many flags across two backend projects + the frontend; an accidental
  production enablement is the top operational risk (mitigated by fail-closed defaults and the
  flag audit).
- **Environment topology confusion** (misleading project names) — risk of touching the wrong
  environment; validated procedures exist but require care.
- **Supplier send** — the real risk lives here; keeping it staging-only + single-allowlist is
  the correct posture until data cleanup and an explicit go-ahead.
- **Staff readiness** — without UAT, a real launch could surface workflow gaps late.

## 10. Go / No-Go criteria (for a broad V2-first launch — not today)

**GO only when all are true:**

- Staff UAT signed off on the core V2 surfaces.
- Finance V2 dependency resolved or formally accepted with a documented Classic fallback.
- Supplier / contract data cleanup to an agreed threshold (Catalog warnings triaged).
- Production-flag audit passed (intended state; fail-closed elsewhere).
- Classic fallback confirmed reachable for every V2 surface.
- Rollback (flag-off + redeploy per surface) rehearsed.

## 11. Current verdict

- **NO-GO** for a broad V2-first live launch today (expected — still building / testing).
- **GO** for continued internal use of what is already live (Product Catalog V2, read-only,
  internal-only).
- **GO** for continued staging QA.

Do **not** enable any production flag broadly yet, do **not** widen the supplier-send allowlist,
do **not** start supplier broad email, and do **not** build new Classic features.
