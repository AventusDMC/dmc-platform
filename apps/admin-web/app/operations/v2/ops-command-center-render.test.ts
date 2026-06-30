import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { CommandCenter } from '../../../components/ops/v2/command-center';
import { OpsBetaHeader } from '../../../components/ops/v2/ops-beta-header';
import { buildCommandCenterVM } from './ops-command-center-vm';
import { CC_REDACTED_RAW, EMPTY_DISPATCH, SAMPLE_BOOKINGS, SAMPLE_DASHBOARD, SAMPLE_DISPATCH } from './ops-command-center.fixtures';

// Components are authored for Next's automatic JSX runtime (no `import React`);
// tsx transpiles with the classic runtime, so expose React for the render.
(globalThis as unknown as { React?: unknown }).React = React;

const vm = buildCommandCenterVM({ dispatch: SAMPLE_DISPATCH, dashboard: SAMPLE_DASHBOARD, bookings: SAMPLE_BOOKINGS });
const html = renderToStaticMarkup(createElement(CommandCenter, { vm, activeRange: 'today' }));

describe('CommandCenter render — regions', () => {
  it('renders the KPI grid', () => {
    for (const label of ['Critical issues', 'Missing suppliers', 'Pending confirmations', 'Vouchers pending', 'Ready for dispatch', 'Arrivals today', 'In progress', 'Delayed']) {
      assert.ok(html.includes(label), `KPI "${label}" missing`);
    }
  });

  it('renders the dispatch window + range controls', () => {
    assert.ok(html.includes('Dispatch · Today'));
    for (const r of ['Today', 'Tomorrow', 'Next 7 days']) assert.ok(html.includes(r));
    assert.ok(html.includes('href="/operations/v2?range=tomorrow"'));
  });

  it('renders the Needs attention table with View in V2 + Open in Classic', () => {
    assert.ok(html.includes('Needs attention'));
    assert.ok(html.includes('BK-0001'));
    assert.ok(html.includes('href="/operations/v2/b-high"'));
    assert.ok(html.includes('href="/bookings/b-high/operations"'));
    assert.ok(html.includes('View in V2'));
    assert.ok(html.includes('Open in Classic'));
  });

  it('Needs attention table uses the combined Trip/Finance columns with no-wrap labels', () => {
    // Combined columns (Dates+Pax → Trip, Invoice+Supplier → Finance) keep the
    // table from squeezing beside the 320px sidebar.
    assert.ok(html.includes('>Trip<'), 'missing combined Trip column header');
    assert.ok(html.includes('>Finance<'), 'missing combined Finance column header');
    // Finance cell stacks invoice + supplier with axis prefixes.
    assert.ok(html.includes('Invoice:'), 'missing Invoice axis prefix in Finance cell');
    assert.ok(html.includes('Supplier:'), 'missing Supplier axis prefix in Finance cell');
    // Key labels/badges must not break mid-word (PA X / Confirm ed / Unbill ed).
    assert.ok(html.includes('whitespace-nowrap'), 'expected no-wrap treatment on labels/badges');
  });

  it('renders the right sidebar', () => {
    assert.ok(html.includes('Dispatch summary'));
    assert.ok(html.includes('Fleet readiness'));
    assert.ok(html.includes('Blocking items'));
    assert.ok(html.includes('Next required action'));
    assert.ok(html.includes('Resolve BK-0001'));
  });

  it('the only V2 resolve action is disabled "Coming later"', () => {
    assert.ok(html.includes('Resolve in V2'));
    assert.ok(html.includes('Coming later'));
    assert.ok(html.includes('aria-disabled="true"'));
  });
});

describe('CommandCenter render — read-only / data safety', () => {
  it('no forms / inputs / mutation / export mechanics', () => {
    for (const forbidden of ['<form', '<input', '<select', '<textarea', 'method="POST"', 'window.print', 'createObjectURL', 'download=', '.pdf', '/export', 'action="/api']) {
      assert.ok(!html.includes(forbidden), `command center must not render "${forbidden}"`);
    }
  });
  it('no cost/sell/reference/raw-JSON leak', () => {
    for (const raw of CC_REDACTED_RAW) assert.ok(!html.includes(raw), `command center leaked "${raw}"`);
    assert.ok(!html.includes('{"'), 'rendered raw JSON');
  });
});

describe('CommandCenter render — empty + per-region error', () => {
  it('empty dispatch window + empty queue states', () => {
    const emptyVm = buildCommandCenterVM({ dispatch: EMPTY_DISPATCH, dashboard: SAMPLE_DASHBOARD, bookings: [] });
    const emptyHtml = renderToStaticMarkup(createElement(CommandCenter, { vm: emptyVm, activeRange: 'today' }));
    assert.ok(emptyHtml.includes('No services in this window.'));
    assert.ok(emptyHtml.includes('No bookings need attention.'));
  });

  it('per-region error cards when a source is missing', () => {
    const partialVm = buildCommandCenterVM({ bookings: SAMPLE_BOOKINGS }); // no dispatch + no dashboard
    const partialHtml = renderToStaticMarkup(createElement(CommandCenter, { vm: partialVm, activeRange: 'today' }));
    // dispatch region degrades to an error card while the queue still renders
    assert.ok(partialHtml.includes('Couldn'));
    assert.ok(partialHtml.includes('Needs attention'));
    assert.ok(partialHtml.includes('BK-0001'));
  });
});

describe('OpsBetaHeader render — Command Center', () => {
  const headerHtml = renderToStaticMarkup(
    createElement(OpsBetaHeader, {
      breadcrumb: ['Operations', 'Command Center'],
      title: 'Booking Operations',
      classicHref: '/operations/dispatch',
      helper: 'Fleet triage is read-only in V2. Changes are made in Classic.',
    }),
  );
  it('shows Read-only V2 Beta + helper copy', () => {
    assert.ok(headerHtml.includes('Read-only V2 Beta'));
    assert.ok(headerHtml.includes('Fleet triage is read-only in V2. Changes are made in Classic.'));
  });
});
