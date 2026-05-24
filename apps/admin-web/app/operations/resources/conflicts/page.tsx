import Link from 'next/link';
import { AdminBreadcrumbs } from '../../../components/AdminBreadcrumbs';
import { ADMIN_API_BASE_URL, adminPageFetchJson, isNextRedirectError } from '../../../lib/admin-server';
import { OPERATIONS_TIME_ZONE } from '../../../lib/operations-timezone';

export const dynamic = 'force-dynamic';

type ConflictService = {
  bookingServiceId: string;
  bookingId: string;
  bookingRef: string | null;
  description: string;
  operationType: string;
  serviceDate: string | null;
  startTime: string | null;
  executionStatus: string;
};

type ResourceConflict = {
  resourceType: 'DRIVER' | 'VEHICLE' | 'GUIDE';
  resourceId: string;
  resourceName: string;
  severity: 'WARNING' | 'BLOCKING' | 'CRITICAL';
  reason: string;
  services: ConflictService[];
};

type ConflictsResponse = {
  rangeDays: number;
  counts: {
    total: number;
    warning: number;
    blocking: number;
    critical: number;
    driver: number;
    vehicle: number;
    guide: number;
    hotelAllotment: number;
    activityCapacity: number;
  };
  driver: ResourceConflict[];
  vehicle: ResourceConflict[];
  guide: ResourceConflict[];
  hotelAllotment: ResourceConflict[];
  activityCapacity: ResourceConflict[];
};

type UtilizationResponse = {
  rangeDays: number;
  operatingDayHours: number;
  drivers: { active: number; committedHours: number; availableHours: number; utilizationPct: number };
  vehicles: { active: number; committedHours: number; availableHours: number; utilizationPct: number };
  guides: { active: number; committedHours: number; availableHours: number; utilizationPct: number };
};

