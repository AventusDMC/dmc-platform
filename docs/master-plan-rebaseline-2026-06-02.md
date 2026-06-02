# DMC ERP — Master Plan Re-baseline (2026-06-02)

**Supersedes the status table in the root master plan.** The 2026-06-01 audit
(`docs/master-plan-audit-2026-06-01.md`) cross-checked every claimed-complete
master-plan item against the actual code and found the plan's percentages
systematically *understated* the operational/finance/portal layers. Since then,
**13 feature PRs (#239–#255) shipped and merged**, closing every gap the audit
surfaced. This document re-states reality and ranks what's genuinely next.

> Method note: percentages below are evidence-based estimates from the audit
> (10 read-only agents + adversarial verification) updated for what shipped this
> cycle. They're directional, not precise — but far closer than the prior table.

---

## Corrected status by area

| Area | Old plan said | Re-baselined | Why it changed |
| --- | --- | --- | --- |
| Core platform | 100% | 100% | unchanged |
| Hotels engine | 90–95% | ~95% | + preferred-hotel ranking (#240) |
| Transport engine | 95–100% | ~100% | unchanged |
| Activities & experiences | 90% | ~92% | + operational-metadata editor (#239) |
| Contract intelligence | 85% | ~95% | audit found it more complete than claimed |
| Guided quote builder | 85–90% | ~60%* | *overstated — guided flow is a v1 scaffold; pricing/itinerary live in the advanced workspace |
| **Operational ERP** | **15–20%** | **~70%** | bookings/passengers/rooming shipped; + rooming auto-allocation (#241), emergency contacts (#242), dietary (#252) |
| **Dispatch & execution** | "Phase 4, future" | **~90%** | already live (transport+guide dispatch, timeline, incidents, resource conflicts) |
| Manifests / vouchers / supplier confirmations | "missing" | ~85% | + restaurant/dining vouchers (#244); manifest export already shipped |
| **Finance** | **10%** | **~65%** | invoicing + reporting live; + supplier cost-variance (#245); + single-supplement (#255) |
| **Agent portal** | **0–10%** | **~85%** | + commission (#248), analytics (#250), net rates (#254); was already functional |
| **Client portal** | **0%** | **~55%** | token portal already existed; + 24/7 emergency line (#251) |
| Business intelligence (Phase 9) | not built | ~15% | agent analytics (#250) + cost-variance (#245) are the seeds; sales BI not built |

**Headline:** this is no longer "a quoting + contracting ERP with a thin
operational layer." It is a near-complete operational DMC platform. The booking
→ passengers → rooming → manifests → vouchers → confirmations → dispatch chain
is largely in place; finance and both portals are real.

---

## What shipped this cycle (2026-06-01 → 06-02)

All merged to `main` via the team's `--merge` + Vercel-CLEAN gate:

| PR | Gap closed |
| --- | --- |
| #239 | Master-plan audit + activity Guided-taxonomy editor |
| #240 | Preferred hotel ranking (recommendation-engine input) |
| #241 | Rooming auto-allocation (twin matching) |
| #242 | Per-passenger emergency contacts |
| #244 | Restaurant/dining vouchers |
| #245 | Supplier cost-variance report |
| #248 | Agent commission |
| #250 | Agent analytics dashboard |
| #251 | Traveler-portal 24/7 emergency line |
| #252 | Per-passenger dietary requirements |
| #254 | Agent net rates (pricing tiers) |
| #255 | Single-supplement charges (auto from contracts) |

Plus the guardrail-test fix folded into #240. **Every gap the audit identified is
now addressed.** Anything below is net-new beyond the audit.

---

## Genuinely-next priorities (ranked)

1. **Harden the test baseline.** ~12 admin-web + ~19 api/bookings tests fail on
   `main` and are currently tolerated. With this much new surface area, a green,
   trustworthy suite is the highest-leverage next investment — it protects all of
   the above and removes "is this my break or baseline?" friction. *(Caveat: some
   failures look environment/DB-state dependent; scope as investigate→fix-tractable→report.)*

2. **Business Intelligence — sales analytics (Phase 9).** Top suppliers / hotels /
   routes by revenue + margin, win-rate and volume trends. The data and the
   reporting pattern (reports.service + agent-analytics) now exist. *Caveat: "top
   hotels/routes" needs a destination/entity attribution dimension that bookings/
   services don't cleanly carry today (same constraint that blocks destination
   profitability) — supplier-level BI is clean; hotel/route-level needs a data step first.*

3. **Recommendation engines (Phase 2 "Next").** The inputs now exist —
   preferred-hotel ranking (#240) + activity operational metadata (#239) feed the
   guided suggestion engine. Turning those into ranked auto-recommendations is the
   natural payoff.

4. **Design-system consolidation.** admin-web carries 3–4 competing `:root` token
   systems in a ~27k-line `globals.css` + ~2,080 inline styles (this cycle added a
   few more). Phased unification per `docs/design-system-assessment.md`.

5. **Data-model groundwork unlocked by the audit:** a destination/city dimension
   on bookings/services would unlock both destination-profitability *and*
   hotel/route-level BI in one step.

---

## Still off-limits (DO NOT TOUCH — confirmed stable)

Hotel / transport / activity pricing engines, HB-supplement architecture, route-
standards and touring-route architecture. Note: this cycle's pricing-adjacent
features (agent net rates #254, single-supplement #255) were implemented as
**read-only consumers / display layers** — they never modified these engines.
