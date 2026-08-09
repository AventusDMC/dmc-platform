# ERP V2 — Ops V2 Display-Gap Closure Plan

Planning document. No code, no behavior change. Plans the next read-only Ops V2
display-gap closure slice: a curated serviceType/operationType label/icon table and
surfacing already-present safe operational detail on the board — preserving the Ops
V2 read-only invariant.

---

## 1. Current Ops V2 display inventory

- Board organized by **5 operational phases** (not by day).
- Each **service row** shows a serviceType icon, description, day label, supplier (or
  "Unassigned"), and Confirmation / Voucher / Status badges.
- Key files:
  - `apps/admin-web/components/ops/v2/service-row.tsx`
  - `apps/admin-web/app/operations/v2/ops-view-model.ts`
  - `apps/admin-web/components/ops/v2/service-type-icon.tsx`
  - `apps/admin-web/app/operations/v2/ops-status-map.ts`
- `app/operations/v2/ops-readonly-invariant.test.ts` — scans all Ops V2 files for
  mutation/form/download tokens; a `MUTATION_ALLOWLIST` of **exactly 4** sanctioned
  mutations (supplier assign, supplier confirm, voucher generate, voucher send).

## 2. serviceType / operationType gap

- The backend **already folds `operationType` into the row's `serviceType`**:
  `bookings.service.ts:1079` → `serviceType: service.operationType || service.serviceType || 'SERVICE'`.
  `BookingService.operationType` exists and is indexed (`schema.prisma:2824`).
- operationType values include `AIRPORT_TRANSFER`, `POINT_TO_POINT`, `ROUTE_TRANSFER`,
  `HOTEL`, `ACTIVITY`, `GUIDE`, `MEAL`, `ENTRANCE/TICKET`, `EXTERNAL_PACKAGE`.
- The current icon/label maps (`service-type-icon.tsx`, `ops-status-map.ts#humanizeStatus`)
  **do not cover the operationType vocabulary**.
- Unknown types fall back to **`CircleDot` / title-case / `neutral`** (silently).
- **No separate operationType display is needed for this slice** — it is already the
  source of the row's `serviceType`; a curated table covers it.

## 3. Hotel detail gap

- The board payload **already includes** safe fields such as `mealPlan`, `nights`,
  `pickupLocation`, `dropoffLocation`, `operationalTime`, `vehicleName`, `driverName`
  (`bookings.service.ts:1090-1114`).
- The FE `RawGridRow` currently **does not declare them**, so `mapRow` drops them.
- The voucher-preview VM has richer hotel fields such as `checkIn`, `checkOut`,
  `occupancy`, `roomingSummary` (`ops-voucher-preview-vm.ts:43-49`, allowlist-extracted
  from the voucher snapshot).
- **Full check-in/out/occupancy on the board requires backend enrichment and is
  deferred** (a later optional slice).

## 4. Answers / recommendation

- **FE polish first.**
- **No backend change needed** for the label table + safe detail line.
- operationType can be displayed **through the existing `serviceType` value**.
- Full backend enrichment **deferred**.
- Safe board details:
  - `mealPlan`
  - `nights`
  - `pickupLocation`
  - `dropoffLocation`
  - `operationalTime`
- **Defer driver/vehicle names** for a minimal slice.

## 5. Recommended display model

- Curated **serviceType/operationType label + icon table** (a pure map).
- Documented fallback (no longer silent where a known mapping exists).
- Compact **secondary detail line** on the service row.
- Hotel detail example: `mealPlan · N nights`.
- Transfer detail example: `pickupLocation · operationalTime`.
- **No changes** to phases, badges, supplier controls, confirmation controls,
  voucher/packet controls, or flags.

## 6. Redaction / privacy rules

- No cost / sell / payable / margin / price.
- No supplier discounts.
- No supplier payment amounts.
- No raw supplier object.
- No `ratePolicies`.
- No tokens.
- No references.
- No PII / contact fields.
- Explicitly **exclude `driverPhone`**.
- No raw row spreading.
- **Opt-in display fields only.**

## 7. Affected files for future implementation

- `apps/admin-web/components/ops/v2/service-type-icon.tsx` (widen the icon map + labels)
  — or a new pure label table file.
- `apps/admin-web/app/operations/v2/ops-view-model.ts` (`RawGridRow` widen for
  allowlisted safe fields; `OpsRowVM` + `mapRow` add a curated `typeLabel` + `detail`).
- `apps/admin-web/components/ops/v2/service-row.tsx` (render the curated label +
  secondary detail line).
- Tests for the label table, VM mapping, service-row render, and the read-only
  invariant.

## 8. Test plan

- Known operationType values map to the expected label/icon.
- Unknown values use the documented fallback.
- `mapRow` surfaces `mealPlan`/`nights`/transfer detail from the payload.
- `OpsRowVM` does **not** include cost/PII fields.
- Service row renders the curated label + detail line.
- No cost / margin / price / `driverPhone` rendered.
- `ops-readonly-invariant` still passes.
- Existing ops board / status-map / render tests still pass.
- Optional staging read-only board check after implementation.

## 9. Risks

- Read-only invariant regression.
- Cost / PII leakage from a widened `RawGridRow`.
- Silent fallback masking new types.
- operationType value drift.
- Board vs voucher/packet consistency.

## 10. GO / NO-GO

**GO**

- FE-only display polish.
- Curated serviceType/operationType label/icon table.
- Surface already-present safe operational details.
- Preserve the read-only invariant.

**NO-GO**

- New actions / forms / fetches / mutations.
- Send / supplier-send / voucher-send / generate behavior changes.
- Cost / margin / supplier-payment or PII exposure.
- Backend grid enrichment in this slice.
- Pricing / lifecycle / Accept / invoice / booking changes.
- Flag / env changes.
- Classic changes.
- Staff rollout / live bookings.

## 11. Exact next implementation slice

**Ops-DG-1 (frontend-only, read-only):**

- Curated serviceType/operationType label + icon table.
- Widen `RawGridRow` / `OpsRowVM` / `mapRow` **only** for allowlisted safe fields:
  - `mealPlan`
  - `nights`
  - `pickupLocation`
  - `dropoffLocation`
  - `operationalTime`
- Expose a curated `typeLabel` + short `detail` string.
- Render the curated label + secondary detail line in `service-row.tsx`.
- Tests:
  - label-table unit tests
  - VM no-cost/PII assertions
  - render tests
  - `ops-readonly-invariant` green
- No backend.
- No proxy.
- No flags.
- No new fetch/mutation.
- Then staging read-only board validation and doc reports.

---

*Planning only. No code, no data, no flag/env, no production or staging behavior
change. Classic remains the system of record.*