async function loadConflicts(): Promise<ConflictsResponse | null> {
  try {
    return await adminPageFetchJson<ConflictsResponse>(
      `${ADMIN_API_BASE_URL}/operations/resources/conflicts?rangeDays=14`,
      'Resource conflicts',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[resources/conflicts] fetch failed', error);
    return null;
  }
}

async function loadUtilization(): Promise<UtilizationResponse | null> {
  try {
    return await adminPageFetchJson<UtilizationResponse>(
      `${ADMIN_API_BASE_URL}/operations/resources/utilization?rangeDays=7`,
      'Resource utilization',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[resources/utilization] fetch failed', error);
    return null;
  }
}

const SEV_TONE: Record<string, { bg: string; border: string; text: string; label: string }> = {
  WARNING: { bg: '#fff8eb', border: '#f79009', text: '#b54708', label: 'WARNING' },
  BLOCKING: { bg: '#fef3f2', border: '#f04438', text: '#b42318', label: 'BLOCKING' },
  CRITICAL: { bg: '#fef3f2', border: '#b42318', text: '#7a271a', label: 'CRITICAL' },
};

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

export default async function ResourceConflictsPage() {
  const [conflicts, utilization] = await Promise.all([loadConflicts(), loadUtilization()]);

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs
          items={[
            { label: 'Operations', href: '/operations' },
            { label: 'Resources' },
            { label: 'Conflicts' },
          ]}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1>Resource Conflict Center</h1>
            <p className="admin-muted-copy">
              Detects double-booked drivers / vehicles / guides across all bookings in the next {conflicts?.rangeDays ?? 14} days. Surfaces tight
              turnarounds (&lt;30 min gap) as warnings, overlapping windows as blocking, and overlaps where the resource is already DISPATCHED or
              IN_PROGRESS as critical.
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

      {/* Utilization metrics */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
        <UtilCard label="Driver utilization" data={utilization?.drivers} />
        <UtilCard label="Vehicle utilization" data={utilization?.vehicles} />
        <UtilCard label="Guide utilization" data={utilization?.guides} />
        <ConflictCounter label="Conflicts (total)" value={conflicts?.counts.total ?? 0} tone="critical" />
        <ConflictCounter label="Blocking" value={conflicts?.counts.blocking ?? 0} tone="critical" />
        <ConflictCounter label="Warnings" value={conflicts?.counts.warning ?? 0} tone="action" />
      </section>

      {conflicts && conflicts.counts.total === 0 ? (
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
          <strong style={{ fontSize: '1.1rem' }}>✓ No resource conflicts in the next {conflicts.rangeDays} days.</strong>
          <p style={{ margin: '0.5rem 0 0', color: '#475467' }}>
            Every assigned driver, vehicle, and guide is scheduled with room to breathe.
          </p>
        </section>
      ) : null}

      <ConflictSection
        title="Driver Conflicts"
        accent="#175cd3"
        conflicts={conflicts?.driver || []}
        resourceLabel="Driver"
        resourceType="driver"
      />
      <ConflictSection
        title="Vehicle Conflicts"
        accent="#7e22ce"
        conflicts={conflicts?.vehicle || []}
        resourceLabel="Vehicle"
        resourceType="vehicle"
      />
      <ConflictSection
        title="Guide Conflicts"
        accent="#b54708"
        conflicts={conflicts?.guide || []}
        resourceLabel="Guide"
        resourceType="guide"
      />

      {/* Hotel allotment + activity capacity sections placeholder for v2. */}
      <section
        style={{
          background: '#fafbfc',
          border: '1px dashed #d0d5dd',
          borderRadius: 10,
          padding: '0.85rem 1rem',
          color: '#667085',
          fontSize: '0.85rem',
          marginBottom: '1rem',
        }}
      >
        <strong>Hotel allotment + activity capacity tracking — coming in v2.</strong>
        <p style={{ margin: '0.4rem 0 0' }}>
          Requires per-contract allotment data and per-activity capacity fields. Once modelled, the same detection engine will surface them under
          dedicated sections here.
        </p>
      </section>
    </main>
  );
}

function UtilCard({
  label,
  data,
}: {
  label: string;
  data?: { active: number; committedHours: number; availableHours: number; utilizationPct: number };
}) {
  const pct = data?.utilizationPct ?? 0;
  const tone =
    pct >= 80
      ? { bg: '#fef3f2', border: '#f04438', text: '#b42318' }
      : pct >= 50
      ? { bg: '#fff8eb', border: '#f79009', text: '#b54708' }
      : { bg: '#f0fdf4', border: '#12b76a', text: '#067647' };
  return (
    <div
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 10,
        padding: '0.85rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
      }}
    >
      <span style={{ color: tone.text, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <strong style={{ color: tone.text, fontSize: '1.9rem', lineHeight: 1, fontWeight: 700 }}>{pct}%</strong>
      <span style={{ color: tone.text, fontSize: '0.78rem', opacity: 0.85 }}>
        {data?.committedHours ?? 0}h / {data?.availableHours ?? 0}h · {data?.active ?? 0} resources
      </span>
    </div>
  );
}

function ConflictCounter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'critical' | 'action' | 'ready';
}) {
  const palette: Record<string, { bg: string; border: string; text: string }> = {
    critical: { bg: '#fef3f2', border: '#f04438', text: '#b42318' },
    action: { bg: '#fff8eb', border: '#f79009', text: '#b54708' },
    ready: { bg: '#f0fdf4', border: '#12b76a', text: '#067647' },
  };
  const p = value === 0 ? palette.ready : palette[tone];
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
      <span style={{ color: p.text, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ color: p.text, fontSize: '1.9rem', lineHeight: 1, fontWeight: 700 }}>{value}</strong>
    </div>
  );
}

