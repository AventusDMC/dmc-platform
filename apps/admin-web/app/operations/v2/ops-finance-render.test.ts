import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { FinanceTab } from '../../../components/ops/v2/finance-tab';
import { buildFinanceVM } from './ops-finance-vm';
import { EMPTY_FINANCE_DETAIL, FINANCE_REDACTED_RAW, SAMPLE_FINANCE_DETAIL } from './ops-finance.fixtures';

// Components are authored for Next's automatic JSX runtime (no `import React`);
// tsx transpiles with the classic runtime, so expose React for the render.
(globalThis as unknown as { React?: unknown }).React = React;

const BK = 'bk-1';
const html = renderToStaticMarkup(
  createElement(FinanceTab, { vm: buildFinanceVM(SAMPLE_FINANCE_DETAIL), bookingId: BK }),
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

  it('renders disabled "Coming later" finance actions', () => {
    for (const label of ['Record payment', 'Mark paid', 'Send invoice', 'Send payment reminder', 'Export financials']) {
      assert.ok(html.includes(label), `missing disabled action "${label}"`);
    }
    assert.ok(html.includes('Coming later'));
    assert.ok(html.includes('aria-disabled="true"'));
    assert.ok(html.includes('disabled'));
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
    createElement(FinanceTab, { vm: buildFinanceVM(EMPTY_FINANCE_DETAIL), bookingId: BK }),
  );
  it('shows empty payment states and keeps notice + Classic link', () => {
    assert.ok(emptyHtml.includes('No payments recorded.'));
    assert.ok(emptyHtml.includes('Internal financial summary'));
    assert.ok(emptyHtml.includes(`href="/bookings/${BK}?tab=financials"`));
  });
});
