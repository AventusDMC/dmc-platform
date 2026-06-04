import Link from 'next/link';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { AppAlert } from '../../components/ui';
import {
  ADMIN_API_BASE_URL,
  adminPageFetchJson,
  isNextRedirectError,
} from '../../lib/admin-server';
import { OPERATIONS_TIME_ZONE } from '../../lib/operations-timezone';
import { STATUS_TONE } from '../../lib/status-tone';
import { RouteConfidenceBadge } from './RouteConfidenceBadge';

type Severity = 'INFO' | 'ACTION REQUIRED' | 'CRITICAL';

type ExecutionStatus = 'READY' | 'DISPATCHED' | 'IN_PROGRESS' | 'COMPLETED' | 'ISSUE' | 'CANCELLED';

type DispatchRow = {
  bookingId: string;
  bookingRef: string | null;
  bookingTitle: string;
  clientName: string | null;
  serviceId: string;
  serviceType: string | null;
  operationType: string | null;
  description: string | null;
  date: string | null;
  time: string | null;
  dayNumber: number | null;
  dayTitle: string | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierPhone: string | null;
  assignmentStatus: string;
  confirmationStatus: string;
  operationStatus: string;
  voucherStatus: string;
  voucherId: string | null;
  voucherGeneratedAt: string | null;
  delayMinutes: number | null;
  driverName: string | null;
  driverPhone: string | null;
  driverLicenseNumber: string | null;
  vehicleName: string | null;
  vehicleType: string | null;
  vehiclePlateNumber: string | null;
  guideName: string | null;
  guidePhone: string | null;
  guideLanguages: string[];
  guideReportingTime: string | null;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  meetingPoint: string | null;
  confirmationReference: string | null;
  routeName: string | null;
  // Phase 2B — canonical route operational profile (when a RouteStandard
  // is seeded for this service's route). Null when no standard available;
  // the badge strip stays hidden and the card behaves as before.
  routeStandard?: {
    routeCode: string;
    routeName: string;
    standardDistanceKm: number | null;
    standardDurationHours: number | null;
    operationalBufferMinutes: number | null;
    longDistanceFlag: boolean;
    overnightRisk: boolean;
    mountainRoadFlag: boolean;
    borderCrossingFlag: boolean;
    airportRouteFlag: boolean;
    notes: string | null;
    confidenceLabel: string;
  } | null;
  // Execution lifecycle.
  executionStatus: ExecutionStatus;
  dispatchedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  issueReportedAt: string | null;
  issueType: string | null;
  issueSeverity: string | null;
  issueNotes: string | null;
  dispatchNotes: string | null;
  severity: Severity;
  reasons: string[];
};

type Lane = {
  label: string;
  rows: DispatchRow[];
  total: number;
  critical: number;
  actionRequired: number;
  ready: number;
};

type DispatchResponse = {
  range: { label: string; from: string; to: string };
  counters: {
    operationsReadyPct: number;
    vouchersGeneratedPct: number;
    confirmationsCompletePct: number;
    roomingCompletePct: number;
    manifestCompletePct: number;
    totalRows: number;
    operationallyReadyCount: number;
    vouchersGeneratedCount: number;
    confirmationsCompleteCount: number;
    hotelRoomingCompleteCount: number;
    hotelTotalCount: number;
    manifestCompleteCount: number;
    manifestTotalCount: number;
    missingSuppliersCount: number;
    pendingConfirmationsCount: number;
    vouchersPendingCount: number;
    todaysArrivalsCount: number;
    criticalIssuesCount: number;
    dispatchCompletionPct: number;
    completedTodayCount: number;
    activeIssuesCount: number;
    delayedCount: number;
    inProgressCount: number;
    activeIncidentsCount: number;
    delayedOperationsCount: number;
    escalatedIssuesCount: number;
    resolutionQueueCount: number;
    resourceConflictsCount?: number;
    overbookedResourcesCount?: number;
    dispatchCapacityWarningsCount?: number;
  };
  execution: {
    inProgress: { label: string; count: number; rows: DispatchRow[] };
    delayedIssues: { label: string; count: number; rows: DispatchRow[] };
    completedToday: { label: string; count: number; rows: DispatchRow[] };
    resolutionQueue?: { label: string; count: number; rows: DispatchRow[] };
  };
  sections: {
    criticalIssues: { count: number; rows: DispatchRow[] };
    arrivals: { count: number; rows: DispatchRow[] };
    departures: { count: number; rows: DispatchRow[] };
    transportDispatch: { count: number; rows: DispatchRow[] };
    guideDispatch: { count: number; rows: DispatchRow[] };
    hotelOperations: { count: number; rows: DispatchRow[] };
  };
  lanes: {
    arrivals: Lane;
    departures: Lane;
    hotels: Lane;
    transport: Lane;
    activities: Lane;
    guides: Lane;
  };
};

type PageProps = {
  searchParams?: Promise<{
    range?: string;
    view?: string;
  }>;
};

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'next-7-days', label: 'Next 7 days' },
] as const;

const SEVERITY_TONE: Record<Severity, { bg: string; border: string; pillBg: string; pillText: string; label: string; icon: string }> = {
  CRITICAL: { bg: '#fef3f2', border: '#f04438', pillBg: '#f04438', pillText: '#ffffff', label: 'CRITICAL', icon: '⚠' },
  'ACTION REQUIRED': { bg: '#fff8eb', border: '#f79009', pillBg: '#f79009', pillText: '#ffffff', label: 'ACTION', icon: '!' },
  INFO: { bg: '#f0fdf4', border: '#12b76a', pillBg: '#12b76a', pillText: '#ffffff', label: 'READY', icon: '✓' },
};

function severityTone(severity: Severity) {
  return SEVERITY_TONE[severity] || SEVERITY_TONE.INFO;
}

const VIEW_OPTIONS = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'lanes', label: 'Lanes' },
] as const;

const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 0, 'ACTION REQUIRED': 1, INFO: 2 };

// Execution-state colors. Blue = dispatched, green = completed, red = issue,
// orange = delayed (computed from date+time vs now, not stored).
const EXECUTION_TONE: Record<ExecutionStatus, { bg: string; text: string; border: string; label: string }> = {
  READY: { bg: '#f2f4f7', text: '#475467', border: '#d0d5dd', label: 'READY' },
  DISPATCHED: { bg: '#eff8ff', text: '#175cd3', border: '#84caff', label: 'DISPATCHED' },
  IN_PROGRESS: { bg: '#fff8eb', text: '#b54708', border: '#f79009', label: 'IN PROGRESS' },
  COMPLETED: { bg: '#ecfdf3', text: '#067647', border: '#12b76a', label: 'COMPLETED' },
  ISSUE: { bg: '#fef3f2', text: '#b42318', border: '#f04438', label: 'ISSUE' },
  CANCELLED: { bg: '#f2f4f7', text: '#667085', border: '#d0d5dd', label: 'CANCELLED' },
};