function ConflictSection({
  title,
  accent,
  conflicts,
  resourceLabel,
  resourceType,
}: {
  title: string;
  accent: string;
  conflicts: ResourceConflict[];
  resourceLabel: string;
  resourceType: string;
}) {
  if (conflicts.length === 0) {
    return (
      <section
        style={{
          background: '#ffffff',
          border: `1px solid #e4e7ec`,
          borderLeft: `4px solid ${accent}`,
          borderRadius: 10,
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          color: '#475467',
          fontSize: '0.85rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>
          <strong style={{ color: accent }}>{title}</strong> · No conflicts detected
        </span>
        <span style={{ color: '#067647' }}>✓ Clear</span>
      </section>
    );
  }
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
      <h2 style={{ margin: 0, color: accent }}>
        {title} · {conflicts.length}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {conflicts.map((c) => (
          <ConflictCard key={`${c.resourceType}-${c.resourceId}`} conflict={c} resourceLabel={resourceLabel} resourceType={resourceType} />
        ))}
      </div>
    </section>
  );
}

function ConflictCard({
  conflict,
  resourceLabel,
  resourceType,
}: {
  conflict: ResourceConflict;
  resourceLabel: string;
  resourceType: string;
}) {
  const tone = SEV_TONE[conflict.severity];
  return (
    <article
      style={{
        background: '#ffffff',
        border: `1px solid ${tone.border}`,
        borderLeft: `4px solid ${tone.border}`,
        borderRadius: 10,
        padding: '0.75rem 0.85rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.55rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: '1.05rem' }}>
          {resourceLabel}: <span style={{ color: tone.text }}>{conflict.resourceName}</span>
        </strong>
        <span
          style={{
            background: tone.bg,
            color: tone.text,
            border: `1px solid ${tone.border}`,
            padding: '0.15rem 0.6rem',
            borderRadius: 999,
            fontSize: '0.72rem',
            fontWeight: 800,
            letterSpacing: '0.06em',
          }}
        >
          {tone.label}
        </span>
      </div>
      <p style={{ margin: 0, color: tone.text, fontSize: '0.85rem' }}>{conflict.reason}</p>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        {conflict.services.map((s) => (
          <li
            key={s.bookingServiceId}
            style={{
              display: 'flex',
              gap: '0.55rem',
              padding: '0.4rem 0.55rem',
              background: '#fafbfc',
              border: '1px solid #e4e7ec',
              borderRadius: 6,
              alignItems: 'center',
              fontSize: '0.85rem',
            }}
          >
            <strong style={{ fontVariantNumeric: 'tabular-nums', minWidth: '3.5rem' }}>
              {formatTime(s.startTime) || '—'}
            </strong>
            <span style={{ color: '#667085', minWidth: '4.5rem' }}>{formatDate(s.serviceDate)}</span>
            <span style={{ flex: 1 }}>
              <Link
                href={`/bookings/${s.bookingId}/operations`}
                style={{ color: '#175cd3', textDecoration: 'none', fontWeight: 600 }}
              >
                {s.bookingRef || s.bookingId.slice(0, 8)}
              </Link>
              {' · '}
              {s.description}
            </span>
            <span
              style={{
                background: '#f2f4f7',
                color: '#475467',
                padding: '0.1rem 0.45rem',
                borderRadius: 4,
                fontSize: '0.72rem',
                fontWeight: 700,
              }}
            >
              {s.operationType}
            </span>
            <span
              style={{
                background: s.executionStatus === 'READY' ? '#f2f4f7' : '#eff8ff',
                color: s.executionStatus === 'READY' ? '#475467' : '#175cd3',
                padding: '0.1rem 0.45rem',
                borderRadius: 4,
                fontSize: '0.72rem',
                fontWeight: 700,
              }}
            >
              {s.executionStatus}
            </span>
          </li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <Link
          href={`/operations/resources/timeline/${resourceType}/${conflict.resourceId}`}
          style={{
            background: '#ffffff',
            color: '#175cd3',
            border: '1px solid #84caff',
            padding: '0.4rem 0.75rem',
            borderRadius: 6,
            fontSize: '0.82rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          View timeline →
        </Link>
        <Link
          href="/operations/recovery"
          style={{
            background: '#ffffff',
            color: '#b54708',
            border: '1px solid #f79009',
            padding: '0.4rem 0.75rem',
            borderRadius: 6,
            fontSize: '0.82rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Open Recovery Center
        </Link>
      </div>
    </article>
  );
}
