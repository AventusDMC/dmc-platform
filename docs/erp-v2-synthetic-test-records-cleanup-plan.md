# ERP V2 — Synthetic Test Records Cleanup Plan

**Date:** 2026-07-18
**Status:** Planning only. **No cleanup executed, no deletes, no archive/deactivate, no invoice action, no
flags, no production writes.** No code, schema, environment, or data change accompanies this plan.

## 1. Scope
- **Production cleanup planning only.**
- **No cleanup executed.**
- **No deletes / archives / deactivations.**

## 2. Key dependency facts (read-only)
- **The supplier model has no `isActive` / `status` field** → supplier cleanup means **leave or delete**
  (no archive / deactivate).
- **An invoice cascades with its quote delete** (`Invoice.quoteId @unique`, `onDelete: Cascade`).
- **Supplier delete requires all references cleared first** (assigned services, vouchers, packets) or the
  foreign key blocks it.

## 3. Cleanup candidates
1. **BK-2026-0006 passenger smoke note.**
2. **Q-2026-0082 internal test quote.**
3. **BK-2026-0007 internal test booking.**
4. **Generated voucher on BK-2026-0007.**
5. **Generated packet on BK-2026-0006.**
6. **Auto-generated invoice(s).**
7. **`ZZZ TEST SUPPLIER — DO NOT SEND`.**
8. **`ZZZ TEST ACTIVITY SUPPLIER — DO NOT SEND`.**
9. **`ZZZ TEST TICKET SUPPLIER — DO NOT SEND`.**

## 4. Per-item assessment

### 1. BK-2026-0006 passenger smoke note
- **Why it exists:** left deliberately by the Passenger / Rooming prod smoke (a benign `dietaryNotes`
  value on the single test passenger).
- **Still needed:** No (benign) — has audit value as smoke evidence.
- **Dependencies:** none (free-text field).
- **Safe cleanup option:** **Leave**, or **revert** (clear the field). No delete.
- **Timing:** anytime; lowest priority.
- **Risk:** **Very low.**

