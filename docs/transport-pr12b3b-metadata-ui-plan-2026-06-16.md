# PR 12B-3B — Metadata capture UI (plan only)

**Date:** 2026-06-16
**Branch (to create):** `transport-pr12b3b-metadata-capture-ui` (from `origin/main`)
**Scope:** admin-web UI to capture/edit the three metadata fields added in PR 12B-2 and wired
through the API in PR 12B-3A:
- `Supplier.baseCity` (transport suppliers)
- `QuoteItineraryDay.overnightCity`
- `QuoteItineraryDay.vehicleReturnsToBase`

**UI capture only. No pricing, no schema, no new endpoints, no recalc.** PR 12C reads these later.

---

## 1. UI proposal

### A. Supplier — "Base city" (`apps/admin-web/app/suppliers/SuppliersForm.tsx`)
- New text input **"Base city"** rendered inside the existing **transport-only** block, directly
  under the existing "Transport discount %" field (mirror its `type === 'transport'` gating —
  base city is only meaningful for transport suppliers / driver-overnight evaluation).
- Help text: *"Where this supplier's vehicles are based. Used later for driver-overnight
  evaluation — this does not change pricing yet."*
- Free text, optional. No dropdown (suppliers are few; a fixed city list would be wrong for new
  regions). Trim handled server-side (PR 12B-3A caps 120 / blank → NULL).

### B. Quote day — "Transport day (advanced)" (`apps/admin-web/app/quotes/[id]/QuoteItineraryDayForm.tsx`)
Extend the existing `<details><summary>Transport day (advanced)</summary>` block (PR7). Add two
controls after the retention control:

1. **"Overnight city / area"** — free-text input.
   - Empty → NULL. Help text: *"Where the vehicle/driver stays overnight on this day, if different
     from base. Leave blank for none."*
2. **"Vehicle returns to base overnight?"** — tri-state `<select>` mirroring the PR7 retention
   pattern: `Auto / Unknown` (`''` → **null**), `Yes` (→ **true**), `No` (→ **false**).
   - Help text: *"Whether the vehicle returns to base at night. Affects future overnight pricing
     only — no pricing change yet."*

All three controls carry an explicit "does not change pricing yet" note so the operator isn't
misled into expecting a total to move.

---

## 2. Data flow (no new API/proxy needed)

### Supplier
- `SuppliersForm` builds the PATCH/POST body explicitly in `JSON.stringify({...})`
  (`SuppliersForm.tsx:50`). Add `baseCity` to that body:
  `baseCity: type === 'transport' ? (baseCity.trim() === '' ? null : baseCity) : undefined`.
- Request goes to `${apiBaseUrl}/suppliers[/:id]`; the proxy `app/api/suppliers/[id]/route.ts`
  (PATCH) forwards the body verbatim via `proxyRequest` → **no proxy change**.
