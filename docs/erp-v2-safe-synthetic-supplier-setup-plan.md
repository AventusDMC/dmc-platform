# ERP V2 — Safe Synthetic Supplier Setup Plan for Ops V2 Production Smoke

**Date:** 2026-07-17
**Status:** Planning only. **No supplier created, no data edits, no flags/env changed, no production or
staging touched, no email.** No code, schema, or environment change accompanies this plan.

## 1. Purpose
- Create **one** clearly labeled internal / test supplier **later**.
- Use it **only** for the controlled production Ops V2 supplier assignment / confirmation smoke.
- **Avoid assigning a real supplier to a synthetic booking.**

## 2. Read-only findings
- Supplier **minimum record is `name` + `type`** (both required).
- **`email` is nullable** but use a `.invalid` address for safety / labeling.
- **`type` is free-text** (not an enum).
- A **bare supplier has no required rates / contracts / catalog records** (all such relations are optional
  and empty on create).
- **Assignment does not validate supplier type against service type** — any type is assignable.
- A **new supplier is easy to find** in supplier lists (the list is newest-first, so a freshly created
  record appears at the top; the "ZZZ" prefix also isolates it in alphabetical views).
- The **create endpoint sends no email**.

## 3. Supplier naming
- Name: **`ZZZ TEST SUPPLIER — DO NOT SEND`**.
- Clearly **internal / test**.
- **Should not be confused with real suppliers** (distinct "ZZZ … DO NOT SEND" label).

## 4. Supplier email
- Use a **non-deliverable `.invalid` email** (e.g. `zzz-test-supplier@axis.invalid`).
- **No real email.**
- **No staff email.**
- **No supplier email.**
- **Send paths remain unused and disabled** (the `.invalid` address is defense-in-depth labeling, not a
  functional dependency).

## 5. Supplier type / category
- Use **`type = other`**.
- **Compatible with BK-2026-0007's single service** (its one service is `other`).
- **Avoid `hotel` / `transport` semantics** (contract / room / discount / vehicle-rate implications).
- **No rates / contracts / catalog / service records.**

## 6. Scope
- **Supplier creation only** in the later setup step.
- No assignment.
- No confirmation.
- No voucher / packet.
- No email.
- No flags.

## 7. Verification after later setup
- Supplier **exists**.
- Name **clearly labeled test / internal**.
- **`.invalid` email present.**
- **No rates / contracts / catalog dependencies.**
- Supplier **appears in the supplier list** (available for assignment).
- **No send occurred.**

## 8. Cleanup
- **Retain** the supplier until the production smoke is documented.
- Cleanup / deactivate / delete **only later if safe**.
- **No automatic cleanup.**

## 9. GO / NO-GO
- **GO** only if the supplier is safely labeled and isolated.
- **GO** only if no email path is used.
- **GO** only if no catalog / rate / contract data is required.
- **NO-GO** if supplier creation risks real supplier data or send paths.

## 10. Next execution order
1. Save this plan as a doc PR.
2. **Approve supplier creation separately.**
3. Create the supplier.
4. Document supplier setup.
5. Runtime-probe the `-4gu9` flags.
6. Run the assignment / confirmation smoke **only if flags + supplier are safe**.

## 11. Safety boundaries
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- **Supplier sending remains disabled.**
- No supplier emails.
- No voucher-send.
- No packet-send.

## 12. Net conclusion
- Safe synthetic supplier setup is **feasible and low-risk**.
- Execution remains a **separate approved step**.
- **No supplier was created by this plan.**

## Confirmations
- No code changed.
- No data changed.
- No flags / environment changed.
- No production / staging behavior changed.
- No supplier created.
- No supplier assigned / confirmed.
- No email sent.
- No supplier-send or voucher-send action.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this plan.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only the proposed supplier label, the human-readable booking reference,
  the field / type names, and the plan.
