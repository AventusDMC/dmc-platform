import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { OpsBoard } from '../../../components/ops/v2/ops-board';
import { OpsBetaHeader } from '../../../components/ops/v2/ops-beta-header';
import { buildOperationsBoardVM } from './ops-view-model';
import { COST_LEAK_VALUES, SAMPLE_GRID, SAMPLE_READINESS } from './ops-view-model.fixtures';

// The V2 components are authored for Next's AUTOMATIC JSX runtime (no `import
// React`), which is correct in production. Under tsx/esbuild the test harness
// transpiles their JSX with the CLASSIC runtime (React.createElement), so we
// expose React on the global for the render below. Test-only shim — it does not
// change how the components compile in the Next build.
(globalThis as unknown as { React?: unknown }).React = React;

const vm = buildOperationsBoardVM(SAMPLE_GRID, SAMPLE_READINESS);
const html = renderToStaticMarkup(createElement(OpsBoard, { vm }));

/** HTML of one phase <section aria-label="..."> up to its closing tag. */
function sectionOf(phase: string): string {
  const start = html.indexOf(`aria-label="${phase}"`);
  assert.notEqual(start, -1, `expected a section for phase "${phase}"`);
  const end = html.indexOf('</section>', start);
  return html.slice(start, end === -1 ? undefined : end);
}

describe('OpsBoard render — phases', () => {
  it('renders all 5 phase headings in fixed order', () => {
    const phases = ['Critical Issues', 'Needs Assignment', 'Needs Confirmation', 'Ready for Voucher', 'Operationally Ready'];
    const indices = phases.map((p) => html.indexOf(`aria-label="${p}"`));
    for (const i of indices) assert.notEqual(i, -1);
    const sorted = [...indices].sort((a, b) => a - b);
    assert.deepEqual(indices, sorted, 'phase sections are not in fixed order');
  });

  it('rejected supplier row sits under Critical Issues with named rejection context', () => {
    const critical = sectionOf('Critical Issues');
    assert.ok(critical.includes('operation-row-critical'), 'rejected row not in Critical Issues');
    assert.ok(critical.includes('Almushtari Logistics'), 'named supplier missing from rejected row');
    assert.ok(critical.includes('Rejected'), 'rejection context missing');
  });

  it('unassigned row sits under Needs Assignment with confirmation "Not Sent"', () => {
    const section = sectionOf('Needs Assignment');
    assert.ok(section.includes('operation-row-unassigned'));
    assert.ok(section.includes('Not Sent'), 'expected "Not Sent" confirmation label');
    assert.ok(section.includes('Unassigned'), 'expected "Unassigned" supplier label');
  });

  it('confirmed/no-voucher row sits under Ready for Voucher', () => {
    assert.ok(sectionOf('Ready for Voucher').includes('operation-row-voucher'));
  });

  it('confirmed/voucher-issued row sits under Operationally Ready', () => {
    assert.ok(sectionOf('Operationally Ready').includes('operation-row-ready'));
  });
});

describe('OpsBoard render — read-only guardrails', () => {
  it('renders disabled action buttons labelled "Coming later"', () => {
    assert.ok(html.includes('Assign supplier'));
    assert.ok(html.includes('Coming later'));
    assert.ok(html.includes('aria-disabled="true"'));
    assert.ok(html.includes('disabled'));
    // No form / no submit affordance in the rendered board.
    assert.ok(!html.includes('<form'), 'board must not render a form');
  });

  it('renders NO cost/sell/payable values', () => {
    for (const v of COST_LEAK_VALUES) {
      assert.ok(!html.includes(v), `rendered board leaked cost value ${v}`);
    }
  });
});

describe('OpsBetaHeader render — Classic fallback + beta label', () => {
  const headerHtml = renderToStaticMarkup(
    createElement(OpsBetaHeader, {
      breadcrumb: ['Operations', 'Command Center', 'BK-2026-0004'],
      title: 'Booking Operations',
      classicHref: '/bookings/bk-1/operations',
      classicLabel: 'Open in Classic',
    }),
  );

  it('shows the "Read-only V2 Beta" label', () => {
    assert.ok(headerHtml.includes('Read-only V2 Beta'));
  });

  it('shows an "Open in Classic" link to the Classic operations grid', () => {
    assert.ok(headerHtml.includes('Open in Classic'));
    assert.ok(headerHtml.includes('href="/bookings/bk-1/operations"'));
  });
});
