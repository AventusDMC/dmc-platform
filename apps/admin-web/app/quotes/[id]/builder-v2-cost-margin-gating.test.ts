import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — Slice 2A: internal cost/margin UI role-gating.
// Source-grep tests (same convention as builder-v2-create-booking / add-activity)
// pinning: the Finance-V2 role predicate, the prop threading
// page -> client -> builder -> {PricingStep, QuoteSummarySidebar}, the redaction
// of net cost / markup / margin / per-line cost for restricted roles, and the
// invariant that client-facing selling price / per person stay visible to all.

const pageSrc = readFileSync(new URL('./builder-v2/page.tsx', import.meta.url), 'utf8');
const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');
const pricingSrc = readFileSync(new URL('../../../components/quote/v2/steps/pricing-step.tsx', import.meta.url), 'utf8');
const sidebarSrc = readFileSync(new URL('../../../components/quote/v2/quote-summary-sidebar.tsx', import.meta.url), 'utf8');
const authSrc = readFileSync(new URL('../../lib/auth-session.ts', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('Quote Builder V2 — cost/margin UI role-gating (Slice 2A)', () => {
  it('the role policy is the Finance V2 predicate: admin / super_admin / finance only', () => {
    // canAccessFinance grants admin, super_admin, finance — and (unlike
    // hasRequiredRole with "admin") does NOT auto-grant agent_admin, and never
    // grants operations / agent / viewer.
    contains(authSrc, [
      'export function canAccessFinance(role?: SessionRole | null) {',
      "role === 'admin' || role === 'super_admin' || role === 'finance'",
    ]);
    assert.ok(
      !/canAccessFinance[\s\S]*?operations/.test(authSrc.split('export function canAccessOperations')[0]),
      'canAccessFinance must not include operations',
    );
  });

  it('page.tsx resolves canViewCostMargin from canAccessFinance and threads it', () => {
    contains(pageSrc, [
      'canAccessFinance',
      'const canViewCostMargin = canAccessFinance(role)',
      'canViewCostMargin={canViewCostMargin}',
    ]);
  });

  it('client accepts and threads canViewCostMargin to the builder', () => {
    contains(clientSrc, [
      'canViewCostMargin = false,',
      'canViewCostMargin?: boolean',
      'canViewCostMargin={canViewCostMargin}',
    ]);
  });

  it('builder accepts canViewCostMargin and passes it to both pricing surfaces', () => {
    contains(builderSrc, [
      'canViewCostMargin?: boolean',
      'canViewCostMargin = false,',
      'canViewCostMargin={canViewCostMargin}',
    ]);
  });

  it('PricingStep hides per-line cost breakdown + net/markup/margin when restricted', () => {
    contains(pricingSrc, [
      'canViewCostMargin = false }: PricingStepProps',
      '{canViewCostMargin ? (',
      'Restricted',
      'visible to finance / admin roles only',
    ]);
    // Client-facing selling price + per person stay outside the gate (always shown).
    contains(pricingSrc, [
      'Selling price',
      '{formatCurrency(sellingPrice, currency)}',
      '{formatCurrency(perPerson, currency)}',
    ]);
  });

  it('QuoteSummarySidebar omits the Margin row when restricted but keeps total + per person', () => {
    contains(sidebarSrc, [
      'canViewCostMargin = false,',
      '{canViewCostMargin ? (',
      'Margin',
      '{formatCurrency(pricing.sellingPrice, pricing.currency)}',
      '{formatCurrency(pricing.perPerson, pricing.currency)}',
    ]);
  });
});