### 2. Q-2026-0082 internal test quote
- **Why it exists:** internal test quote for the Booking Creation V2 smoke ("UAT-PROD-BOOKING-CREATE — DO
  NOT SEND", ACCEPTED).
- **Still needed:** No, once its booking + invoice are handled.
- **Dependencies:** → BK-2026-0007 (booking) and → an **ISSUED invoice (10 JOD)** which **cascades** on
  quote delete.
- **Safe cleanup option:** **Delete only after** BK-2026-0007 and the invoice are resolved; delete cascades
  the invoice, so do it only once finance has voided / accepted it.
- **Timing:** after items 3–6.
- **Risk:** **Medium** (issued invoice + booking snapshot).

### 3. BK-2026-0007 internal test booking
- **Why it exists:** created by the Booking Creation V2 smoke; reused for supplier + voucher smokes (draft;
  1 service, 1 voucher).
- **Still needed:** No.
- **Dependencies:** its voucher (item 4) + the `ZZZ TEST SUPPLIER` assignment (item 7); links to
  Q-2026-0082.
- **Safe cleanup option:** **Delete only after** its voucher is removed and supplier unassigned; or
  **leave** as audit evidence.
- **Timing:** after item 4.
- **Risk:** **Medium.**

### 4. Generated voucher on BK-2026-0007
- **Why it exists:** the Voucher generate / preview / download smoke (GENERATED).
- **Still needed:** No.
- **Dependencies:** references `ZZZ TEST SUPPLIER`; blocks that supplier's deletion.
- **Safe cleanup option:** **Delete if safe** (test artifact) — frees the supplier reference; or **leave**.
- **Timing:** first, before BK-2026-0007 and the ZZZ "other" supplier.
- **Risk:** **Low.**

### 5. Generated packet on BK-2026-0006
- **Why it exists:** the Packet V2 no-send smoke (GENERATED), grouped under `ZZZ TEST TICKET SUPPLIER`.
- **Still needed:** No.
- **Dependencies:** references `ZZZ TEST TICKET SUPPLIER`; blocks that supplier's deletion.
- **Safe cleanup option:** **Delete if safe** — frees the supplier reference; or **leave**.
- **Timing:** first, before the ZZZ TICKET supplier.
- **Risk:** **Low.**

### 6. Auto-generated invoice(s)
- **Why it exists:** the Accept step auto-generates a client invoice — **1 invoice, ISSUED, 10 JOD, on
  Q-2026-0082** (Q-2026-0081 has none).
- **Still needed:** No — but it is a **finance record**.
- **Dependencies:** belongs to Q-2026-0082; cascades if the quote is deleted.
- **Safe cleanup option:** **Do not hard-delete directly.** **Void / settle via Classic `/finance`**, or let
  it cascade only when Q-2026-0082 is deleted **after** finance sign-off.
- **Timing:** finance-gated; before / with item 2.
- **Risk:** **Medium** (finance artifact — handle through finance, not raw delete).

### 7. `ZZZ TEST SUPPLIER — DO NOT SEND`
- **Why it exists:** first synthetic supplier (supplier-assignment / voucher smokes); type `other`.
- **Still needed:** No.
- **Dependencies:** **assignedBookingServices=1, vouchers=1** (BK-2026-0007) — must unassign + remove item 4
  first.
- **Safe cleanup option:** **Delete only after** references cleared (no deactivate available); or **leave**.
- **Timing:** after items 3 & 4.
- **Risk:** **Low–medium** (delete blocked until refs cleared).

### 8. `ZZZ TEST ACTIVITY SUPPLIER — DO NOT SEND`
- **Why it exists:** created during the (mis-diagnosed) ACTIVITY compatibility attempt; type `activity`.
- **Still needed:** No.
- **Dependencies:** **NONE (0 references everywhere)** — never successfully used.
- **Safe cleanup option:** **Delete (safe now)** — fully unreferenced; or leave.
- **Timing:** **anytime** — the cleanest first candidate.
- **Risk:** **Very low.**

### 9. `ZZZ TEST TICKET SUPPLIER — DO NOT SEND`
- **Why it exists:** TICKET-compatible supplier for the Packet V2 group; type `other`.
- **Still needed:** No.
- **Dependencies:** **assignedBookingServices=1, voucherPackets=1** (BK-2026-0006) — must remove item 5 +
  unassign first.
- **Safe cleanup option:** **Delete only after** references cleared; or **leave**.
- **Timing:** after item 5.
- **Risk:** **Low–medium.**

## 5. What should NOT be cleaned yet
- **The ISSUED invoice** via any raw delete (finance-handle it).
- **Audit / history records.**
- **Records still useful as beta evidence** (retain the smoke voucher / packet / assignments until beta
  sign-off).
- **Packet flags / supplier-send config** (unrelated to record cleanup).

## 6. Retain for audit / history
- **Audit logs.**
- **Assignment / confirmation logs.**
- **Voucher / packet generation history.**
- **Passenger edit audit.**
- **Documentation PRs.**

## 7. Dependency cleanup order (if approved later)
1. **Delete `ZZZ TEST ACTIVITY SUPPLIER` first only if approved** — it has 0 references.
2. **Delete the packet on BK-2026-0006 before deleting the ticket supplier.**
3. **Unassign the BK-2026-0006 Activity/TICKET service before deleting the ticket supplier.**
4. **Delete the voucher on BK-2026-0007 before deleting the other supplier.**
5. **Unassign the BK-2026-0007 service before deleting the other supplier.**
6. **Handle the invoice through Classic finance before deleting the quote.**
7. **Delete BK-2026-0007 / Q-2026-0082 only after dependencies are resolved.**
8. **Revert or leave the passenger note independently.**

## 8. Rollback / restore considerations
- **Deletes are irreversible.**
- **No soft-delete on suppliers.**
- **Quote delete cascades the invoice.**
- **Prefer leaving records until beta sign-off.**
- **Each cleanup action requires separate approval.**

## 9. Final recommendation
- **Now:** optionally clean **only `ZZZ TEST ACTIVITY SUPPLIER`** because it has 0 references.
- Otherwise **leave all records for audit evidence until beta sign-off**.
- **After beta sign-off:** clean up **leaf-first** per the order above.
- **Never hard-delete the invoice directly; use Classic finance handling.**

## 10. Confirmations
- No cleanup executed.
- No production writes.
- No flags changed.
- No email sent.
- No supplier-send or voucher-send action.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this plan.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only human-readable booking / quote references, supplier labels, record
  types, dependency counts, and the plan.
