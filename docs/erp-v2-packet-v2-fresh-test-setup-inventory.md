# ERP V2 — Packet V2 Fresh Test Setup Inventory

**Date:** 2026-07-16
**Status:** Read-only inventory. Staging only. No code, schema, flag, environment, or data change
accompanies this report.

## 1. Scope
- **Read-only inventory.**
- **Staging only.**
- Goal: find a clean target for a full Supplier Voucher Packet V2 UAT
  (group → generate → PDF → regenerate → send-preview only, **no send**).

## 2. Candidate assessment
| Booking | Safe for full packet UAT? | Why |
|---|---|---|
| **BK-2026-0001** | ❌ No | Its only service already has a **standalone voucher** → packet generate would 409 (no double-vouchering). |
| **BK-2026-0003** | ❌ No | Its only service already has a **standalone voucher** (from the earlier voucher UAT) → 409. |
| **BK-2026-0002** | ✅ **Recommended target** | Has voucher-free services; only the HOTEL group is packeted, so its non-hotel groups are free. |

## 3. BK-2026-0002 details
- Status **draft**.
- Has **5 services** (activity, transport, guide, meal, HOTEL — all QA Staging Supplier).
- **Non-hotel services are voucher-free** (no standalone voucher).
- The **HOTEL group already has an existing packet** (GENERATED).
- The **non-hotel groups are free / unpacketed**.
- The non-hotel services currently show `assignmentStatus=UNASSIGNED`, so they **need a re-assign through
  the fixed V2 path** before packet generation (which sets `assignedSupplierId` + `assignmentStatus=ASSIGNED`).

## 4. Recommended target
- **`BK-2026-0002`.**
- Use **one non-hotel voucher-free service** — preferably **activity** or **transport**.
- **Re-assign QA Staging Supplier through the fixed V2 `assign-supplier`** in the later UAT step.
- Then run **group → generate → PDF → regenerate → send-preview only**.
- **No send.**

## 5. New setup decision
- **No new quote / booking / service creation is needed.**
- Option B (create a fresh quote / booking, or add a second service) remains a **fallback only** if a
  completely pristine booking is preferred.

## 6. Avoid
- **BK-2026-0001.**
- **BK-2026-0003.**
- **BK-2026-0002 HOTEL group** (already packeted).

## 7. Confirmations
- No data changed.
- No production mutation.
- No email sent.
- No flags changed.
- No voucher / packet created.
- No supplier assignment.
- No quote / booking / service creation.
- No packet-send / voucher-send.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 8. Net conclusion
- **`BK-2026-0002` is the safest existing staging target** for a full Packet V2 UAT.
- The next step after this doc merges is a **separately approved Packet V2 UAT rerun using
  `BK-2026-0002`** (a non-hotel voucher-free service).
- **No send.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher / packet IDs are recorded
  here — only human-readable booking references, service types, the supplier label, and counts.
