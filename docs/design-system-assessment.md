# Design System Assessment & Unification Plan

_Assessed 2026-05-30 (admin-web). Snapshot of the current styling architecture and a safe, phased plan to converge on a single centralized design system._

## TL;DR

The app does **not** use Tailwind (or styled-components / emotion / sass). It has a bespoke
system whose **skeleton is good but whose adoption has fragmented into 3–4 competing,
half-migrated token sets** plus heavy inline-style sprawl. The fix is consolidation, not a
rewrite — and it should be done **with visual verification**, because changing which token
block "wins" can shift colors/spacing app-wide.

## What exists today

**Good — the bones of a system are here:**
- A token layer: ~74 CSS custom properties (`--accent`, `--surface`, `--border`,
  `--radius-*`, `--shadow-*`, sizing tokens like `--admin-card-radius`).
- A shared primitive library: `app/components/ui.tsx` — ~25 `App*` components
  (`AppShell`, `AppCard`, `AppButton`, `AppBadge`, `AppTabs`, `AppTable`, `AppInput`,
  `MetricCard`, `FinancialPanel`, `DrawerPanel`, `EntityDetailHeader`, …).

**The problems:**

1. **Competing, conflicting token systems** in one file (`app/globals.css`, ~27,300 lines).
   Several `:root` blocks redefine the *same* core variables with *different* values:
   | System | Defines | `--background` | accent |
   |---|---|---|---|
   | base (top of file) | `--accent/--surface/--border/--shadow-*` | `#F9FAFB` | `#1F9ACF` |
   | `--saas-*` (~L6548) | full parallel palette, remaps base vars | `#f3f6fb` | `#1F9ACF/#1C7FB8` |
   | `--axis-*` (~L14540 **and** ~L14808, duplicated) | another palette, remaps base vars | `#FFFFFF` | `#1F9ACF/#1C7FB8` |
   | `--proposal-*` (proposal template) | isolated proposal tokens | `#FFFFFF` paper | **`#1FA3D6`** (different blue) |

   These look like successive redesigns (base → "saas" → "axis") that were never torn down.
   Whichever block cascades last wins; the rest is dead or conflicting weight.

2. **Inline-style sprawl** — ~2,080 `style={{…}}` attributes across ~92 files, concentrated
   exactly where complexity lives: `quotes/[id]` (15 files), `route-standards`, `operations`,
   `bookings`, `hotels`. Every one bypasses the token/primitive layer and hard-codes values
   (e.g. status banners hard-code `#fef3f2`/`#b42318` instead of a `--danger` token).

3. **One 27k-line global stylesheet** — no partials/modules; hard to navigate, very likely
   carrying dead rules and specificity fights from the abandoned redesigns.

4. **App vs proposal accent drift** — app accent `#1F9ACF` vs proposal accent `#1FA3D6`.
   Small, but symptomatic: there is no single source of truth even for the brand color.

## Why not just "switch to Tailwind"

Tailwind would enforce consistency, but it (a) is a large multi-week migration over 27k lines
of CSS + 92 inline-style files, (b) doesn't itself make anything *look* better — it changes the
authoring model, and (c) would sit alongside the existing system during a long transition,
adding a *fourth* way to style things. Recommended only if the team wants utility-first
authoring as a deliberate long-term bet. The cheaper, lower-risk win is to **finish the system
that already exists**.

## Recommended path — harden & unify (phased, verifiable)

Each phase is independently shippable and should be **visually verified** (screenshots /
review) before merge, since token changes are global.

- **Phase 0 — Freeze the brand token.** Pick ONE canonical accent (resolve `#1F9ACF` vs
  `#1FA3D6`) and a canonical neutral ramp. One decision, documented here.
- **Phase 1 — Canonical token file.** Create `app/design-tokens.css` as the single source of
  truth (color ramp, spacing scale, radius, shadow, typography, plus missing semantic tokens:
  `--success/--warning/--danger` surfaces). Re-point the legacy names (`--saas-*`, `--axis-*`,
  base) to canonical **using their currently-rendering values** so it's visually a no-op, then
  delete the duplicate/dead `:root` blocks. Verify nothing shifts.
- **Phase 2 — Primitive coverage.** Fill gaps in `ui.tsx` (e.g. `AppAlert`/`Callout` for the
  status banners that are currently inline) so there's a component for every recurring pattern.
- **Phase 3 — Burn down inline styles by area,** highest-traffic first (`quotes/[id]`), swapping
  hard-coded values for tokens/primitives. ~2,080 → target near-zero, one area per PR.
- **Phase 4 — Split `globals.css`** into modules (base/tokens/layout/components/utilities) and
  prune dead rules left over from the abandoned redesigns.

## Quick wins (low risk, do anytime)
- Add `--success/--warning/--danger` (+ soft variants) tokens and convert the few status
  banners that hard-code reds/greens (including the quote "nights mismatch" banner added in
  PR #199, which currently inlines `#fef3f2`/`#b42318`).
- Delete the duplicate `--axis-*` `:root` block (appears twice).

## Note on verification
This plan was written from static analysis. Pixel-level verification was not possible in the
assessment environment (no PDF rasterizer, preview capture channel unresponsive, no connected
browser). **Execute Phase 1+ only with working visual verification** — global token changes
must be eyeballed before merge.
