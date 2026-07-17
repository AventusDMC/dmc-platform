# ERP V2 — Voucher Generate / Preview / Download Runtime Flag Probe Report

**Date:** 2026-07-17
**Status:** Read-only runtime probe. Confirms the baked voucher generate flag is effectively ON in the
live canonical staff-prod build; preview/download remain read-only-indeterminate without a voucher. No
mutation, no flags changed, no data edits, no voucher generated, no send. No code, schema, flag/env, or
production/staging change accompanies this report.

## 1. Environment
- **Canonical staff-prod `-4gu9`.**
- **BK-2026-0007.**
- **Read-only runtime UI probe.**
- **admin / internal role.**
- **No mutation endpoints called.**

## 2. Method
- **Authenticated read-only GET of the Ops V2 workspace.**
- **Scanned the server-rendered control markers** — a row renders either the live control or a disabled
  "Coming later" placeholder, so the rendered output is a non-mutating readout.
- **No clicks.**
- **No voucher generation.**
- **No preview / download call requiring a voucher.**
- **No send.**

## 3. Findings
- **Generate voucher control visible / enabled** (live, eligible on the assigned + confirmed service).
- **`NEXT_PUBLIC_OPS_V2_VOUCHER_GENERATE` appears ON.**
- **Preview shows "Coming later".**
- **Download / PDF shows "Coming later".**
- **Preview / Download are indeterminate because no voucher exists yet.**
- **Send-preview shows "Coming later" / OFF.**
- **Send shows "Coming later" / OFF.**
- **Packet control not active / OFF or out of scope** (backend `OPS_V2_VOUCHER_PACKET_ENABLED` absent).

## 4. Important note
- **Preview and Download require BOTH the flag ON and a voucher / data-eligible state.**
- With **0 vouchers**, the **read-only UI cannot distinguish flag OFF from data-gated OFF**.
- Their values **become observable after Generate runs in the smoke**, or via dashboard inspection.
- **No voucher was created in this probe.**

## 5. Role-gate observation
- **admin can see the Generate control.**
- **viewer blocked / no controls rendered.**
- **admin / operations only** for voucher actions.

## 6. Safety confirmations
- No mutation endpoint called.
- No data changed.
- No flags changed.
- No voucher generated.
- No packet created.
- No email / send occurred.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

## 7. Net conclusion
- **Generate is already ON on `-4gu9`.**
- **No flag change is needed to generate the test voucher.**
- **Preview / Download will be confirmed after voucher creation during the smoke.**
- **Send remains disabled.**
- The **voucher smoke still requires separate explicit GO.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this report.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only the human-readable booking reference, flag / role names, the
  observed control states, and the conclusion.
