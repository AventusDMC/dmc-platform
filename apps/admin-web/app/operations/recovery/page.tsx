import Link from 'next/link';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { ADMIN_API_BASE_URL, adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';
import { OPERATIONS_TIME_ZONE } from '../../lib/operations-timezone';
import { RecoveryActions } from './RecoveryActions';

export const dynamic = 'force-dynamic';

type DispatchRow = {
  bookingId: string;
  bookingRef: string | null;
  serviceId: string;
  description: string | null;
  operationType: string | null;
  serviceType: string | null;
  time: string | null;
  date: string | null;
  supplierName: string | null;
  confirmationStatus: string;
  voucherStatus: string;
  issueType: string | null;
  issueSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  issueEffectiveSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  issueAgeMinutes: number | null;
  issueNotes: string | null;
  issueReportedAt: string | null;
  delayMinutes: number | null;
  executionStatus: string;
  driverName: string | null;
  driverPhone: string | null;
  vehicleName: string | null;
};

type DispatchResponse = {
  counters: {
    recoveryQueueCount: number;
    awaitingReassignmentCount: number;
    slaBreachesCount: number;
    escalatedIncidentsCount: number;
    activeIncidentsCount: number;
    delayedOperationsCount: number;
  };
  execution: {
    resolutionQueue?: { count: number; rows: DispatchRow[] };
  };
};

type RecoveryMetrics = {
  rangeDays: number;
  resolvedTodayCount: number;
  openIncidentsCount: number;
  avgResolutionMinutes: number | null;
  delayedOpsPct: number;
  totalScheduledInWindow: number;
  delayedInWindow: number;
};

async function loadDispatch(): Promise<DispatchResponse | null> {
  try {
    return await adminPageFetchJson<DispatchResponse>(
      `${ADMIN_API_BASE_URL}/operations/dispatch?range=next-7-days`,
      'Dispatch (recovery)',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[recovery] dispatch fetch failed', error);
    return null;
  }
}

async function loadMetrics(): Promise<RecoveryMetrics | null> {
  try {
    return await adminPageFetchJson<RecoveryMetrics>(
      `${ADMIN_API_BASE_URL}/operations/recovery/metrics?rangeDays=7`,
      'Recovery metrics',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[recovery] metrics fetch failed', error);
    return null;
  }
}

function formatTime(time: string | null) {
  if (!time) return null;
  const match = String(time).match(/(\d{1,2}):(\d{2})/);
  if (!match) return time;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
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

const SEV_TONE: Record<string, { bg: string; border: string; text: string }> = {
  LOW: { bg: '#f0fdf4', border: '#12b76a', text: '#067647' },
  MEDIUM: { bg: '#fff8eb', border: '#f79009', text: '#b54708' },
  HIGH: { bg: '#fef3f2', border: '#f04438', text: '#b42318' },
  CRITICAL: { bg: '#fef3f2', border: '#b42318', text: '#7a271a' },
};

function bucketsFromRows(rows: DispatchRow[]) {
  // Three buckets — same set, different lenses on the incident pool:
  //  awaitingReassignment: no supplier OR confirmation rejected
  //  criticalUnresolved:   effective severity HIGH or CRITICAL
  //  slaBreach:            open > 30 minutes
  // A row can land in multiple buckets; the UI shows the same card in each
  // bucket so operators can scan by the lens that's most useful right now.
  const awaiting: DispatchRow[] = [];
  const critical: DispatchRow[] = [];
  const slaBreach: DispatchRow[] = [];
  for (const row of rows) {
    const noSupplier = !row.supplierName;
    const rejected = row.confirmationStatus === 'REJECTED';
    const sev = row.issueEffectiveSeverity || row.issueSeverity;
    const ageMin = row.issueAgeMinutes ?? 0;
    if (noSupplier || rejected) awaiting.push(row);
    if (sev === 'HIGH' || sev === 'CRITICAL') critical.push(row);
    if (ageMin >= 30) slaBreach.push(row);
  }
  return { awaiting, critical, slaBreach };
}

export default async function RecoveryPage() {
  const [dispatch, metrics] = await Promise.all([loadDispatch(), loadMetrics()]);
  const rows = dispatch?.execution?.resolutionQueue?.rows ?? [];
  const buckets = bucketsFromRows(rows);
  const c = dispatch?.counters;

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs items={[{ label: 'Operations', href: '/operations' }, { label: 'Recovery' }]} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1>Operational Recovery</h1>
            <p className="admin-muted-copy">
              Central command for active incidents. Replacement suggestions, cascading impact, and recovery actions all live here.
            </p>
          </div>
          <Link
            href="/operations/dispatch"
            style={{
              background: '#175cd3',
              color: '#ffffff',
              padding: '0.6rem 1rem',
              borderRadius: 8,
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            Open Dispatch →
          </Link>
        </div>
      </div>

      {/* Recovery metrics row */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
        <MetricCard label="Resolved today" value={metrics?.resolvedTodayCount ?? 0} tone="ready" />
        <MetricCard
          label="Open incidents"
          value={c?.recoveryQueueCount ?? metrics?.openIncidentsCount ?? 0}
          tone={(c?.recoveryQueueCount ?? 0) > 0 ? 'critical' : 'ready'}
        />
        <MetricCard
          label="Avg resolution"
          value={metrics?.avgResolutionMinutes != null ? `${metrics.avgResolutionMinutes}m` : '—'}
          tone="info"
          sub={`over last ${metrics?.rangeDays ?? 7}d`}
        />
        <MetricCard
          label="Delayed ops %"
          value={`${metrics?.delayedOpsPct ?? 0}%`}
          tone={(metrics?.delayedOpsPct ?? 0) > 10 ? 'action' : 'ready'}
          sub={`${metrics?.delayedInWindow ?? 0}/${metrics?.totalScheduledInWindow ?? 0} in window`}
        />
        <MetricCard
          label="SLA breaches"
          value={c?.slaBreachesCount ?? 0}
          tone={(c?.slaBreachesCount ?? 0) > 0 ? 'critical' : 'ready'}
          sub="open > 30 min"
        />
        <MetricCard
          label="Awaiting reassignment"
          value={c?.awaitingReassignmentCount ?? 0}
          tone={(c?.awaitingReassignmentCount ?? 0) > 0 ? 'action' : 'ready'}
        />
      </section>

      {rows.length === 0 ? (
        <section
          style={{
            background: '#f0fdf4',
            border: '1px solid #12b76a',
            borderRadius: 12,
            padding: '1.5rem',
            textAlign: 'center',
            color: '#067647',
          }}
        >
          <strong style={{ fontSize: '1.1rem' }}>✓ No active incidents in the next 7 days.</strong>
          <p style={{ margin: '0.5rem 0 0', color: '#475467' }}>
            Use{' '}
            <Link href="/operations/simulation" style={{ color: '#175cd3', fontWeight: 700 }}>
              /operations/simulation
            </Link>{' '}
            to inject scenarios for testing.
          </p>
        </section>
      ) : (
        <>
          <RecoveryBucket
            title="Awaiting Reassignment"
            description="Incidents with no supplier assigned or with a rejected confirmation."
            accent="#f79009"
            rows={buckets.awaiting}
          />
          <RecoveryBucket
            title="Critical Unresolved"
            description="Effective severity HIGH or CRITICAL after SLA aging applied."
            accent="#b42318"
            rows={buckets.critical}
          />
          <RecoveryBucket
            title="SLA Breach"
            description="Open longer than 30 minutes — operator response window exceeded."
            accent="#7a271a"
            rows={buckets.slaBreach}
          />
        </>
      )}
    </main>
  );
}

function MetricCard({
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
      <strong style={{ color: p.text, fontSize: '1.9rem', lineHeight: 1, fontWeight: 700 }}>{value}</strong>
      {sub ? <span style={{ color: p.text, fontSize: '0.78rem', opacity: 0.85 }}>{sub}</span> : null}
    </div>
  );
}

function RecoveryBucket({
  title,
  description,
  accent,
  rows,
}: {
  title: string;
  description: string;
  accent: string;
  rows: DispatchRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <section
      style={{
        background: '#ffffff',
        border: `1px solid ${accent}`,
        borderLeft: `6px solid ${accent}`,
        borderRadius: 10,
        padding: '0.85rem 1rem',
        marginBottom: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
      }}
    >
      <div>
        <h2 style={{ margin: 0, color: accent }}>
          {title} · {rows.length}
        </h2>
        <p style={{ margin: 0, color: '#667085', fontSize: '0.85rem' }}>{description}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {rows.map((row) => (
          <IncidentCard key={`${title}-${row.serviceId}`} row={row} />
        ))}
      </div>
    </section>
  );
}

function IncidentCard({ row }: { row: DispatchRow }) {
  const sevTone = SEV_TONE[row.issueEffectiveSeverity || row.issueSeverity || 'MEDIUM'];
  const time = formatTime(row.time);
  const date = formatDate(row.date);
  const type = String(row.operationType || row.serviceType || '').toUpperCase();
  return (
    <article
      style={{
        background: '#ffffff',
        border: '1px solid #e4e7ec',
        borderRadius: 10,
        padding: '0.75rem 0.85rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.55rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
          {time ? (
            <strong style={{ fontSize: '1.25rem', color: '#101828', fontVariantNumeric: 'tabular-nums' }}>{time}</strong>
          ) : null}
          <strong style={{ fontSize: '1rem' }}>{row.description || type || 'Service'}</strong>
          {date ? <span style={{ color: '#667085', fontSize: '0.85rem' }}>{date}</span> : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
          {row.issueEffectiveSeverity || row.issueSeverity ? (
            <span
              style={{
                background: sevTone.bg,
                color: sevTone.text,
                border: `1px solid ${sevTone.border}`,
                padding: '0.15rem 0.55rem',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 800,
                letterSpacing: '0.04em',
              }}
            >
              {row.issueEffectiveSeverity || row.issueSeverity}
              {row.issueAgeMinutes != null ? ` · ${row.issueAgeMinutes}m` : ''}
            </span>
          ) : null}
          {row.delayMinutes && row.delayMinutes > 0 ? (
            <span
              style={{
                background: '#fef3f2',
                color: '#b42318',
                border: '1px solid #f04438',
                padding: '0.1rem 0.5rem',
                borderRadius: 999,
                fontSize: '0.7rem',
                fontWeight: 800,
              }}
            >
              ⏱ DELAYED {row.delayMinutes}m
            </span>
          ) : null}
        </div>
      </div>

      <div style={{ color: '#475467', fontSize: '0.85rem' }}>
        <strong>{row.bookingRef || 'Booking'}</strong>
        {row.supplierName ? ` · Supplier: ${row.supplierName}` : ' · No supplier'}
        {row.driverName ? ` · Driver: ${row.driverName}` : ''}
        {row.vehicleName ? ` · ${row.vehicleName}` : ''}
      </div>

      {row.issueNotes ? (
        <p style={{ margin: 0, color: '#7a271a', fontSize: '0.85rem' }}>
          ⚠ {row.issueNotes}
        </p>
      ) : null}

      <RecoveryActions row={row} />
    </article>
  );
}
