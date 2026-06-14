# PR 10B-2 — Route-vs-Package selection UI (plan only, non-live-pricing)

**Date:** 2026-06-14
**Status:** PLAN ONLY — no implementation.
**Builds on:** PR 10B-1 (metadata-only save/clear endpoint `PATCH /transport-pricing/quotes/:id/package-selection`, merge commit `e4619073`).

PR 10B-2 adds UI to **save / clear** a planner's route-vs-package selection through the
PR 10B-1 metadata endpoint. It **never applies the selection to quote totals or items**.
It is display + selection only; the live pricing path is untouched.

---

## 0. Open decision (needs your call before implementation)

The UI must show the **persisted** saved selection on page load (option, contract id,
timestamp, who, and a stale/invalid warning). The current PR9 pricing-shadow GET does **not**
return those persisted columns. Two read-source options:

- **Option A (RECOMMENDED) — extend the existing PR9 pricing-shadow GET response, read-only.**
  Add an additive, read-only block to the response the component already fetches:
  `savedSelection { option, contractId, isManual, at, byUserId }` + `selectionStale` (boolean).
  Computed in `package-eligibility-shadow.service.ts` by reading the 5 persisted columns and
  re-checking against the freshly-resolved active contract. **No new endpoint, no new proxy,
  no schema, no writes.** One existing GET already mounted in the component.
  - Gating: the `savedSelection`/`selectionStale` block is only populated when
    `transport.packageOptionSelection` is ON (so the shadow-compare flag alone never exposes it).

- **Option B — dedicated read endpoint + proxy.** New `GET /transport-pricing/quotes/:id/
  package-selection` (returns saved selection + staleness) and a matching GET proxy. Cleaner
  separation but more surface (extra controller method + extra proxy file + extra tests).

The rest of this plan assumes **Option A**. If you prefer B, only §1 (file list) and §4
(proxy/API flow) change (add one GET endpoint + one GET proxy).

> Either way: the **save/clear** path uses the PR 10B-1 PATCH endpoint unchanged. The only
> question is how the UI *reads back* persisted state. Both options are strictly read-only for
> state retrieval; neither touches totals/items.

---

## 1. File list

**Admin-web (UI):**
- `apps/admin-web/app/quotes/[id]/PackagePricingPreview.tsx` — EXTEND. Add the selection
  controls + saved-state display inside the existing display-only `<details>` panel. Gated by
  both preview and selection flags.
- `apps/admin-web/app/api/transport-pricing/quotes/[id]/package-selection/route.ts` — **NEW**
  proxy. `PATCH` only → forwards to PR 10B-1 API endpoint via `proxyRequest`. No other methods.
- `apps/admin-web/app/quotes/[id]/PackagePricingPreview.test.ts` — EXTEND/REVISE. The existing
  PR10A assertions #3 (`no <button`, `no PATCH`, "future step") will be **revised** to be
  flag-conditional (see §7 / Risks).

