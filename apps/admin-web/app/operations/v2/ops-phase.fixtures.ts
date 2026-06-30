/**
 * Pinning fixtures for ops-phase.ts.
 *
 * Each row fixture encodes one of the required Round-1 scenarios together with
 * the EXACT output the Classic Operational Service Grid produces today
 * (apps/admin-web/app/bookings/[id]/operations/page.tsx). If a future change to
 * ops-phase.ts alters any of these, the pinning test fails — that is the point:
 * V2 must not silently diverge from Classic semantics in Round 1.
 *
 * Note on "open issue / critical state": the operations-grid API does NOT carry
 * an execution-level ISSUE field (executionStatus lives on the dispatch
 * endpoint, out of Round-1 grid scope). In the grid's phase model the only
 * Critical states are (a) rejected supplier confirmation and (b) missing
 * operational date/time. Both are pinned below.
 */
import type { OpsGridRow, Phase, Readiness, Severity } from './ops-phase';

export type RowCase = {
  name: string;
  row: OpsGridRow;
  expected: { phase: Phase; readiness: Readiness; severity: Severity; reasonsInclude: string[] };
};

const baseTiming = { operationalDate: '2026-07-04', operationalTime: '09:00' };

export const ROW_CASES: RowCase[] = [
  {
    name: 'unassigned supplier → Needs Assignment / confirmation NOT_SENT',
    row: {
      id: 'r1',
      assignedSupplierId: null,
      supplierId: null,
      assignmentStatus: 'UNASSIGNED',
      supplierConfirmationStatus: 'NOT_SENT',
      voucherStatus: 'NOT_GENERATED',
      ...baseTiming,
    },
    expected: {
      phase: 'Needs Assignment',
      readiness: 'Blocked',
      severity: 'ACTION REQUIRED',
      reasonsInclude: ['Supplier unassigned'],
    },
  },
  {
    name: 'supplier request sent → Needs Confirmation / REQUESTED',
    row: {
      id: 'r2',
      assignedSupplierId: 'sup-1',
      assignmentStatus: 'ASSIGNED',
      supplierConfirmationStatus: 'REQUESTED',
      voucherStatus: 'NOT_GENERATED',
      ...baseTiming,
    },
    expected: {
      phase: 'Needs Confirmation',
      readiness: 'Pending',
      severity: 'ACTION REQUIRED',
      reasonsInclude: ['Supplier confirmation pending'],
    },
  },
  {
    name: 'supplier rejected → Critical Issues with named supplier',
    row: {
      id: 'r3',
      assignedSupplierId: 'sup-2',
      assignedSupplierName: 'Almushtari Logistics',
      assignmentStatus: 'ASSIGNED',
      supplierConfirmationStatus: 'REJECTED',
      voucherStatus: 'NOT_GENERATED',
      ...baseTiming,
    },
    expected: {
      phase: 'Critical Issues',
      readiness: 'Critical',
      severity: 'CRITICAL',
      reasonsInclude: ['Rejected supplier confirmation'],
    },
  },
  {
    name: 'confirmed but no voucher → Ready for Voucher',
    row: {
      id: 'r4',
      assignedSupplierId: 'sup-3',
      assignmentStatus: 'ASSIGNED',
      supplierConfirmationStatus: 'CONFIRMED',
      voucherStatus: 'NOT_GENERATED',
      ...baseTiming,
    },
    expected: {
      phase: 'Ready for Voucher',
      readiness: 'Pending',
      severity: 'ACTION REQUIRED',
      reasonsInclude: ['Voucher pending'],
    },
  },
  {
    name: 'confirmed + voucher issued + no blockers → Operationally Ready',
    row: {
      id: 'r5',
      assignedSupplierId: 'sup-4',
      assignmentStatus: 'ASSIGNED',
      supplierConfirmationStatus: 'CONFIRMED',
      voucherStatus: 'ISSUED',
      ...baseTiming,
    },
    expected: {
      phase: 'Operationally Ready',
      readiness: 'Ready',
      severity: 'INFO',
      reasonsInclude: ['Operationally ready'],
    },
  },
  {
    name: 'open issue / critical state → missing operational timing → Critical Issues',
    row: {
      id: 'r6',
      assignedSupplierId: 'sup-5',
      assignmentStatus: 'ASSIGNED',
      supplierConfirmationStatus: 'CONFIRMED',
      voucherStatus: 'ISSUED',
      operationalDate: '2026-07-04',
      operationalTime: null,
    },
    expected: {
      phase: 'Critical Issues',
      readiness: 'Critical',
      severity: 'CRITICAL',
      reasonsInclude: ['Missing operational date or time'],
    },
  },
];

/** A mixed row set for action-center pinning (1 ready of 4 → 25%). */
export const ACTION_CENTER_ROWS: OpsGridRow[] = [
  // Operationally Ready (the only "Ready")
  {
    id: 'a1',
    assignedSupplierId: 'sup-1',
    assignmentStatus: 'ASSIGNED',
    supplierConfirmationStatus: 'CONFIRMED',
    voucherStatus: 'ISSUED',
    ...baseTiming,
  },
  // Vouchers pending (assigned + confirmed + voucher NOT_GENERATED)
  {
    id: 'a2',
    assignedSupplierId: 'sup-2',
    assignmentStatus: 'ASSIGNED',
    supplierConfirmationStatus: 'CONFIRMED',
    voucherStatus: 'NOT_GENERATED',
    ...baseTiming,
  },
  // Confirmation pending (assigned + REQUESTED)
  {
    id: 'a3',
    assignedSupplierId: 'sup-3',
    assignmentStatus: 'ASSIGNED',
    supplierConfirmationStatus: 'REQUESTED',
    voucherStatus: 'NOT_GENERATED',
    ...baseTiming,
  },
  // Supplier unassigned
  {
    id: 'a4',
    assignedSupplierId: null,
    supplierId: null,
    assignmentStatus: 'UNASSIGNED',
    supplierConfirmationStatus: 'NOT_SENT',
    voucherStatus: 'NOT_GENERATED',
    ...baseTiming,
  },
];
