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
import { isPreviewableVoucherStatus } from './ops-voucher-preview-vm';

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
   * DISPLAY / PRE-SELECT supplier id for the Phase 2A supplier-assignment control.
   * Falls back to the catalog/source supplierId so the picker can pre-select the
   * default supplier. This is NOT an operational-assignment signal — do NOT gate
   * mutations on it. Never any cost/sell/payable value.
   */
  assignedSupplierId: string | null;
  assignmentStatus: string | null;
  /**
   * The RAW operational supplier assignment (no catalog fallback). This mirrors
   * exactly what the backend checks before it will record a supplier
   * confirmation, and is the ONLY supplier signal the Phase 2B confirmation
   * control may gate on. Identifier only — never cost/sell/payable.
   */
  operationalAssignedSupplierId: string | null;
  hasOperationalSupplierAssignment: boolean;
  /**
   * Raw supplier confirmation status (e.g. NOT_SENT / CONFIRMED / REJECTED) —
   * STATUS ONLY, carried to pre-select the Phase 2B manual confirmation control.
   * Never any cost/sell/payable value.
   */
  supplierConfirmationStatus: string | null;
  /** Display-only context for rejected rows (named supplier). */
  isRejected: boolean;
  confirmation: BadgeVM;
  voucher: BadgeVM;
  operation: BadgeVM;
  /**
   * Phase 2C voucher-generate ELIGIBILITY (display/gating only, no values). A row
   * may generate its voucher record only when it has an operational supplier, a
   * CONFIRMED supplier confirmation, an operational date, and no voucher yet.
   * `voucherIneligibleReason` is the single plain-language reason when it cannot.
   */
  operationalDatePresent: boolean;
  canGenerateVoucher: boolean;
  voucherIneligibleReason: string | null;
  /**
   * Phase 2D: whether this row has an existing voucher that may be previewed
   * read-only (status GENERATED/READY/ISSUED/SENT). Display/gating only.
   */
  canPreviewVoucher: boolean;
  /**
   * Phase 2E: whether this row has an existing voucher whose PDF may be
   * downloaded (same GENERATED/READY/ISSUED/SENT set). Display/gating only.
   */
  canDownloadVoucher: boolean;
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

/**
 * Phase 2C: derive whether a row may generate its voucher record, and the single
 * plain-language reason when it cannot. All required (stricter than the backend):
 * operational supplier assigned (raw, no catalog fallback) + confirmation
 * CONFIRMED + operational date present + no voucher generated yet. Ordered so the
 * most actionable blocker wins.
 */
function voucherEligibility(
  row: RawGridRow,
  confirmationU: string,
  voucherU: string,
): { canGenerateVoucher: boolean; voucherIneligibleReason: string | null } {
  let reason: string | null = null;
  if (!row.assignedSupplierId) reason = 'Assign a supplier first.';
  else if (confirmationU === 'REJECTED') reason = 'Confirmation rejected — reassign or resolve in Classic.';
  else if (confirmationU !== 'CONFIRMED') reason = 'Confirm supplier before generating voucher.';
  else if (!row.operationalDate) reason = 'Set operational date in Classic.';
  else if (voucherU === 'CANCELLED') reason = 'Use Classic for this voucher.';
  else if (voucherU !== 'NOT_GENERATED') reason = 'Voucher already generated.';
  return { canGenerateVoucher: reason === null, voucherIneligibleReason: reason };
}

function mapRow(row: RawGridRow): OpsRowVM {
  const { readiness, severity, reasons } = getRowReadiness(row);
  const confirmation = row.supplierConfirmationStatus || 'NOT_SENT';
  const voucher = row.voucherStatus || 'NOT_GENERATED';
  // grid row `status` is operationStatus.
  const operation = String(row.status || 'PENDING');
  const { canGenerateVoucher, voucherIneligibleReason } = voucherEligibility(
    row,
    String(confirmation).toUpperCase(),
    String(voucher).toUpperCase(),
  );
  return {
    id: row.id,
    serviceType: String(row.serviceType || 'SERVICE'),
    description: row.description || humanizeStatus(row.serviceType) || 'Service',
    dayLabel: dayLabel(row),
    supplierLabel: row.assignedSupplierName || row.supplierName || null,
    assignedSupplierId: row.assignedSupplierId || row.supplierId || null,
    assignmentStatus: row.assignmentStatus || null,
    operationalAssignedSupplierId: row.assignedSupplierId || null,
    hasOperationalSupplierAssignment: Boolean(row.assignedSupplierId),
    supplierConfirmationStatus: String(confirmation),
    isRejected: String(confirmation).toUpperCase() === 'REJECTED',
    confirmation: { label: humanizeStatus(confirmation), variant: confirmationVariant(confirmation) },
    voucher: { label: humanizeStatus(voucher), variant: voucherVariant(voucher) },
    operation: { label: humanizeStatus(operation), variant: operationStatusVariant(operation) },
    operationalDatePresent: Boolean(row.operationalDate),
    canGenerateVoucher,
    voucherIneligibleReason,
    canPreviewVoucher: isPreviewableVoucherStatus(voucher),
    canDownloadVoucher: isPreviewableVoucherStatus(voucher),
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
