# ERP V2 — Supplier Field Alignment Fix Plan for Packet V2

**Date:** 2026-07-16
**Status:** Planning only. No code, DB patch, data, flag/env, or production change accompanies this
document.

Aligns the supplier assignment fields so Supplier Voucher Packet V2 can group V2-assigned services.

## 1. Planning-only scope
- No code.
- No DB patch.
- No data edits.
- No flags / environment changes.
- No packet UAT rerun.

## 2. Refined root cause
- The packable-service mapper **already falls back**:
  `assignedSupplierId = service.assignedSupplierId ?? service.supplierId ?? null`.
- The **actual blocking gate is `assignmentStatus`**.
- Packet grouping requires a **resolved supplier id AND `assignmentStatus` not equal to `UNASSIGNED`**.
- V2 `assignSupplier` writes **`supplierId` / `supplierName`** but does **not** set `assignedSupplierId`
  or `assignmentStatus`.
- `assignmentStatus` remains **`UNASSIGNED`**.
- Grouping returns **0 groups**.

## 3. Classic / operations comparison
- The operations / Classic assign path **sets `assignedSupplierId` and `assignmentStatus`**.
- The V2 service-scoped assign path is **incomplete**.
- **Classic must not be broken.**

## 4. Recommended fix
- Update V2 `assignSupplier` so it also writes:
  - `assignedSupplierId`
  - `assignmentStatus`
- **Reuse the existing `normalizeSupplierAssignmentStatus` helper** (returns `ASSIGNED` when a supplier
  is present, `UNASSIGNED` when clearing).
- **Keep packet grouping strict** — do **not** loosen `isAssigned` in a risky way (dropping the
  `assignmentStatus` check would risk grouping genuinely unassigned services).
- **No schema / migration.**

## 5. Files likely to change
- `apps/api/src/bookings/bookings.service.ts`
  - single method: the V2 `assignSupplier` update `data`.
- Tests only as needed.
- **No admin-web change.**
- **No Classic change.**

## 6. Tests
- V2 assign sets `supplierId`, `supplierName`, `assignedSupplierId`, and `assignmentStatus=ASSIGNED`.
- Packet grouping **includes** V2-assigned services.
- **Unassigned** services remain **excluded**.
- Classic / operations-assigned services **still group**.
- Clear / unassign sets `assignmentStatus=UNASSIGNED` and clears the ids safely.

## 7. Risks
- **Low risk.**
- Aligns V2 with existing operations behavior.
- Existing V2-assigned rows are **not automatically fixed**.
- `BK-2026-0003` will need a **re-assign after the fix** during staging validation.
- **No backfill proposed** in this fix.

## 8. Rollback
- Revert the single-method PR.
- No schema rollback.
- No migration rollback.
- No data rollback required.

## 9. Staging validation plan (after code fix, separately approved)
- Use `BK-2026-0003`.
- Re-assign **QA Staging Supplier** through the fixed V2 `assign-supplier`.
- Confirm `assignedSupplierId` + `assignmentStatus` are correct.
- Re-run packet grouping.
- Expect **1 packet group**.
- Generate packet.
- Preview / PDF.
- Regenerate once (no duplicate).
- Send-preview / readiness only.
- **No send.**
- Confirm finance / agent / viewer blocked.
- Confirm allowlist remains `ziad@axisdmc.com` only.
- Confirm supplier sending disabled.

## 10. Net conclusion
- **Root cause confirmed.**
- The recommended fix is **small and backend-only**.
- Implementation should happen in a **separate approved code PR** after this doc merges.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this document.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher / packet IDs are recorded
  here — only field/method/helper names, the human-readable booking reference, and the plan.
