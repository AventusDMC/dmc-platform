import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { FinanceTab } from '../../../components/ops/v2/finance-tab';
import { buildFinanceVM } from './ops-finance-vm';
import { canAccessFinance, type SessionRole } from '../../lib/auth-session';
import { EMPTY_FINANCE_DETAIL, FINANCE_REDACTED_RAW, SAMPLE_FINANCE_DETAIL } from './ops-finance.fixtures';

// Components are authored for Next's automatic JSX runtime (no `import React`);
// tsx transpiles with the classic runtime, so expose React for the render.
(globalThis as unknown as { React?: unknown }).React = React;

const BK = 'bk-1';
// Finance-visibility render (canSeeMargin = true — admin / super_admin / finance).
const html = renderToStaticMarkup(
  createElement(FinanceTab, { vm: buildFinanceVM(SAMPLE_FINANCE_DETAIL), bookingId: BK, canSeeMargin: true }),
);
// Restricted render (canSeeMargin = false — operations / agent_admin / agent / viewer).
const restrictedHtml = renderToStaticMarkup(
  createElement(FinanceTab, { vm: buildFinanceVM(SAMPLE_FINANCE_DETAIL), bookingId: BK, canSeeMargin: false }),
);

describe('FinanceTab render — content', () => {
  it('shows the persistent read-only notice', () => {
    assert.ok(html.includes('Internal financial summary. Payment and invoice actions remain in Classic.'));
  });

  it('renders summary cards incl. margin amount and margin %', () => {
    assert.ok(html.includes('Quoted total'));
    assert.ok(html.includes('Realized cost'));
    assert.ok(html.includes('Margin'));
    assert.ok(html.includes('8,450'), 'quoted total amount missing');
    assert.ok(html.includes('2,470'), 'margin amount missing');
    assert.ok(html.includes('29%'), 'margin percent missing');
  });

  it('renders client + supplier payment tables', () => {
    assert.ok(html.includes('Client payments'));
    assert.ok(html.includes('Supplier payments'));
    assert.ok(html.includes('Reference recorded'));
  });

  it('shows the section-level Classic financials link', () => {
    assert.ok(html.includes(`href="/bookings/${BK}?tab=financials"`));
    assert.ok(html.includes('Open financials in Classic'));
  });

  it('renders the Classic handoff panel (actions as text, not buttons)', () => {
    assert.ok(html.includes('Finance actions are handled in Classic.'));
    // Classic-only actions render as plain list items — NOT buttons.
    for (const li of [
      '<li>Record payment</li>',
      '<li>Mark paid</li>',
      '<li>Invoice / send invoice</li>',
      '<li>Payment reminder</li>',
      '<li>Reconciliation</li>',
      '<li>Exports</li>',
    ]) {
      assert.ok(html.includes(li), `missing handoff list item "${li}"`);
    }
    // Exactly the one safe Classic link (the booking financials tab).
    assert.ok(html.includes(`href="/bookings/${BK}?tab=financials"`));
    assert.ok(html.includes('Open financials in Classic'));
    // The old inert "Coming later" disabled buttons are gone from the tab.
    assert.ok(!html.includes('Coming later'), '"Coming later" pills must be removed');
    assert.ok(!html.includes('aria-disabled'), 'no disabled action buttons may remain');
    // No per-action deep links / export / pdf / download / /finance route links.
    assert.ok(!html.includes('/export'));
    assert.ok(!html.includes('.pdf'));
    assert.ok(!html.includes('download='));
    assert.ok(!html.includes('/finance/'));
  });
});

