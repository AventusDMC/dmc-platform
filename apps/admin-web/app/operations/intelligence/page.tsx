import Link from 'next/link';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { AppAlert } from '../../components/ui';
import { ADMIN_API_BASE_URL, adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';
import { STATUS_TONE } from '../../lib/status-tone';

export const dynamic = 'force-dynamic';

type Performer = {
  id: string;
  name: string;
  totalServices: number;
  incidentCount: number;
  delayedCount: number;
  completedCount: number;
  incidentRatePct: number;
  delayedRatePct: number;
  completionPct: number;
  avgDelayMinutes: number;
};

type BottleneckEntry = {
  key: string;
  label: string;
  category: 'route' | 'hotel' | 'supplier' | 'hour' | 'day';
  totalServices: number;
  incidentCount: number;
  delayedCount: number;
  insight: string;
};

type ForecastDay = {
  date: string;
  dayLabel: string;
  totalServices: number;
  driverUtilizationPct: number;
  vehicleUtilizationPct: number;
  guideUtilizationPct: number;
  loadLevel: 'low' | 'medium' | 'high' | 'overloaded';
};

type HeatmapCell = {
  dayOfWeek: number;
  dayLabel: string;
  bucket: 'morning' | 'afternoon' | 'evening' | 'late';
  totalServices: number;
  incidentCount: number;
};

type TrendPoint = {
  weekLabel: string;
  dispatchedCount: number;
  completedCount: number;
  incidentCount: number;
  delayedCount: number;
};

type IntelligenceDashboard = {
  rangeDays: number;
  window: { from: string; to: string };
  efficiency: {
    totalServices: number;
    completedCount: number;
    delayedCount: number;
    onTimeCount: number;
    reassignmentCount: number;
    completedOnTimePct: number;
    delayedPct: number;
    completionPct: number;
  };
  sla: {
    totalIncidents: number;
    resolvedIncidents: number;
    avgResolutionMinutes: number | null;
    escalationCount: number;
    oldestUnresolvedAgeMinutes: number | null;
    operationalCompletionPct: number;
  };
  supplierPerformance: Performer[];
  driverPerformance: Performer[];
  guidePerformance: Performer[];
  bottlenecks: BottleneckEntry[];
  capacityForecast: ForecastDay[];
  heatmap: HeatmapCell[];
  trends: TrendPoint[];
  warnings: string[];
};

async function loadDashboard(): Promise<{ data: IntelligenceDashboard | null; error: string | null }> {
  try {
    const data = await adminPageFetchJson<IntelligenceDashboard>(
      `${ADMIN_API_BASE_URL}/operations/intelligence?rangeDays=30`,
      'Intelligence dashboard',
      { cache: 'no-store' },
    );
    return { data, error: null };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[intelligence] fetch failed', error);
    const message = error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error);
    return { data: null, error: message };
  }
}

const LOAD_TONE: Record<ForecastDay['loadLevel'], { bg: string; text: string; border: string }> = {
  low: { bg: '#f0fdf4', text: '#067647', border: '#12b76a' },
  medium: { bg: '#fffbeb', text: '#a16207', border: '#fde68a' },
  high: { bg: '#fff8eb', text: '#b54708', border: '#f79009' },
  overloaded: { bg: '#fef3f2', text: '#b42318', border: '#f04438' },
};

function heatmapTone(value: number, max: number) {
  if (value === 0) return { bg: '#fafbfc', text: '#98a2b3' };
  const ratio = max > 0 ? value / max : 0;
  if (ratio < 0.25) return { bg: '#eff8ff', text: '#175cd3' };
  if (ratio < 0.5) return { bg: '#dbeafe', text: '#1e40af' };
  if (ratio < 0.75) return { bg: '#fff8eb', text: '#b54708' };
  return { bg: '#fef3f2', text: '#b42318' };
}

