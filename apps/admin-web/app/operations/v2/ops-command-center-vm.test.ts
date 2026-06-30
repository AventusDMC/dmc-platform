import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildCommandCenterVM } from './ops-command-center-vm';
import { CC_REDACTED_RAW, EMPTY_DISPATCH, SAMPLE_BOOKINGS, SAMPLE_DASHBOARD, SAMPLE_DISPATCH } from './ops-command-center.fixtures';

describe('command-center-vm — KPIs', () => {
  const vm = buildCommandCenterVM({ dispatch: SAMPLE_DISPATCH, dashboard: SAMPLE_DASHBOARD, bookings: SAMPLE_BOOKINGS });
  const byKey = Object.fromEntries(vm.kpis.map((k) => [k.key, k.value]));

  it('maps dispatch counters into the 8 KPIs', () => {
    assert.equal(byKey['critical_issues'], 2);
    assert.equal(byKey['missing_suppliers'], 3);
    assert.equal(byKey['pending_confirmations'], 5);
    assert.equal(byKey['vouchers_pending'], 4);
    assert.equal(byKey['ready_for_dispatch'], 8);
    assert.equal(byKey['arrivals_today'], 1);
    assert.equal(byKey['in_progress'], 2);
    assert.equal(byKey['delayed'], 1);
    assert.equal(vm.kpisAvailable, true);
  });

  it('falls back to dashboard kpis when dispatch is missing', () => {
    const vm2 = buildCommandCenterVM({ dashboard: SAMPLE_DASHBOARD, bookings: SAMPLE_BOOKINGS });
    const k = Object.fromEntries(vm2.kpis.map((x) => [x.key, x.value]));
    assert.equal(k['missing_suppliers'], 3); // dashboard.unassignedSuppliers
    assert.equal(k['pending_confirmations'], 5); // dashboard.servicesPendingConfirmation
    assert.equal(k['ready_for_dispatch'], null); // no dashboard equivalent
    assert.equal(vm2.kpisAvailable, true);
    assert.equal(vm2.dispatchAvailable, false);
  });
});

describe('command-center-vm — dispatch summary', () => {
  it('maps counters + lanes + range label', () => {
    const vm = buildCommandCenterVM({ dispatch: SAMPLE_DISPATCH, bookings: [] });
    assert.equal(vm.dispatch?.rangeLabel, 'Today');
    assert.equal(vm.dispatch?.totalRows, 20);
    assert.equal(vm.dispatch?.readyPct, 65);
    assert.deepEqual(vm.dispatch?.lanes.map((l) => l.label), ['Arrivals', 'Transport', 'Guides']);
    assert.equal(vm.dispatch?.isEmpty, false);
  });
  it('empty dispatch → isEmpty true', () => {
    const vm = buildCommandCenterVM({ dispatch: EMPTY_DISPATCH, bookings: [] });
    assert.equal(vm.dispatch?.isEmpty, true);
  });
});

describe('command-center-vm — queue', () => {
  const vm = buildCommandCenterVM({ dispatch: SAMPLE_DISPATCH, dashboard: SAMPLE_DASHBOARD, bookings: SAMPLE_BOOKINGS });

  it('excludes cancelled + completed; keeps active', () => {
    const ids = vm.queue.rows.map((r) => r.id);
    assert.ok(!ids.includes('b-cancelled'));
    assert.ok(!ids.includes('b-completed'));
    assert.equal(vm.queue.totalCount, 3);
  });

  it('risk-sorts most-blocked first, ready last', () => {
    assert.deepEqual(vm.queue.rows.map((r) => r.id), ['b-high', 'b-draft', 'b-low']);
  });

  it('maps allowlisted row fields + blocker chips', () => {
    const top = vm.queue.rows[0];
    assert.equal(top.bookingRef, 'BK-0001');
    assert.equal(top.title, 'Amman + Petra');
    assert.equal(top.client, 'Anderson Family');
    assert.equal(top.pax, 4);
    assert.equal(top.status, 'Confirmed');
    assert.equal(top.invoiceStatus, 'Invoiced');
    assert.equal(top.supplierPaymentStatus, 'Unpaid');
    assert.ok(top.blockers.includes('3 confirmations pending'));
    assert.ok(top.blockers.includes('2 unassigned pax'));
    assert.ok(top.blockers.includes('1 finance flag'));
    assert.ok(/2 Jul 2026/.test(top.dateLabel || ''));
  });

  it('caps the queue and reports N of M', () => {
    const capped = buildCommandCenterVM({ dispatch: SAMPLE_DISPATCH, bookings: SAMPLE_BOOKINGS, cap: 2 });
    assert.equal(capped.queue.shownCount, 2);
    assert.equal(capped.queue.totalCount, 3);
    assert.equal(capped.queue.capped, true);
  });

  it('NEVER carries injected financial values through the allowlist', () => {
    const serialized = JSON.stringify(vm);
    for (const raw of CC_REDACTED_RAW) {
      assert.ok(!serialized.includes(raw), `command-center VM leaked "${raw}"`);
    }
  });
});

describe('command-center-vm — sidebar', () => {
  const vm = buildCommandCenterVM({ dispatch: SAMPLE_DISPATCH, dashboard: SAMPLE_DASHBOARD, bookings: SAMPLE_BOOKINGS });
  it('fleet readiness + blocking items + next action', () => {
    assert.equal(vm.sidebar.fleetReadinessPct, 65);
    assert.equal(vm.sidebar.bookingsInOperation, 6);
    const labels = vm.sidebar.blockingItems.map((b) => b.label);
    assert.ok(labels.includes('Critical issues'));
    assert.ok(labels.includes('Missing suppliers'));
    assert.ok(!labels.includes('Arrivals today')); // informational KPIs excluded
    assert.equal(vm.sidebar.nextAction?.bookingId, 'b-high');
    assert.equal(vm.sidebar.nextAction?.classicHref, '/bookings/b-high/operations');
  });
});

describe('command-center-vm — missing data', () => {
  it('all sources missing → no throw, regions unavailable', () => {
    const vm = buildCommandCenterVM({});
    assert.equal(vm.kpisAvailable, false);
    assert.equal(vm.dispatchAvailable, false);
    assert.equal(vm.queueAvailable, false);
    assert.equal(vm.kpis.length, 8);
    assert.equal(vm.queue.rows.length, 0);
  });
});