describe('FinanceTab render — F1 margin/role gate', () => {
  // The page wires `canSeeMargin` = canAccessFinance(role); render each role with
  // that exact capability and assert cost/margin visibility follows the accepted
  // decision (admin / super_admin / finance see it; everyone else does not).
  const ALL_ROLES: SessionRole[] = ['admin', 'super_admin', 'finance', 'operations', 'agent_admin', 'agent', 'viewer'];
  const COST_MARGIN_MARKERS = ['Realized cost', '5,980', 'Margin', '2,470', '29%'];

  it('canAccessFinance grants cost/margin only to admin / super_admin / finance', () => {
    assert.equal(canAccessFinance('admin'), true);
    assert.equal(canAccessFinance('super_admin'), true);
    assert.equal(canAccessFinance('finance'), true);
    assert.equal(canAccessFinance('operations'), false);
    assert.equal(canAccessFinance('agent_admin'), false);
    assert.equal(canAccessFinance('agent'), false);
    assert.equal(canAccessFinance('viewer'), false);
  });

  for (const role of ALL_ROLES) {
    const canSee = canAccessFinance(role);
    const roleHtml = renderToStaticMarkup(
      createElement(FinanceTab, { vm: buildFinanceVM(SAMPLE_FINANCE_DETAIL), bookingId: BK, canSeeMargin: canSee }),
    );

    if (canSee) {
      it(`${role}: sees cost + margin`, () => {
        for (const marker of COST_MARGIN_MARKERS) {
          assert.ok(roleHtml.includes(marker), `${role} should see "${marker}"`);
        }
        assert.ok(!roleHtml.includes('Cost and margin are restricted to finance roles.'));
        assert.ok(roleHtml.includes('Supplier payments'));
        // supplier payment amount is visible (finance roles)
        assert.ok(roleHtml.includes('3,000'), `${role} should see the supplier payment amount`);
      });
    } else {
      it(`${role}: does NOT see cost / realized cost / margin / margin %`, () => {
        assert.ok(!roleHtml.includes('Realized cost'), `${role} must not see Realized cost`);
        assert.ok(!roleHtml.includes('5,980'), `${role} must not see the realized cost value`);
        assert.ok(!roleHtml.includes('2,470'), `${role} must not see the margin value`);
        assert.ok(!roleHtml.includes('29%'), `${role} must not see the margin percent`);
        // supplier payment amounts (cost-revealing) are withheld
        assert.ok(!roleHtml.includes('3,000'), `${role} must not see the supplier payment amount`);
      });
      it(`${role}: sees the restricted copy + keeps non-financial summary`, () => {
        assert.ok(roleHtml.includes('Cost and margin are restricted to finance roles.'));
        // Non-sensitive summary still renders: quoted total, statuses, currency,
        // payment count, client payments, Open-in-Classic.
        assert.ok(roleHtml.includes('Quoted total'));
        assert.ok(roleHtml.includes('8,450'), 'quoted total (sell) stays visible');
        assert.ok(roleHtml.includes('Statuses'));
        assert.ok(roleHtml.includes('Client payments'));
        assert.ok(roleHtml.includes('Supplier payment amounts are restricted to finance roles.'));
        assert.ok(roleHtml.includes(`href="/bookings/${BK}?tab=financials"`));
      });
    }
  }

  it('introduces no finance write mechanics for restricted roles', () => {
    for (const forbidden of ['<form', '<input', '<select', '<textarea', 'action="/api', 'download=']) {
      assert.ok(!restrictedHtml.includes(forbidden), `restricted finance tab must not render "${forbidden}"`);
    }
    // Read-only Classic handoff panel renders for restricted roles too — and no
    // inert "Coming later" buttons remain.
    assert.ok(restrictedHtml.includes('Finance actions are handled in Classic.'));
    assert.ok(!restrictedHtml.includes('Coming later'));
  });
});

describe('FinanceTab render — read-only / data safety', () => {
  it('renders no forms / inputs / real action mechanics', () => {
    for (const forbidden of ['<form', '<input', '<select', '<textarea', 'window.print', 'createObjectURL', 'download=', '.pdf', '/export', 'action="/api']) {
      assert.ok(!html.includes(forbidden), `finance tab must not render "${forbidden}"`);
    }
  });

  it('renders no raw sensitive reference / note / injected cost values', () => {
    for (const raw of FINANCE_REDACTED_RAW) {
      assert.ok(!html.includes(raw), `finance tab leaked "${raw}"`);
    }
  });
});

describe('FinanceTab render — empty state', () => {
  const emptyHtml = renderToStaticMarkup(
    createElement(FinanceTab, { vm: buildFinanceVM(EMPTY_FINANCE_DETAIL), bookingId: BK, canSeeMargin: true }),
  );
  it('shows empty payment states and keeps notice + Classic link', () => {
    assert.ok(emptyHtml.includes('No payments recorded.'));
    assert.ok(emptyHtml.includes('Internal financial summary'));
    assert.ok(emptyHtml.includes(`href="/bookings/${BK}?tab=financials"`));
  });
});