export default async function IntelligencePage() {
  const { data, error } = await loadDashboard();

  if (!data) {
    return (
      <main className="admin-page-shell">
        <div className="admin-page-heading">
          <AdminBreadcrumbs items={[{ label: 'Operations', href: '/operations' }, { label: 'Intelligence' }]} />
          <h1>Operations Intelligence</h1>
        </div>
        <AppAlert tone="danger">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <strong>Could not load intelligence dashboard.</strong>
            {error ? (
              <details>
                <summary style={{ cursor: 'pointer', color: '#7a271a', fontWeight: 600 }}>Error details</summary>
                <pre
                  style={{
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.78rem',
                    color: '#7a271a',
                    maxHeight: '20rem',
                    overflow: 'auto',
                    marginTop: '0.5rem',
                  }}
                >
                  {error}
                </pre>
              </details>
            ) : null}
          </div>
        </AppAlert>
      </main>
    );
  }

  const maxHeatmap = data.heatmap.reduce((m, c) => Math.max(m, c.totalServices), 0);

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs items={[{ label: 'Operations', href: '/operations' }, { label: 'Intelligence' }]} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1>Operations Intelligence</h1>
            <p className="admin-muted-copy">
              Analytics over the last {data.rangeDays} days ({data.window.from} → {data.window.to}). Where operations fail, where capacity breaks,
              which suppliers and resources are risky, and what's coming next.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Link
              href="/operations/intelligence/financial"
              style={{
                background: '#b54708',
                color: '#ffffff',
                padding: '0.6rem 1rem',
                borderRadius: 8,
                fontWeight: 700,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              💰 Financial Convergence →
            </Link>
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
      </div>

      {/* Warnings */}
      {data.warnings.length > 0 ? (
        <AppAlert tone="warning" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <strong style={{ fontSize: '0.85rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              ⚠ Intelligence Warnings
            </strong>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#7a2e0e' }}>
              {data.warnings.map((w, i) => (
                <li key={i} style={{ marginBottom: '0.2rem' }}>{w}</li>
              ))}
            </ul>
          </div>
        </AppAlert>
      ) : null}

      {/* Efficiency + SLA strip */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
        <Stat label="Total services" value={data.efficiency.totalServices} tone="info" />
        <Stat label="Completion %" value={`${data.efficiency.completionPct}%`} tone="ready" />
        <Stat label="On-time of completed" value={`${data.efficiency.completedOnTimePct}%`} tone="ready" />
        <Stat label="Delayed %" value={`${data.efficiency.delayedPct}%`} tone={data.efficiency.delayedPct > 10 ? 'action' : 'ready'} />
        <Stat label="Total incidents" value={data.sla.totalIncidents} tone={data.sla.totalIncidents > 0 ? 'action' : 'ready'} />
        <Stat
          label="Avg resolution"
          value={data.sla.avgResolutionMinutes != null ? `${data.sla.avgResolutionMinutes}m` : '—'}
          tone="info"
          sub={`${data.sla.resolvedIncidents} resolved`}
        />
        <Stat
          label="Escalations"
          value={data.sla.escalationCount}
          tone={data.sla.escalationCount > 0 ? 'critical' : 'ready'}
        />
        <Stat label="Reassignments" value={data.efficiency.reassignmentCount} tone="info" />
      </section>

      {/* Capacity forecast — 14-day strip */}
      <Panel title="Capacity Forecast · next 14 days" accent="#175cd3">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, minmax(0, 1fr))', gap: '0.25rem' }}>
          {data.capacityForecast.map((d) => {
            const tone = LOAD_TONE[d.loadLevel];
            return (
              <div
                key={d.date}
                title={`${d.dayLabel}\nDrivers: ${d.driverUtilizationPct}%\nVehicles: ${d.vehicleUtilizationPct}%\nGuides: ${d.guideUtilizationPct}%`}
                style={{
                  background: tone.bg,
                  border: `1px solid ${tone.border}`,
                  borderRadius: 6,
                  padding: '0.35rem 0.25rem',
                  textAlign: 'center',
                  fontSize: '0.7rem',
                  color: tone.text,
                  fontWeight: 700,
                }}
              >
                <div>{d.dayLabel}</div>
                <div style={{ fontSize: '0.85rem', marginTop: '0.15rem' }}>{d.totalServices}</div>
                <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>
                  D{d.driverUtilizationPct}/V{d.vehicleUtilizationPct}
                </div>
              </div>
            );
          })}
        </div>
        <p style={{ margin: '0.5rem 0 0', color: '#667085', fontSize: '0.78rem' }}>
          Top number = services scheduled. D/V = driver / vehicle utilisation %. Green = low, amber = high, red = overloaded.
        </p>
      </Panel>

      {/* Heatmap */}
      <Panel title="Operations Heatmap · day-of-week × time-of-day" accent="#7e22ce">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem', color: '#667085' }}></th>
              <th style={{ padding: '0.35rem 0.5rem', color: '#667085' }}>Morning</th>
              <th style={{ padding: '0.35rem 0.5rem', color: '#667085' }}>Afternoon</th>
              <th style={{ padding: '0.35rem 0.5rem', color: '#667085' }}>Evening</th>
              <th style={{ padding: '0.35rem 0.5rem', color: '#667085' }}>Late</th>
            </tr>
          </thead>
          <tbody>
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
              <tr key={day}>
                <th style={{ textAlign: 'right', padding: '0.4rem 0.5rem', color: '#475467', fontWeight: 600 }}>{day}</th>
                {(['morning', 'afternoon', 'evening', 'late'] as const).map((bucket) => {
                  const cell = data.heatmap.find((c) => c.dayOfWeek === idx && c.bucket === bucket);
                  const total = cell?.totalServices ?? 0;
                  const inc = cell?.incidentCount ?? 0;
                  const tone = heatmapTone(total, maxHeatmap);
                  return (
                    <td
                      key={bucket}
                      style={{
                        background: tone.bg,
                        color: tone.text,
                        padding: '0.55rem 0.5rem',
                        textAlign: 'center',
                        fontWeight: 700,
                        borderRadius: 4,
                        border: '1px solid #ffffff',
                      }}
                      title={`${total} services${inc > 0 ? `, ${inc} incidents` : ''}`}
                    >
                      {total}
                      {inc > 0 ? <span style={{ color: '#b42318', marginLeft: '0.3rem', fontSize: '0.72rem' }}>⚠{inc}</span> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {/* Trends */}
      <Panel title="Weekly Trends · last 4 weeks" accent="#067647">
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
              <th style={{ padding: '0.5rem' }}>Week starting</th>
              <th style={{ padding: '0.5rem', textAlign: 'right' }}>Dispatched</th>
              <th style={{ padding: '0.5rem', textAlign: 'right' }}>Completed</th>
              <th style={{ padding: '0.5rem', textAlign: 'right' }}>Delayed</th>
              <th style={{ padding: '0.5rem', textAlign: 'right' }}>Incidents</th>
            </tr>
          </thead>
          <tbody>
            {data.trends.map((t, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f2f4f7' }}>
                <td style={{ padding: '0.5rem', fontWeight: 600 }}>{t.weekLabel}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right' }}>{t.dispatchedCount}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right', color: '#067647' }}>{t.completedCount}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right', color: t.delayedCount > 0 ? '#b54708' : '#475467' }}>{t.delayedCount}</td>
                <td style={{ padding: '0.5rem', textAlign: 'right', color: t.incidentCount > 0 ? '#b42318' : '#475467', fontWeight: 700 }}>
                  {t.incidentCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {/* Bottlenecks */}
      {data.bottlenecks.length > 0 ? (
        <Panel title="Operational Bottlenecks" accent="#b42318">
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
            {data.bottlenecks.slice(0, 10).map((b) => (
              <li
                key={b.key}
                style={{
                  display: 'flex',
                  gap: '0.55rem',
                  padding: '0.55rem 0.75rem',
                  background: '#fafbfc',
                  border: '1px solid #e4e7ec',
                  borderRadius: 6,
                  alignItems: 'center',
                  fontSize: '0.85rem',
                }}
              >
                <span
                  style={{
                    background: '#fef3f2',
                    color: '#b42318',
                    padding: '0.1rem 0.45rem',
                    borderRadius: 4,
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                  }}
                >
                  {b.category}
                </span>
                <strong>{b.label}</strong>
                <span style={{ flex: 1, color: '#475467' }}>{b.insight}</span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {/* Performance tables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
        <PerformerTable title="Supplier performance" accent="#175cd3" performers={data.supplierPerformance} />
        <PerformerTable title="Driver performance" accent="#7e22ce" performers={data.driverPerformance} />
        <PerformerTable title="Guide performance" accent="#b54708" performers={data.guidePerformance} />
      </div>
    </main>
  );
}

function Panel({ title, accent, children }: { title: string; accent: string; children: any }) {
  return (
    <section
      style={{
        background: '#ffffff',
        border: '1px solid #e4e7ec',
        borderLeft: `6px solid ${accent}`,
        borderRadius: 10,
        padding: '0.85rem 1rem',
        marginBottom: '1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
      }}
    >
      <h2 style={{ margin: 0, color: accent, fontSize: '1.05rem' }}>{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: number | string; tone: 'info' | 'action' | 'critical' | 'ready'; sub?: string }) {
  const p = STATUS_TONE[tone];
  return (
    <div
      style={{
        background: p.bg,
        border: `1px solid ${p.border}`,
        borderRadius: 10,
        padding: '0.75rem 0.9rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.15rem',
      }}
    >
      <span style={{ color: p.text, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ color: p.text, fontSize: '1.6rem', lineHeight: 1, fontWeight: 700 }}>{value}</strong>
      {sub ? <span style={{ color: p.text, fontSize: '0.74rem', opacity: 0.85 }}>{sub}</span> : null}
    </div>
  );
}

function PerformerTable({ title, accent, performers }: { title: string; accent: string; performers: Performer[] }) {
  return (
    <Panel title={title} accent={accent}>
      {performers.length === 0 ? (
        <p style={{ color: '#667085', fontSize: '0.85rem', margin: 0 }}>No assignments in window.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
              <th style={{ padding: '0.4rem' }}>Name</th>
              <th style={{ padding: '0.4rem', textAlign: 'right' }}>Svcs</th>
              <th style={{ padding: '0.4rem', textAlign: 'right' }}>Incident %</th>
              <th style={{ padding: '0.4rem', textAlign: 'right' }}>Delayed %</th>
              <th style={{ padding: '0.4rem', textAlign: 'right' }}>Done %</th>
            </tr>
          </thead>
          <tbody>
            {performers.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f2f4f7' }}>
                <td style={{ padding: '0.4rem', fontWeight: 600 }}>{p.name}</td>
                <td style={{ padding: '0.4rem', textAlign: 'right' }}>{p.totalServices}</td>
                <td
                  style={{
                    padding: '0.4rem',
                    textAlign: 'right',
                    color: p.incidentRatePct >= 20 ? '#b42318' : p.incidentRatePct > 0 ? '#b54708' : '#475467',
                    fontWeight: 600,
                  }}
                >
                  {p.incidentRatePct}%
                </td>
                <td
                  style={{
                    padding: '0.4rem',
                    textAlign: 'right',
                    color: p.delayedRatePct >= 20 ? '#b42318' : p.delayedRatePct > 0 ? '#b54708' : '#475467',
                  }}
                >
                  {p.delayedRatePct}%{p.avgDelayMinutes > 0 ? ` · ${p.avgDelayMinutes}m` : ''}
                </td>
                <td style={{ padding: '0.4rem', textAlign: 'right', color: '#067647', fontWeight: 600 }}>{p.completionPct}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
