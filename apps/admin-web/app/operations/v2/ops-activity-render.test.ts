import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { ActivityTab } from '../../../components/ops/v2/activity-tab';
import { buildActivityVM } from './ops-activity-vm';
import {
  EMPTY_ACTIVITY,
  REDACTED_RAW,
  SAMPLE_ACTIVITY,
  SUPPLIER_ASSIGN_ACTIVITY,
  SUPPLIER_ASSIGN_UUID,
} from './ops-activity.fixtures';

// Components are authored for Next's automatic JSX runtime (no `import React`);
// tsx transpiles with the classic runtime, so expose React for the render.
(globalThis as unknown as { React?: unknown }).React = React;

const BK = 'bk-1';
const html = renderToStaticMarkup(
  createElement(ActivityTab, { vm: buildActivityVM(SAMPLE_ACTIVITY), bookingId: BK }),
);

describe('ActivityTab render — content', () => {
  it('shows the persistent read-only notice', () => {
    assert.ok(html.includes('Audit and dispatch events are read-only in V2. Changes are made in Classic.'));
  });

  it('renders the timeline with action labels', () => {
    assert.ok(html.includes('<ol'));
    assert.ok(html.includes('Pickup Time Updated'));
    assert.ok(html.includes('08:00 → 09:00'));
  });

  it('shows the section-level Classic audit link', () => {
    assert.ok(html.includes(`href="/bookings/${BK}?tab=audit-log"`));
    assert.ok(html.includes('Open audit log in Classic'));
  });

  it('shows "Value updated" for redacted entries', () => {
    assert.ok(html.includes('Value updated'));
  });
});

describe('ActivityTab render — data safety', () => {
  it('renders no raw JSON or financial / reference values', () => {
    for (const raw of REDACTED_RAW) {
      assert.ok(!html.includes(raw), `activity tab leaked redacted value "${raw}"`);
    }
    assert.ok(!html.includes('bar'), 'rendered a JSON blob value');
  });

  it('renders no edit / form / mutation controls', () => {
    for (const forbidden of ['<form', '<input', '<select', '<textarea', '<button', 'Resend', 'Replay', 'Revert', 'Export', 'Download']) {
      assert.ok(!html.includes(forbidden), `activity tab must not render "${forbidden}"`);
    }
  });
});

describe('ActivityTab render — supplier UUID hidden', () => {
  const saHtml = renderToStaticMarkup(
    createElement(ActivityTab, { vm: buildActivityVM(SUPPLIER_ASSIGN_ACTIVITY), bookingId: BK }),
  );
  it('shows the supplier name but not the internal UUID', () => {
    assert.ok(saHtml.includes('Almushtari Logistics Services'), 'supplier name should be visible');
    assert.ok(!saHtml.includes(SUPPLIER_ASSIGN_UUID), 'internal UUID must not render');
    assert.ok(saHtml.includes('Internal reference updated'), 'bare-UUID value shows the fallback');
  });
});

describe('ActivityTab render — empty state', () => {
  const emptyHtml = renderToStaticMarkup(
    createElement(ActivityTab, { vm: buildActivityVM(EMPTY_ACTIVITY), bookingId: BK }),
  );
  it('shows the empty state and keeps notice + Classic link', () => {
    assert.ok(emptyHtml.includes('No activity logged yet.'));
    assert.ok(emptyHtml.includes('read-only in V2'));
    assert.ok(emptyHtml.includes(`href="/bookings/${BK}?tab=audit-log"`));
  });
});
