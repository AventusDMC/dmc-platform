/**
 * Booking Operations V2 — status → badge-variant decoding.
 *
 * PRESENTATIONAL ONLY. This maps raw status enums to one of five visual
 * variants so a single badge component can render every status axis uniformly.
 * It is the V2 design decision from the design brief §7 / handoff §6 — it does
 * NOT derive phase/readiness (that is ops-phase.ts, ported from Classic).
 *
 * Variants (colors come from ops-v2.css tokens, matching Quote Builder V2):
 *   success  → #16A34A   CONFIRMED, COMPLETED, paid, Operationally Ready, voucher ISSUED/SENT, Valid rooming
 *   warning  → #D97706   REQUESTED/pending, Needs Confirmation, scheduled, reconfirmation-due, manifest incomplete, voucher GENERATED
 *   critical → #DC2626   REJECTED, ISSUE, CANCELLED, overdue, Critical Issues, unpaid+overdue
 *   info     → #1F9ACF   DISPATCHED, IN_PROGRESS, invoiced, informational
 *   neutral  → muted     NOT_SENT, UNASSIGNED, draft, NOT_GENERATED, Needs Assignment
 *
 * Pure module: no React, no I/O.
 */

export type StatusVariant = 'success' | 'warning' | 'critical' | 'info' | 'neutral';

const norm = (v: string | null | undefined) => String(v || '').trim().toUpperCase();

/** Supplier confirmation status (NOT_SENT | REQUESTED | SENT | ACKNOWLEDGED | CONFIRMED | REJECTED | CANCELLED). */
export function confirmationVariant(status: string | null | undefined): StatusVariant {
  switch (norm(status)) {
    case 'CONFIRMED':
      return 'success';
    case 'REQUESTED':
    case 'SENT':
    case 'ACKNOWLEDGED':
      return 'warning';
    case 'REJECTED':
    case 'CANCELLED':
      return 'critical';
    case 'NOT_SENT':
    case '':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Voucher status (NOT_GENERATED | GENERATED | SENT | ISSUED | CANCELLED). */
export function voucherVariant(status: string | null | undefined): StatusVariant {
  switch (norm(status)) {
    case 'ISSUED':
    case 'SENT':
      return 'success';
    case 'GENERATED':
      return 'warning';
    case 'CANCELLED':
      return 'critical';
    case 'NOT_GENERATED':
    case '':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Service execution status (READY | DISPATCHED | IN_PROGRESS | COMPLETED | ISSUE | CANCELLED). */
export function executionVariant(status: string | null | undefined): StatusVariant {
  switch (norm(status)) {
    case 'COMPLETED':
      return 'success';
    case 'DISPATCHED':
    case 'IN_PROGRESS':
      return 'info';
    case 'ISSUE':
    case 'CANCELLED':
      return 'critical';
    case 'READY':
    case '':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Booking status (draft | confirmed | in_progress | completed | cancelled). */
export function bookingStatusVariant(status: string | null | undefined): StatusVariant {
  switch (norm(status)) {
    case 'CONFIRMED':
    case 'COMPLETED':
      return 'success';
    case 'IN_PROGRESS':
      return 'info';
    case 'CANCELLED':
      return 'critical';
    case 'DRAFT':
    case '':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Phase → variant (drives the phase-section header tint). */
export function phaseVariant(phase: string | null | undefined): StatusVariant {
  switch (String(phase || '')) {
    case 'Operationally Ready':
      return 'success';
    case 'Ready for Voucher':
    case 'Needs Confirmation':
      return 'warning';
    case 'Critical Issues':
      return 'critical';
    case 'Needs Assignment':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Action-center / dispatch severity → variant. */
export function severityVariant(severity: string | null | undefined): StatusVariant {
  switch (norm(severity)) {
    case 'CRITICAL':
      return 'critical';
    case 'ACTION REQUIRED':
    case 'WARNING':
      return 'warning';
    case 'INFO':
    case '':
      return 'info';
    default:
      return 'info';
  }
}

/**
 * Operation status — the operations-grid row's `status` field
 * (= service.operationStatus): PENDING | REQUESTED | CONFIRMED | REJECTED |
 * VOUCHER_SENT | OPERATIONAL_READY | COMPLETED. This is the grid's
 * execution-ish axis (true executionStatus lives on the dispatch endpoint,
 * out of Round-1 grid scope).
 */
export function operationStatusVariant(status: string | null | undefined): StatusVariant {
  switch (norm(status)) {
    case 'COMPLETED':
    case 'OPERATIONAL_READY':
    case 'CONFIRMED':
      return 'success';
    case 'VOUCHER_SENT':
      return 'info';
    case 'REQUESTED':
      return 'warning';
    case 'REJECTED':
      return 'critical';
    case 'PENDING':
    case '':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Client invoice status (unbilled | invoiced | paid). */
export function invoiceStatusVariant(status: string | null | undefined): StatusVariant {
  switch (norm(status)) {
    case 'PAID':
      return 'success';
    case 'INVOICED':
      return 'info';
    case 'UNBILLED':
    case '':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Supplier payment status (unpaid | scheduled | paid). */
export function supplierPaymentStatusVariant(status: string | null | undefined): StatusVariant {
  switch (norm(status)) {
    case 'PAID':
      return 'success';
    case 'SCHEDULED':
      return 'warning';
    case 'UNPAID':
    case '':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/** Per-payment status (PENDING | PAID); PENDING + overdue → critical. */
export function paymentStatusVariant(status: string | null | undefined, overdue = false): StatusVariant {
  if (norm(status) === 'PAID') return 'success';
  return overdue ? 'critical' : 'warning';
}

/**
 * Document status — covers voucher status (DRAFT|READY|SENT|ISSUED|CANCELLED)
 * plus derived document states (AVAILABLE|PENDING|NOT_GENERATED|IN_CLASSIC).
 */
export function documentStatusVariant(status: string | null | undefined): StatusVariant {
  switch (norm(status)) {
    case 'ISSUED':
    case 'SENT':
    case 'AVAILABLE':
      return 'success';
    case 'READY':
    case 'GENERATED':
      return 'info';
    case 'DRAFT':
    case 'PENDING':
      return 'warning';
    case 'CANCELLED':
      return 'critical';
    case 'NOT_GENERATED':
    case 'IN_CLASSIC':
    case '':
      return 'neutral';
    default:
      return 'neutral';
  }
}

/**
 * Humanize an enum-ish status into a Title-Case label
 * (NOT_SENT → "Not Sent"). Mirrors the Classic operations page `formatLabel`
 * (apps/admin-web/app/bookings/[id]/operations/page.tsx:120-130).
 */
export function humanizeStatus(value: string | null | undefined): string {
  if (!value) return '-';
  return String(value)
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
