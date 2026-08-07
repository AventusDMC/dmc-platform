# ERP V2 — Quote Builder V2 Slice 2D: HOTEL_APPLY Staging/Prod Flag Reconciliation Plan

**Date:** 2026-08-07
**Status:** Planning / read-only inspection. **Build-mode — Classic remains the system of record.** No code, schema,
flag/env, deployment, or data change accompanies this plan.

## 1. Current flag matrix (backend, Railway — read per-project, definitive)

| Flag | PRODUCTION (`cheerful-enthusiasm`) | STAGING (`dmc-platform-staging`) |
|---|---|---|
| `QUOTE_PRICING_PREVIEW` (global) | `true` | `true` |
| `QUOTE_PRICING_APPLY` (global) | `true` | `true` |
| `QUOTE_PRICING_HOTEL_PREVIEW` | `true` | `true` |
| **`QUOTE_PRICING_HOTEL_APPLY`** | **`true`** | **absent → OFF** ⟵ the inconsistency |
| `QUOTE_PRICING_ENTRANCE_PREVIEW` | `true` | `true` |
| `QUOTE_PRICING_ENTRANCE_APPLY` | `true` | `true` |
| `QUOTE_PRICING_EXTERNAL_PACKAGE_PREVIEW` | `true` | `true` |
| `QUOTE_PRICING_EXTERNAL_PACKAGE_APPLY` | `false` | absent → OFF |
| `QUOTE_PRICING_TRANSPORT_PREVIEW` | `true` | `true` |
| `QUOTE_PRICING_TRANSPORT_APPLY` | `false` | absent → OFF |
| `QUOTE_PREVIEW_TOKEN_SECRET` | present | present |
| `QUOTE_ITEM_CREATE` | absent → OFF | `true` (reverse skew — staging-only build-mode) |

**Frontend (Vercel, build-time `NEXT_PUBLIC`):** the client gate is
`NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_APPLY === 'true'` (`app/quotes/[id]/builder-v2/page.tsx:114`), which also requires
`NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_PREVIEW` + `canPreviewPricing`. A best-effort `vercel env ls production` (against
an **ambiguous/unlinked** project — likely not the canonical staff-prod `-4gu9`) listed `HOTEL_PREVIEW`, `ITEM_CREATE`,
`EXTERNAL_PACKAGE_PREVIEW`, `TRANSPORT_PREVIEW`, `ENTRANCE_PRICING` but **not** `HOTEL_APPLY`. Per the prior enablement
record ([[project_quote_builder_v2_hotel_apply]]), prod `-4gu9` carries `NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_APPLY=true`.
**The `NEXT_PUBLIC` value is therefore inconclusive via CLI and must be confirmed against the specific staging + prod
admin-web Vercel projects during remediation.**

**Net:** the only apply-scope that is ON in prod but OFF in staging is **`QUOTE_PRICING_HOTEL_APPLY`** (entrance-apply is
ON in both; external-package and transport apply are OFF in both).

## 2. Source / code-path summary
- **Preview** (`quotes.service` ~L3726): a hotel item preview is blocked unless `QUOTE_PRICING_HOTEL_PREVIEW` is ON;
  pure read (`hotelRate.findMany` + compute), no writes, issues a signed preview token.
- **Apply** (`quotes.service` ~L4133–4195) requires **ALL** of: global `QUOTE_PRICING_PREVIEW` **and**
  `QUOTE_PRICING_APPLY` (L4133), then `isHotelApply = isHotelService(item) && QUOTE_PRICING_HOTEL_APPLY` (L4195). In
  `NODE_ENV=production` it also refuses unless `QUOTE_PREVIEW_TOKEN_SECRET` is configured (L4140).
- **Token / acknowledgedDelta:** apply verifies the preview token (signature, expiry→`stale_preview`, quote/item/company
  binding, `normalizePayloadHash` payload match→`payload_mismatch`); non-zero delta needs `acknowledgedDelta`.
- **Write path:** apply re-uses the EXISTING `updateItem → recalculateQuoteTotals` (the same path Classic uses) — it
  re-resolves the rate for the already-selected hotel/contract/room/occupancy/dates from persisted columns. No schema/
  formula change; no selection/primary/rooming/itinerary change.
