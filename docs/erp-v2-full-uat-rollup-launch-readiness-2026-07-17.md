# ERP V2 — Full UAT Roll-Up & Launch Readiness Update

**Date:** 2026-07-17
**Status:** Read-only synthesis. No code, schema, flag, environment, or data change accompanies this
report.

Summarizes the full ERP V2 UAT after Phases 1–2 plus Booking Creation, Operations, Passenger/Rooming,
Supplier Assignment, Single-Service Voucher, and Supplier Voucher Packet.

## 1. Completed UAT areas
- **Phase 1 read surfaces** (Finance V2 tab + Catalog V2, full role matrix + prod read-only smoke).
- **Quote Builder → proposal lifecycle** (build day + priced item, Mark-as-Sent, public link, save
  version, Accept).
- **Booking Creation V2** (convert accepted quote → booking + duplicate guard).
- **Operations V2 read-only workspace** (header, services, pax/rooming, finance, activity tabs + role
  gating).
- **Passenger / Rooming** read + a safe pricing-inert passenger edit (PII gating).
- **Supplier assignment / confirmation.**
- **Single-service voucher** generate / preview / download.
- **Supplier Voucher Packet V2** group / generate / PDF / regenerate / send-preview.

## 2. PASS summary
- **All executed surfaces passed.**
- **Correct role gating** (finance/agent/viewer blocked where intended; admin/operations/super_admin/
  agent_admin authorized where intended).
- **Correct no-send enforcement** (read-only where intended; send paths never called).
- **Blockers: 0.**
- **Open majors: 0.**
- The one Major was **fixed and revalidated** (see §3).
- **Minor observations (non-blocking):**
  1. Activity item maps to booking service type **"other"** on conversion (shared convert engine).
  2. Source quote number not surfaced in the Ops V2 workspace SSR.
  3. The `finance` role cannot see the Finance V2 **tab** (Ops-workspace gate excludes finance) — uses
     Classic `/finance`.
  4. Staging Catalog V2 backend returns **403** (stricter) for non-internal roles vs the source
     redaction comment.
  5. Two supplier fields on the booking service (`supplierId` vs `assignedSupplierId`) — root of the
     fixed Major.
  6. Packet send-preview shows **no resolvable recipient** for the no-email test supplier (expected /
     safe).

## 3. Fixed issue
- **Packet V2 supplier-field mismatch:** V2 `assignSupplier` wrote `supplierId`/`supplierName` but not
  `assignedSupplierId`/`assignmentStatus`, so packet grouping (which needs `assignmentStatus` not equal
  to `UNASSIGNED`) returned 0 groups for V2-assigned services.
- **PR #731** fixed the V2 `assignSupplier` alignment (sets `assignedSupplierId` + `assignmentStatus`;
  reuses the existing helper; no schema; no Classic change; tests added).
- **Packet V2 rerun passed end-to-end** (group → generate → PDF → regenerate → send-preview).

## 4. Still not tested / intentionally disabled
- Actual supplier email send.
- Packet-send.
- Voucher-send.
- Production Booking Creation broad enablement.
- Production Passenger / Rooming edit.
- Production Voucher Packet.
- Finance writes.
- Catalog / supplier / rate edits.

## 5. Classic dependencies that remain
- Finance writes.
- Invoices / payments / credit notes / reconciliation.
- Catalog edits.
- Supplier / contract / rate edits.
- Hotel / rooming edit needing a hotel booking setup.
- Cleanup / admin tools.

## 6. Production readiness recommendation
- ✅ **GO** for continued internal V2 beta.
- ✅ **GO** for staging-validated flows.
- ✅ **GO** for controlled production-enablement planning.
- ⛔ **NO-GO** for full no-Classic launch.
- ⛔ **NO-GO** for supplier send.

## 7. Recommended production enablement order
1. **Passenger / Rooming edit.**
2. **Booking Creation V2.**
3. **Operations V2 write actions.**
4. **Voucher generate / download.**
5. **Packet V2 without send.**
6. **Supplier send — later only, after a dedicated review.**

## 8. Suggested realistic timeline
- **Limited V2 beta editing:** soon, after a controlled enablement plan.
- **Mostly V2 daily ops:** about **2–4 weeks**.
- **No-Classic / V2-only:** later, because finance and catalog / supplier / rate writes remain
  Classic-only.

## 9. Safety boundaries
- Production flags remain unchanged until explicitly approved.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.
- No actual supplier emails.
- Send paths remain untested / off.

## 10. Net conclusion
- ERP V2 read + edit surfaces are **staging-validated end-to-end**.
- **0 open blockers.**
- **0 open majors.**
- **GO** for internal beta and controlled per-surface production-enablement planning.
- **NO-GO** for a full no-Classic launch and for supplier send.

## Confirmations
- No code changed.
- No data changed.
- No flags / environment changed.
- No production / staging behavior changed.
- No email sent.
- No supplier-send or voucher-send action.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this report.
- No secrets, passwords, DB URLs, credentials, hosts, raw deployment URLs, project identifiers, session
  tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher / packet IDs are recorded
  here — only UAT-area names, results, recommendations, and the referenced fix PR number.
