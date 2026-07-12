# Finance V2 — F2 (Classic Handoff Clarity) Staging Validation Report

**Date:** 2026-07-12
**Environment:** Staging admin-web (Operations V2 Finance tab); production spot-checked for reachability only.
**Verdict:** ✅ PASS — the five inert "Coming later" finance buttons are replaced by a read-only
Classic handoff panel on staging; F1 cost/margin role gate intact; read-only; no writes; no
rollback needed.
**Scope of change:** Documentation only. No code, schema, flag, or environment change accompanies
this report.

Feature: Finance V2 F2 — a read-only admin-web change to the Operations V2 Finance tab that removes
the five inert "Coming later" action buttons and adds a single Classic handoff panel (a heading, a
plain-text list of the Classic-only actions, and one navigation link to the Classic booking
financials tab). No finance writes, no backend/schema/Classic changes; the F1 cost/margin role gate
is unchanged.

---

## 1. Merge commit
`2a058c955332632c5feada3416dc349cd79c9b47` — PR #682
(`feat(admin-web): clarify Finance V2 Classic handoff`), merged with all checks green.
Two admin-web files only (the Finance tab component and its render test).

## 2. Deploy status
- **Staging admin-web:** deployed the merge — **SUCCESS**. Confirmed behaviorally: the live staging
  Finance tab renders the new handoff panel copy, which exists only in the merged F2 code. (The build
  landed a few minutes after merge; validation was performed only after the F2 build was confirmed
  live — the first check still showed the pre-F2 build.)

## 3. Production note
- The merge auto-deployed the F2 code into the production build, **but Operations V2 remains
  flag-gated OFF in production**, so the Finance tab is **not reachable** in production. Verified:
  production `/operations/v2/{id}?tab=finance` for admin and operations rendered no Finance tab and
  no handoff panel. The production Finance tab was therefore **not directly exercised** — this matches
  the intended staging-only posture. **No production flag was changed.**

## 4. Handoff panel result
The Finance tab renders the read-only Classic handoff panel:
- Heading: **"Finance actions are handled in Classic."**
- Classic-only actions listed:
  - Record payment
  - Mark paid
  - Invoice / send invoice
  - Payment reminder
  - Reconciliation
  - Exports

## 5. Actions render as plain text, not buttons
The six action names render as plain list items (`<li>`), **not** buttons — the handoff list segment
contains no `<button>` element.

## 6. Old "Coming later" buttons removed
The five old inert buttons are gone: the "Coming later" pill and `aria-disabled` are absent, and the
old button-only labels ("Send invoice", "Send payment reminder", "Export financials") no longer appear.

## 7. Classic link result
- One safe navigation link to **`/bookings/{bookingId}?tab=financials`** (the kept header-level "Open
  financials in Classic" link plus the handoff panel link both point to this same URL).
- **No** per-action links.
- **No** `/finance/**` links.
- **No** `/export` links.
- **No** `.pdf` links.
- **No** `download` attributes.

## 8. F1 role gate unchanged
- **admin** — sees realized cost, margin, margin %.
- **super_admin** — sees realized cost, margin, margin %.
- **operations** — does NOT see cost/margin; sees the restricted copy.
- **agent_admin** — does NOT see cost/margin; sees the restricted copy.
- **finance** — allowed by the `canAccessFinance` predicate, but currently **blocked upstream by the
  Ops V2 route gate**; documented honestly and covered by render tests.
- **viewer / agent** — blocked upstream.

The handoff panel renders for all reachable roles with the F1 cost/margin gate intact.

## 9. Read-only / no-write confirmation
- **Read-only:** no `<form>`, no `<input>`, no `<select>`, no `<textarea>`, no `action="/api"`, no
  mutation actions, no payment/invoice write mechanics — only the handoff panel (text + one link) and
  the read-only payment tables.
- **No writes:** every request was a GET. After the full role matrix, the booking was unchanged
  (payment count, realized cost, quoted total, and status identical before and after). **No audit
  rows created; no booking / payment / finance rows created, updated, or deleted.**

## 10. Classic finance behavior
Unchanged — F2 modified only the Operations V2 Finance tab component and its test; no Classic files
were touched. The handoff simply links to the existing Classic financials tab.

## 11. Supplier packet / send / allowlist
Unchanged. F2 touched only admin-web finance-tab files — no packet / send / allowlist / flag / env
files. The voucher-send **allowlist remains `ziad@axisdmc.com` only** and supplier sending remains
disabled.

## 12. Final status
- **Staging:** F2 **live and validated** — five inert "Coming later" buttons replaced by a read-only
  Classic handoff panel (heading + six actions as text + one safe Classic link); F1 cost/margin gate
  intact; read-only; no writes.
- **Production:** F2 code deployed in the build, but Operations V2 (and its Finance tab) **remains
  gated OFF** — not reachable, consistent with the intended posture. **No production flag was changed.**

## 13. Safety confirmations
- **No flag/env change** and **no production flag change** were made for this validation.
- **Read-only** — GET-only; no writes, no audit, no forms, no mutations, no email/send.
- **No backend / schema / migration / Classic change.**
- Read-only inspection used a staging session secret pulled into a temporary file that was deleted
  immediately; no secrets, hosts, URLs, project identifiers, or connection details are recorded here.
- Documentation only — no code, schema, flag, or environment change in this report.