- PR 12B-3A controller/service already accept + normalize `baseCity`.
- **initialValues:** add `baseCity?: string` to the `SuppliersForm` `initialValues` type, seed
  `const [baseCity, setBaseCity] = useState(initialValues?.baseCity || '')`, and have the supplier
  **edit page** include `baseCity` when it passes `initialValues` (and in its supplier fetch/select
  if it explicitly selects columns — verify it isn't a narrow `select`). Prisma returns scalar
  columns by default, so a non-`select` fetch already carries `baseCity`.

### Quote day
- `QuoteItineraryDayForm` PATCH payload is assembled in the PR7 advanced block
  (`QuoteItineraryDayForm.tsx:94-103`). Add (edit/PATCH only — never on the create POST, which
  the form already restricts):
  - `payload.overnightCity = overnightCity.trim() === '' ? null : overnightCity;`
  - `payload.vehicleReturnsToBase = returnsChoice === '' ? null : returnsChoice === 'yes';`
- Add state `overnightCity` + `returnsChoice`, plus entries in the `useEffect` reset and its dep
  array (`QuoteItineraryDayForm.tsx:72-79`), seeded from `initialValues`.
- Extend the `initialValues` type (`QuoteItineraryDayForm.tsx:19-22`) with
  `overnightCity?: string | null` + `vehicleReturnsToBase?: boolean | null`.
- `QuoteItineraryTab.tsx`: add the two fields to the day type (`:105-106`) and pass them in every
  `initialValues={{ ... }}` block that renders the form (`:273-280` and the nested one `:359+`).
- **Verify** the day-list loader the tab uses returns `overnightCity` / `vehicleReturnsToBase`
  (default Prisma scalar return covers this unless a narrow `select` is in play — check the
  quote-itinerary GET path; add to `select` only if one exists).
- Endpoint already accepts the fields (PR 12B-3A `UpdateDayBody` + `toUpdateDayDto`); the existing
  day-update proxy forwards body → **no proxy change**.

---

## 3. Validation rules (UI mirrors server, server is source of truth)
- All three optional. Blank → send `null` (server also coerces blank → NULL, caps cities at 120).
- `vehicleReturnsToBase`: only `true | false | null` ever sent (tri-state select can't produce
  anything else); server rejects non-boolean with 400 as a backstop.
- No auto-fill, no inference, no backfill. Untouched fields on the day form: overnight fields only
  written on PATCH (consistent with PR7 metadata which is edit-only).
- No client-side recalculation; no pricing fields touched.

---

## 4. Tests
- **`apps/admin-web/app/quotes/[id]/QuoteItineraryDayEditing.test.ts`** (existing source-grep):
  add fragment assertions that the form source contains the new labels/keys
  (`overnightCity`, `vehicleReturnsToBase`, "Overnight city", "returns to base"). The existing
  guards (no `/items`, no `markup/totalSell/totalCost/...`, no `dayItems/poiAssignments`) must
  still pass — the new controls add none of those.
- **New `apps/admin-web/app/suppliers/SuppliersForm.test.ts`** (source-grep, same harness shape):
  assert the form source contains the "Base city" label + `baseCity` body key, and contains no
  pricing/total fields.
- Run with `tsx --test` (bracket `[id]` path needs the wildcard runner).
- API behavior already covered by PR 12B-3A unit tests — not re-run here (no API change).

---

## 5. Conflict risk
- **Source-grep fragility** (per memory `project_source_grep_tests`): edits near
  `QuoteItineraryDayEditing.test.ts`'s asserted strings can break it — additive controls are low
  risk; I update the test in the same PR.
- **No-proxy-needed** (per memory `project_api_proxy_routes`): pages already have matching proxies;
  no missing-proxy 404 risk.
- Both targets are additive form fields; no shared-component churn. No `QuoteServicePlanner` /
  `QuoteItemCard` touch.

---

## 6. File list
**Edit:**
- `apps/admin-web/app/suppliers/SuppliersForm.tsx` (state + input + body key + initialValues type)
- supplier **edit page** that renders `SuppliersForm` (add `baseCity` to initialValues; verify fetch) — confirm exact path during impl (e.g. `app/suppliers/[id]/edit/page.tsx`)
- `apps/admin-web/app/quotes/[id]/QuoteItineraryDayForm.tsx` (2 controls + state + payload + reset + type)
- `apps/admin-web/app/quotes/[id]/QuoteItineraryTab.tsx` (day type + initialValues blocks)
- `apps/admin-web/app/quotes/[id]/QuoteItineraryDayEditing.test.ts` (new fragments)

**Add:**
- `apps/admin-web/app/suppliers/SuppliersForm.test.ts` (new source-grep test)
- this plan + a verification doc

**Verify only (likely no change):** suppliers proxy `app/api/suppliers/[id]/route.ts`, day-update
proxy, quote-itinerary day GET select.

---

## 7. Risks & mitigations
- *Day GET uses a narrow `select` omitting the new columns* → fields would show blank on reload.
  Mitigation: grep the loader during impl; add to `select` if present.
- *Operator expects a price change* → mitigated by explicit "does not change pricing yet" help text.
- *Switching a supplier away from `transport` type* → base-city input hidden + sent `undefined`
  (unchanged), matching the existing transportDiscountPercent gating; document the behavior.

---

## 8. Acceptance criteria
1. Transport supplier form shows "Base city"; save persists it; clearing → NULL; reload shows saved
   value; non-transport supplier unaffected.
2. Quote day "Transport day (advanced)" shows "Overnight city / area" + "Vehicle returns to base
   overnight?"; PATCH persists overnight city + tri-state boolean; blank/Auto → NULL; reload shows
   saved values.
3. No new endpoints/proxies; PR 12B-3A API unchanged.
4. `QuoteItineraryDayEditing.test.ts` + new `SuppliersForm.test.ts` pass; existing admin-web
   baseline unchanged.
5. **No pricing/quote-total change**; overnight/stationary remain blocked; live-apply flag OFF.
6. No touch to `QuoteServicePlanner` / `QuoteItemCard` / quote-WIP stash / dana;
   `proposal-v3-pdf-export.test.ts` stays excluded.

---

## Out of scope (unchanged)
No shadow calc (12C); no planner UI (12D); no controlled validation (12E); no live apply (12F);
no PR 13; no production activation; no schema/migration (12B-2 done); no API change (12B-3A done).
