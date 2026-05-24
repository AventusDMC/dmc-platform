import Link from 'next/link';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../../lib/admin-server';
import { OPERATIONS_TIME_ZONE } from '../../lib/operations-timezone';

type Severity = 'INFO' | 'ACTION REQUIRED' | 'CRITICAL';

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
  driverName: string | null;
  vehicleName: string | null;
  vehicleType: string | null;
  guideName: string | null;
  guidePhone: string | null;
  guideLanguages: string[];
  guideReportingTime: string | null;
  pickupLocation: string | null;
  dropoffLocation: string | null;
  meetingPoint: string | null;
  confirmationReference: string | null;
  routeName: string | null;
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
  }>;
};

const RANGE_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'tomorrow', label: 'Tomorrow' },
  { value: 'next-7-days', label: 'Next 7 days' },
] as const;

const SEVERITY_TONE: Record<Severity, { bg: string; border: string; pillBg: string; pillText: string; label: string }> = {
  CRITICAL: { bg: '#fef3f2', border: '#f04438', pillBg: '#f04438', pillText: '#ffffff', label: 'CRITICAL' },
  'ACTION REQUIRED': { bg: '#fff8eb', border: '#f79009', pillBg: '#f79009', pillText: '#ffffff', label: 'ACTION' },
  INFO: { bg: '#f0fdf4', border: '#12b76a', pillBg: '#12b76a', pillText: '#ffffff', label: 'READY' },
};

function severityTone(severity: Severity) {
  return SEVERITY_TONE[severity] || SEVERITY_TONE.INFO;
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

function buildHref(range: string) {
  const params = new URLSearchParams();
  params.set('range', range);
  return `/operations/dispatch?${params.toString()}`;
}

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
  const palette: Record<string, { bg: string; border: string; text: string }> = {
    info: { bg: '#eff8ff', border: '#84caff', text: '#175cd3' },
    action: { bg: '#fff8eb', border: '#f79009', text: '#b54708' },
    critical: { bg: '#fef3f2', border: '#f04438', text: '#b42318' },
    ready: { bg: '#f0fdf4', border: '#12b76a', text: '#067647' },
  };
  const p = palette[tone];
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
        padding: '0.15rem 0.5rem',
        borderRadius: 999,
        fontSize: '0.68rem',
        fontWeight: 700,
        letterSpacing: '0.04em',
      }}
    >
      {tone.label}
    </span>
  );
}

