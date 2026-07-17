# ERP V2 — Controlled Production Enablement Plan: Operations V2 Supplier Assignment / Confirmation

**Date:** 2026-07-17
**Status:** Planning only. **No flags changed, no production touched, no staging touched.** No code,
schema, environment, or data change accompanies this plan.

## 1. Purpose
- Controlled production enablement plan for **Operations V2 supplier assignment / confirmation**.
- The next production V2 write surface after Booking Creation V2.
- **Planning only.**
- **No flags changed.**
- **No production touched.**

## 2. Read-only findings
- **Assign supplier** is controlled by **`NEXT_PUBLIC_OPS_V2_SUPPLIER_ASSIGN`**.
- **Confirmation status** is controlled by **`NEXT_PUBLIC_OPS_V2_SUPPLIER_CONFIRM_STATUS`**.
- **Both are frontend build-time flags** (default OFF; `NEXT_PUBLIC` = baked at build).
- Both sit **under `NEXT_PUBLIC_OPS_V2_DEFAULT`** (already ON in production — read-only beta) and the
  route-level role gate.
- **Backend routes are role-gated with no backend flag** — `PATCH .../operations/:operationId/assign-supplier`
  and `PATCH .../operations/:operationId/confirmation`, both `admin` / `operations` only.
- **Neither route sends email** (assign writes supplier fields only; confirmation records status only).
- **Supplier-send / voucher-send paths remain separate and disabled.**
- The assign writer applies the **PR #731 field-alignment fix** (sets `supplierId` + `assignedSupplierId`
  and flips `assignmentStatus` to `ASSIGNED` together).

## 3. Current uncertainty
- **Both supplier flags are present in the `-4gu9` env.**
- **Values are masked / not CLI-readable** (`env pull` masks even known-true flags to empty).
- A **runtime UI probe or dashboard inspection is required before GO** to determine the baked ON/OFF
  value.
- **If already ON, the controls may already be live for admin / operations** (backend is role-gated with
  no flag) — this state must be recorded if found.

## 4. Production test booking
- **`BK-2026-0007`** is the preferred test booking.
- **Internal test booking** from **`Q-2026-0082`** ("UAT-PROD-BOOKING-CREATE — DO NOT SEND").
- Status **draft**.
- **Exactly one service.**
- **No supplier assigned.**
- Confirmation status **NOT_SENT**.
- **Suitable for smoke.**

## 5. Safe supplier blocker
- **Production has no safe internal / test supplier.**
- All available suppliers appear **real** (real operational records with real emails).
- **Execution is NO-GO until a safe supplier strategy is approved.**
- **Recommended path:** create **one labeled synthetic supplier** such as
  **"ZZZ TEST SUPPLIER — DO NOT SEND"** with a **non-deliverable `.invalid` email**.
- **Supplier creation is a separate approved setup step** (not part of this plan).
- Note: neither control emails a supplier, so assigning a real supplier would not contact them; the
  residual risk is a phantom assignment on a real record. The synthetic supplier is the clean unblock and
  remains the default per the NO-GO rule.

## 6. Scope to enable
- Assign **one** supplier to **one** booking service.
- Record **one** supplier confirmation status.
- Confirm **`supplierId` / `supplierName` / `assignedSupplierId` / `assignmentStatus`** alignment.
- Confirm **booking status / totals / currency unchanged**.
- Confirm **no email**.

## 7. Explicitly out of scope
- Supplier email send.
- Voucher generation.
- Packet generation.
- Passenger / rooming edits.
- Booking creation.
- Quote edits.
- Finance writes.
- Catalog / supplier / rate edits.

## 8. Role access
- **admin / operations** — allowed.
- **super_admin / agent_admin** — allowed if guard coalescing applies.
- **finance** — blocked from the Ops V2 workspace (uses Classic).
- **agent / viewer** — blocked.
- Frontend editor visibility additionally requires the two flags ON; "Open in Classic" always stays
  visible.

## 9. Smoke-test plan
- Use **`BK-2026-0007`** only.
- Use the **approved safe supplier** only.
- **Assign supplier.**
- **Record a synthetic confirmation reference / status.**
- Confirm **assignment fields align** (`supplierId` / `supplierName` / `assignedSupplierId` set,
  `assignmentStatus=ASSIGNED`).
- Confirm **no booking totals / currency / status drift**.
- Confirm **no email**.
- Confirm **no voucher / packet created**.
- Confirm **restricted roles blocked**.

## 10. Rollback plan
- Turn the supplier **assign / confirmation frontend flags OFF** if this task enables them.
- **Rebuild `-4gu9`.**
- Confirm the controls disappear.
- **Unassign / reset the test service only if separately approved.**
- **No DB rollback without explicit approval.**

## 11. Monitoring
- API / admin-web errors.
- Audit / activity entries.
- Assignment fields.
- Booking totals / currency.
- No email / send events.

## 12. GO / NO-GO
- **GO** only when the baked flag values are confirmed.
- **GO** only when a safe supplier is approved / available.
- **GO** only with **`BK-2026-0007`** confirmed suitable.
- **GO** only with a rollback owner.
- **Current state: NO-GO** due to the safe-supplier gap and flag-value uncertainty.

## 13. Recommended execution order
1. Approve plan.
2. Create / approve the safe synthetic supplier as a **separate setup**.
3. Probe the baked flags on `-4gu9`.
4. Enable **only if OFF**.
5. Rebuild `-4gu9` **only if changed**.
6. Run one smoke.
7. Document result.
8. Keep voucher / packet / send paused.

## 14. Safety boundaries
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- **Supplier sending remains disabled.**
- No supplier emails.
- No voucher-send.
- No packet-send.

## 15. Net conclusion
- **Booking-side is ready.**
- **`BK-2026-0007`** is an ideal test booking.
- **Execution remains NO-GO** until the safe supplier and baked-flag verification are resolved.

## Confirmations
- No code changed.
- No data changed.
- No flags / environment changed.
- No production / staging behavior changed.
- No supplier created.
- No supplier assigned / confirmed.
- No email sent.
- No supplier-send or voucher-send action.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this plan.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only human-readable booking / quote references, the proposed supplier
  label, flag names, role names, and the plan.
