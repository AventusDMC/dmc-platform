# Supplier Voucher Packet V2 — S1 Migration Status & Deploy-Pipeline Note

**Date:** 2026-07-05
**Status:** Documentation only. Records what happened with the S1 schema migration and how
the Railway deploy pipeline auto-applies migrations. No code, schema, flag, or environment
change accompanies this document.

> **Correction to an earlier report:** a first status read said "production not applied."
> That was wrong. A read-only inspection of the production Railway project found that
> **production also auto-applied this migration** via the same pipeline. This document
> records the accurate state.

## 1. PR and commit
PR **#641** (`feat(api): add VoucherPacket and VoucherPacketItem schema`) merged with
merge commit **`0dd63c64`**.

## 2. Migration auto-applied to staging (not manual)
The staging Railway API service (`dmc-platform-staging` → service `dmc-platform`) starts
with `start:prod` = `npm run prisma:migrate:deploy && node dist/src/main.js`. Merging to
`main` triggered the staging deploy, whose start command ran `prisma migrate deploy` and
applied the migration. Deploy log (staging):

```
> prisma migrate deploy
193 migrations found in prisma/migrations
Applying migration `20260705120000_add_voucher_packets`
All migrations have been successfully applied.
```

This was **not run manually** — it is the standing deploy pipeline.

## 3. Migration ALSO auto-applied to production
A read-only inspection of the production Railway project (`cheerful-enthusiasm` → service
`dmc-platform`, environment `production`) found its latest deployment is the **same merge
commit `0dd63c64`** and that its `start:prod` likewise ran `prisma migrate deploy` and
applied the migration. Deploy log (production):

```
193 migrations found in prisma/migrations
Applying migration `20260705120000_add_voucher_packets`
The following migration(s) have been applied:
  └─ 20260705120000_add_voucher_packets/
```

Both the staging and production `dmc-platform` API services **auto-track `main`** and run
`start:prod` (which includes `prisma migrate deploy`). No production deploy or migration was
triggered manually; production deployed the merge automatically within the same window as
staging.

## 4. What the apply created
Only two new **empty, unused** tables — `voucher_packets` and `voucher_packet_items` — on
both staging and production. No rows are written by any code path yet (S1 is schema-only).

## 5. No existing schema altered
The migration is additive only: two `CREATE TABLE` statements + indexes + foreign keys.
**No existing table, column, or enum was altered**; the existing 1:1 `Voucher` model is
untouched; `BookingAuditEntityType` is unchanged.

## 6. No behavior / API / UI / send / allowlist change
Despite the apply, there is no functional change: no code references the new tables; no API
routes, UI, PDF, send-preview, or send were added. The voucher-send allowlist remains
`ziad@axisdmc.com` only; supplier sending remains disabled.

## 7. Staging rollback not recommended
The staging tables are additive, empty, and unused. Rolling back would require a
**destructive** `DROP TABLE`, for no benefit. Leaving them in place is the accepted,
benign outcome.

## 8. Production status — applied (accepted as benign)
Contrary to the initial assumption, the migration **is applied on production**. It is
accepted as benign for the same reasons: additive-only, two empty/unused tables, no
existing schema altered, no behavior/API/UI/send/allowlist change. **No production rollback
is recommended or performed** (a `DROP TABLE` on prod would be destructive and is not
warranted).

## 9. Production deploy behavior — confirmed auto-migrate
Production **does** auto-run `prisma migrate deploy` on deploy (via `start:prod`), and the
production API auto-deploys `main`. Therefore **any migration merged to `main` is applied
to production automatically on the next production deploy** — which happens on merge.

## 10. Implication for future migration PRs
Because merging a migration PR to `main` auto-applies it to **both staging and
production**, every future migration must be treated as **production-affecting at merge
time**. Before merging any future schema slice that adds a migration, we must explicitly
accept that it will be applied to production automatically. If a migration must NOT reach
production yet, it cannot be merged to `main` under the current pipeline, or the pipeline's
auto-migrate/auto-deploy behavior must be changed first (a separate, deliberate decision —
not made here).

## 11. Gate on S2
S2 (grouping engine) does **not** start until this status is documented (this file) and the
production deploy/auto-migrate behavior is understood (documented in §3, §9–§10). S2 is
planned to be **code-only** (a pure grouping function + read-only view) with **no further
migration**, so it should not re-trigger a schema apply; that will be confirmed when S2 is
scoped.

---

**Summary:** the S1 additive migration `20260705120000_add_voucher_packets` is applied on
**both staging and production**, automatically, by the Railway `start:prod` →
`prisma migrate deploy` pipeline that runs on every `main` deploy. The apply is benign
(two empty, unused tables; no existing schema or behavior changed). No rollback is
recommended. The key operational takeaway: **merging any migration PR applies it to
production automatically** — future schema PRs must be merged with that understood and
accepted.
