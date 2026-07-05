import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { PaxRoomingTab } from '../../../components/ops/v2/pax-rooming-tab';
import { PassengerEditorError } from '../../../components/ops/v2/passenger-editor';
import { RoomingEditorError } from '../../../components/ops/v2/rooming-editor';
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

// --- PR-2b: passenger editing surface (flag/role decided server-side) --------

const STUB_ROUTER = { back() {}, forward() {}, push() {}, replace() {}, refresh() {}, prefetch() {} };

function renderTab(detail: Parameters<typeof buildPaxRoomingVM>[0], canEditPassengers: boolean): string {
  return renderToStaticMarkup(
    createElement(
      AppRouterContext.Provider as never,
      { value: STUB_ROUTER } as never,
      createElement(PaxRoomingTab, { vm: buildPaxRoomingVM(detail), bookingId: BK, canEditPassengers }),
    ),
  );
}

const ALLOWED_FIELD_LABELS = [
  'First name',
  'Last name',
  'Title',
  'Nationality',
  'Arrival flight',
  'Departure flight',
  'Dietary notes',
  'Rooming notes',
];

const PII_INPUT_NAMES = [
  'passportNumber',
  'passportIssueDate',
  'passportExpiryDate',
  'dateOfBirth',
  'gender',
  'entryPoint',
  'visaStatus',
  'emergencyContactName',
  'emergencyContactPhone',
];

describe('PaxRoomingTab — passenger editing ON', () => {
  const h = renderTab(SAMPLE_DETAIL, true);

  it('renders add / edit / delete / set-lead controls', () => {
    assert.ok(h.includes('Add passenger'), 'add control missing');
    assert.ok(h.includes('>Edit<'), 'edit control missing');
    assert.ok(h.includes('>Delete<'), 'delete control missing');
    assert.ok(h.includes('>Set lead<'), 'set-lead control missing');
  });

  it('renders only the allowlisted non-PII input fields', () => {
    for (const label of ALLOWED_FIELD_LABELS) {
      assert.ok(h.includes(`aria-label="${label}"`), `missing allowed field ${label}`);
    }
  });

  it('renders NO PII inputs even with editing on', () => {
    for (const name of PII_INPUT_NAMES) {
      assert.ok(!h.includes(`name="${name}"`), `editor rendered a PII input: ${name}`);
    }
    for (const token of ['Passport', 'Date of birth', 'Emergency', 'Visa', 'Gender']) {
      assert.ok(!h.includes(token), `editor leaked a PII label: ${token}`);
    }
  });

  it('introduces no finance/cost/sell/margin fields', () => {
    assert.ok(!/unitSell|unitCost|totalSell|payable|margin|invoice/i.test(h), 'editor leaked a financial key');
  });
});

describe('PaxRoomingTab — passenger editing OFF (default) stays read-only', () => {
  it('renders the read-only manifest table and no editor controls', () => {
    const h = renderTab(SAMPLE_DETAIL, false);
    assert.ok(h.includes('<table'), 'read-only manifest table missing');
    assert.ok(!h.includes('Add passenger'), 'add control leaked when editing off');
    assert.ok(!h.includes('Set lead'), 'set-lead leaked when editing off');
    for (const forbidden of ['<form', '<input', '<button']) {
      assert.ok(!h.includes(forbidden), `read-only tab must not render "${forbidden}"`);
    }
  });
});

describe('PassengerEditorError — inline backend error', () => {
  it('renders the delete-lead guard message as an alert', () => {
    const h = renderToStaticMarkup(
      createElement(PassengerEditorError, { message: 'Set another passenger as lead before deleting the lead passenger.' }),
    );
    assert.ok(h.includes('Set another passenger as lead before deleting the lead passenger.'));
    assert.ok(h.includes('role="alert"'));
  });

  it('renders nothing when there is no error', () => {
    assert.equal(renderToStaticMarkup(createElement(PassengerEditorError, { message: null })), '');
  });
});

// --- PR-2c-1: rooming editing (room CRUD, same edit flag) --------------------

describe('PaxRoomingTab — rooming editing ON (PR-2c-1 CRUD)', () => {
  const h = renderTab(SAMPLE_DETAIL, true);

  it('renders add / edit / delete room controls + occupancy select', () => {
    assert.ok(h.includes('Add room'), 'add-room control missing');
    assert.ok(h.includes('aria-label="Room type"'), 'room type input missing');
    assert.ok(h.includes('aria-label="Occupancy"'), 'occupancy select missing');
    assert.ok(h.includes('<select'), 'occupancy <select> missing');
    assert.ok(h.includes('>Edit<'), 'room edit control missing');
    assert.ok(h.includes('>Delete<'), 'room delete control missing');
  });

  it('does NOT render assignment / auto-assign controls (deferred to PR-2c-2)', () => {
    for (const token of ['Auto-assign', 'Auto-allocate', 'Assign passenger', 'Unassign']) {
      assert.ok(!h.includes(token), `PR-2c-1 must not render "${token}"`);
    }
  });

  it('introduces no finance/cost/sell/margin fields', () => {
    assert.ok(!/unitSell|unitCost|totalSell|payable|margin|invoice/i.test(h), 'rooming editor leaked a financial key');
  });
});

describe('PaxRoomingTab — rooming editing OFF (default) stays read-only', () => {
  it('renders the read-only rooming map and no editor controls', () => {
    const h = renderTab(SAMPLE_DETAIL, false);
    assert.ok(h.includes('DBL'), 'read-only rooming map (room label) missing');
    assert.ok(!h.includes('Add room'), 'add-room leaked when editing off');
    for (const forbidden of ['<form', '<input', '<select', '<button']) {
      assert.ok(!h.includes(forbidden), `read-only tab must not render "${forbidden}"`);
    }
  });
});

describe('RoomingEditorError — inline backend error', () => {
  it('renders the delete-with-occupants guard message as an alert', () => {
    const h = renderToStaticMarkup(
      createElement(RoomingEditorError, { message: 'Unassign passengers from the room before deleting the rooming entry.' }),
    );
    assert.ok(h.includes('Unassign passengers from the room before deleting'));
    assert.ok(h.includes('role="alert"'));
  });

  it('renders nothing when there is no error', () => {
    assert.equal(renderToStaticMarkup(createElement(RoomingEditorError, { message: null })), '');
  });
});
