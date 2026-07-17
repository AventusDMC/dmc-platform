# ERP V2 — Ops V2 Supplier Assignment / Confirmation Runtime Flag Probe Report

**Date:** 2026-07-17
**Status:** Read-only runtime probe. Confirms the baked supplier assignment / confirmation flags are
effectively ON in the live canonical staff-prod build. No mutation, no flags changed, no data edits, no
send. No code, schema, flag/env, or production/staging change accompanies this report.

## 1. Environment
- **Canonical staff-prod `-4gu9`.**
- **BK-2026-0007.**
- **Read-only runtime UI probe.**
- **admin / internal role.**
- **No mutation endpoints called.**

## 2. Method
- **Authenticated read-only GET of the Ops V2 workspace** for BK-2026-0007.
- **Inspected the rendered control markers** — the row renders either the live control or a disabled
  "Coming later" placeholder depending on the baked flag, so the rendered output is a direct, non-mutating
  readout of flag state.
- **No clicks / submits.**
- **No assignment.**
- **No confirmation.**

## 3. Findings
- **Supplier assignment control visible / enabled.**
- **Supplier confirmation control visible / enabled.**
- **No "Coming later" placeholder for assignment.**
- **No "Coming later" placeholder for confirmation.**
- **Unrelated voucher / download / send-preview controls still show "Coming later"** where applicable
  (Download, Preview, Send preview, Send) — assignment and confirmation are not among them.

## 4. Flag conclusion
- **`NEXT_PUBLIC_OPS_V2_SUPPLIER_ASSIGN` appears ON** in the live `-4gu9` build.
- **`NEXT_PUBLIC_OPS_V2_SUPPLIER_CONFIRM_STATUS` appears ON** in the live `-4gu9` build.
- **No flag change or rebuild is required for the smoke.**

## 5. Role-gate observation
- **admin can see the controls.**
- **viewer is blocked / no write controls rendered.**
- **Backend routes remain role-gated** (`admin` / `operations`; no backend flag).
- **No mutation tested** (observation only).

## 6. Safety confirmations
- No mutation endpoint called.
- No data changed.
- No flags changed.
- No email / send occurred.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 7. Net conclusion
- The **final GO-gate is cleared** — both supplier flags are confirmed effectively ON in the live build.
- **Ops V2 supplier assignment / confirmation smoke is ready.**
- The **smoke still requires separate explicit approval.**
- **No supplier was assigned and no confirmation was recorded in this task.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this report.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only the human-readable booking reference, flag / role names, the
  observed control states, and the conclusion.
