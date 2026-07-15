# ERP V2 — Staff UAT Plan

**Date:** 2026-07-15
**Status:** Read-only plan. No code, schema, flag, environment, or data change accompanies this report.

A structured Staff UAT plan for the V2 surfaces **before** any broad production enablement.

---

## 1. UAT is pre-broad-enablement validation
This plan validates the V2 surfaces as a **precondition** for a broad V2-first GO. It is a test plan,
not an enablement step.

## 2. No production enablement happens through this plan
UAT runs on **staging** for all write / edit flows. Production is touched **read-only** and only for
the already-live Product Catalog V2. **No new production flag flips, no production mutations.**

## 3. UAT surfaces
| # | Surface | State under test | Env |
|---|---|---|---|
| S1 | Quote Builder V2 | Build / price-preview / apply (hotel apply live in prod; others preview) | Staging |
| S2 | Booking Creation V2 | Pilot convert-quote → booking flow (flag OFF in prod; staging only) | Staging |
| S3 | Operations V2 workspace | Command Center + 5-tab workspace (staging-only flag) | Staging |
| S4 | Passenger / Rooming | Read paths + pricing-inert edit paths (prod edit OFF) | Staging |
| S5 | Finance V2 | Read-only tab + Classic handoff + margin/cost role gate | Staging + prod read |
| S6 | Product Catalog V2 | Internal read-only warning surface (live) | Production (read-only) + staging |
| S7 | Supplier assignment / confirmation | Assign supplier, record confirmation | Staging |
| S8 | Voucher single-service | Generate / preview / download (no send) | Staging |
| S9 | Supplier Voucher Packet V2 | Readiness + regenerate + send-preview (staging-only) | Staging |

## 4. Test roles
| Role | Focus |
|---|---|
| super_admin | Full access; confirm nothing is over-restricted |
| admin | Primary happy-path operator across S1–S9 |
| operations | Ops workspace, supplier assignment / confirmation, vouchers |
| finance | Finance V2 read-only tab; confirm margin / cost visibility |
| agent_admin / agent / viewer | Blocked / redacted behavior — margin/cost hidden, disabled V2 actions unavailable, catalog gated |

Each scenario names roles that must both **succeed** (authorized) and be **blocked/redacted**
(unauthorized).

## 5. Test environments
- **Staging** — all write / edit / build / convert / assign / voucher / packet flows. Staging DB; no
  prod data touched.
- **Production** — only the already-live read-only Product Catalog V2 (warning review, gating checks).
  No new production enablement, no prod writes.
- **No production flag flips** during UAT. Any staging flag enablement is staging-scoped and reverted
  after.

## 6. UAT scenarios (U1–U10)
| # | Scenario | Surface | Roles (authorized / blocked) | Env |
|---|---|---|---|---|
| U1 | Create a quote (add days, activity/guide items, hotels) | S1 | admin, operations / viewer | Staging |
| U2 | Price-preview + apply (hotel apply; entrance/transport/external preview) | S1 | admin / agent | Staging |
| U3 | Mark-as-Sent + share/public proposal link; Accept / Request-Changes on public token | S1 | admin / — | Staging |
| U4 | Convert accepted quote → booking (controlled pilot, staging flag) | S2 | admin, operations / viewer | Staging |
| U5 | Assign supplier to a booking service + record confirmation | S7 | operations, admin / agent | Staging |
| U6 | Passenger CRUD + rooming edit (pricing-inert); pax counts stay Classic | S4 | admin, operations / viewer | Staging |
| U7 | Finance V2 summary review; margin/cost gate check; Classic handoff link | S5 | finance, admin (see) / agent, viewer (redacted) | Staging + prod read |
| U8 | Catalog V2 warning review (27 total; drill into categories) | S6 | admin, operations (see) / agent, viewer (gated) | Prod read-only + staging |
| U9 | Generate + preview + download a single-service voucher (no send) | S8 | operations, admin / viewer | Staging |
| U10 | Voucher Packet V2 — readiness review, regenerate, send-preview (no send) | S9 | operations, admin / viewer | Staging |

