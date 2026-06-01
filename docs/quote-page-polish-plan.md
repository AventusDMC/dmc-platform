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

- [x] **Pass 1 · Primary money-card reskin.** ★ Done. The
  `.quote-pricing-summary-card-dominant.app-financial-panel` card (saturated
  navy→blue gradient + white text) reskinned to a clean token-based surface with a
  slim accent bar, accent eyebrow, ink values, muted labels, faint-fill rows. Markup
  unchanged → source-grep `page.test.tsx` stays green. **Finding:** the card had ~15
  competing style blocks (lines 18856–26036); rather than untangle them now (that's
  Pass 6 / Phase 4) an authoritative end-of-file block wins the cascade. Flagged for
  later collapse.
- [ ] **Pass 0 · Token unification (foundation, run in parallel).** Finish
  design-system Phase 1b: resolve the one accent (`#1F9ACF` vs proposal `#1FA3D6`),
  point legacy `--saas-*` / `--axis-*` / base vars at `--ds-*` (live computed values),
  delete dead `:root` blocks. Verified no-op via computed-style capture + screenshot.
  Until this lands, every restyle fights duplicate blocks (see Pass 1 finding).
- [ ] **Pass 2 · Typographic hierarchy + card consistency.** Replace the wall of
  identical small-caps gray labels with eyebrow / title / sub tiers; standardize card
  padding, radius, shadow on `--ds-*`. Page-wide scannability.
- [ ] **Pass 3 · Day-by-day timeline (centerpiece).** Adopt the mock's color-coded
  timeline (day nodes + colored service rows). Tie-in: full-day / stationary /
  free-day daily-package days get distinct visual treatment so the pricing logic
  reads at a glance.
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