// SLA breach colour ramp — 1-14m: warning amber, 15-29m: stronger amber,
// 30m+: red (operator SLA breached). Surfaces on the dispatch card as a
// compact "Delayed Xm" pill so drift is visible at a glance.
function DelayPill({ minutes }: { minutes: number }) {
  const tone =
    minutes >= 30
      ? { bg: '#fef3f2', text: '#b42318', border: '#f04438' }
      : minutes >= 15
      ? { bg: '#fff8eb', text: '#b54708', border: '#f79009' }
      : { bg: '#fffbeb', text: '#a16207', border: '#fde68a' };
  const label = minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ''}` : `${minutes}m`;
  return (
    <span
      style={{
        background: tone.bg,
        color: tone.text,
        border: `1px solid ${tone.border}`,
        padding: '0.15rem 0.5rem',
        borderRadius: 999,
        fontSize: '0.7rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        fontVariantNumeric: 'tabular-nums',
      }}
      title={minutes >= 30 ? 'SLA breach — over 30 minutes delayed' : 'Delayed'}
    >
      ⏱ DELAYED {label}
    </span>
  );
}

function ExecutionPill({ status }: { status: ExecutionStatus }) {
  const tone = EXECUTION_TONE[status] || EXECUTION_TONE.READY;
  return (
    <span
      style={{
        background: tone.bg,
        color: tone.text,
        border: `1px solid ${tone.border}`,
        padding: '0.15rem 0.5rem',
        borderRadius: 999,
        fontSize: '0.7rem',
        fontWeight: 800,
        letterSpacing: '0.04em',
      }}
    >
      {tone.label}
    </span>
  );
}

// Type-aware action labels per spec — e.g. transport "Mark Pickup Complete"
// vs hotel "Hotel Completed" vs activity "Tour Completed". The underlying
// state machine action is the same (start / complete / issue); only labels differ.
function executionActionsFor(row: DispatchRow): Array<{ action: string; label: string; tone: 'primary' | 'success' | 'warning' | 'danger' }> {
  const status = row.executionStatus;
  const type = String(row.operationType || row.serviceType || '').toUpperCase();
  const isTransport = type === 'TRANSPORT' || /TRANSFER|TRANSPORT/.test(type);
  const isHotel = type === 'HOTEL' || /ACCOMMODATION|LODGING/.test(type);
  const isActivity = ['ACTIVITY', 'EXCURSION', 'TICKET'].includes(type) || /ACTIVITY|EXCURSION|TICKET/.test(type);
  const isGuide = type === 'GUIDE' || /GUIDE/.test(type);

  if (status === 'CANCELLED' || status === 'COMPLETED') return [];

  if (status === 'ISSUE') {
    return [
      { action: 'resolve', label: 'Resolve issue', tone: 'success' },
      { action: 'complete', label: 'Mark complete anyway', tone: 'warning' },
    ];
  }

  if (status === 'READY') {
    const dispatchLabel = isHotel ? 'Confirm check-in' : 'Mark dispatched';
    return [
      { action: 'dispatch', label: dispatchLabel, tone: 'primary' },
      { action: 'issue', label: 'Report issue', tone: 'danger' },
    ];
  }

  if (status === 'DISPATCHED') {
    const startLabel = isTransport
      ? 'Mark pickup complete'
      : isHotel
      ? 'Mark check-in done'
      : isActivity
      ? 'Tour started'
      : isGuide
      ? 'Guide reported'
      : 'Mark started';
    return [
      { action: 'start', label: startLabel, tone: 'primary' },
      { action: 'complete', label: 'Mark complete', tone: 'success' },
      { action: 'issue', label: 'Report issue', tone: 'danger' },
    ];
  }

  // IN_PROGRESS
  const completeLabel = isTransport
    ? 'Mark transfer complete'
    : isHotel
    ? 'Hotel completed'
    : isActivity
    ? 'Tour completed'
    : isGuide
    ? 'Guide completed'
    : 'Mark complete';
  return [
    { action: 'complete', label: completeLabel, tone: 'success' },
    { action: 'issue', label: 'Report issue', tone: 'danger' },
  ];
}

const ACTION_TONE: Record<'primary' | 'success' | 'warning' | 'danger', { bg: string; text: string; border: string }> = {
  primary: { bg: '#175cd3', text: '#ffffff', border: '#175cd3' },
  success: { bg: '#067647', text: '#ffffff', border: '#067647' },
  warning: { bg: '#b54708', text: '#ffffff', border: '#b54708' },
  danger: { bg: '#b42318', text: '#ffffff', border: '#b42318' },
};

function ExecutionActionButton({ row, action, label, tone, returnTo }: {
  row: DispatchRow;
  action: string;
  label: string;
  tone: 'primary' | 'success' | 'warning' | 'danger';
  returnTo: string;
}) {
  const t = ACTION_TONE[tone];
  return (
    <form
      method="post"
      action={`/api/bookings/services/${row.serviceId}/execution`}
      style={{ margin: 0, display: 'inline' }}
    >
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <button
        type="submit"
        style={{
          background: t.bg,
          color: t.text,
          border: `1px solid ${t.border}`,
          padding: '0.5rem 0.85rem',
          borderRadius: 8,
          fontWeight: 700,
          fontSize: '0.85rem',
          cursor: 'pointer',
        }}
      >
        {label}
      </button>
    </form>
  );
}

function formatTime(time: string | null) {
  if (!time) return null;
  // Pick the first HH:MM-shaped substring; backend stores some times as
  // "HH:MM" strings, others as full ISO.
  const match = String(time).match(/(\d{1,2}):(\d{2})/);
  if (!match) return time;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function getTimeBucket(time: string | null): 'morning' | 'afternoon' | 'evening' | 'unscheduled' {
  if (!time) return 'unscheduled';
  const formatted = formatTime(time);
  if (!formatted) return 'unscheduled';
  const hour = Number(formatted.slice(0, 2));
  if (!Number.isFinite(hour)) return 'unscheduled';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

function formatDate(value: string | null) {
  if (!value) return null;
  try {
    return new Date(value).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      timeZone: OPERATIONS_TIME_ZONE,
    });
  } catch {
    return value;
  }
}

function buildHref({ range, view }: { range: string; view: string }) {
  const params = new URLSearchParams();
  params.set('range', range);
  if (view && view !== 'timeline') params.set('view', view);
  return `/operations/dispatch?${params.toString()}`;
}

const BUCKET_LABELS = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
  unscheduled: 'Unscheduled',
} as const;

const BUCKET_ICON = {
  morning: '☀',
  afternoon: '🌤',
  evening: '🌙',
  unscheduled: '—',
} as const;

function CounterCard({
  label,
  value,
  tone = 'info',
  sub,
}: {
  label: string;
  value: number | string;
  tone?: 'info' | 'action' | 'critical' | 'ready';
  sub?: string;
}) {
  const p = STATUS_TONE[tone];
  return (
    <div
      style={{
        background: p.bg,
        border: `1px solid ${p.border}`,
        borderRadius: 10,
        padding: '0.85rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
      }}
    >
      <span style={{ color: p.text, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <strong style={{ color: p.text, fontSize: '2.1rem', lineHeight: 1, fontWeight: 700 }}>{value}</strong>
      {sub ? <span style={{ color: p.text, fontSize: '0.78rem', opacity: 0.85 }}>{sub}</span> : null}
    </div>
  );
}

function SeverityPill({ severity }: { severity: Severity }) {
  const tone = severityTone(severity);
  return (
    <span
      style={{
        background: tone.pillBg,
        color: tone.pillText,
        padding: severity === 'CRITICAL' ? '0.25rem 0.6rem' : '0.15rem 0.5rem',
        borderRadius: 999,
        fontSize: severity === 'CRITICAL' ? '0.78rem' : '0.68rem',
        fontWeight: 800,
        letterSpacing: '0.06em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        boxShadow: severity === 'CRITICAL' ? '0 0 0 3px rgba(240, 68, 56, 0.18)' : 'none',
      }}
      aria-label={tone.label}
    >
      <span aria-hidden style={{ fontSize: '0.85em' }}>{tone.icon}</span>
      {tone.label}
    </span>
  );
}

function StatusPill({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <span
      style={{
        background: ok ? 'var(--ds-color-success-surface, #ECFDF3)' : 'var(--ds-color-surface-soft, #F9FAFB)',
        color: ok ? 'var(--ds-color-success, #067647)' : 'var(--ds-color-text-muted, #475569)',
        padding: '0.1rem 0.4rem',
        borderRadius: 6,
        fontSize: '0.7rem',
        fontWeight: 600,
      }}
      title={label}
    >
      {value}
    </span>
  );
}

function DispatchCard({ row, returnTo = '/operations/dispatch' }: { row: DispatchRow; returnTo?: string }) {
  const tone = severityTone(row.severity);
  const time = formatTime(row.time);
  const isCritical = row.severity === 'CRITICAL';
  const executionActions = executionActionsFor(row);
  // Operational action buttons — bigger, color-intent. Primary action is
  // whatever is most likely needed next given the row's state.
  const needsSupplier = !row.supplierName;
  const needsConfirmation = row.confirmationStatus !== 'CONFIRMED' && row.confirmationStatus !== 'REJECTED';
  const needsVoucher = !['GENERATED', 'SENT', 'ISSUED', 'READY'].includes(row.voucherStatus);
  const primaryAction = (() => {
    if (needsSupplier) return { label: 'Assign supplier', href: `/bookings/${row.bookingId}/operations` };
    if (needsConfirmation) return { label: 'Manage confirmation', href: `/bookings/${row.bookingId}/operations` };
    if (needsVoucher) return { label: 'Generate voucher', href: `/bookings/${row.bookingId}/operations` };
    if (row.voucherId) return { label: 'Open voucher', href: `/bookings/${row.bookingId}/operations/${row.serviceId}/voucher` };
    return { label: 'Operations grid', href: `/bookings/${row.bookingId}/operations` };
  })();
  return (
    <article
      style={{
        background: isCritical ? tone.bg : '#ffffff',
        border: isCritical ? `2px solid ${tone.border}` : '1px solid var(--ds-color-border-subtle, #E4E7EC)',
        borderLeft: isCritical ? `8px solid ${tone.border}` : `4px solid ${tone.border}`,
        borderRadius: 10,
        padding: isCritical ? '0.9rem 1rem' : '0.7rem 0.9rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        boxShadow: isCritical ? '0 4px 14px rgba(240, 68, 56, 0.12)' : '0 1px 2px rgba(15,23,42,0.04)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.7rem', minWidth: 0, flex: 1, flexWrap: 'wrap' }}>
          {time ? (
            <strong style={{ fontSize: '1.5rem', color: isCritical ? '#7a271a' : 'var(--ds-color-text, #0F172A)', fontVariantNumeric: 'tabular-nums', minWidth: '3.5rem' }}>
              {time}
            </strong>
          ) : null}
          <span style={{ fontSize: '1.05rem', fontWeight: 700, color: isCritical ? '#7a271a' : 'var(--ds-color-text, #0F172A)' }}>
            {row.description || row.serviceType || 'Service'}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
          <SeverityPill severity={row.severity} />
          {row.executionStatus && row.executionStatus !== 'READY' ? <ExecutionPill status={row.executionStatus} /> : null}
          {row.delayMinutes && row.delayMinutes > 0 ? <DelayPill minutes={row.delayMinutes} /> : null}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.85rem' }}>
        <span><strong>{row.bookingRef || 'Booking'}</strong></span>
        {row.clientName ? <span>· {row.clientName}</span> : null}
        {row.dayNumber ? <span>· Day {row.dayNumber}{row.dayTitle ? ` (${row.dayTitle})` : ''}</span> : null}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
        <StatusPill label="Supplier" value={row.supplierName || 'Supplier missing'} ok={Boolean(row.supplierName)} />
        <StatusPill label="Confirmation" value={row.confirmationStatus} ok={row.confirmationStatus === 'CONFIRMED'} />
        <StatusPill label="Voucher" value={row.voucherStatus} ok={['GENERATED', 'SENT', 'ISSUED', 'READY'].includes(row.voucherStatus)} />
        {row.driverName ? (
          <StatusPill
            label="Driver"
            value={`Driver: ${row.driverName}${row.driverPhone ? ` · ${row.driverPhone}` : ''}`}
            ok
          />
        ) : null}
        {row.vehicleName ? (
          <StatusPill
            label="Vehicle"
            value={`${row.vehicleName}${row.vehiclePlateNumber ? ` · ${row.vehiclePlateNumber}` : ''}`}
            ok
          />
        ) : null}
        {row.guideName ? <StatusPill label="Guide" value={`Guide: ${row.guideName}`} ok /> : null}
      </div>

      {Array.isArray(row.reasons) && row.reasons.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: '1.1rem', color: isCritical ? '#7a271a' : 'var(--ds-color-warning, #B54708)', fontSize: '0.88rem', fontWeight: 500 }}>
          {row.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.15rem' }}>
        {/* Live execution actions — type-aware labels per spec. Drives the
            executionStatus state machine via /api/bookings/services/:id/execution. */}
        {executionActions.map((a) => (
          <ExecutionActionButton key={a.action} row={row} action={a.action} label={a.label} tone={a.tone} returnTo={returnTo} />
        ))}
        {/* Preparation actions still available (assign supplier / generate
            voucher etc.) — useful when execution hasn't started yet. */}
        {row.executionStatus === 'READY' || row.executionStatus === 'ISSUE' ? (
          <Link
            href={primaryAction.href}
            style={{
              background: '#ffffff',
              color: 'var(--ds-color-info, #175CD3)',
              padding: '0.5rem 0.85rem',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: '0.85rem',
              textDecoration: 'none',
              border: '1px solid var(--ds-color-info-border, #84CAFF)',
            }}
          >
            {primaryAction.label}
          </Link>
        ) : null}
        <Link
          href={`/bookings/${row.bookingId}`}
          style={{
            background: '#ffffff',
            color: 'var(--ds-color-info, #175CD3)',
            padding: '0.5rem 0.85rem',
            borderRadius: 8,
            fontWeight: 600,
            fontSize: '0.85rem',
            textDecoration: 'none',
            border: '1px solid #d0d5dd',
          }}
        >
          Open booking
        </Link>
        {row.voucherId && primaryAction.label !== 'Open voucher' ? (
          <Link
            href={`/bookings/${row.bookingId}/operations/${row.serviceId}/voucher`}
            style={{
              background: '#ffffff',
              color: '#175cd3',
              padding: '0.5rem 0.85rem',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: '0.85rem',
              textDecoration: 'none',
              border: '1px solid #d0d5dd',
            }}
          >
            View voucher
          </Link>
        ) : null}
        {row.driverPhone ? (
          <a
            href={`tel:${row.driverPhone}`}
            style={{
              background: '#ffffff',
              color: 'var(--ds-color-success, #067647)',
              padding: '0.5rem 0.85rem',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: '0.85rem',
              textDecoration: 'none',
              border: '1px solid var(--ds-color-success-border, #ABEFC6)',
            }}
          >
            Call driver
          </a>
        ) : null}
        {row.supplierPhone ? (
          <a
            href={`tel:${row.supplierPhone}`}
            style={{
              background: '#ffffff',
              color: 'var(--ds-color-success, #067647)',
              padding: '0.5rem 0.85rem',
              borderRadius: 8,
              fontWeight: 600,
              fontSize: '0.85rem',
              textDecoration: 'none',
              border: '1px solid var(--ds-color-success-border, #ABEFC6)',
            }}
          >
            Call supplier
          </a>
        ) : null}
      </div>

      <details style={{ fontSize: '0.78rem', color: 'var(--ds-color-text-subtle, #667085)' }}>
        <summary style={{ cursor: 'pointer' }}>Secondary details</summary>
        <div style={{ marginTop: '0.4rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.25rem' }}>
          {row.pickupLocation ? <div><span>Pickup:</span> <strong>{row.pickupLocation}</strong></div> : null}
          {row.dropoffLocation ? <div><span>Dropoff:</span> <strong>{row.dropoffLocation}</strong></div> : null}
          {row.meetingPoint ? <div><span>Meeting:</span> <strong>{row.meetingPoint}</strong></div> : null}
          {row.routeName ? (
            <div style={{ gridColumn: row.routeStandard ? '1 / -1' : undefined }}>
              <span>Route:</span> <strong>{row.routeName}</strong>
              {row.routeStandard ? (
                <span style={{ marginLeft: '0.5rem' }}>
                  <RouteConfidenceBadge standard={row.routeStandard} />
                </span>
              ) : null}
            </div>
          ) : null}
          {row.guideReportingTime ? <div><span>Reporting:</span> <strong>{row.guideReportingTime}</strong></div> : null}
          {row.guidePhone ? <div><span>Guide phone:</span> <strong>{row.guidePhone}</strong></div> : null}
          {row.supplierPhone ? <div><span>Supplier phone:</span> <strong>{row.supplierPhone}</strong></div> : null}
          {row.confirmationReference ? <div><span>Confirmation ref:</span> <strong>{row.confirmationReference}</strong></div> : null}
          <div><span>Service id:</span> <strong style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>{row.serviceId}</strong></div>
        </div>
      </details>
    </article>
  );
}

function LaneBlock({ lane, startOpen, returnTo }: { lane: Lane; startOpen: boolean; returnTo: string }) {
  const buckets: Record<string, DispatchRow[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    unscheduled: [],
  };
  const rows = Array.isArray(lane.rows) ? lane.rows : [];
  for (const row of rows) {
    if (!row) continue;
    buckets[getTimeBucket(row.time)].push(row);
  }
  // Sort within bucket by time ascending.
  for (const b of Object.values(buckets)) {
    b.sort((a, b) => String(a.time || '99:99').localeCompare(String(b.time || '99:99')));
  }
  const sectionsToRender: Array<[string, DispatchRow[]]> = [
    ['Morning', buckets.morning],
    ['Afternoon', buckets.afternoon],
    ['Evening', buckets.evening],
    ['Unscheduled', buckets.unscheduled],
  ];
  return (
    <details
      open={startOpen}
      style={{
        background: '#ffffff',
        border: '1px solid var(--ds-color-border-subtle, #E4E7EC)',
        borderRadius: 10,
        padding: '0.75rem 1rem',
      }}
    >
      <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{lane.label}</h3>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <span style={{ color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.85rem' }}>{lane.total} total</span>
            {lane.critical > 0 ? (
              <span style={{ background: 'var(--ds-color-danger-surface, #FEF3F2)', color: 'var(--ds-color-danger, #B42318)', padding: '0.1rem 0.5rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700 }}>
                {lane.critical} critical
              </span>
            ) : null}
            {lane.actionRequired > 0 ? (
              <span style={{ background: '#fff8eb', color: 'var(--ds-color-warning, #B54708)', padding: '0.1rem 0.5rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700 }}>
                {lane.actionRequired} action
              </span>
            ) : null}
            {lane.ready > 0 ? (
              <span style={{ background: 'var(--ds-color-success-surface, #ECFDF3)', color: 'var(--ds-color-success, #067647)', padding: '0.1rem 0.5rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700 }}>
                {lane.ready} ready
              </span>
            ) : null}
          </div>
        </div>
      </summary>
      {lane.total === 0 ? (
        <p style={{ color: 'var(--ds-color-text-subtle, #667085)', margin: '0.5rem 0 0' }}>No {lane.label.toLowerCase()} in this window.</p>
      ) : (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sectionsToRender.map(([bucketLabel, rows]) =>
            rows.length === 0 ? null : (
              <div key={bucketLabel}>
                <p style={{ margin: '0 0 0.4rem', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {bucketLabel} · {rows.length}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {rows.map((row) => <DispatchCard key={`${lane.label}-${row.serviceId}`} row={row} returnTo={returnTo} />)}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </details>
  );
}

export default async function DispatchPage({ searchParams }: PageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const range = resolved?.range || 'today';
  const view = resolved?.view === 'lanes' ? 'lanes' : 'timeline';

  const query = new URLSearchParams();
  query.set('range', range);
  // Preserve range + view across execution action redirects so the operator
  // lands back on the same dispatch view they were just looking at, not the
  // default today/timeline.
  const returnQuery = new URLSearchParams();
  returnQuery.set('range', range);
  if (view !== 'timeline') returnQuery.set('view', view);
  const returnTo = `/operations/dispatch?${returnQuery.toString()}`;

  let data: DispatchResponse | null = null;
  let fetchError: string | null = null;
  try {
    data = await adminPageFetchJson<DispatchResponse>(
      `${ADMIN_API_BASE_URL}/operations/dispatch?${query.toString()}`,
      'Operations dispatch',
      { cache: 'no-store' },
    );
  } catch (error) {
    // Re-throw Next.js redirects (session-expired, login) — swallowing them
    // would break auth flow.
    if (isNextRedirectError(error)) throw error;
    fetchError = error instanceof Error ? error.message : String(error);
  }

  if (!data) {
    return (
      <main className="admin-page-shell">
        <div className="admin-page-heading">
          <AdminBreadcrumbs items={[{ label: 'Operations', href: '/operations' }, { label: 'Dispatch' }]} />
          <h1>Operations Dispatch</h1>
        </div>
        <section className="warning-banner" aria-label="Dispatch fetch error">
          <p className="form-error"><strong>Could not load dispatch data.</strong></p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.85rem' }}>{fetchError || 'Unknown error'}</pre>
        </section>
      </main>
    );
  }

  const c = data.counters;
  const criticalRows = data.sections?.criticalIssues?.rows ?? [];

  // Any render error from below bubbles up to ./error.tsx (the Next.js error
  // boundary) which surfaces the actual message + digest instead of a blank
  // "Application error" screen.
  return renderDispatchBody({ data, c, criticalRows, range, view, returnTo });
}

function renderDispatchBody({
  data,
  c,
  criticalRows,
  range,
  view,
  returnTo,
}: {
  data: DispatchResponse;
  c: DispatchResponse['counters'];
  criticalRows: DispatchRow[];
  range: string;
  view: 'timeline' | 'lanes';
  returnTo: string;
}) {
  // DEBUG: embed the raw API response so we can View Source to inspect
  // shape mismatches between backend response and frontend types when render
  // crashes. Safe to leave in: it's data the operator already has access to.
  const debugJson = (() => {
    try {
      return JSON.stringify(data);
    } catch {
      return '"<unserializable>"';
    }
  })();
  return (
    <main className="admin-page-shell">
      <script
        id="dispatch-debug"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: debugJson }}
      />
      <div className="admin-page-heading">
        <AdminBreadcrumbs items={[{ label: 'Operations', href: '/operations' }, { label: 'Dispatch' }]} />
        <div className="admin-heading-row">
          <div>
            <h1>Operations Dispatch</h1>
            <p className="admin-muted-copy">
              {data.range?.label || 'Range'} · {data.range?.from || '—'}{data.range?.from && data.range?.from !== data.range?.to ? ` → ${data.range.to}` : ''} · {c?.totalRows ?? 0} service rows in window
            </p>
          </div>
          <div className="admin-heading-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--ds-color-surface-soft, #F9FAFB)', padding: '0.2rem', borderRadius: 8 }}>
              {VIEW_OPTIONS.map((opt) => (
                <Link
                  key={opt.value}
                  href={buildHref({ range, view: opt.value })}
                  style={{
                    padding: '0.35rem 0.7rem',
                    borderRadius: 6,
                    background: view === opt.value ? '#ffffff' : 'transparent',
                    color: view === opt.value ? 'var(--ds-color-text, #0F172A)' : 'var(--ds-color-text-muted, #475569)',
                    fontWeight: view === opt.value ? 700 : 500,
                    fontSize: '0.85rem',
                    textDecoration: 'none',
                    boxShadow: view === opt.value ? '0 1px 2px rgba(15,23,42,0.06)' : 'none',
                  }}
                >
                  {opt.label}
                </Link>
              ))}
            </div>
            {RANGE_OPTIONS.map((opt) => (
              <Link
                key={opt.value}
                className={`button ${range === opt.value ? 'button-primary' : 'button-secondary'}`}
                href={buildHref({ range: opt.value, view })}
              >
                {opt.label}
              </Link>
            ))}
            <Link
              href="/operations/recovery"
              className="button button-primary"
              title="Active-incident command center: recovery actions, replacements, impact"
            >
              🛠 Recovery
            </Link>
            <Link
              href="/operations/resources/conflicts"
              className="button button-secondary"
              title="Cross-booking resource conflict detection (drivers / vehicles / guides)"
            >
              ⚙ Resources
            </Link>
            <Link
              href="/operations/intelligence"
              className="button button-secondary"
              title="Operations analytics — performance, bottlenecks, forecast, trends"
            >
              📊 Intelligence
            </Link>
            <Link
              href="/operations/simulation"
              className="button button-secondary"
              style={{ borderStyle: 'dashed' }}
              title="Inject realistic operational scenarios"
            >
              🧪 Simulation
            </Link>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 280px',
          gap: '1rem',
          alignItems: 'start',
        }}
      >
        {/* MAIN COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Top counters — 6 cards, color-coded by tone */}
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.6rem' }}>
            <CounterCard label="Today's Arrivals" value={c.todaysArrivalsCount} tone="info" />
            <CounterCard
              label="Pending Confirmations"
              value={c.pendingConfirmationsCount}
              tone={c.pendingConfirmationsCount > 0 ? 'action' : 'ready'}
            />
            <CounterCard
              label="Missing Suppliers"
              value={c.missingSuppliersCount}
              tone={c.missingSuppliersCount > 0 ? 'critical' : 'ready'}
            />
            <CounterCard
              label="Ready for Dispatch"
              value={`${c.operationallyReadyCount}`}
              sub={`${c.operationsReadyPct}% of ${c.totalRows}`}
              tone="ready"
            />
            <CounterCard
              label="Critical Issues"
              value={c.criticalIssuesCount}
              tone={c.criticalIssuesCount > 0 ? 'critical' : 'ready'}
            />
            <CounterCard
              label="Vouchers Pending"
              value={c.vouchersPendingCount}
              tone={c.vouchersPendingCount > 0 ? 'action' : 'ready'}
            />
          </section>

          {/* Execution lifecycle counters — separate row so they don't get
              confused with preparation-side counters above. */}
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.6rem' }}>
            <CounterCard
              label="Dispatch Completion"
              value={`${c.dispatchCompletionPct}%`}
              sub={`${c.completedTodayCount} completed today`}
              tone="ready"
            />
            <CounterCard
              label="In Progress"
              value={c.inProgressCount}
              tone={c.inProgressCount > 0 ? 'info' : 'ready'}
            />
            <CounterCard
              label="Active Issues"
              value={c.activeIssuesCount}
              tone={c.activeIssuesCount > 0 ? 'critical' : 'ready'}
            />
            <CounterCard
              label="Delayed"
              value={c.delayedCount}
              tone={c.delayedCount > 0 ? 'action' : 'ready'}
            />
          </section>

          {/* Stability counters — incident health surfaces. Drawn between the
              prep counters and Live Ops so an operator who just opened the
              page sees "is anything actively broken" before scrolling. */}
          {c.activeIncidentsCount > 0 || c.delayedOperationsCount > 0 || c.escalatedIssuesCount > 0 || c.resolutionQueueCount > 0 ? (
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.6rem' }}>
              <CounterCard label="Active Incidents" value={c.activeIncidentsCount} tone={c.activeIncidentsCount > 0 ? 'critical' : 'ready'} />
              <CounterCard label="Delayed Operations" value={c.delayedOperationsCount} tone={c.delayedOperationsCount > 0 ? 'action' : 'ready'} />
              <CounterCard label="Escalated Issues" value={c.escalatedIssuesCount} tone={c.escalatedIssuesCount > 0 ? 'critical' : 'ready'} sub="HIGH or CRITICAL" />
              <CounterCard label="Resolution Queue" value={c.resolutionQueueCount} tone={c.resolutionQueueCount > 0 ? 'critical' : 'ready'} sub="Open > 30 min" />
            </section>
          ) : null}

          {/* Resource-orchestration counters. Quick-scan from this window;
              full per-conflict detail at /operations/resources/conflicts. */}
          {(c.resourceConflictsCount ?? 0) > 0 || (c.overbookedResourcesCount ?? 0) > 0 || (c.dispatchCapacityWarningsCount ?? 0) > 0 ? (
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: '0.6rem' }}>
              <CounterCard
                label="Resource Conflicts"
                value={c.resourceConflictsCount ?? 0}
                tone={(c.resourceConflictsCount ?? 0) > 0 ? 'critical' : 'ready'}
                sub="Driver / vehicle / guide"
              />
              <CounterCard
                label="Overbooked Resources"
                value={c.overbookedResourcesCount ?? 0}
                tone={(c.overbookedResourcesCount ?? 0) > 0 ? 'critical' : 'ready'}
                sub="Overlapping windows"
              />
              <CounterCard
                label="Capacity Warnings"
                value={c.dispatchCapacityWarningsCount ?? 0}
                tone={(c.dispatchCapacityWarningsCount ?? 0) > 0 ? 'action' : 'ready'}
                sub="Tight turnaround"
              />
            </section>
          ) : null}

          {/* Resolution Queue — list of ISSUE-state rows ordered oldest-first
              so the most-overdue incident is at the top. Hidden when empty. */}
          {data.execution?.resolutionQueue && data.execution.resolutionQueue.count > 0 ? (
            <AppAlert tone="danger" aria-label="Resolution queue">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <p style={{ margin: 0, color: 'var(--ds-color-danger, #B42318)', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Resolution Queue · oldest first
                  </p>
                  <h2 style={{ margin: 0, color: '#7a271a' }}>
                    {data.execution.resolutionQueue.count} incident{data.execution.resolutionQueue.count === 1 ? '' : 's'} need resolution
                  </h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {data.execution.resolutionQueue.rows.slice(0, 10).map((row) => (
                    <DispatchCard key={`res-${row.serviceId}`} row={row} returnTo={returnTo} />
                  ))}
                  {data.execution.resolutionQueue.count > 10 ? (
                    <p style={{ margin: 0, color: '#7a271a', fontSize: '0.85rem' }}>
                      + {data.execution.resolutionQueue.count - 10} more in the queue.
                    </p>
                  ) : null}
                </div>
              </div>
            </AppAlert>
          ) : null}

          {/* Live Operations command panel — drawn FIRST because what's
              happening right now beats what's still being prepared. Type-split
              into transfers / check-ins / guides / activities so the desk can
              scan by domain. Delayed/Issue rows get their own dominant block
              inside the same panel. */}
          <ExecutionSections data={data} returnTo={returnTo} />

          {/* Critical Issues — dominant red banner if any */}
          {criticalRows.length > 0 ? (
            <AppAlert tone="danger">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                  <div>
                    <p style={{ margin: 0, color: 'var(--ds-color-danger, #B42318)', fontWeight: 700, letterSpacing: '0.04em', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                      Critical · resolve first
                    </p>
                    <h2 style={{ margin: 0, color: '#7a271a' }}>{criticalRows.length} row{criticalRows.length === 1 ? '' : 's'} blocking dispatch</h2>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {criticalRows.slice(0, 10).map((row) => (
                    <DispatchCard key={`crit-${row.serviceId}`} row={{ ...row, severity: 'CRITICAL' }} returnTo={returnTo} />
                  ))}
                  {criticalRows.length > 10 ? (
                    <p style={{ margin: 0, color: '#7a271a', fontSize: '0.85rem' }}>
                      + {criticalRows.length - 10} more critical rows in the lanes below.
                    </p>
                  ) : null}
                </div>
              </div>
            </AppAlert>
          ) : (
            <AppAlert tone="success">
              <strong>No critical issues blocking dispatch in this window.</strong>
            </AppAlert>
          )}

          {/* View body: timeline-first (default) or lane-based */}
          {view === 'timeline' ? <TimelineView data={data} returnTo={returnTo} /> : <LanesView data={data} returnTo={returnTo} />}

          {/* Completed Today — compact summary at the bottom. Doesn't compete
              for top-of-page attention with live ops or critical prep. */}
          <CompletedTodaySummary data={data} />
        </div>

        {/* STICKY SIDEBAR */}
        <aside
          style={{
            position: 'sticky',
            top: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            background: '#ffffff',
            border: '1px solid var(--ds-color-border-subtle, #E4E7EC)',
            borderRadius: 10,
            padding: '0.85rem 1rem',
          }}
        >
          <p style={{ margin: 0, color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
            Dispatch summary
          </p>
          <SidebarStat label="Critical" value={c.criticalIssuesCount} accent="#b42318" />
          <SidebarStat label="Ready" value={c.operationallyReadyCount} accent="#067647" />
          <SidebarStat label="Pending confirmations" value={c.pendingConfirmationsCount} accent="#b54708" />
          <SidebarStat label="Vouchers pending" value={c.vouchersPendingCount} accent="#b54708" />
          <SidebarStat label="Manifest" value={`${c.manifestCompletePct}%`} accent="#175cd3" sub={`${c.manifestCompleteCount}/${c.manifestTotalCount} bookings`} />
          <SidebarStat label="Rooming" value={`${c.roomingCompletePct}%`} accent="#175cd3" sub={`${c.hotelRoomingCompleteCount}/${c.hotelTotalCount} hotel rows`} />
        </aside>
      </div>
    </main>
  );
}

// Operation-type bucket helper. Splits in-progress (or completed) rows into
// the operational sub-groups the dispatch desk actually thinks in: transfers,
// hotel check-ins, guides, activities, other. The order of returned groups
// is fixed so the layout is stable across refreshes.
type ExecGroupKey = 'transfers' | 'checkIns' | 'guides' | 'activities' | 'other';
const EXEC_GROUP_META: Record<ExecGroupKey, { label: string; icon: string; accent: string }> = {
  transfers: { label: 'Transfers', icon: '🚐', accent: '#175cd3' },
  checkIns: { label: 'Check-ins', icon: '🏨', accent: '#7e22ce' },
  guides: { label: 'Guides', icon: '🧭', accent: '#b54708' },
  activities: { label: 'Activities', icon: '🎟', accent: '#067647' },
  other: { label: 'Other', icon: '·', accent: '#475467' },
};
function execGroupOf(row: DispatchRow): ExecGroupKey {
  const t = String(row.operationType || row.serviceType || '').toUpperCase();
  if (t === 'TRANSPORT' || /TRANSFER|TRANSPORT/.test(t)) return 'transfers';
  if (t === 'HOTEL' || /ACCOMMODATION|LODGING/.test(t)) return 'checkIns';
  if (t === 'GUIDE' || /GUIDE|GUIDING/.test(t)) return 'guides';
  if (['ACTIVITY', 'EXCURSION', 'TICKET'].includes(t) || /ACTIVITY|EXCURSION|TICKET|MUSEUM/.test(t)) return 'activities';
  return 'other';
}
function groupByExecType(rows: DispatchRow[]): Record<ExecGroupKey, DispatchRow[]> {
  const out: Record<ExecGroupKey, DispatchRow[]> = {
    transfers: [], checkIns: [], guides: [], activities: [], other: [],
  };
  for (const r of rows) {
    if (r) out[execGroupOf(r)].push(r);
  }
  return out;
}

// "Started 12 min ago" / "Dispatched 1h 23m ago". Server-rendered, so we
// snap to the SSR moment — refreshing updates it.
function formatTimeAgo(iso: string | null, prefix: string): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return `${prefix} just now`;
  if (minutes < 60) return `${prefix} ${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${prefix} ${h}h${m > 0 ? ` ${m}m` : ''} ago`;
}

// Time-in-state badge — surfaces how long this row has been in its current
// execution state. Drift on operations becomes visible as the number climbs.
function TimeInStateBadge({ row }: { row: DispatchRow }) {
  let text: string | null = null;
  let tone = '#175cd3';
  if (row.executionStatus === 'IN_PROGRESS') {
    text = formatTimeAgo(row.startedAt, 'Started');
    tone = '#b54708';
  } else if (row.executionStatus === 'DISPATCHED') {
    text = formatTimeAgo(row.dispatchedAt, 'Dispatched');
    tone = '#175cd3';
  } else if (row.executionStatus === 'ISSUE') {
    text = formatTimeAgo(row.issueReportedAt, 'Issue raised');
    tone = '#b42318';
  } else if (row.executionStatus === 'COMPLETED') {
    text = formatTimeAgo(row.completedAt, 'Completed');
    tone = '#067647';
  }
  if (!text) return null;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        background: '#ffffff',
        color: tone,
        border: `1px solid ${tone}`,
        padding: '0.1rem 0.45rem',
        borderRadius: 999,
        fontSize: '0.72rem',
        fontWeight: 700,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      ⏱ {text}
    </span>
  );
}

// Live execution sections — split In Progress into operational sub-groups
// (transfers / check-ins / guides / activities) so the dispatch desk can
// scan by domain. Delayed/Issues stays as its own dominant block. Completed
// Today renders below the timeline as a daily summary rather than competing
// for top-of-page attention.
function ExecutionSections({ data, returnTo }: { data: DispatchResponse; returnTo: string }) {
  if (!data.execution) return null;

  const inProgressRows = data.execution.inProgress?.rows ?? [];
  const delayedRows = data.execution.delayedIssues?.rows ?? [];
  const groups = groupByExecType(inProgressRows);
  const anyInProgress = inProgressRows.length > 0;
  const anyDelayed = delayedRows.length > 0;
  if (!anyInProgress && !anyDelayed) return null;

  const order: ExecGroupKey[] = ['transfers', 'checkIns', 'guides', 'activities', 'other'];

  return (
    <section
      style={{
        background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)',
        border: '1px solid var(--ds-color-info-border, #84CAFF)',
        borderRadius: 12,
        padding: '0.85rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        boxShadow: '0 2px 6px rgba(23, 92, 211, 0.08)',
      }}
      aria-label="Live operations"
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div>
          <p
            style={{
              margin: 0,
              color: 'var(--ds-color-info, #175CD3)',
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <span
              aria-hidden
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--ds-color-info, #175CD3)',
                boxShadow: '0 0 0 4px rgba(23, 92, 211, 0.18)',
              }}
            />
            Live Operations · happening now
          </p>
          <h2 style={{ margin: 0, color: 'var(--ds-color-text, #0F172A)' }}>
            {inProgressRows.length} in progress
            {anyDelayed ? ` · ${delayedRows.length} delayed / issue` : ''}
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {order.map((key) => {
            const count = groups[key].length;
            if (count === 0) return null;
            const meta = EXEC_GROUP_META[key];
            return (
              <span
                key={key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  background: '#ffffff',
                  color: meta.accent,
                  border: `1px solid ${meta.accent}`,
                  padding: '0.2rem 0.55rem',
                  borderRadius: 999,
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                <span aria-hidden>{meta.icon}</span> {meta.label} · {count}
              </span>
            );
          })}
        </div>
      </div>

      {anyInProgress
        ? order.map((key) => {
            const rows = groups[key];
            if (rows.length === 0) return null;
            const meta = EXEC_GROUP_META[key];
            return (
              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '1rem' }} aria-hidden>{meta.icon}</span>
                  <h3 style={{ margin: 0, fontSize: '0.95rem', color: meta.accent }}>
                    Active {meta.label.toLowerCase()}
                  </h3>
                  <span style={{ color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.8rem' }}>· {rows.length}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {rows.map((row) => (
                    <div key={`live-${key}-${row.serviceId}`} style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', top: '0.5rem', right: '0.65rem', zIndex: 1 }}>
                        <TimeInStateBadge row={row} />
                      </div>
                      <DispatchCard row={row} returnTo={returnTo} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        : null}

      {anyDelayed ? (
        <div
          style={{
            background: 'var(--ds-color-danger-surface, #FEF3F2)',
            border: '1px solid #f04438',
            borderRadius: 10,
            padding: '0.75rem 0.85rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span aria-hidden style={{ fontSize: '1rem' }}>⚠</span>
            <h3 style={{ margin: 0, color: 'var(--ds-color-danger, #B42318)', fontSize: '1rem' }}>
              Delayed / Issue · resolve now
            </h3>
            <span style={{ color: '#7a271a', fontSize: '0.85rem' }}>· {delayedRows.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {delayedRows.map((row) => (
              <div key={`delayed-${row.serviceId}`} style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: '0.5rem', right: '0.65rem', zIndex: 1 }}>
                  <TimeInStateBadge row={row} />
                </div>
                <DispatchCard row={row} returnTo={returnTo} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

// Compact "completed today" summary — lives below the timeline so the dispatch
// desk can see what already shipped without it competing for top-of-page
// attention with live ops + critical prep.
function CompletedTodaySummary({ data }: { data: DispatchResponse }) {
  const rows = data.execution?.completedToday?.rows ?? [];
  if (rows.length === 0) return null;
  const groups = groupByExecType(rows);
  const order: ExecGroupKey[] = ['transfers', 'checkIns', 'guides', 'activities', 'other'];
  return (
    <section
      style={{
        background: 'var(--ds-color-success-surface, #ECFDF3)',
        border: '1px solid #12b76a',
        borderRadius: 10,
        padding: '0.65rem 0.9rem',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '0.75rem',
      }}
      aria-label="Completed today"
    >
      <strong style={{ color: 'var(--ds-color-success, #067647)', fontSize: '0.95rem' }}>
        ✓ {rows.length} completed today
      </strong>
      {order.map((key) => {
        const count = groups[key].length;
        if (count === 0) return null;
        const meta = EXEC_GROUP_META[key];
        return (
          <span
            key={key}
            style={{
              color: 'var(--ds-color-success, #067647)',
              fontSize: '0.82rem',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
            }}
          >
            <span aria-hidden>{meta.icon}</span> {meta.label.toLowerCase()}: {count}
          </span>
        );
      })}
    </section>
  );
}

// Timeline view — flattens all unique rows across lanes, groups by exact
// scheduled time (e.g. "08:30", "11:00", "14:00") so the dispatch desk reads
// like a train schedule rather than a generic "morning / afternoon" digest.
// Multi-service slots cluster naturally. Unscheduled rows fall to a final
// section so they don't dilute the timeline.
function TimelineView({ data, returnTo }: { data: DispatchResponse; returnTo: string }) {
  // Deduplicate rows across lanes (a transport row that's also an arrival
  // shows in both lanes; here it should appear once on the timeline).
  const seen = new Set<string>();
  const allRows: DispatchRow[] = [];
  const lanes = data.lanes ? Object.values(data.lanes) : [];
  for (const lane of lanes) {
    if (!lane || !Array.isArray(lane.rows)) continue;
    for (const row of lane.rows) {
      if (!row || !row.serviceId || seen.has(row.serviceId)) continue;
      seen.add(row.serviceId);
      allRows.push(row);
    }
  }

  // Group by exact formatted time. Rows with no time go to "unscheduled."
  const slotMap = new Map<string, DispatchRow[]>();
  const unscheduled: DispatchRow[] = [];
  for (const row of allRows) {
    const t = formatTime(row.time);
    if (!t) {
      unscheduled.push(row);
      continue;
    }
    if (!slotMap.has(t)) slotMap.set(t, []);
    slotMap.get(t)!.push(row);
  }
  // Sort each slot's rows: critical first, then stable by booking ref.
  for (const list of slotMap.values()) {
    list.sort((a, b) => {
      const sr = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (sr !== 0) return sr;
      return String(a.bookingRef || '').localeCompare(String(b.bookingRef || ''));
    });
  }
  // Order slots chronologically.
  const orderedSlots = [...slotMap.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {orderedSlots.map(([time, rows]) => {
        const critical = rows.filter((r) => r.severity === 'CRITICAL').length;
        const action = rows.filter((r) => r.severity === 'ACTION REQUIRED').length;
        return (
          <div
            key={time}
            style={{
              display: 'grid',
              gridTemplateColumns: '5rem minmax(0, 1fr)',
              gap: '0.75rem',
              alignItems: 'start',
            }}
          >
            <div
              style={{
                position: 'sticky',
                top: '0.5rem',
                background: '#ffffff',
                padding: '0.5rem 0 0.5rem 0',
                borderRight: '2px solid var(--ds-color-border-subtle, #E4E7EC)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.2rem',
                alignItems: 'flex-end',
                paddingRight: '0.75rem',
                zIndex: 1,
              }}
            >
              <strong
                style={{
                  fontSize: '1.6rem',
                  color: critical > 0 ? 'var(--ds-color-danger, #B42318)' : action > 0 ? 'var(--ds-color-warning, #B54708)' : 'var(--ds-color-text, #0F172A)',
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}
              >
                {time}
              </strong>
              <span style={{ color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.04em' }}>
                {rows.length} svc{rows.length === 1 ? '' : 's'}
              </span>
              {critical > 0 ? (
                <span style={{ background: 'var(--ds-color-danger-surface, #FEF3F2)', color: 'var(--ds-color-danger, #B42318)', padding: '0.1rem 0.4rem', borderRadius: 4, fontSize: '0.65rem', fontWeight: 800 }}>
                  ⚠ {critical}
                </span>
              ) : null}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '0.5rem' }}>
              {rows.map((row) => <DispatchCard key={`tl-${row.serviceId}`} row={row} returnTo={returnTo} />)}
            </div>
          </div>
        );
      })}
      {unscheduled.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '5rem minmax(0, 1fr)',
            gap: '0.75rem',
            alignItems: 'start',
            marginTop: '0.5rem',
          }}
        >
          <div
            style={{
              padding: '0.5rem 0.75rem 0.5rem 0',
              borderRight: '2px dashed #d0d5dd',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: '0.2rem',
            }}
          >
            <strong style={{ fontSize: '0.95rem', color: 'var(--ds-color-text-muted, #475569)', textAlign: 'right' }}>UNSCHED.</strong>
            <span style={{ color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.72rem', fontWeight: 600 }}>
              {unscheduled.length} svc{unscheduled.length === 1 ? '' : 's'}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingTop: '0.5rem' }}>
            {unscheduled.map((row) => <DispatchCard key={`tl-u-${row.serviceId}`} row={row} returnTo={returnTo} />)}
          </div>
        </div>
      ) : null}
      {allRows.length === 0 ? (
        <p style={{ color: 'var(--ds-color-text-subtle, #667085)' }}>No services in this window.</p>
      ) : null}
    </section>
  );
}

const EMPTY_LANE: Lane = { label: '', rows: [], total: 0, critical: 0, actionRequired: 0, ready: 0 };

function LanesView({ data, returnTo }: { data: DispatchResponse; returnTo: string }) {
  // Guard against an older API response shape missing the lanes block —
  // render an empty state instead of crashing the page.
  if (!data.lanes) {
    return (
      <section style={{ color: 'var(--ds-color-text-subtle, #667085)', padding: '1rem', border: '1px dashed #d0d5dd', borderRadius: 8 }}>
        Lanes view is not available for this response. Switch to Timeline view.
      </section>
    );
  }
  const l = data.lanes;
  const arrivals = l.arrivals || { ...EMPTY_LANE, label: 'Arrivals' };
  const departures = l.departures || { ...EMPTY_LANE, label: 'Departures' };
  const hotels = l.hotels || { ...EMPTY_LANE, label: 'Hotels' };
  const transport = l.transport || { ...EMPTY_LANE, label: 'Transport' };
  const activities = l.activities || { ...EMPTY_LANE, label: 'Activities' };
  const guides = l.guides || { ...EMPTY_LANE, label: 'Guides' };
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <LaneBlock lane={arrivals} startOpen={arrivals.total > 0} returnTo={returnTo} />
      <LaneBlock lane={departures} startOpen={departures.total > 0} returnTo={returnTo} />
      <LaneBlock lane={hotels} startOpen={hotels.critical > 0 || hotels.actionRequired > 0} returnTo={returnTo} />
      <LaneBlock lane={transport} startOpen={transport.critical > 0 || transport.actionRequired > 0} returnTo={returnTo} />
      <LaneBlock lane={activities} startOpen={activities.critical > 0} returnTo={returnTo} />
      <LaneBlock lane={guides} startOpen={guides.critical > 0} returnTo={returnTo} />
    </section>
  );
}

function SidebarStat({ label, value, accent, sub }: { label: string; value: number | string; accent: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', padding: '0.35rem 0', borderBottom: '1px solid var(--ds-color-surface-soft, #F9FAFB)' }}>
      <div>
        <div style={{ color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.78rem' }}>{label}</div>
        {sub ? <div style={{ color: 'var(--ds-color-text-faint, #94A3B8)', fontSize: '0.7rem' }}>{sub}</div> : null}
      </div>
      <strong style={{ color: accent, fontSize: '1.15rem' }}>{value}</strong>
    </div>
  );
}