**API (read-side, Option A only):**
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.ts` — EXTEND the existing
  `evaluateQuotePackagePricingShadow` (or its caller) to additively include `savedSelection` +
  `selectionStale`, gated by `isPackageOptionSelectionEnabled()`. Read-only; no writes.
- `apps/api/src/transport-pricing/package-eligibility-shadow.service.test.ts` — EXTEND with
  read-side tests (savedSelection surfaced when flag ON; stale detection; absent when flag OFF).

**NOT touched (explicit):**
- `QuoteServicePlanner.tsx`, `QuoteItemCard.tsx` — untouched.
- `apps/api/prisma/schema.prisma`, migrations — untouched (no schema, no migration).
- `apps/api/src/quotes/quotes.service.ts` — untouched.
- quote-WIP stash files (`QuoteItemCard.tsx`, `QuoteServicePlanner.tsx`,
  `excursion-origin-display.ts/.test.ts`) — untouched.
- `apps/api/src/quotes/proposal-v3-pdf-export.test.ts` — remains excluded (see §8).

---

## 2. UI behavior (inside the existing preview panel)

Rendered only when **both** `NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTIONS_PREVIEW` (preview) **and**
`NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTION_SELECTION` (selection) are ON. Preview-only stays exactly
as PR10A when the selection flag is OFF.

- **Show current route/transfer option** — the route/transfer baseline (already shown).
- **Show package candidate option** — the package candidate (already shown).
- **Show recommended label only** — a passive "Recommended: …" tag derived from the existing
  diagnostic comparison. **Label only — it does not pre-select or auto-apply anything.**
- **"Select route"** button → PATCH `{ option: 'ROUTE_TRANSFER' }`. Always enabled.
- **"Select package"** button → PATCH `{ option: 'PACKAGE_MIN_FULL_DAY' }`. **Enabled only when
  eligible** (has active package contract AND `manualRequiredDays === 0` AND `packageEligible`).
  Disabled otherwise, with an inline reason (see §5). Client sends **no contract id** — the API
  resolves the active contract server-side (PR 10B-1 behavior).
- **"Clear selection"** button → PATCH `{ option: null }`. Always enabled.
- **Show saved selection state** — render persisted `savedSelection` (see §6).
- **Stale/invalid warning** — if `selectionStale` is true, show a warning (selected package
  contract no longer eligible/found) and visually mark the saved state as stale.
- **Always show "NOT APPLIED TO TOTALS"** — keep the existing NOT-APPLIED banner; add an
  explicit "NOT APPLIED TO TOTALS" line next to the saved selection.
- **No apply button.** **No quote total change.** **No automatic cheapest selection** (the
  recommended label is passive; nothing is auto-selected/saved).
- After a successful PATCH, update local state from the PATCH response (which echoes the saved
  selection) — no quote refetch that could imply totals changed.
- Disable buttons while a PATCH is in flight; surface PATCH errors (e.g. 400 reasons) inline.

---

## 3. Feature flag behavior

| Preview flag (`…OPTIONS_PREVIEW`) | Selection flag (`…OPTION_SELECTION`) | Result |
|---|---|---|
| OFF | (any) | Component renders nothing, no fetch (PR10A behavior). |
| ON | OFF | **Display-only** preview exactly as today. No selection buttons, no saved-state block, **no PATCH ever**. |
| ON | ON | Preview **plus** selection controls + saved-state display. |

- Client flags are `NEXT_PUBLIC_*` (build-time, truthy `1/true/on/yes`).
- The API stays independently gated: reads by `transport.packagePricingShadowCompare`
  (and, for Option A's savedSelection block, also `transport.packageOptionSelection`); the
  PATCH save by `transport.packageOptionSelection`. **If the client selection flag is ON but the
  API flag is OFF, the PATCH returns 403** and the UI shows the error — no data changes.
- Defense in depth: even with the client flag forced on, the API still hard-gates the save.

---

## 4. Proxy / API flow

**Save/clear (write):**
```
PackagePricingPreview (client, selection flag ON)
  → fetch PATCH /api/transport-pricing/quotes/:id/package-selection  (buildAuthHeaders)
  → NEW proxy route.ts: proxyRequest(request, `${API}/transport-pricing/quotes/:id/package-selection`, 'PATCH')
  → PR 10B-1 controller (flag transport.packageOptionSelection, @Roles admin,finance)
  → saveQuotePackageSelection → writeSelection (5 columns only)
