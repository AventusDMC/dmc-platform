/**
 * Booking Operations V2 — Command Center (Screen 1, fleet) view model.
 *
 * Builds from three existing GET sources (any may be missing):
 *   - GET /api/operations/dispatch   → KPI counters + dispatch lanes
 *   - GET /api/operations/dashboard  → fleet health + blocking items
 *   - GET /api/bookings              → risk-sorted "Needs attention" queue
 *
 * Round 1 does NOT call per-booking operations-grid here.
 *
 * Data safety (allowlist): reads only display-safe fields — booking ref/title/
 * client/dates/pax, badge COUNTS, and invoice/supplier STATUS. Never reads
 * pricePerPax, pricingSnapshotJson, payments[]/reference/notes, or any cost/
 * sell/payable/margin field from the bookings list.
 *
 * Pure module: no React, no I/O.
 */
import {
  bookingStatusVariant,
  invoiceStatusVariant,
  supplierPaymentStatusVariant,
  type StatusVariant,
} from './ops-status-map';

// ---- raw input subsets ----

export type RawDispatch = {
  range?: { label?: string | null } | null;
  counters?: {
    criticalIssuesCount?: number | null;
    missingSuppliersCount?: number | null;
    pendingConfirmationsCount?: number | null;
    vouchersPendingCount?: number | null;
    operationallyReadyCount?: number | null;
    todaysArrivalsCount?: number | null;
    inProgressCount?: number | null;
    delayedCount?: number | null;
    totalRows?: number | null;
    operationsReadyPct?: number | null;
  } | null;
  lanes?: Record<string, { label?: string | null; total?: number | null; critical?: number | null; actionRequired?: number | null; ready?: number | null } | null> | null;
} | null
  | undefined;

export type RawDashboard = {
  kpis?: {
    bookingsInOperation?: number | null;
    operationalExceptions?: number | null;
    unassignedSuppliers?: number | null;
    servicesPendingConfirmation?: number | null;
    vouchersPending?: number | null;
    missingRooming?: number | null;
  } | null;
} | null
  | undefined;

type RawBadge = { count?: number | null; breakdown?: Record<string, number | null | undefined> | null } | null;

export type RawBookingListItem = {
  id: string;
  bookingRef?: string | null;
  status?: string | null;
  snapshotJson?: {
    title?: string | null;
    travelStartDate?: string | null;
    nightCount?: number | null;
    adults?: number | null;
    children?: number | null;
    company?: { name?: string | null } | null;
  } | null;
  operations?: { badge?: RawBadge } | null;
  rooming?: { badge?: RawBadge } | null;
  finance?: { clientInvoiceStatus?: string | null; supplierPaymentStatus?: string | null; badge?: RawBadge } | null;
};

// ---- output VM ----

export type KpiVM = { key: string; label: string; value: number | null; variant: StatusVariant };

export type DispatchLaneVM = { label: string; total: number; critical: number; actionRequired: number; ready: number };

export type DispatchSummaryVM = {
  rangeLabel: string;
  totalRows: number;
  readyPct: number | null;
  lanes: DispatchLaneVM[];
  isEmpty: boolean;
};

export type QueueRowVM = {
  id: string;
  bookingRef: string;
  title: string | null;
  client: string | null;
  dateLabel: string | null;
  pax: number | null;
  status: string;
  statusVariant: StatusVariant;
  blockers: string[];
  invoiceStatus: string;
  invoiceVariant: StatusVariant;
  supplierPaymentStatus: string;
  supplierVariant: StatusVariant;
  riskScore: number;
};

export type BlockingItemVM = { label: string; count: number; variant: StatusVariant };

export type CommandCenterVM = {
  kpis: KpiVM[];
  kpisAvailable: boolean;
  dispatch: DispatchSummaryVM | null;
  dispatchAvailable: boolean;
  queue: { rows: QueueRowVM[]; shownCount: number; totalCount: number; capped: boolean };
  queueAvailable: boolean;
  sidebar: {
    fleetReadinessPct: number | null;
    bookingsInOperation: number | null;
    blockingItems: BlockingItemVM[];
    nextAction: { label: string; bookingId: string; classicHref: string } | null;
  };
};

