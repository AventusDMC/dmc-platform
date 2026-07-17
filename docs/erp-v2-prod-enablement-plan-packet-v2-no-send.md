# ERP V2 — Controlled Production Enablement Plan: Supplier Voucher Packet V2 (No-Send)

**Date:** 2026-07-17
**Status:** Planning only. **No flags changed, no packet created, no production/staging touched.** No
code, schema, environment, or data change accompanies this plan.

## 1. Purpose
- Controlled production enablement plan for **Supplier Voucher Packet V2 no-send**.
- **Planning only.**
- **No flags changed.**
- **No packet created.**
- **No production touched.**

## 2. Read-only findings
- Packet V2 requires **two flags**:
  - **`OPS_V2_VOUCHER_PACKET_ENABLED`** — backend flag.
  - **`NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET`** — frontend flag.
- **Both are currently OFF in production.**
- **Backend is fail-closed.**
- **Frontend requires a `-4gu9` rebuild.**
- **Staging passed full Packet V2 UAT after PR #731** (group → generate → PDF → regenerate → send-preview).
- **Send remains OFF.**

## 3. Scope to enable
- Packet **grouping**.
- Packet **generate**.
- Packet **PDF**.
- Packet **regenerate**.
- **Send-preview / readiness only.**
- **No send.**

## 4. Explicitly out of scope
- packet-send.
- voucher-send.
- supplier email.
- real supplier communication.
- finance writes.
- catalog / supplier / rate edits.
- passenger / rooming edits.
- booking creation.

## 5. Required production flags
- **`OPS_V2_VOUCHER_PACKET_ENABLED=true`** on the prod API.
- **`NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET=true`** on `-4gu9`.
- **API redeploy required.**
- **`-4gu9` rebuild required.**
- **Send flags remain OFF.**
- **No flags changed in this plan.**

## 6. Test-record strategy
- **`BK-2026-0007` is not suitable** because its only service already has a **standalone voucher** (packet
  generate would 409 — "a service already has a single-service voucher").
- **`BK-2026-0006` has two services but they are currently unassigned** (grouping needs an assigned
  supplier).
- **No eligible record exists today.**
- **Recommended separate setup:**
  - Use **`BK-2026-0006`**.
  - **Assign and confirm one service** using **`ZZZ TEST SUPPLIER — DO NOT SEND`**.
  - **Do not generate a standalone voucher** for it.
  - Then use that service for the Packet V2 smoke.

## 7. Smoke-test plan after enablement
- Confirm **packet group exists**.
- **Generate one packet.**
- Confirm packet status **GENERATED**.
- **Render PDF.**
- Confirm **PDF finance-safe**.
- **Regenerate once.**
- Confirm **no duplicate packet**.
- Run **send-preview / readiness only**.
- Confirm **no email**.
- Confirm **booking status / totals / currency unchanged**.

## 8. Role access
- **admin / operations** — allowed.
- **super_admin** — allowed via coalescing.
- **finance / agent / viewer** — blocked.

## 9. Rollback plan
- Turn **`OPS_V2_VOUCHER_PACKET_ENABLED` OFF**.
- Turn **`NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET` OFF**.
- **Redeploy API.**
- **Rebuild `-4gu9`.**
- **Do not delete the packet** unless separately approved.

## 10. Monitoring
- API / admin-web errors.
- Packet count.
- PDF content safety.
- No margin / cost leak.
- No email / send events.
- Booking totals unchanged.

## 11. GO / NO-GO
- **GO** only if both flags are confirmed.
- **GO** only with a packet-eligible internal test service.
- **GO** only if send remains disabled.
- **GO** only with a rollback owner.
- **Current state: NO-GO** because no eligible test service exists and the packet flags are OFF.
- **NO-GO** on send ambiguity.

## 12. Recommended execution order
1. Approve plan.
2. Prepare a **packet-eligible test record** as a separate approved setup.
3. Confirm flags.
4. Enable **only** the packet no-send flags.
5. Run the packet smoke.
6. Document result.
7. **Keep send paused.**

## 13. Safety boundaries
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- **Supplier sending remains disabled.**
- No supplier emails.
- No voucher-send.
- No packet-send.

## 14. Net conclusion
- Packet V2 no-send is **technically ready for controlled planning**.
- Execution is **NO-GO until `BK-2026-0006` or another internal record is made packet-eligible**.
- **Send remains OFF.**
- **No production action was taken by this plan.**

## Confirmations
- No code changed.
- No data changed.
- No flags / environment changed.
- No production / staging behavior changed.
- No packet created.
- No voucher created.
- No email sent.
- No supplier-send or voucher-send action.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this plan.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only human-readable booking references, the supplier label, flag / role
  names, and the plan.