- **Role / status gates:** the shared apply guard enforces company scope (`requireActorCompanyId`) + editable quote
  status (same allowlist as preview); the UI additionally gates cost/margin display by `canAccessFinance(role)` (PR
  #766) with hydration-payload redaction (PR #767).
- **Cost/margin redaction — GAP:** the Slice 2C response-side cost redaction (`canViewQuoteCostMargin`) is scoped to the
  **activity item-create** endpoints ONLY. The **hotel preview / apply-preview RESPONSE still returns cost/margin
  regardless of role.** This is a pre-existing exposure in prod (mitigated at the UI layer, not the API layer), surfaced
  here as a separate hardening candidate — not a blocker for flag reconciliation.

## 3. Existing tests
- **Backend:** `quote-item-apply-guard.test.ts` (apply guard incl. hotel out-of-scope/token/flag gating),
  `quote-item-preview.test.ts` (hotel preview branch), plus `cost-visibility.test.ts` (2C predicate).
- **Frontend (source-grep):** `builder-v2-hotel-apply.test.ts`, `builder-v2-hotel-apply-hardening.test.ts`,
  `builder-v2-hotel-preview.test.ts` — pin the `NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_APPLY` gate + `canApply` composition
  (`canPreview && onApplyItemPricing && hotelApplyEnabled && hotel.pricedQuoteItemId`).

## 4. Existing production usage (read-only assessment)
- Hotel apply was **deliberately enabled for staff in prod on 2026-07-01** (backend + `-4gu9` `NEXT_PUBLIC`), the first
  V2 apply capability shipped. It re-uses the Classic write path (no forked pricing).
- **No live-booking dependency and no send dependency:** apply only re-persists the resolved hotel price on a quote item
  (updateItem→recalc); it does not create bookings, invoices, vouchers, or emails.
- **Tension to surface:** a staff-live prod hotel-apply sits in tension with the current "ERP V2 not ready for staff /
  build-mode" directive (which postdates the 2026-07-01 enablement). Whether prod hotel-apply remains a sanctioned live
  exception is a **product decision** and is out of scope for this reconciliation.

## 5. Answers
1. **Why prod ON / staging OFF?** Prod was intentionally enabled for staff (2026-07-01). Staging was configured for a
   *different* build-mode focus (`QUOTE_ITEM_CREATE=true`, which is OFF in prod) and simply **never had HOTEL_APPLY
   turned on** — the flag was not synced when prod shipped it.
2. **Intentional / accidental / leftover?** Prod = **intentional** (shipped feature). Staging OFF = **an un-synced gap /
   leftover**, not a deliberate "staging must differ" decision.
3. **Which state is safer during build-mode?** For *reproduction parity* (validate prod behavior on synthetic data),
   staging should **match** prod. Disabling prod would regress a shipped, staff-live feature.
4. **Turn staging ON to match prod?** **Yes — recommended.** It is the lowest-risk way to restore reproduction parity,
   is staging-only, and is fully reversible.
5. **Turn prod OFF to match staging?** **Not recommended** as the default — it disables a live staff feature. Only do
   this if product explicitly decides to freeze *all* V2 apply (incl. hotel) under the build-mode directive; that is a
   separate decision, not a flag-hygiene fix.
6. **Leave both as-is with docs?** Acceptable short-term (this document), but it leaves prod behavior unreproducible on
   staging — the exact problem this slice exists to fix. Prefer to proceed to Option A after approval.
7. **Safest next action + why?** **Option A** — enable `HOTEL_APPLY` on **staging only** (backend + staging `NEXT_PUBLIC`)
   to mirror prod, then validate on a synthetic staging hotel quote with the staging hard-fail guard + cleanup. No prod
   change; reversible; restores parity for build-mode validation.

## 6. Recommended reconciliation — Option A (enable staging to match prod)
Bring staging up to prod's shipped state so hotel-apply behavior is reproducible on synthetic staging data. Production is
**not** touched.

## 7. Exact future remediation steps — ONLY after approval
1. **Staging backend flag** (pin by project ID — collision-safe; this also triggers a staging redeploy):
   `railway variables -p 26e31130-a684-448a-bb96-f0da7a0a60c9 -e production -s dmc-platform --set "QUOTE_PRICING_HOTEL_APPLY=true"`.
2. **Staging frontend flag** on the **staging** admin-web Vercel project (build-time): add
   `NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_APPLY=true` to its Production env, then redeploy that project so the flag is baked
   in. (Confirm the exact staging Vercel project first; do NOT touch the prod `-4gu9` project.)
3. **Convergence verify** (read-only, pinned probes): staging runtime shows `QUOTE_PRICING_HOTEL_APPLY=true`, the four
   gating flags all ON, and **prod is unchanged** (read-only re-check).
4. **Staging-only hotel-apply validation** on a synthetic quote with a hotel item: privileged vs restricted preview/apply,
   token/`stale_preview`/`invalid_preview_token` fail-closed, deterministic totals, **staging hard-fail identity guard
   before any DB access**, and recalc-aware cleanup afterward (per the Slice 2C targeting lesson —
   [[reference_railway_db_topology]]).

## 8. Rollback plan
- **Staging-only and fully reversible.** To revert: set `QUOTE_PRICING_HOTEL_APPLY=false` (or remove it) on staging
  backend, and remove `NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_APPLY` from the staging Vercel project + redeploy.
- **Production is untouched throughout, so no prod rollback is ever needed.**

## 9. Risks
- **Wrong-env action:** the `dmc-platform` service name exists in BOTH projects — every flag/SSH command MUST pin by
  project ID (`26e31130…` staging / `cheerful-enthusiasm` prod) and every script MUST run the staging hard-fail identity
  guard before any DB access.
- **Vercel project ambiguity:** `NEXT_PUBLIC` changes must target the correct staging admin-web project explicitly; do
  not touch prod `-4gu9`.
- **Response-side cost exposure (pre-existing):** hotel preview/apply API responses return cost/margin regardless of role
  (2C redaction covered only activity item-create). Enabling staging apply does not worsen prod, but this is a hardening
  candidate ("2C-for-hotel/apply-preview") worth tracking.
- **Synthetic-data writes:** staging apply writes via updateItem→recalc; safe on synthetic quotes, but must use guard +
  cleanup.
- **Product tension:** prod hotel-apply is staff-live vs the build-mode/no-staff directive — needs a separate product
  decision; this plan does not resolve it and does not change prod.

## 10. GO / NO-GO
- ✅ **GO** — continued build-mode validation planning.
- ⛔ **NO-GO** — production flag changes now.
- ⛔ **NO-GO** — staff rollout.
- ⛔ **NO-GO** — live bookings.
- ⛔ **NO-GO** — supplier send.
- ⛔ **NO-GO** — full no-Classic launch.

### Safety confirmations
- Read-only inspection only — no code, schema, flag/env, deployment, or data change was made. No flags enabled/disabled;
  no redeploy; no hotel apply run; no production data touched.
- **Classic remains the system of record.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**
- **Supplier sending remains disabled.**
- Flag values were read per-project with explicit project pinning. No secrets, full DB URLs, or token values are
  recorded — the token secret is noted only as "present". Staging project ID is an operational identifier (already in
  [[reference_railway_db_topology]]).
