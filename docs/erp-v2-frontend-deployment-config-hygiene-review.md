# ERP V2 — Frontend Deployment Config-Hygiene Review

Planning / read-only inspection. No Vercel settings, domains, aliases, projects, flags, env vars, or deployments were changed. Classic remains the system of record.

**Scope:** review the frontend Vercel deployment/project configuration risk discovered during Hotel Apply Readiness — specifically the duplicate admin-web projects and the silent-disable surface they create. Variable **names/presence only**; no secret values are printed.

## 1. Current project inventory (Vercel team `aventus-dmc-portal`)

| Project | Role | `NEXT_PUBLIC` vars | V2/Ops-V2 flags | Hotel flags | Repo-linked |
|---|---|---|---|---|---|
| **dmc-platform-admin-web-4gu9** | **Canonical production frontend** | 23 | 18 | ✅ both | ✅ root `.vercel` |
| **dmc-platform-admin-web-staging** | Staging frontend | 22 | 18 | ✅ both | — |
| **dmc-platform-admin-web** | Vestigial duplicate | 2 | 0 | ❌ none | — |
| **dmc-platform** | Backend / API | — | — | — | — |

- Root `.vercel/project.json` points to **`dmc-platform-admin-web-4gu9`** (project id / org id recorded in that in-repo file; not duplicated here).
- `apps/admin-web/vercel.json` is **generic** (`framework: nextjs`, `buildCommand: npm run build`, `outputDirectory: .next`) — it does **not** pin a project or env.

## 2. Canonical production frontend

**`dmc-platform-admin-web-4gu9`**:
- Repo-linked (root `.vercel/project.json`).
- Carries the full V2 / Ops-V2 flag set (18 flags) including the V2-default config (`NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT`, `…_DEFAULT_STATUSES`).
- Both hotel flags present (`NEXT_PUBLIC_QUOTE_BUILDER_V2_HOTEL_PREVIEW`, `…_HOTEL_APPLY`).
- Served at `https://dmc-platform-admin-web-4gu9.vercel.app` (+ `-git-main-` alias).
- The `-4gu9` suffix came from a previous Vercel workaround.

## 3. Staging frontend

**`dmc-platform-admin-web-staging`**:
- Carries the V2 / Ops-V2 flag set (18 flags).
- Both hotel flags present.
- Has some **staging-ahead** in-test flags not yet in prod (`…_QUOTE_BUILDER_V2_ITEM_CREATE`, `…_QUOTE_PROPOSAL_EMAIL_SEND`, `…_OPS_V2_VOUCHER_PACKET_SEND_PREVIEW`).
- Staging-ahead flags are **expected, not drift**.

## 4. Vestigial duplicate

**`dmc-platform-admin-web`**:
- Only `API_URL` / `APP_URL`-style `NEXT_PUBLIC` vars (2 total).
- **Zero** V2 / Ops-V2 / hotel flags.
- Still reachable at `https://dmc-platform-admin-web.vercel.app`.
- Auto-deploys from `main`.
- Produces a **functioning-looking app with V2 features silently OFF**.

## 5. Domain / alias inventory

- **No custom branded production domain currently exists** — production is served via a `*.vercel.app` alias.
- Each project has its own `.vercel.app` aliases (`<name>.vercel.app`, `<name>-aventus-dmc-portal.vercel.app`, `<name>-git-main-aventus-dmc-portal.vercel.app`).
- The vestigial project still has an **active alias** (`dmc-platform-admin-web.vercel.app`).
- **No domain/alias changes were made.**

## 6. Deployment behavior

- All three admin-web projects **auto-deploy from the same repo `main` branch**.
- All three **redeploy on each merge** (confirmed: all three redeployed simultaneously on the most recent merge; each carries a `-git-main-` production alias).
- This creates **extra Vercel checks and build noise** (three admin-web checks per PR).
- The vestigial project is therefore **not inert** — it actively rebuilds a production target on every merge, just without the V2 flags.

## 7. V2 flag presence summary

- `-4gu9` (prod) and `-staging` both expose the V2 / Ops-V2 flags + both hotel flags → V2 fully enabled.
- The vestigial `dmc-platform-admin-web` exposes **no** V2 flags → Quote Builder V2 default, Ops V2, hotel preview/apply, entrance/transport/external-package, catalog-v2, and Ops-V2 voucher/supplier surfaces all render **OFF** there.
- Reported as variable **names / presence only** — no secret values printed.

## 8. Risk assessment

- **Live silent-disable surface (present, not hypothetical):** old bookmarks or stale links to the vestigial URL show V2 features **OFF** with no error — same code, different flags — leading to confusing, hard-to-diagnose "the feature disappeared" reports.
- **Repoint risk:** if a future custom domain (or a staff bookmark) is ever pointed at the wrong project, V2 **disappears silently** with no failure signal.
- **Drift risk:** multiple independently-maintained env sets increase rollout drift risk; a new V2 flag must be set on the correct project(s).
- **Build/check noise:** extra production build + PR check for a project nobody should use.
- **Weak canonical binding:** with no custom domain, "canonical production" is **convention, not a hard binding**.

## 9. Recommended cleanup / hardening plan

1. **First confirm the canonical staff URL** (gating fact before any change).
2. **Safest first operational step:** disconnect the vestigial project's **Git auto-deploy** (reversible; stops the flag-less prod-target build and the extra PR check; existing deploys/aliases remain).
3. **Do not delete the project first.**
4. **After a quiet period** with no inbound traffic to the vestigial URL, consider removing the vestigial project/alias — **separately, with its own approval**.
5. **Add a custom production domain bound to `-4gu9`** as the long-term fix (turns "production" into a hard binding).
6. **Document the project → role → env mapping** (this doc) so future flag rollouts target the correct projects.
7. **Do not rename `-4gu9` casually** — its `.vercel.app` URL is likely bookmarked; renaming changes the URL. Only via the custom-domain plan.

## 10. Owner confirmation question

> Please confirm the canonical staff production URL: Is staff currently using `dmc-platform-admin-web-4gu9.vercel.app` as the production admin-web URL, or are any staff / docs / bookmarks still using `dmc-platform-admin-web.vercel.app`?

## 11. Exact safe next action

- **Doc-only PR now** (this document).
- After the owner confirms the canonical URL, propose a **separate Vercel settings action**: disconnect Git auto-deploy for the vestigial `dmc-platform-admin-web`.
- **No Vercel setting change until explicit approval.**

## 12. GO / NO-GO

**GO**
- Document findings.
- Ask the owner to confirm the canonical staff URL.

**GO (later, after approval)**
- Disconnect the vestigial project's Git auto-deploy.
- Consider a custom production domain bound to `-4gu9`.

**NO-GO (now)**
- Deleting the project.
- Removing domains / aliases.
- Changing env vars / flags.
- Renaming / repointing any project or domain.
- Redeploying / touching production.
- Staff rollout / live bookings.
