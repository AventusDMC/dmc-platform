import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { PaxRoomingTab } from '../../../components/ops/v2/pax-rooming-tab';
import { buildPaxRoomingVM } from './ops-pax-rooming-vm';
import { COST_LEAK_VALUE, EMPTY_DETAIL, READY_DETAIL, SAMPLE_DETAIL, WARN_DETAIL } from './ops-pax-rooming.fixtures';

// Components are authored for Next's automatic JSX runtime (no `import React`);
// tsx transpiles with the classic runtime, so expose React for the render.
(globalThis as unknown as { React?: unknown }).React = React;

const BK = 'bk-1';
const vm = buildPaxRoomingVM(SAMPLE_DETAIL);
const html = renderToStaticMarkup(createElement(PaxRoomingTab, { vm, bookingId: BK }));

describe('PaxRoomingTab render — content', () => {
  it('shows the persistent read-only notice', () => {
    assert.ok(html.includes('Passenger and rooming data are read-only in V2. Changes are made in Classic.'));
  });

  it('renders the manifest table with passengers and the lead marker', () => {
    assert.ok(html.includes('<table'));
    assert.ok(html.includes('James Anderson'));
    assert.ok(html.includes('Lead'), 'lead marker missing');
    assert.ok(html.includes('Vegetarian'), 'dietary note missing');
  });

  it('renders the rooming map with validity badges', () => {
    for (const v of ['Valid', 'Mismatch', 'Needs occupancy', 'Assigned']) {
      assert.ok(html.includes(v), `validity "${v}" missing`);
    }
  });

  it('shows section-level Classic links for passengers and rooming', () => {
    assert.ok(html.includes(`href="/bookings/${BK}?tab=passengers"`));
    assert.ok(html.includes(`href="/bookings/${BK}?tab=rooming"`));
    assert.ok(html.includes('Open passengers in Classic'));
    assert.ok(html.includes('Open rooming in Classic'));
  });

  it('renders NO financial values', () => {
    assert.ok(!html.includes(COST_LEAK_VALUE), `pax tab leaked value ${COST_LEAK_VALUE}`);
  });
});

describe('PaxRoomingTab render — read-only guardrails', () => {
  it('renders no edit / auto-assign / form controls', () => {
    for (const forbidden of ['<form', '<input', '<select', '<textarea', '<button', 'Auto-allocate', 'Auto-assign']) {
      assert.ok(!html.includes(forbidden), `pax tab must not render "${forbidden}"`);
    }
  });
});

// --- PR-1 advisory readiness strip (flag-gated) ----------------------------

function renderWithFlag(detail: Parameters<typeof buildPaxRoomingVM>[0], enabled: boolean): string {
  const prev = process.env.NEXT_PUBLIC_OPS_V2_PAX_READINESS;
  if (enabled) process.env.NEXT_PUBLIC_OPS_V2_PAX_READINESS = 'true';
  else delete process.env.NEXT_PUBLIC_OPS_V2_PAX_READINESS;
  try {
    return renderToStaticMarkup(
      createElement(PaxRoomingTab, { vm: buildPaxRoomingVM(detail), bookingId: BK }),
    );
  } finally {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_OPS_V2_PAX_READINESS;
    else process.env.NEXT_PUBLIC_OPS_V2_PAX_READINESS = prev;
  }
}

describe('PaxRoomingTab render — readiness strip (flag ON)', () => {
  it('renders advisory warning badges for a booking with issues', () => {
    const h = renderWithFlag(WARN_DETAIL, true);
    assert.ok(h.includes('missing a passport'), 'missing-passport badge missing');
    assert.ok(h.includes('expiring within 6 months'), 'passport-expiry badge missing');
    assert.ok(h.includes('no passengers'), 'empty-rooms badge missing');
    assert.ok(h.includes('not assigned to a room'), 'unassigned badge missing');
  });

  it('renders per-row passport chips', () => {
    const h = renderWithFlag(WARN_DETAIL, true);
    assert.ok(h.includes('No passport'), 'No passport chip missing');
    assert.ok(h.includes('Passport expiring'), 'Passport expiring chip missing');
  });

  it('shows the clean ready state when there are no warnings', () => {
    const h = renderWithFlag(READY_DETAIL, true);
    assert.ok(h.includes('Manifest') && h.includes('rooming ready'), 'ready affirmative missing');
    assert.ok(!h.includes('No passport'), 'no passport chip should not appear when clean');
  });

  it('renders no form controls even with the strip enabled', () => {
    const h = renderWithFlag(WARN_DETAIL, true);
    for (const forbidden of ['<form', '<input', '<select', '<textarea', '<button']) {
      assert.ok(!h.includes(forbidden), `strip must not render "${forbidden}"`);
    }
  });
});

describe('PaxRoomingTab render — readiness strip (flag OFF default)', () => {
  it('renders neither the strip nor per-row chips when the flag is unset', () => {
    const h = renderWithFlag(WARN_DETAIL, false);
    assert.ok(!h.includes('No passport'), 'chip leaked with flag off');
    assert.ok(!h.includes('Passport expiring'), 'chip leaked with flag off');
    assert.ok(!h.includes('missing a passport'), 'strip badge leaked with flag off');
    assert.ok(!h.includes('Manifest &amp; rooming ready'), 'ready strip leaked with flag off');
  });
});

describe('PaxRoomingTab render — empty states', () => {
  const emptyHtml = renderToStaticMarkup(
    createElement(PaxRoomingTab, { vm: buildPaxRoomingVM(EMPTY_DETAIL), bookingId: BK }),
  );
  it('shows passenger + rooming empty states', () => {
    assert.ok(emptyHtml.includes('No passengers recorded yet.'));
    assert.ok(emptyHtml.includes('No rooming entries created'));
  });
  it('still shows the read-only notice and Classic links when empty', () => {
    assert.ok(emptyHtml.includes('read-only in V2'));
    assert.ok(emptyHtml.includes(`href="/bookings/${BK}?tab=passengers"`));
  });
});