```
- Proxy exposes **PATCH only** — no GET/POST/PUT/DELETE exports.
- Body forwarded verbatim (`{ option, manualOverride? }`); `manualOverride` is ignored by the
  API in 10B-1/10B-2 (no override for ineligible).

**Read (state + staleness):**
- Option A: the existing GET `package-pricing-shadow` proxy/endpoint, response additively
  includes `savedSelection` + `selectionStale` (gated by `transport.packageOptionSelection`).
- Option B: a new GET `package-selection` endpoint + GET proxy.

---

## 5. Validation / UX (why package can't be selected)

"Select package" is **disabled** with an explicit inline reason when:
- **No package contract** — `no-package-contract` → "No package contract for this supplier/
  vehicle class."
- **Below minimum** — `below-minimum` → "Below the package minimum (N full days required)."
- **Manual-required days exist** — `manualRequiredDays > 0` → "Resolve N manual-required day(s)
  first."
- **Stale/invalid** — `selectionStale` → "Previously selected package is no longer eligible."

Rules:
- **Route selection always allowed.** **Clear selection always allowed.**
- **No manual override** for ineligible package in PR 10B-2 (the API hard-blocks anyway; the UI
  must not send a path that bypasses it).
- The disabled state is driven by the same `packageEligible` / `manualRequiredDays` / `reason`
  the API computes — the UI never decides eligibility on its own; it mirrors the API and the API
  re-validates on save (so a race that flips eligibility still gets a 400, shown inline).

---

## 6. Saved selection display

From `savedSelection` (+ `selectionStale`):
- **Selected option type** — Route/transfer, Package, or "None".
- **Selected contract ID** — shown only when option is Package.
- **Selection timestamp** — `transportSelectionAt`.
- **Selected by** — `transportSelectionByUserId` if available; otherwise "—".
- **Not-applied status** — explicit "NOT APPLIED TO TOTALS".
- **Stale/invalid warning** — shown when `selectionStale` (selected package contract
  deactivated/deleted or no longer eligible). Staleness is **recomputed server-side** by
  re-resolving the active contract; the UI never trusts the stored id as still-valid.

---

## 7. Tests (admin-web `PackagePricingPreview.test.ts`, source-grep style; + API read tests)

UI (source-grep over the component + new proxy, consistent with PR10A style):
1. **Selection flag OFF** → buttons absent and no PATCH (`method:'PATCH'` not present in the
   selection-OFF render path); preview still display-only.
2. **Selection flag ON** → "Select route", "Select package", "Clear selection" controls present.
3. **Select route** → PATCH body contains `ROUTE_TRANSFER`.
4. **Select package** → PATCH body contains `PACKAGE_MIN_FULL_DAY` (no client contract id sent;
   server resolves it).
5. **Clear** → PATCH body `option: null`.
6. **Ineligible package** → "Select package" rendered `disabled`.
7. **Manual-required package** → "Select package" disabled + reason text.
8. **Stale/invalid** → stale warning markup present.
9. **No apply button** → no "Apply"/apply-to-totals control anywhere.
10. **No mutating call except the selection endpoint** → the only non-GET fetch targets
    `package-selection`; no other POST/PATCH/PUT/DELETE.
11. **Quote total display unchanged** → component does not write to or refetch quote totals;
    NOT-APPLIED banner present.
12. **Proxy** → PATCH-only export; forwards to `/transport-pricing/quotes/.../package-selection`;
    no GET/POST/PUT/DELETE exports.
13. **Source-grep safety** → existing PR7/PR10A fragments in `QuoteItineraryTab.tsx` remain
    intact; the revised assertions are flag-conditional (see Risks).

API (Option A, `package-eligibility-shadow.service.test.ts`):
14. `savedSelection` surfaced in the pricing-shadow result when `transport.packageOptionSelection`
    is ON.
15. `savedSelection` **absent/empty** when that flag is OFF.
16. `selectionStale === true` when saved option is PACKAGE but the resolved active contract is
    missing / id mismatch / no longer eligible.
17. `selectionStale === false` for a still-valid package selection and for ROUTE/none.
18. Read path performs **no writes** (no `quote.update` called).

---

## 8. Conflict check

- **Quote-WIP stash files** — PR 10B-2 touches **none** of them. Confirmed stash contents:
  `QuoteItemCard.tsx`, `QuoteServicePlanner.tsx`, `excursion-origin-display.ts`,
  `excursion-origin-display.test.ts`. PR 10B-2 only edits `PackagePricingPreview.tsx` /
  its test / a new proxy file (+ Option A: the shadow service/test). Stash will **not** be
  restored, dropped, or applied.
- **`apps/api/src/quotes/proposal-v3-pdf-export.test.ts`** — still present as an unstaged
  modification (` M`). It is unrelated and will remain excluded.
- **How it stays excluded** — PR 10B-2 stages files by explicit path (never `git add -A` / `.`);
  the commit will list only the PR 10B-2 files; the GitHub PR diff will be verified to exclude
  it before requesting merge. It will not be reverted/stashed without asking.

---

## 9. Risks

- **PR10A test regression (primary risk).** Existing assertions #3 assert *absence* of buttons,
  PATCH, and presence of "future step" text. Adding selection controls breaks them. Mitigation:
  revise those assertions to be **flag-conditional** — display-only invariants still hold for the
  selection-OFF path; button/PATCH assertions move under the selection-ON path. Source-grep tests
  read raw source, so the component must keep both branches clearly present.
- **Reading persisted state** requires the §0 decision; Option A keeps surface minimal but means
  one additive read field on the PR9 endpoint (still read-only, flag-gated).
- **Stale detection correctness** — must recompute against the freshly-resolved active contract
  (deactivation/deletion ⇒ stale), never trust the stored id. Covered by tests 16–17.
- **Accidental totals coupling** — must not refetch/recompute quote totals after save. Mitigation:
  update local state from the PATCH echo only; test 11.
- **Flag-skew** (client ON, API OFF) — handled: API 403, shown inline, no data change.

---

## 10. Acceptance criteria

- With **selection flag OFF**, the panel is byte-for-byte the PR10A display-only experience; no
  PATCH is ever issued.
- With **selection flag ON**: Select route / Select package (eligible-only) / Clear render and
  call the PR 10B-1 PATCH endpoint with the correct body; saved state + stale warning + a
  persistent "NOT APPLIED TO TOTALS" indicator render.
- Ineligible/manual-required/stale package ⇒ "Select package" disabled with an explicit reason.
- No apply button; no automatic cheapest selection; no manual override for ineligible package.
- Quote totals and quote items are unchanged in code and in the rendered UI.
- API still hard-gates the save (`transport.packageOptionSelection`); client flag-on with API
  flag-off ⇒ 403, no change.
- No schema, no migration, no DB writes except the selection save via the metadata endpoint.
- `QuoteServicePlanner.tsx`, `QuoteItemCard.tsx`, stash files, dana files, `touring_route_days`,
  and `proposal-v3-pdf-export.test.ts` are all untouched/excluded.
- All admin-web + API tests pass; source-grep tests remain safe.

---

## 11. Explicitly NOT in PR 10B-2

No live pricing activation · no quote total change · no quote item price mutation · no
supplier/method switching · no automatic cheapest selection · no package apply · no manual
override for ineligible package · no schema/migration · no DB writes except the selection save ·
no DAILY_PACKAGE / driver-overnight / stationary charging · no PR 11 work · no quote-WIP stash
restore/drop · no dana files · no touring_route_days cleanup.
