/**
 * Booking Operations V2 — phase / readiness / severity / action-center derivation.
 *
 * ROUND 1 POLICY (copy-with-pinning-test):
 * This module is a VERBATIM PORT of the Classic Operational Service Grid logic.
 * The operations-grid API (`GET /bookings/:id/operations-grid`) returns RAW
 * service rows — it does NOT carry phase, readiness, severity, a reason list, or
 * action-center counts. Those are derived on the client. We deliberately copy
 * that derivation here (rather than make Classic import shared code yet) so V2
 * stays decoupled from Classic in this first pass. The accompanying pinning
 * tests (ops-phase.test.ts) lock this output to the current Classic semantics.
 *
 * SOURCE OF TRUTH (do not diverge without updating the pinning tests):
 *   apps/admin-web/app/bookings/[id]/operations/page.tsx
 *     - predicates ............ lines 201-219
 *     - getRowReadiness ....... lines 221-242
 *     - getRowPhase ........... lines 244-250
 *     - action-center counts .. lines 548-569
 *
 * A true shared module (Classic + V2 importing one source) is a deliberate
 * later, no-behavior-change refactor — NOT part of Round 1.
 *
 * Pure module: no React, no I/O, no mutation. Safe to unit-test in isolation.
 */

/** Structural subset of an operations-grid row used by the derivation. */
export type OpsGridRow = {
  id: string;
  supplierId?: string | null;
  assignedSupplierId?: string | null;
  assignmentStatus?: string | null;
  supplierConfirmationStatus?: string | null;
  voucherStatus?: string | null;
  operationalDate?: string | null;
  operationalTime?: string | null;
  /** Display-only context for the Critical "rejected" case (named supplier). */
  supplierName?: string | null;
  assignedSupplierName?: string | null;
};

export type OpsManifest = {
  status: 'PENDING' | 'INCOMPLETE' | 'COMPLETE' | string;
  expected: number;
  received: number;
  missingRecords: number;
  incompleteRecords: number;
  namesPending: boolean;
  voucherReady: boolean;
} | null
  | undefined;

export type Severity = 'INFO' | 'ACTION REQUIRED' | 'CRITICAL';
export type Readiness = 'Ready' | 'Pending' | 'Blocked' | 'Critical';
export type Phase =
  | 'Critical Issues'
  | 'Needs Assignment'
  | 'Needs Confirmation'
  | 'Ready for Voucher'
  | 'Operationally Ready';

/** Fixed, server-given order. Ported from page.tsx:100. */
export const PHASES: Phase[] = [
  'Critical Issues',
  'Needs Assignment',
  'Needs Confirmation',
  'Ready for Voucher',
  'Operationally Ready',
];

// --- Predicates (verbatim port of page.tsx:201-219) ---

export function isAssigned(row: OpsGridRow): boolean {
  return (
    Boolean(row.assignedSupplierId || row.supplierId) &&
    String(row.assignmentStatus || '').toUpperCase() !== 'UNASSIGNED'
  );
}

export function isConfirmationRejected(row: OpsGridRow): boolean {
  return String(row.supplierConfirmationStatus || '').toUpperCase() === 'REJECTED';
}

export function isConfirmationConfirmed(row: OpsGridRow): boolean {
  return String(row.supplierConfirmationStatus || '').toUpperCase() === 'CONFIRMED';
}

export function isVoucherPending(row: OpsGridRow): boolean {
  return !['GENERATED', 'SENT', 'ISSUED'].includes(String(row.voucherStatus || '').toUpperCase());
}

export function isTimingMissing(row: OpsGridRow): boolean {
  return !row.operationalDate || !row.operationalTime;
}

// --- Readiness / severity (verbatim port of page.tsx:221-242) ---

