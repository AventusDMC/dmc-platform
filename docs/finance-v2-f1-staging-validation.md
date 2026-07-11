# Finance V2 — F1 (Margin / Role Alignment) Staging Validation Report

**Date:** 2026-07-11
**Environment:** Staging admin-web (Operations V2 Finance tab); production spot-checked for reachability only.
**Verdict:** ✅ PASS — cost/margin are correctly restricted to finance roles on staging; read-only;
no writes; no rollback needed.
**Scope of change:** Documentation only. No code, schema, flag, or environment change accompanies
this report.

Feature: Finance V2 F1 — a read-only admin-web change to the Operations V2 Finance tab that hides
cost / realized cost / margin / margin % (and the supplier payments table, whose amounts reveal
supplier cost) from non-finance roles, reusing the existing `canAccessFinance` predicate
(admin / super_admin / finance). Other authorized ops roles keep the non-financial summary plus a
restricted notice. No finance writes, no backend/schema/Classic changes.

---

## 1. Merge commit
`75f710b576e5e69af9314bb1a2b772f14df65b3c` — PR #680
(`feat(admin-web): restrict Finance V2 cost and margin visibility`), merged with all checks green.
Four admin-web files only (Ops V2 page, finance-tab, finance-summary, finance render test).

## 2. Deploy status
- **Staging admin-web:** deployed the merge — **SUCCESS**. Confirmed behaviorally: the live staging
  Finance tab returns the new F1 restricted-copy string for restricted roles, which exists only in
  the merged F1 code.
- **Production admin-web:** the merge auto-deployed the F1 code into the production build, **but
  Operations V2 remains flag-gated OFF in production** (`NEXT_PUBLIC_OPS_V2_DEFAULT` is not `true`),
  so the Finance tab is **not reachable** in production. Verified: production
  `/operations/v2/{id}?tab=finance` for admin and operations rendered the not-found page and did not
  render the Finance tab. The production Finance tab was therefore **not directly exercised** — this
  matches the intended staging-only posture.

## 3. Validation target
A live staging booking with finance summary data (quoted total, realized cost, margin, currency).
The booking had **zero payment rows** (no supplier payments) — see §7 for the honest implication.

## 4. Role visibility result (live, staging)
Definitive signals were the "Realized cost" card label and the restricted-copy string (small
numeric values are unreliable to grep).

- **admin** — reachable; sees **realized cost, margin, margin %, and the supplier payments table**.
- **super_admin** — reachable; sees **realized cost, margin, margin %, and the supplier payments
  table**.
- **finance** — **allowed by the `canAccessFinance` predicate, but currently blocked upstream by the
  Ops V2 route gate** (`isOpsV2Authorized` allows admin / operations plus super_admin and agent_admin
  via coalescence, not the finance role). Documented honestly; the finance → sees-cost/margin
  contract is covered by the merged render tests.
- **operations** — reachable; **does NOT see realized cost, margin, margin %, or supplier payment
  amounts**; sees the restricted copy.
- **agent_admin** — reachable; **does NOT see realized cost, margin, margin %, or supplier payment
  amounts**; sees the restricted copy.
- **viewer** — blocked upstream (forbidden state).
- **agent** — blocked upstream (redirected).

## 5. Restricted-copy result
For **operations** and **agent_admin**, the Finance tab shows:

> Cost and margin are restricted to finance roles.

and the supplier payments table is replaced by "Supplier payment amounts are restricted to finance
roles."

## 6. Safe non-financial content (reachable restricted roles)
For operations and agent_admin, all non-sensitive content still renders: **quoted total, status
badges, payment count, currency, client payments table, and the Open in Classic link** (plus the
read-only notice and inert "Coming later" actions).

## 7. Supplier-amount hiding (honest note)
The supplier payments table is withheld and replaced by the restricted note for restricted roles,
while admin / super_admin get the real table. Because the live staging booking had **zero supplier
payments**, there were no actual supplier amounts to mask on screen; **supplier amount value hiding
is covered by the merged render tests**, and the live check confirmed the table-swap / restricted-copy
behavior.

## 8. Read-only confirmation
Scoped to the Finance tab region: **no `<form>`, no `<input>`, no `<select>`, no `<textarea>`, no
form action to the API, no POST/PATCH, no download/PDF**. Only inert disabled "Coming later" buttons
(`aria-disabled`) remain. The single form on the page belongs to the app shell (nav/search), not the
Finance tab.

## 9. No-write confirmation
Every request was a GET. After the full role matrix, the booking was unchanged (payment count, realized
cost, quoted total, and status identical before and after). **No audit rows created; no booking /
payment / finance rows created, updated, or deleted.**

## 10. Classic finance behavior
Unchanged — F1 modified only the Operations V2 components and page; no Classic files were touched.

## 11. Supplier packet / send / allowlist
Unchanged. F1 touched only admin-web finance files — no packet / send / allowlist / flag / env files.
The voucher-send **allowlist remains `ziad@axisdmc.com` only** and supplier sending remains disabled.

## 12. Final status
- **Staging:** F1 **live and validated** — cost/margin restricted to admin / super_admin (finance
  blocked upstream, honestly reported); operations / agent_admin see the restricted copy and keep the
  safe non-financial summary; viewer / agent blocked; read-only; no writes.
- **Production:** F1 code deployed in the build, but Operations V2 (and its Finance tab) **remains
  gated OFF** — not reachable, consistent with the intended posture. **No production flag was changed.**

## 13. Safety confirmations
- **No flag/env change** and **no production flag change** were made for this validation.
- **Read-only** — GET-only; no writes, no audit, no forms, no mutations, no email/send.
- **No backend / schema / migration / Classic change.**
- Read-only inspection used a staging session secret pulled into a temporary file that was deleted
  immediately; no secrets, hosts, URLs, project identifiers, or connection details are recorded here.
- Documentation only — no code, schema, flag, or environment change in this report.
