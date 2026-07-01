import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PHASES } from './ops-phase';
import { buildOperationsBoardVM } from './ops-view-model';
import { COST_LEAK_VALUES, SAMPLE_GRID, SAMPLE_READINESS } from './ops-view-model.fixtures';

describe('ops-view-model — board mapping', () => {
  const vm = buildOperationsBoardVM(SAMPLE_GRID, SAMPLE_READINESS);

  it('emits the 5 phases in fixed order', () => {
    assert.deepEqual(vm.phases.map((p) => p.phase), PHASES);
  });

  it('buckets each fixture row into the right phase', () => {
    const byPhase = Object.fromEntries(vm.phases.map((p) => [p.phase, p.rows.map((r) => r.id)]));
    assert.deepEqual(byPhase['Critical Issues'], ['row-critical']);
    assert.deepEqual(byPhase['Needs Assignment'], ['row-unassigned']);
    assert.deepEqual(byPhase['Needs Confirmation'], ['row-requested']);
    assert.deepEqual(byPhase['Ready for Voucher'], ['row-voucher']);
    assert.deepEqual(byPhase['Operationally Ready'], ['row-ready']);
  });

  it('maps display-safe badges + supplier label per row', () => {
    const all = vm.phases.flatMap((p) => p.rows);
    const byId = Object.fromEntries(all.map((r) => [r.id, r]));

    assert.equal(byId['row-critical'].confirmation.label, 'Rejected');
    assert.equal(byId['row-critical'].confirmation.variant, 'critical');
    assert.equal(byId['row-critical'].isRejected, true);
    assert.equal(byId['row-critical'].supplierLabel, 'Almushtari Logistics');

    assert.equal(byId['row-unassigned'].confirmation.label, 'Not Sent');
    assert.equal(byId['row-unassigned'].supplierLabel, null);

    assert.equal(byId['row-voucher'].voucher.label, 'Not Generated');
    assert.equal(byId['row-ready'].voucher.label, 'Issued');
    assert.equal(byId['row-ready'].voucher.variant, 'success');
  });

  it('derives readiness % (1 of 5 ready → 20%) and manifest/rooming flags', () => {
    assert.equal(vm.summary.readinessPercent, 20);
    assert.equal(vm.summary.manifestIncomplete, true);
    assert.equal(vm.summary.roomingIncompleteCount, 2);
    assert.equal(vm.manifest?.incomplete, true);
    assert.equal(vm.manifest?.received, 3);
    assert.equal(vm.manifest?.expected, 4);
  });

  it('carries booking status through for the header pill', () => {
    assert.equal(vm.booking.status, 'confirmed');
    assert.equal(vm.booking.bookingRef, 'BK-2026-0004');
  });

  it('carries assignedSupplierId + assignmentStatus (identifiers only) for Phase 2A', () => {
    const byId = Object.fromEntries(vm.phases.flatMap((p) => p.rows).map((r) => [r.id, r]));
    assert.equal(byId['row-critical'].assignedSupplierId, 'sup-2');
    assert.equal(byId['row-critical'].assignmentStatus, 'ASSIGNED');
    assert.equal(byId['row-unassigned'].assignedSupplierId, null);
    assert.equal(byId['row-unassigned'].assignmentStatus, 'UNASSIGNED');
    // The added fields are identifiers/status only — no cost/sell/payable keys.
    for (const r of vm.phases.flatMap((p) => p.rows)) {
      for (const k of ['cost', 'sell', 'payable', 'price', 'margin', 'amount', 'rate']) {
        assert.ok(!(k in r), `row leaked a financial key "${k}"`);
      }
    }
  });

  it('NEVER carries cost/sell/payable into the VM (allowlist mapping)', () => {
    const serialized = JSON.stringify(vm);
    for (const v of COST_LEAK_VALUES) {
      assert.ok(!serialized.includes(v), `view model leaked cost value ${v}`);
    }
  });
});