export function getRowReadiness(row: OpsGridRow): {
  readiness: Readiness;
  severity: Severity;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (isConfirmationRejected(row)) reasons.push('Rejected supplier confirmation');
  if (isTimingMissing(row)) reasons.push('Missing operational date or time');
  if (!isAssigned(row)) reasons.push('Supplier unassigned');
  if (isAssigned(row) && !isConfirmationConfirmed(row) && !isConfirmationRejected(row))
    reasons.push('Supplier confirmation pending');
  if (isAssigned(row) && isConfirmationConfirmed(row) && isVoucherPending(row))
    reasons.push('Voucher pending');

  if (isConfirmationRejected(row) || isTimingMissing(row)) {
    return { readiness: 'Critical', severity: 'CRITICAL', reasons };
  }

  if (!isAssigned(row)) {
    return { readiness: 'Blocked', severity: 'ACTION REQUIRED', reasons };
  }

  if (!isConfirmationConfirmed(row) || isVoucherPending(row)) {
    return { readiness: 'Pending', severity: 'ACTION REQUIRED', reasons };
  }

  return { readiness: 'Ready', severity: 'INFO', reasons: ['Operationally ready'] };
}

// --- Phase (verbatim port of page.tsx:244-250) ---

export function getRowPhase(row: OpsGridRow): Phase {
  if (isConfirmationRejected(row) || isTimingMissing(row)) return 'Critical Issues';
  if (!isAssigned(row)) return 'Needs Assignment';
  if (!isConfirmationConfirmed(row)) return 'Needs Confirmation';
  if (isVoucherPending(row)) return 'Ready for Voucher';
  return 'Operationally Ready';
}

export type ActionItem = { label: string; count: number; severity: Severity };

export type ActionCenter = {
  readinessPercent: number;
  manifestIncomplete: boolean;
  roomingIncompleteCount: number;
  actionItems: ActionItem[];
  groupedRows: { phase: Phase; rows: OpsGridRow[] }[];
};

/**
 * Action-center counts, readiness %, manifest/rooming flags and phase grouping.
 * Verbatim port of page.tsx:548-569. `roomingIncompleteCount` comes from the
 * booking-readiness rooming badge (`bookingReadiness.rooming.badge.count`),
 * which lives on `GET /bookings/:id` — the caller passes it in.
 */
export function computeActionCenter(
  rows: OpsGridRow[],
  manifest: OpsManifest,
  roomingIncompleteCount: number,
): ActionCenter {
  const suppliersUnassignedRows = rows.filter((row) => !isAssigned(row));
  const confirmationsRejectedRows = rows.filter(isConfirmationRejected);
  const confirmationsPendingRows = rows.filter(
    (row) => isAssigned(row) && !isConfirmationConfirmed(row) && !isConfirmationRejected(row),
  );
  const vouchersPendingRows = rows.filter(
    (row) => isAssigned(row) && isConfirmationConfirmed(row) && isVoucherPending(row),
  );
  const manifestIncomplete = manifest
    ? manifest.status !== 'COMPLETE' || manifest.namesPending || manifest.incompleteRecords > 0
    : false;
  const readyRows = rows.filter((row) => getRowReadiness(row).readiness === 'Ready').length;
  const readinessPercent = rows.length > 0 ? Math.round((readyRows / rows.length) * 100) : 0;
  const groupedRows = PHASES.map((phase) => ({
    phase,
    rows: rows.filter((row) => getRowPhase(row) === phase),
  }));

  const actionItems: ActionItem[] = [
    { label: 'Suppliers unassigned', count: suppliersUnassignedRows.length, severity: 'ACTION REQUIRED' },
    { label: 'Confirmations pending', count: confirmationsPendingRows.length, severity: 'ACTION REQUIRED' },
    { label: 'Confirmations rejected', count: confirmationsRejectedRows.length, severity: 'CRITICAL' },
    { label: 'Vouchers pending', count: vouchersPendingRows.length, severity: 'ACTION REQUIRED' },
    { label: 'Manifest incomplete', count: manifestIncomplete ? 1 : 0, severity: 'INFO' },
    { label: 'Rooming incomplete', count: roomingIncompleteCount, severity: 'INFO' },
  ];

  return {
    readinessPercent,
    manifestIncomplete,
    roomingIncompleteCount,
    actionItems,
    groupedRows,
  };
}
