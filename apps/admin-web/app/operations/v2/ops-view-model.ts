/**
 * Booking Operations V2 — Operations board view model (pure mapping).
 *
 * This is the ONLY place raw API data becomes board props. It deliberately
 * copies a small ALLOWLIST of display-safe operational fields off each
 * operations-grid row — it never carries cost/sell/payable (those are not on
 * grid rows today, and mapping by allowlist guarantees they can't leak even if
 * the backend adds them later). Phase/readiness/severity come from the ported
 * Classic derivation (ops-phase.ts); badge variants/labels from ops-status-map.
 *
 * Pure module: no React, no I/O.
 */
import {
  computeActionCenter,
  getRowPhase,
  getRowReadiness,
  PHASES,
  type ActionItem,
  type OpsGridRow,
  type OpsManifest,
  type Phase,
  type Readiness,
  type Severity,
} from './ops-phase';
import {
  confirmationVariant,
  humanizeStatus,
  operationStatusVariant,
  phaseVariant,
  voucherVariant,
  type StatusVariant,
} from './ops-status-map';

/** Raw operations-grid response (structural subset we read). */
export type RawOperationsGrid = {
  booking?: { id?: string | null; bookingRef?: string | null; title?: string | null } | null;
  passengerManifest?: OpsManifest;
  rows?: RawGridRow[] | null;
};

/** Raw grid row — only the fields the board reads. (No cost/sell/payable exist here.) */
export type RawGridRow = OpsGridRow & {
  serviceType?: string | null;
  description?: string | null;
  dayNumber?: number | null;
  dayTitle?: string | null;
  /** operationStatus, surfaced as the row's "Status" badge. */
  status?: string | null;
};

/** Booking-detail subset used only for the rooming badge + status pill. */
export type RawBookingReadiness = {
  status?: string | null;
  rooming?: { badge?: { count?: number | null } | null } | null;
} | null
  | undefined;

export type BadgeVM = { label: string; variant: StatusVariant };

export type OpsRowVM = {
  id: string;
  serviceType: string;
  description: string;
  dayLabel: string | null;
  supplierLabel: string | null;
  /**
   * Current assigned supplier id + assignment status — IDENTIFIER/STATUS ONLY,
   * carried to drive the Phase 2A supplier-assignment control (pre-select +
   * assign/change/unassign). Never any cost/sell/payable value.
   */
  assignedSupplierId: string | null;
  assignmentStatus: string | null;
  /** Display-only context for rejected rows (named supplier). */
  isRejected: boolean;
  confirmation: BadgeVM;
  voucher: BadgeVM;
  operation: BadgeVM;
  readiness: Readiness;
  severity: Severity;
  reasons: string[];
};

export type PhaseSectionVM = {
  phase: Phase;
  variant: StatusVariant;
  count: number;
  rows: OpsRowVM[];
};

export type ManifestVM = {
  status: string;
  expected: number;
  received: number;
  missingRecords: number;
  incompleteRecords: number;
  incomplete: boolean;
} | null;

export type OperationsBoardVM = {
  booking: { id: string; bookingRef: string; title: string | null; status: string | null };
  phases: PhaseSectionVM[];
  summary: {
    readinessPercent: number;
    manifestIncomplete: boolean;
    roomingIncompleteCount: number;
    actionItems: ActionItem[];
  };
  manifest: ManifestVM;
};

function dayLabel(row: RawGridRow): string | null {
  const n = row.dayNumber;
  const t = row.dayTitle;
  if (n != null && t) return `Day ${n} · ${t}`;
  if (n != null) return `Day ${n}`;
  return t || null;
}

function mapRow(row: RawGridRow): OpsRowVM {
  const { readiness, severity, reasons } = getRowReadiness(row);
  const confirmation = row.supplierConfirmationStatus || 'NOT_SENT';
  const voucher = row.voucherStatus || 'NOT_GENERATED';
  // grid row `status` is operationStatus.
  const operation = String(row.status || 'PENDING');
  return {
    id: row.id,
    serviceType: String(row.serviceType || 'SERVICE'),
    description: row.description || humanizeStatus(row.serviceType) || 'Service',
    dayLabel: dayLabel(row),
    supplierLabel: row.assignedSupplierName || row.supplierName || null,
    assignedSupplierId: row.assignedSupplierId || row.supplierId || null,
    assignmentStatus: row.assignmentStatus || null,
    isRejected: String(confirmation).toUpperCase() === 'REJECTED',
    confirmation: { label: humanizeStatus(confirmation), variant: confirmationVariant(confirmation) },
    voucher: { label: humanizeStatus(voucher), variant: voucherVariant(voucher) },
    operation: { label: humanizeStatus(operation), variant: operationStatusVariant(operation) },
    readiness,
    severity,
    reasons,
  };
}

export function buildOperationsBoardVM(
  grid: RawOperationsGrid,
  readiness: RawBookingReadiness,
): OperationsBoardVM {
  const rawRows: RawGridRow[] = Array.isArray(grid?.rows) ? grid.rows! : [];
  const roomingIncompleteCount = Number(readiness?.rooming?.badge?.count || 0);
  const manifest = grid?.passengerManifest ?? undefined;

  const ac = computeActionCenter(rawRows, manifest, roomingIncompleteCount);

  // Map rows once, then bucket by phase preserving the fixed PHASES order.
  const mapped = rawRows.map((row) => ({ vm: mapRow(row), phase: getRowPhase(row) }));
  const phases: PhaseSectionVM[] = PHASES.map((phase) => {
    const rows = mapped.filter((m) => m.phase === phase).map((m) => m.vm);
    return { phase, variant: phaseVariant(phase), count: rows.length, rows };
  });

  const manifestVM: ManifestVM = manifest
    ? {
        status: humanizeStatus(manifest.status),
        expected: manifest.expected,
        received: manifest.received,
        missingRecords: manifest.missingRecords,
        incompleteRecords: manifest.incompleteRecords,
        incomplete: ac.manifestIncomplete,
      }
    : null;

  return {
    booking: {
      id: String(grid?.booking?.id || ''),
      bookingRef: String(grid?.booking?.bookingRef || 'Booking'),
      title: grid?.booking?.title ?? null,
      status: readiness?.status ?? null,
    },
    phases,
    summary: {
      readinessPercent: ac.readinessPercent,
      manifestIncomplete: ac.manifestIncomplete,
      roomingIncompleteCount: ac.roomingIncompleteCount,
      actionItems: ac.actionItems,
    },
    manifest: manifestVM,
  };
}