function StatusPill({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <span
      style={{
        background: ok ? '#ecfdf3' : '#f2f4f7',
        color: ok ? '#067647' : '#475467',
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

function DispatchCard({ row }: { row: DispatchRow }) {
  const tone = severityTone(row.severity);
  const time = formatTime(row.time);
  return (
    <article
      style={{
        background: '#ffffff',
        borderLeft: `4px solid ${tone.border}`,
        borderRadius: 8,
        padding: '0.7rem 0.9rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'baseline' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', minWidth: 0, flex: 1 }}>
          {time ? <strong style={{ fontSize: '1rem', color: '#101828' }}>{time}</strong> : null}
          <span style={{ fontSize: '0.95rem', fontWeight: 600, color: '#101828', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {row.description || row.serviceType || 'Service'}
          </span>
        </div>
        <SeverityPill severity={row.severity} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', color: '#475467', fontSize: '0.82rem' }}>
        <span>{row.bookingRef || 'Booking'}</span>
        {row.clientName ? <span>· {row.clientName}</span> : null}
        {row.dayNumber ? <span>· Day {row.dayNumber}{row.dayTitle ? ` (${row.dayTitle})` : ''}</span> : null}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
        <StatusPill label="Supplier" value={row.supplierName || 'Supplier missing'} ok={Boolean(row.supplierName)} />
        <StatusPill label="Confirmation" value={row.confirmationStatus} ok={row.confirmationStatus === 'CONFIRMED'} />
        <StatusPill label="Voucher" value={row.voucherStatus} ok={['GENERATED', 'SENT', 'ISSUED', 'READY'].includes(row.voucherStatus)} />
        {row.driverName ? <StatusPill label="Driver" value={`Driver: ${row.driverName}`} ok /> : null}
        {row.vehicleName ? <StatusPill label="Vehicle" value={row.vehicleName} ok /> : null}
        {row.guideName ? <StatusPill label="Guide" value={`Guide: ${row.guideName}`} ok /> : null}
      </div>

      {row.reasons.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#b54708', fontSize: '0.8rem' }}>
          {row.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
        <Link className="button button-tertiary" href={`/bookings/${row.bookingId}`}>
          Open booking
        </Link>
        <Link className="button button-tertiary" href={`/bookings/${row.bookingId}/operations`}>
          Operations
        </Link>
        {row.voucherId ? (
          <Link className="button button-tertiary" href={`/bookings/${row.bookingId}/operations/${row.serviceId}/voucher`}>
            Voucher
          </Link>
        ) : null}
      </div>

      <details style={{ fontSize: '0.78rem', color: '#667085' }}>
        <summary style={{ cursor: 'pointer' }}>Secondary details</summary>
        <div style={{ marginTop: '0.4rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.25rem' }}>
          {row.pickupLocation ? <div><span>Pickup:</span> <strong>{row.pickupLocation}</strong></div> : null}
          {row.dropoffLocation ? <div><span>Dropoff:</span> <strong>{row.dropoffLocation}</strong></div> : null}
          {row.meetingPoint ? <div><span>Meeting:</span> <strong>{row.meetingPoint}</strong></div> : null}
          {row.routeName ? <div><span>Route:</span> <strong>{row.routeName}</strong></div> : null}
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

function LaneBlock({ lane, startOpen }: { lane: Lane; startOpen: boolean }) {
  const buckets: Record<string, DispatchRow[]> = {
    morning: [],
    afternoon: [],
    evening: [],
    unscheduled: [],
  };
  for (const row of lane.rows) {
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
        border: '1px solid #e4e7ec',
        borderRadius: 10,
        padding: '0.75rem 1rem',
      }}
    >
      <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{lane.label}</h3>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <span style={{ color: '#667085', fontSize: '0.85rem' }}>{lane.total} total</span>
            {lane.critical > 0 ? (
              <span style={{ background: '#fef3f2', color: '#b42318', padding: '0.1rem 0.5rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700 }}>
                {lane.critical} critical
              </span>
            ) : null}
            {lane.actionRequired > 0 ? (
              <span style={{ background: '#fff8eb', color: '#b54708', padding: '0.1rem 0.5rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700 }}>
                {lane.actionRequired} action
              </span>
            ) : null}
            {lane.ready > 0 ? (
              <span style={{ background: '#ecfdf3', color: '#067647', padding: '0.1rem 0.5rem', borderRadius: 6, fontSize: '0.75rem', fontWeight: 700 }}>
                {lane.ready} ready
              </span>
            ) : null}
          </div>
        </div>
      </summary>
      {lane.total === 0 ? (
        <p style={{ color: '#667085', margin: '0.5rem 0 0' }}>No {lane.label.toLowerCase()} in this window.</p>
      ) : (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {sectionsToRender.map(([bucketLabel, rows]) =>
            rows.length === 0 ? null : (
              <div key={bucketLabel}>
                <p style={{ margin: '0 0 0.4rem', color: '#475467', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  {bucketLabel} · {rows.length}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {rows.map((row) => <DispatchCard key={`${lane.label}-${row.serviceId}`} row={row} />)}
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

  const query = new URLSearchParams();
  query.set('range', range);

  let data: DispatchResponse | null = null;
  let fetchError: string | null = null;
  try {
    data = await adminPageFetchJson<DispatchResponse>(
      `${ADMIN_API_BASE_URL}/operations/dispatch?${query.toString()}`,
      'Operations dispatch',
      { cache: 'no-store' },
    );
  } catch (error) {
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
  const criticalRows = data.sections.criticalIssues.rows;

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs items={[{ label: 'Operations', href: '/operations' }, { label: 'Dispatch' }]} />
        <div className="admin-heading-row">
          <div>
            <h1>Operations Dispatch</h1>
            <p className="admin-muted-copy">
              {data.range.label} · {data.range.from}{data.range.from !== data.range.to ? ` → ${data.range.to}` : ''} · {c.totalRows} service rows in window
            </p>
          </div>
          <div className="admin-heading-actions" style={{ display: 'flex', gap: '0.5rem' }}>
            {RANGE_OPTIONS.map((opt) => (
              <Link
                key={opt.value}
                className={`button ${range === opt.value ? 'button-primary' : 'button-secondary'}`}
                href={buildHref(opt.value)}
              >
                {opt.label}
              </Link>
            ))}
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

          {/* Critical Issues — dominant red banner if any */}
          {criticalRows.length > 0 ? (
            <section
              style={{
                background: '#fef3f2',
                border: '2px solid #f04438',
                borderRadius: 12,
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
                <div>
                  <p style={{ margin: 0, color: '#b42318', fontWeight: 700, letterSpacing: '0.04em', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                    Critical · resolve first
                  </p>
                  <h2 style={{ margin: 0, color: '#7a271a' }}>{criticalRows.length} row{criticalRows.length === 1 ? '' : 's'} blocking dispatch</h2>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {criticalRows.slice(0, 10).map((row) => (
                  <DispatchCard key={`crit-${row.serviceId}`} row={{ ...row, severity: 'CRITICAL' }} />
                ))}
                {criticalRows.length > 10 ? (
                  <p style={{ margin: 0, color: '#7a271a', fontSize: '0.85rem' }}>
                    + {criticalRows.length - 10} more critical rows in the lanes below.
                  </p>
                ) : null}
              </div>
            </section>
          ) : (
            <section
              style={{
                background: '#f0fdf4',
                border: '1px solid #12b76a',
                borderRadius: 12,
                padding: '0.85rem 1rem',
                color: '#067647',
              }}
            >
              <strong>No critical issues blocking dispatch in this window.</strong>
            </section>
          )}

          {/* Collapsible lanes */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <LaneBlock lane={data.lanes.arrivals} startOpen={data.lanes.arrivals.total > 0} />
            <LaneBlock lane={data.lanes.departures} startOpen={data.lanes.departures.total > 0} />
            <LaneBlock lane={data.lanes.hotels} startOpen={data.lanes.hotels.critical > 0 || data.lanes.hotels.actionRequired > 0} />
            <LaneBlock lane={data.lanes.transport} startOpen={data.lanes.transport.critical > 0 || data.lanes.transport.actionRequired > 0} />
            <LaneBlock lane={data.lanes.activities} startOpen={data.lanes.activities.critical > 0} />
            <LaneBlock lane={data.lanes.guides} startOpen={data.lanes.guides.critical > 0} />
          </section>
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
            border: '1px solid #e4e7ec',
            borderRadius: 10,
            padding: '0.85rem 1rem',
          }}
        >
          <p style={{ margin: 0, color: '#475467', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
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

function SidebarStat({ label, value, accent, sub }: { label: string; value: number | string; accent: string; sub?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', padding: '0.35rem 0', borderBottom: '1px solid #f2f4f7' }}>
      <div>
        <div style={{ color: '#475467', fontSize: '0.78rem' }}>{label}</div>
        {sub ? <div style={{ color: '#98a2b3', fontSize: '0.7rem' }}>{sub}</div> : null}
      </div>
      <strong style={{ color: accent, fontSize: '1.15rem' }}>{value}</strong>
    </div>
  );
}
