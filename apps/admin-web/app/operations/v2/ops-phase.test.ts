import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeActionCenter,
  getRowPhase,
  getRowReadiness,
  PHASES,
} from './ops-phase';
import { ACTION_CENTER_ROWS, ROW_CASES } from './ops-phase.fixtures';

// Pinning tests: lock V2's derived output to the current Classic semantics
// (apps/admin-web/app/bookings/[id]/operations/page.tsx). A change that breaks
// any of these is a divergence from Classic and must be deliberate.

describe('ops-phase — per-row phase / readiness / severity (pinned to Classic)', () => {
  for (const { name, row, expected } of ROW_CASES) {
    it(name, () => {
      assert.equal(getRowPhase(row), expected.phase);
      const { readiness, severity, reasons } = getRowReadiness(row);
      assert.equal(readiness, expected.readiness);
      assert.equal(severity, expected.severity);
      for (const reason of expected.reasonsInclude) {
        assert.ok(reasons.includes(reason), `expected reasons to include "${reason}", got ${JSON.stringify(reasons)}`);
      }
    });
  }

  it('rejected critical row carries a named supplier for context (display layer)', () => {
    const rejected = ROW_CASES.find((c) => c.expected.phase === 'Critical Issues' && c.row.supplierConfirmationStatus === 'REJECTED');
    assert.ok(rejected, 'expected a rejected-supplier fixture');
    assert.ok(
      rejected!.row.assignedSupplierName || rejected!.row.supplierName,
      'rejected critical row should expose a supplier name for the UI to show',
    );
  });
});

describe('ops-phase — action center (pinned to Classic page.tsx:548-569)', () => {
  it('counts each action item and readiness % from the mixed row set', () => {
    const ac = computeActionCenter(ACTION_CENTER_ROWS, undefined, 0);
    const byLabel = Object.fromEntries(ac.actionItems.map((a) => [a.label, a]));

    assert.equal(byLabel['Suppliers unassigned'].count, 1);
    assert.equal(byLabel['Confirmations pending'].count, 1);
    assert.equal(byLabel['Confirmations rejected'].count, 0);
    assert.equal(byLabel['Vouchers pending'].count, 1);

    // 1 Operationally Ready out of 4 rows → 25%
    assert.equal(ac.readinessPercent, 25);
  });

  it('action-item severities match Classic (rejected=CRITICAL, others ACTION REQUIRED, manifest/rooming INFO)', () => {
    const ac = computeActionCenter(ACTION_CENTER_ROWS, undefined, 0);
    const byLabel = Object.fromEntries(ac.actionItems.map((a) => [a.label, a]));
    assert.equal(byLabel['Suppliers unassigned'].severity, 'ACTION REQUIRED');
    assert.equal(byLabel['Confirmations pending'].severity, 'ACTION REQUIRED');
    assert.equal(byLabel['Confirmations rejected'].severity, 'CRITICAL');
    assert.equal(byLabel['Vouchers pending'].severity, 'ACTION REQUIRED');
    assert.equal(byLabel['Manifest incomplete'].severity, 'INFO');
    assert.equal(byLabel['Rooming incomplete'].severity, 'INFO');
  });

  it('manifest incomplete: INCOMPLETE status, names pending, or incompleteRecords>0 all flag incomplete', () => {
    const rows = ACTION_CENTER_ROWS;
    assert.equal(
      computeActionCenter(rows, { status: 'INCOMPLETE', expected: 4, received: 2, missingRecords: 2, incompleteRecords: 0, namesPending: false, voucherReady: false }, 0).manifestIncomplete,
      true,
    );
    assert.equal(
      computeActionCenter(rows, { status: 'COMPLETE', expected: 4, received: 4, missingRecords: 0, incompleteRecords: 0, namesPending: true, voucherReady: false }, 0).manifestIncomplete,
      true,
    );
    assert.equal(
      computeActionCenter(rows, { status: 'COMPLETE', expected: 4, received: 4, missingRecords: 0, incompleteRecords: 1, namesPending: false, voucherReady: true }, 0).manifestIncomplete,
      true,
    );
    // Fully complete → not incomplete
    assert.equal(
      computeActionCenter(rows, { status: 'COMPLETE', expected: 4, received: 4, missingRecords: 0, incompleteRecords: 0, namesPending: false, voucherReady: true }, 0).manifestIncomplete,
      false,
    );
    // Manifest item count is 1 when incomplete, 0 when complete
    assert.equal(
      computeActionCenter(rows, { status: 'INCOMPLETE', expected: 4, received: 2, missingRecords: 2, incompleteRecords: 0, namesPending: false, voucherReady: false }, 0)
        .actionItems.find((a) => a.label === 'Manifest incomplete')!.count,
      1,
    );
  });

  it('rooming incomplete count passes through from the booking-readiness badge', () => {
    const ac = computeActionCenter(ACTION_CENTER_ROWS, undefined, 3);
    assert.equal(ac.roomingIncompleteCount, 3);
    assert.equal(ac.actionItems.find((a) => a.label === 'Rooming incomplete')!.count, 3);
  });

  it('groups rows under the fixed 5-phase order', () => {
    const ac = computeActionCenter(ACTION_CENTER_ROWS, undefined, 0);
    assert.deepEqual(ac.groupedRows.map((g) => g.phase), PHASES);
    // every row lands in exactly one phase group
    const grouped = ac.groupedRows.reduce((n, g) => n + g.rows.length, 0);
    assert.equal(grouped, ACTION_CENTER_ROWS.length);
  });

  it('readiness % is 0 for an empty row set (no divide-by-zero)', () => {
    assert.equal(computeActionCenter([], undefined, 0).readinessPercent, 0);
  });
});
