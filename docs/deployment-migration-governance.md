# Deployment / Migration Governance Plan

**Date:** 2026-07-05
**Status:** Documentation only. Records the current deploy pipeline behavior and the target
governance model. **No code, config, env, deploy, or Railway/Vercel setting is changed by
this document.**

**Purpose:** prevent future migrations from auto-applying to **production** unexpectedly.

## 1. Current behavior (confirmed, with evidence)

- **Staging API** — Railway project `dmc-platform-staging`, service `dmc-platform`:
  **auto-deploys `main`**; start command `start:prod` =
  `npm run prisma:migrate:deploy && node dist/src/main.js`.
- **Production API** — Railway project `cheerful-enthusiasm`, service `dmc-platform`,
  env `production`: **also auto-deploys `main`** (its latest deployment was merge
  `0dd63c64`), with the **same `start:prod`** → runs `prisma migrate deploy` on every
  deploy.
- **Net effect:** merging any migration PR to `main` → both staging **and** production
  auto-deploy → `prisma migrate deploy` applies the migration to **both DBs
  automatically**. Confirmed live: `20260705120000_add_voucher_packets` applied to staging
  and production on the S1 merge.
- **Vercel admin-web** — staging (`…-staging`) and prod (`…-4gu9`) build on PRs and deploy
  on merge; **Vercel does not run migrations** (frontend only), so the migration risk is
  entirely the **Railway prod API** service.

## 2. Why this is risky for future migrations

- **No prod gate:** a migration reaches prod the moment its PR merges — before any staging
  soak/validation.
- **Destructive migrations are dangerous:** S1 was additive/empty/benign, so the accidental
  prod apply was harmless. A future migration that alters/renames/drops columns, adds
  `NOT NULL`, or backfills would hit prod immediately on merge, with production traffic
  live.
- **Coupling of code + schema deploys:** schema cannot be validated on staging without it
  also landing on prod.
- **Timing / during-traffic:** `migrate deploy` runs at prod container start; a long or
  locking migration could delay startup or lock tables under load.

## 3. Recommended target behavior

- **Staging:** keep **auto-deploy `main`** (fast QA; migrations auto-apply to staging — fine).
- **Production:** **manual / promoted deploy only** — prod does **not** auto-track `main`; a
  human intentionally promotes a known-good commit.
- **Keep `prisma migrate deploy` in the prod start command** so an intentional prod deploy
  still applies pending migrations — but it only runs **during that approved prod deploy**,
  not on every `main` merge.
- Result: merging a migration PR applies it to **staging only**; production gets it later,
  deliberately, after validation.

## 4. What to change in Railway/Vercel (documented — not changed here)

- **Railway prod API (`cheerful-enthusiasm` → `dmc-platform`):** disable **Automatic
  Deployments** (the GitHub branch auto-deploy trigger) on that service. Deploy prod
  intentionally via the Railway dashboard **Deploy/Redeploy**, `railway redeploy`, or a
  promote step. **Do not remove `prisma migrate deploy` from `start:prod`.**
- **Railway staging:** leave as-is (auto-deploy `main`).
- **Vercel prod admin-web (`…-4gu9`):** optionally set prod frontend to **manual
  promotion** for consistency (no migration risk — lower urgency — but aligns the release
  model).
- These are **Railway/Vercel dashboard settings**, not repo changes. This plan does **not**
  apply them; that is a separate approved step.

## 5. Future migration PR process (target)

1. Open the migration PR; CI green.
2. Merge → **staging** auto-deploys and auto-applies the migration.
3. **Validate on staging** (schema present, app healthy, feature slice works).
4. When ready, **intentionally promote to production** (manual Railway deploy of that
   commit) → prod runs `migrate deploy` under human control, ideally in a low-traffic
   window.
5. Record the prod apply (as in the S1 status doc).

## 6. Code-only / flag-gated PR process

- **Safe to merge normally.** They add no migration, so prod's `migrate deploy` is a
  **no-op** ("No pending migrations"), and auto-deploy of code behind an OFF flag changes
  nothing user-visible.
- This is why **S2 (code-only) is not blocked** by the pipeline gap.

## 7. Rollback expectations

- **Prefer forward-fix**, not DB rollback. Prisma has no down-migrations; reverting means a
  new migration.
- **Additive migrations** (new tables / nullable columns): safe to leave; rollback would be
  a destructive `DROP` — avoid unless necessary.
- **Destructive / altering migrations**: must ship with an explicit, reviewed
  rollback/forward-fix plan **before** merge, precisely because prod exposure is immediate
  today (and even under the manual-prod model, prod rollback is high-risk).
- **DB rollback on prod is itself a mutation** and requires explicit approval; never
  automatic.

## 8. Checklist before merging any future migration PR

Until the manual-prod pipeline (§4) is in place, treat **every migration PR as
prod-affecting on merge**:

- [ ] Migration is **additive & reversible** (or has an explicit destructive-change +
      rollback plan).
- [ ] Diff verified: `prisma migrate diff` matches `migration.sql`; no unintended
      `ALTER`/`DROP`.
- [ ] `prisma validate` + `prisma generate` pass; app builds.
- [ ] **Prod impact explicitly accepted** for this commit (it will apply on merge).
- [ ] No secrets / allowlist / env changes bundled.
- [ ] If the migration must **not** reach prod yet → **do not merge to `main`** under the
      current pipeline (hold on the branch), or land the §4 manual-prod change first.
- [ ] Post-merge: verify staging apply, and (once §4 exists) schedule the intentional prod
      promotion.

## 9. Can S2 proceed?

**Yes.** S2 (grouping engine + read-only view) is planned **code-only with no migration**,
so merging it will **not** re-trigger a schema apply on prod (`migrate deploy` no-op) and
any new UI/logic stays behind a flag / unused. Guard: when S2 is scoped, confirm it adds
**zero** files under `apps/api/prisma/migrations/`. S2 does not require the §4 pipeline fix;
the **next migration-bearing slice** does.

## 10. Safety confirmations (this task)

- ✅ **No config changes made** (Railway/Vercel settings untouched; `prisma migrate deploy`
  still in `start:prod`).
- ✅ **No env var changes made.**
- ✅ **No production deploy triggered.**
- ✅ **Voucher-send allowlist unchanged** — remains `ziad@axisdmc.com`; supplier send
  disabled.
- ✅ **Voucher packet tables left in place** on staging and production (no `DROP`, no
  rollback).

---

**Bottom line:** the one change that closes the risk is **disabling auto-deploy on the prod
Railway API service** so production is promoted intentionally, while **keeping
`prisma migrate deploy` in `start:prod`** so an approved prod deploy still migrates. Staging
keeps auto-deploying `main`. Until that setting change is made, **hold any migration-bearing
PR off `main`**; **code-only / flag-gated PRs (including S2) remain safe to merge.**
