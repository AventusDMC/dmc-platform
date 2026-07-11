# Finance V2 — Readiness Audit

**Date:** 2026-07-11
**Status:** Documentation only. No code, schema, flag, or environment change accompanies this
report. It records what Finance V2 can do today, what still depends on Classic, and the minimum
Finance V2 work required before a V2-first launch.

---

## 1. Finance V2 is read-only today

- Finance V2 is the **read-only Finance tab** inside Operations V2 (booking workspace). It loads
  a no-store booking finance summary and displays it — it performs **no writes**.
- What it shows per booking:
  - Summary cards: **Quoted total** (sell), **Realized cost**, **Margin + margin %**, and a
    **Statuses** card (client-invoice badge, supplier-payment badge, payment count, currency).
  - Two **payments tables** (client + supplier): amount, status (+ overdue), method, due, paid,
    reference, notes.
  - A persistent read-only notice ("Internal financial summary. Payment and invoice actions
    remain in Classic.") plus an **"Open financials in Classic"** deep link.
- Every action button on the tab is an inert **"Coming later"** placeholder (no click handler,
  no form, no fetch): Record payment, Mark paid, Send invoice, Send payment reminder, Export
  financials.
- A read-only invariant test bans finance mutation endpoints (`/payments`, `/invoices`,
  `/reconciliation`) from every V2 surface, so the read-only posture is enforced, not just
  visual.

## 2. Finance actions remain Classic-only

For **every** booking — including V2-created bookings — the following are performed **only in
Classic** today:

- **Record payment** (client / supplier).
- **Mark paid** (mark a payment paid).
- **Invoice / send invoice** (generate an invoice and send it).
- **Payment reminder** (send a client payment reminder).
- **Reconciliation** (confirm / remind on client payment proofs, single and batch).
- **Exports** (CSV: invoices / payments / supplier-payables; invoice and financial-document
  PDFs).
- **Dashboards / reports** (finance dashboard, margin report, cost variance, destination
  profitability, supplier payables, reconciliation queue).

The backend endpoints for these already exist and are role-gated; it is the **V2 UI** that is
read-only. Finance mutations live in Classic by design.

## 3. This Classic dependency is launch-acceptable if documented

- The "read the money in V2, act on the money in Classic" split is internally consistent and
  matches the standing strategy (**V2-first, Classic as fallback / reference**).
- It is **acceptable for a V2-first launch as a documented Classic dependency** — provided it is
  a conscious, recorded decision and staff know finance actions live in Classic. It does **not**
  block staff testing (the read-only summary is usable; finance actions are done in Classic).

## 4. The one pre-launch fix: margin / cost visibility alignment

- The V2 Finance tab currently has **no finance-specific role gate**. It is shown to anyone who
  can open Operations V2, and it exposes **realized cost and margin**. That audience is wider
  than Classic's finance-access model and includes roles that should not see margin/cost.
- This is the **single pre-launch fix**: align who can see cost/margin in the V2 Finance tab
  with the finance-visibility model below. Everything else finance-related is post-launch.

## 5. Recommended F1 — cost / margin visibility gate (read-only, small)

**Accepted margin-visibility decision:**

- **Cost / realized cost / margin / margin %** are visible **only to:**
  - `admin`
  - `super_admin`
  - `finance`
- **Hidden from:**
  - `operations`
  - `agent_admin`
  - `agent`
  - `viewer`
- `agent_admin` must **not** see finance-sensitive margin / cost data.
- `operations` may see the **operational / status / payment summary** (invoice + supplier status
  badges, payment list, currency) but **not** margin / cost.

F1 is a read-only visibility change only — hide the cost / realized-cost / margin / margin %
cards from non-finance roles while keeping the non-financial status summary visible where
appropriate. No writes, no new endpoints, no flag change to production.

## 6. Recommended F2 — clarify the Classic hand-off (read-only, optional)

- Optionally replace the generic **"Coming later"** disabled buttons with clearer, per-action
  **"Do this in Classic"** deep links (Record payment in Classic, Invoice in Classic, etc.), so
  staff are not left hunting for an action that lives in Classic.
- Still no V2 mutation — this is a signposting / UX-clarity change only. Optional, not a
  blocker.

## 7. Finance writes and full accounting are post-launch

- The first V2 finance **write** (most likely **Record payment**, whose read model and backend
  endpoint already exist) is **post-launch**: behind its own flag, internal-first, mirroring the
  internal-first pattern already used for other V2 surfaces.
- Subsequent V2 finance writes (invoice send, mark paid, reminders), V2 finance
  dashboards / exports, and **full accounting** are all **post-launch** and explicitly out of
  scope for this launch.

## 8. No production flags or finance-write enablement are proposed

- This audit proposes **no** production flag change and **no** finance-write enablement.
- F1 (visibility gate) and, optionally, F2 (Classic hand-off clarity) are read-only and can ship
  with the rest of the read-only Finance tab; finance mutations stay in Classic.
- Any future V2 finance write would be introduced later, one action at a time, behind a
  dedicated flag, validated on staging, and enabled internal-first — **not** as part of this
  launch.

---

## Supporting notes (honest state)

- **Pricing snapshot is solid.** Booking finance is a **frozen snapshot** taken at
  quote → booking conversion; there is no live re-pricing of money on bookings. V2 booking
  creation delegates to the **same** conversion path, so V2-created bookings get an identical
  finance snapshot. This is covered by snapshot-integrity and currency tests.
- **Single booking currency.** Each booking carries one frozen currency (from the accepted
  quote); multi-currency FX is resolved upstream at quote-pricing time. A payment recorded in a
  different currency is a residual edge to watch, since payment currency is tracked separately
  from the snapshot currency.
- **Status can diverge.** The client-invoice / supplier-payment statuses exist both as stored
  booking columns (manually overridable in Classic) and as values **derived live from payment
  rows** for the summary/badge. The two can diverge; the derived value drives the V2 badge. This
  is a display-consistency risk to signpost, not a money-integrity risk.

## Safety confirmations

- **Documentation only** — no code, schema, flag, or environment change in this report.
- **No apps/api change. No apps/admin-web change. No Classic change.**
- **No production change. No production flag change. No finance-write enablement.**
- **No supplier packet / send / voucher-send / allowlist change.**
- No secrets, database URLs, credentials, internal hosts, raw deployment URLs, project
  identifiers, or scratch links are recorded here.
