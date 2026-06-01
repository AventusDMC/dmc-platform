# Quote-page visual polish — sequenced plan

_Started 2026-06-01. Companion to `design-system-assessment.md` (the app-wide token
unification) and the `quote-builder-redesign-mock.html` "blend workspace" target.
This doc tracks the make-it-look-better work specifically on the quote detail page
(`apps/admin-web/app/quotes/[id]/`)._

## Premise

The quote page is functionally strong (good information architecture, real coverage/
readiness cues, money transparency) but visually incoherent: a few saturated
gradient panels read like a different app than the flat cards around them, and the
density lacks a clear typographic hierarchy. The bones are good; the skin needs work.

We do **not** do a from-scratch redesign. Two efforts already point the right way —
the multi-stage blend-workspace rebuild (Stage 1 / command-bar money shipped in
PR #209) and the phased design-system unification. This plan finishes those on the
quote page, highest-impact first, each pass independently shippable and
**visually verified before merge**.

## Verification method (important)

`globals.css` is ~27.3k lines with 3–4 competing, never-torn-down `:root` token sets
and the same component restyled in many scattered blocks. A naive mid-file edit gets
buried by later, higher-specificity duplicates. So every visual pass is checked with
a **static harness**: an HTML file that loads the real `design-tokens.css` +
`globals.css` and renders the component's exact DOM, served over http and screenshotted
via Claude-in-Chrome. This reflects the true cascade without needing app auth/deploy,
and it catches specificity/contrast bugs pre-merge (it already caught a white-on-white
value-text bug in Pass 1). Branch previews need their own login, and the `-4gu9` URL is
the production (main) alias — so harness-verify on the branch, then merge to see it on
`-4gu9`.

## Passes

- [x] **Pass 1 · Flatten the quote financial-summary rail.** ★ Done (corrected). The
  rail reskinned from the bright brand-cyan gradient to a clean token card (white
  surface, slim accent bar, accent eyebrow, ink values, green Profit + Margin, muted
  labels, faint-fill rows). CSS-only → source-grep `page.test.tsx` stays green.
  **Two corrections after the first attempt:** (1) the gradient is *intentional*
  (`redesign.css` "Stage 5", per the mock) — flattening it is a deliberate
  "bold chrome / calm data" split the operator chose, not a fix of an accident.
  (2) The first attempt put the override in `globals.css`, but `redesign.css` is
  imported LAST with `!important`, so it was a **live no-op** (the harness gave a
  false positive because it omitted `redesign.css`). The real fix lives in
  `redesign.css`, quote-scoped (`.quote-pricing-summary-card-dominant.app-financial-panel`)
  so the bookings panel keeps its gradient, `!important` + higher specificity to beat
  Stage 5. **Lesson: harness must load all three stylesheets in import order.**
- [ ] **Pass 0 · Token unification (foundation, run in parallel).** Finish
  design-system Phase 1b: resolve the one accent (`#1F9ACF` vs proposal `#1FA3D6`),
  point legacy `--saas-*` / `--axis-*` / base vars at `--ds-*` (live computed values),
  delete dead `:root` blocks. Verified no-op via computed-style capture + screenshot.
  Until this lands, every restyle fights duplicate blocks (see Pass 1 finding).
- [x] **Pass 2 · Tighten the gradient command-bar header.** ★ Done. The header
  rendered ~612px tall with action buttons scattered across empty gradient voids.
  Root cause (found via `getComputedStyle` on the live header): the `.quote-dashboard-actions`
  flex-wrap row ballooned to ~383px because the redundant conversion-blocker
  "Operational Review" `<details>` notice was rendered *inline* inside the Convert
  action. Fix: drop that inline notice from the header toolbar (it still shows in the
  sidebar Actions card + review section) + a redesign.css polish that top-aligns the
  action cluster and normalizes the Accept dropdown height. Header → ~230px, buttons
  in a tidy cluster. Verified in a faithful harness (all 3 stylesheets + the real
  composite action DOM, which reproduced the 612px balloon then the fix). Tests:
  43 pass / 20 fail, identical to baseline (no new failures).
- [ ] **Pass 2b · Typographic hierarchy + card consistency.** Replace the wall of
  identical small-caps gray labels with eyebrow / title / sub tiers; standardize card
  padding, radius, shadow on `--ds-*`. Page-wide scannability.
- [~] **Pass 3 · Day-by-day timeline.** Partly done. The day rail ("Base Program
  Days") is now a **numbered vertical timeline** (mock's itinerary spine): a connector
  line down the gutter + a numbered node per day, active day's node filled cyan with a
  ring. CSS-only via a counter (no markup change → no test impact), in `redesign.css`.
  Verified in a faithful 3-stylesheet harness. The day's service lanes (Hotel /
  Transport / Meals / Activity / Ticketing / Guide / Other / External) are now
  **color-coded by type** — a colored left accent bar + matching lane-head label
  via the existing `.quote-service-lane-<type>` classes (CSS-only, no markup). The
  mock's per-type lane palette, scannable at a glance. **Still to do:** individual
  service ROWS could get the mock's icon chips — a bigger day-editor change, deferred.
- [ ] **Pass 4 · Stepper + Add-Service slide-over.** The color-coded stage stepper and
  the slide-over add-service panel from the mock — the remaining blend chrome. Also
  the natural home to resolve the money duplication (top command-bar money vs the
  sidebar Financial-summary card).
- [ ] **Pass 5 · Inline-style burndown for `quotes/[id]` (338 → ~0).** Swap hard-coded
  values for `--ds-*` tokens + `ui.tsx` primitives (add `AppAlert`/`Callout` for the
  inline status banners). Makes `quotes/[id]` the reference implementation to roll the
  same treatment out to bookings / operations / hotels.
- [ ] **Pass 6 · Collapse the duplicate dominant-card blocks** (folds in the Pass 1
  end-of-file override) as part of design-system Phase 4 (split + prune `globals.css`).

## Guardrails

- Harness-verify (and, post-merge, eyeball on `-4gu9`) every pass.
- `page.test.tsx` asserts on raw page **source strings** — avoid changing the asserted
  markup; CSS-only passes are safest.
- Keep each pass an independently shippable PR.