## 7. Pass / fail criteria
- **PASS** = expected result observed **and** unauthorized roles correctly blocked/redacted **and** no
  unintended write, email, or currency/price change occurs.
- **FAIL** = wrong data rendered, an authorized action errors, an unauthorized role can perform/read a
  gated action, **or** any side effect outside the scenario's declared writes (email sent, allowlist
  widened, price/currency changed, prod mutated).
- **BLOCKED** = cannot execute due to environment/flag; recorded and routed to owner (not a functional
  fail).
- Every scenario also asserts the **negative**: the disabled / Classic-only actions in §8 remain
  unavailable in V2.

## 8. Must remain Classic (must NOT be doable in V2 during UAT)
- Finance writes (invoices, payments, credit notes) — Classic only.
- Catalog edits (create / edit services, suppliers, contracts, rates) — Catalog V2 is read-only.
- Supplier / contract / rate edits — Classic / dedicated tools only.
- Passenger-count / pricing-affecting changes — pax counts stay Classic.
- Any V2 action whose prod flag is OFF (Booking Creation broad, Passenger/Rooming prod edit, Operations
  prod, packet send) — must be unavailable in production.

## 9. Safety rules (binding for every tester)
- No real supplier email — supplier sending stays disabled; use send-preview only.
- No allowlist widening — voucher-send allowlist remains `ziad@axisdmc.com` only.
- No production mutations unless explicitly approved, per action.
- No real client bookings — U4 uses test quotes on staging only; no real customer/booking unless
  explicitly approved.
- No production flag flips during UAT.
- Any staging test data is labeled and cleaned up after.

## 10. UAT report template (one row per run)
| Field | Notes |
|---|---|
| Scenario | U-id + short name |
| Role | tester's role |
| Environment | staging / prod-read |
| Expected result | from §6 / §7 |
| Actual result | what happened |
| Pass/Fail | PASS / FAIL / BLOCKED |
| Issue severity | Blocker (launch-stopping) / Major / Minor / Cosmetic |
| Owner | who fixes / decides |
| Next action | fix / re-test / accept / escalate |

Roll-up per surface: # PASS / FAIL / BLOCKED + any Blocker/Major open.

## 11. Recommended order & timeline
| Phase | Days | Content | Gate |
|---|---|---|---|
| 0 — Setup | 0.5 | Staging test users per role; seed test quotes/bookings; confirm staging flags | Roles + data ready |
| 1 — Read surfaces | 1 | U7 (finance read + gate), U8 (catalog, incl. prod read-only) | No redaction leaks |
| 2 — Quote → proposal | 1.5 | U1, U2, U3 | Quote lifecycle clean |
| 3 — Booking pilot | 1.5 | U4 (staging convert), U5 (supplier assign/confirm), U6 (pax/rooming) | No unintended writes |
| 4 — Vouchers / packet | 1 | U9 (single voucher), U10 (packet readiness/preview, no send) | No email, allowlist intact |
| 5 — Triage & sign-off | 1 | Consolidate report; classify Blockers/Majors; GO/NO-GO recommendation | Zero open Blockers to advance |

**Total ≈ 6–7 working days** single-threaded; less if roles test in parallel. Read phases first
(lowest risk), write/pilot phases on staging, triage last feeding the flag-audit and enablement
decisions.

## 12. Current conclusion
- **UAT is required before a broad V2-first GO.**
- **UAT does not enable anything by itself** — it is validation only.
- **Production enablement remains a separate, explicitly-approved step** after UAT + the production flag
  audit.

## 13. Confirmations
- **No data was edited.**
- **No code changed.**
- **No flags / environment changed.**
- **No email was sent.**
- **Supplier sending remains disabled.**
- **Voucher-send allowlist remains `ziad@axisdmc.com` only.**

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- No raw identifiers (supplier / service / quote IDs), secrets, hosts, URLs, project identifiers,
  session tokens, or connection details are recorded here — only surfaces, roles, scenarios, and the
  plan.