const ACTIVE_STATUSES = new Set(['draft', 'confirmed', 'in_progress']);

function n(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function badgeCount(badge: RawBadge): number {
  if (!badge) return 0;
  if (typeof badge.count === 'number') return badge.count;
  const b = badge.breakdown || {};
  return Object.values(b).reduce<number>((sum, v) => sum + (typeof v === 'number' ? v : 0), 0);
}

function titleCase(value: string | null | undefined): string {
  if (!value) return '—';
  return String(value).split(/[_\s]+/).filter(Boolean).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

function dateLabel(start: string | null | undefined, nights: number | null | undefined): string | null {
  if (!start) return null;
  const d = new Date(start);
  if (Number.isNaN(d.getTime())) return String(start);
  const startLabel = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(d);
  return nights && nights > 0 ? `${startLabel} · ${nights}n` : startLabel;
}

function blockerChips(b: RawBookingListItem): string[] {
  const ops = b.operations?.badge?.breakdown || {};
  const room = b.rooming?.badge?.breakdown || {};
  const fin = badgeCount(b.finance?.badge ?? null);
  const chips: string[] = [];
  const push = (count: unknown, label: string) => {
    const c = typeof count === 'number' ? count : 0;
    if (c > 0) chips.push(`${c} ${label}`);
  };
  push(ops.pendingConfirmations, 'confirmations pending');
  push(ops.missingExecutionDetails, 'missing details');
  push(ops.reconfirmationDue, 'reconfirmations due');
  push(room.unassignedPassengers, 'unassigned pax');
  push(room.unassignedRooms, 'unassigned rooms');
  push(room.occupancyIssues, 'occupancy issues');
  if (fin > 0) chips.push(`${fin} finance flag${fin === 1 ? '' : 's'}`);
  return chips;
}

function mapQueueRow(b: RawBookingListItem): QueueRowVM {
  const status = String(b.status || 'draft');
  const opsCount = badgeCount(b.operations?.badge ?? null);
  const roomCount = badgeCount(b.rooming?.badge ?? null);
  const finCount = badgeCount(b.finance?.badge ?? null);
  const adults = n(b.snapshotJson?.adults) ?? 0;
  const children = n(b.snapshotJson?.children) ?? 0;
  const pax = adults + children > 0 ? adults + children : null;
  const invoice = String(b.finance?.clientInvoiceStatus || 'unbilled');
  const supplier = String(b.finance?.supplierPaymentStatus || 'unpaid');
  return {
    id: b.id,
    bookingRef: String(b.bookingRef || 'Booking'),
    title: b.snapshotJson?.title?.trim() || null,
    client: b.snapshotJson?.company?.name?.trim() || null,
    dateLabel: dateLabel(b.snapshotJson?.travelStartDate, b.snapshotJson?.nightCount),
    pax,
    status: titleCase(status),
    statusVariant: bookingStatusVariant(status),
    blockers: blockerChips(b),
    invoiceStatus: titleCase(invoice),
    invoiceVariant: invoiceStatusVariant(invoice),
    supplierPaymentStatus: titleCase(supplier),
    supplierVariant: supplierPaymentStatusVariant(supplier),
    riskScore: opsCount * 3 + roomCount * 2 + finCount,
  };
}

const KPI_DEFS: { key: string; label: string; variant: StatusVariant; from: (d: RawDispatch, b: RawDashboard) => number | null }[] = [
  { key: 'critical_issues', label: 'Critical issues', variant: 'critical', from: (d) => n(d?.counters?.criticalIssuesCount) },
  { key: 'missing_suppliers', label: 'Missing suppliers', variant: 'warning', from: (d, b) => n(d?.counters?.missingSuppliersCount) ?? n(b?.kpis?.unassignedSuppliers) },
  { key: 'pending_confirmations', label: 'Pending confirmations', variant: 'warning', from: (d, b) => n(d?.counters?.pendingConfirmationsCount) ?? n(b?.kpis?.servicesPendingConfirmation) },
  { key: 'vouchers_pending', label: 'Vouchers pending', variant: 'warning', from: (d, b) => n(d?.counters?.vouchersPendingCount) ?? n(b?.kpis?.vouchersPending) },
  { key: 'ready_for_dispatch', label: 'Ready for dispatch', variant: 'success', from: (d) => n(d?.counters?.operationallyReadyCount) },
  { key: 'arrivals_today', label: 'Arrivals today', variant: 'info', from: (d) => n(d?.counters?.todaysArrivalsCount) },
  { key: 'in_progress', label: 'In progress', variant: 'info', from: (d) => n(d?.counters?.inProgressCount) },
  { key: 'delayed', label: 'Delayed', variant: 'warning', from: (d) => n(d?.counters?.delayedCount) },
];

function buildDispatchSummary(dispatch: RawDispatch): DispatchSummaryVM {
  const c = dispatch?.counters || {};
  const lanesRaw = dispatch?.lanes || {};
  const lanes: DispatchLaneVM[] = Object.values(lanesRaw)
    .filter(Boolean)
    .map((l) => ({
      label: String(l!.label || 'Lane'),
      total: n(l!.total) ?? 0,
      critical: n(l!.critical) ?? 0,
      actionRequired: n(l!.actionRequired) ?? 0,
      ready: n(l!.ready) ?? 0,
    }));
  const totalRows = n(c.totalRows) ?? 0;
  return {
    rangeLabel: String(dispatch?.range?.label || 'This window'),
    totalRows,
    readyPct: n(c.operationsReadyPct),
    lanes,
    isEmpty: totalRows === 0,
  };
}

export function buildCommandCenterVM(input: {
  dispatch?: RawDispatch;
  dashboard?: RawDashboard;
  bookings?: RawBookingListItem[] | null;
  cap?: number;
}): CommandCenterVM {
  const { dispatch, dashboard } = input;
  const cap = input.cap ?? 20;
  const dispatchAvailable = Boolean(dispatch);
  const dashboardAvailable = Boolean(dashboard);
  const queueAvailable = Array.isArray(input.bookings);

  const kpis: KpiVM[] = KPI_DEFS.map((def) => ({
    key: def.key,
    label: def.label,
    value: def.from(dispatch, dashboard),
    variant: def.variant,
  }));

  // Queue: active/risky only, risk-sorted (most blockers first), then soonest.
  const rawBookings = Array.isArray(input.bookings) ? input.bookings : [];
  const mapped = rawBookings
    .filter((b) => ACTIVE_STATUSES.has(String(b.status || '').toLowerCase()))
    .map(mapQueueRow)
    .sort((a, b) => b.riskScore - a.riskScore);
  const shown = mapped.slice(0, cap);

  // Blocking items from the KPI counts that are > 0.
  const blockingItems: BlockingItemVM[] = kpis
    .filter((k) => k.key !== 'ready_for_dispatch' && k.key !== 'arrivals_today' && k.key !== 'in_progress')
    .filter((k) => (k.value ?? 0) > 0)
    .map((k) => ({ label: k.label, count: k.value as number, variant: k.variant }));

  const topRisk = mapped.find((r) => r.riskScore > 0) || null;

  return {
    kpis,
    kpisAvailable: dispatchAvailable || dashboardAvailable,
    dispatch: dispatchAvailable ? buildDispatchSummary(dispatch) : null,
    dispatchAvailable,
    queue: { rows: shown, shownCount: shown.length, totalCount: mapped.length, capped: mapped.length > cap },
    queueAvailable,
    sidebar: {
      fleetReadinessPct: n(dispatch?.counters?.operationsReadyPct),
      bookingsInOperation: n(dashboard?.kpis?.bookingsInOperation),
      blockingItems,
      nextAction: topRisk
        ? { label: `Resolve ${topRisk.bookingRef}`, bookingId: topRisk.id, classicHref: `/bookings/${topRisk.id}/operations` }
        : null,
    },
  };
}
