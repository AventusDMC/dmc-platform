import Link from 'next/link';
import { AdminBreadcrumbs } from '../../../components/AdminBreadcrumbs';
import { AppAlert } from '../../../components/ui';
import { ADMIN_API_BASE_URL, adminPageFetchJson, isNextRedirectError } from '../../../lib/admin-server';
import { STATUS_TONE } from '../../../lib/status-tone';

export const dynamic = 'force-dynamic';

type SupplierIntelligence = {
  id: string;
  name: string;
  totalServices: number;
  incidentCount: number;
  delayedCount: number;
  slaBreaches: number;
  completedCount: number;
  noShowCount: number;
  estimatedLeakage: number;
  reliabilityScore: number;
  recoverySuccessPct: number;
};

type RowImpact = {
  bookingServiceId: string;
  bookingRef: string | null;
  supplierName: string | null;
  operationType: string;
  issueType: string | null;
  delayMinutes: number;
  reassignments: number;
  pax: number;
  estimatedDelayCost: number;
  estimatedReassignmentCost: number;
  estimatedSupplierReplacementCost: number;
  estimatedHotelMoveCost: number;
  estimatedRecoveryCost: number;
  estimatedTotalCost: number;
};

type FinancialDashboard = {
  rangeDays: number;
  window: { from: string; to: string };
  heuristicRates: Record<string, number>;
  summary: {
    totalServices: number;
    incidentCount: number;
    estimatedTotalLeakage: number;
    avgLeakagePerService: number;
    openSlaExposure: number;
  };
  leakageByCategory: Array<{ category: string; amount: number; color: string }>;
  preferredSuppliers: SupplierIntelligence[];
  riskSuppliers: SupplierIntelligence[];
  suppliers: SupplierIntelligence[];
  topCostRows: RowImpact[];
  alerts: string[];
};

async function loadDashboard(): Promise<{ data: FinancialDashboard | null; error: string | null }> {
  try {
    const data = await adminPageFetchJson<FinancialDashboard>(
      `${ADMIN_API_BASE_URL}/operations/intelligence/financial?rangeDays=30`,
      'Financial intelligence',
      { cache: 'no-store' },
    );
    return { data, error: null };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error);
    return { data: null, error: message };
  }
}

function money(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function reliabilityTone(score: number) {
  if (score >= 80) return { bg: '#f0fdf4', border: '#12b76a', text: '#067647', label: 'Reliable' };
  if (score >= 50) return { bg: '#fff8eb', border: '#f79009', text: '#b54708', label: 'At-risk' };
  return { bg: '#fef3f2', border: '#f04438', text: '#b42318', label: 'High-risk' };
}

export default async function FinancialIntelligencePage() {
  const { data, error } = await loadDashboard();

  if (!data) {
    return (
      <main className="admin-page-shell">
        <div className="admin-page-heading">
          <AdminBreadcrumbs
            items={[
              { label: 'Operations', href: '/operations' },
              { label: 'Intelligence', href: '/operations/intelligence' },
              { label: 'Financial' },
            ]}
          />
          <h1>Financial Intelligence</h1>
        </div>
        <AppAlert tone="danger">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <strong>Could not load financial intelligence dashboard.</strong>
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

  const maxCategoryAmount = data.leakageByCategory.reduce((m, c) => Math.max(m, c.amount), 0);

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs
          items={[
            { label: 'Operations', href: '/operations' },
            { label: 'Intelligence', href: '/operations/intelligence' },
            { label: 'Financial' },
          ]}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1>Financial + Operational Convergence</h1>
            <p className="admin-muted-copy">
              Heuristic cost-leakage estimates over the last {data.rangeDays} days ({data.window.from} → {data.window.to}). Every figure here is an
              <strong> estimate</strong> based on platform-level cost assumptions — see the rates block at the bottom. Use to spot trends and prioritise
              follow-ups, not as a substitute for accounting.
            </p>
          </div>
          <Link
            href="/operations/intelligence"
            style={{
              background: 'var(--ds-color-info, #175CD3)',
              color: '#ffffff',
              padding: '0.6rem 1rem',
              borderRadius: 8,
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            ← Back to Operations Intelligence
          </Link>
        </div>
      </div>

      {/* Alerts */}
      {data.alerts.length > 0 ? (
        <AppAlert tone="warning" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <strong style={{ fontSize: '0.85rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              ⚠ Financial Intelligence Alerts
            </strong>
            <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#7a2e0e' }}>
              {data.alerts.map((a, i) => (
                <li key={i} style={{ marginBottom: '0.2rem' }}>{a}</li>
              ))}
            </ul>
          </div>
        </AppAlert>
      ) : null}

      {/* Summary strip */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
        <Stat
          label="Total estimated leakage"
          value={money(data.summary.estimatedTotalLeakage)}
          tone={data.summary.estimatedTotalLeakage > 500 ? 'critical' : data.summary.estimatedTotalLeakage > 100 ? 'action' : 'ready'}
          sub={`over ${data.rangeDays}d`}
        />
        <Stat
          label="Avg leakage / service"
          value={money(data.summary.avgLeakagePerService)}
          tone={data.summary.avgLeakagePerService > 20 ? 'action' : 'ready'}
        />
        <Stat label="Total services" value={data.summary.totalServices} tone="info" />
        <Stat
          label="Cost-bearing incidents"
          value={data.summary.incidentCount}
          tone={data.summary.incidentCount > 0 ? 'action' : 'ready'}
        />
        <Stat
          label="SLA exposure"
          value={money(data.summary.openSlaExposure)}
          tone={data.summary.openSlaExposure > 1000 ? 'critical' : data.summary.openSlaExposure > 0 ? 'action' : 'ready'}
          sub="Refund/compensation risk"
        />
      </section>

      {/* Leakage breakdown */}
      <Panel title="Margin Leakage by Category" accent="#b42318">
        {data.leakageByCategory.length === 0 ? (
          <p style={{ color: 'var(--ds-color-success, #067647)', margin: 0 }}>✓ No cost leakage detected in the window.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {data.leakageByCategory.map((c) => {
              const widthPct = maxCategoryAmount > 0 ? Math.round((c.amount / maxCategoryAmount) * 100) : 0;
              return (
                <li key={c.category} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ minWidth: '12rem', fontWeight: 600 }}>{c.category}</span>
                  <span style={{ minWidth: '6rem', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: c.color }}>
                    {money(c.amount)}
                  </span>
                  <span style={{ flex: 1, background: 'var(--ds-color-surface-soft, #F9FAFB)', borderRadius: 999, height: 10, position: 'relative', overflow: 'hidden' }}>
                    <span
                      style={{
                        background: c.color,
                        height: '100%',
                        width: `${widthPct}%`,
                        display: 'block',
                        borderRadius: 999,
                      }}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* Preferred + risk suppliers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1rem' }}>
        <Panel title="Preferred Suppliers · most reliable" accent="#067647">
          <SupplierTable suppliers={data.preferredSuppliers} emptyLabel="Not enough data — needs at least 3 services per supplier." />
        </Panel>
        <Panel title="High-Risk Suppliers · margin leakage" accent="#b42318">
          <SupplierTable suppliers={data.riskSuppliers} emptyLabel="✓ No high-risk suppliers in the window." />
        </Panel>
      </div>

      {/* Top cost-impact rows */}
      <Panel title="Top Cost-Impact Operations" accent="#7e22ce">
        {data.topCostRows.length === 0 ? (
          <p style={{ color: 'var(--ds-color-text-subtle, #667085)', margin: 0 }}>No cost-impacted rows in the window.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--ds-color-surface-soft, #F9FAFB)', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Booking</th>
                <th style={{ padding: '0.5rem' }}>Type</th>
                <th style={{ padding: '0.5rem' }}>Supplier</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Delay</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Reass.</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Pax</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {data.topCostRows.map((r) => (
                <tr key={r.bookingServiceId} style={{ borderBottom: '1px solid var(--ds-color-surface-soft, #F9FAFB)' }}>
                  <td style={{ padding: '0.5rem', fontWeight: 600 }}>{r.bookingRef || r.bookingServiceId.slice(0, 8)}</td>
                  <td style={{ padding: '0.5rem' }}>{r.operationType}</td>
                  <td style={{ padding: '0.5rem' }}>{r.supplierName || '—'}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right', color: r.delayMinutes > 30 ? 'var(--ds-color-danger, #B42318)' : 'var(--ds-color-text-muted, #475569)' }}>
                    {r.delayMinutes > 0 ? `${r.delayMinutes}m` : '—'}
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>{r.reassignments || '—'}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>{r.pax}</td>
                  <td
                    style={{
                      padding: '0.5rem',
                      textAlign: 'right',
                      fontWeight: 700,
                      color: r.estimatedTotalCost > 100 ? 'var(--ds-color-danger, #B42318)' : r.estimatedTotalCost > 20 ? 'var(--ds-color-warning, #B54708)' : 'var(--ds-color-text-muted, #475569)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {money(r.estimatedTotalCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {/* Heuristic rates disclaimer */}
      <section
        style={{
          background: '#fafbfc',
          border: '1px dashed #d0d5dd',
          borderRadius: 10,
          padding: '0.85rem 1rem',
          color: 'var(--ds-color-text-muted, #475569)',
          fontSize: '0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
        }}
      >
        <strong style={{ color: 'var(--ds-color-text, #0F172A)' }}>Heuristic cost model (v1)</strong>
        <p style={{ margin: 0 }}>
          Real per-incident cost tracking needs an <code>IncidentCostEntry</code> schema (deferred to v2). For now the platform estimates leakage with these
          constants:
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li>Delay cost: <strong>${data.heuristicRates.delayPerMinPerPax}/min/pax</strong></li>
          <li>Driver reassignment: <strong>${data.heuristicRates.driverReassignment} per event</strong></li>
          <li>Vehicle reassignment: <strong>${data.heuristicRates.vehicleReassignment} per event</strong></li>
          <li>Guide reassignment: <strong>${data.heuristicRates.guideReassignment} per event</strong></li>
          <li>Supplier replacement: flat <strong>${data.heuristicRates.supplierReplacementFlat}</strong></li>
          <li>Hotel move: <strong>${data.heuristicRates.hotelMovePerRoomingGroup} per rooming group</strong></li>
          <li>Recovery handling: <strong>${data.heuristicRates.recoveryHandlingPerIncident} per incident</strong></li>
        </ul>
      </section>
    </main>
  );
}

function Panel({ title, accent, children }: { title: string; accent: string; children: any }) {
  return (
    <section
      style={{
        background: '#ffffff',
        border: '1px solid var(--ds-color-border-subtle, #E4E7EC)',
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
        padding: '0.85rem 1rem',
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

function SupplierTable({ suppliers, emptyLabel }: { suppliers: SupplierIntelligence[]; emptyLabel: string }) {
  if (suppliers.length === 0) {
    return <p style={{ color: 'var(--ds-color-text-subtle, #667085)', margin: 0 }}>{emptyLabel}</p>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
      <thead>
        <tr style={{ background: 'var(--ds-color-surface-soft, #F9FAFB)', textAlign: 'left' }}>
          <th style={{ padding: '0.4rem' }}>Supplier</th>
          <th style={{ padding: '0.4rem', textAlign: 'center' }}>Reliability</th>
          <th style={{ padding: '0.4rem', textAlign: 'right' }}>Svcs</th>
          <th style={{ padding: '0.4rem', textAlign: 'right' }}>Incidents</th>
          <th style={{ padding: '0.4rem', textAlign: 'right' }}>Recovery %</th>
          <th style={{ padding: '0.4rem', textAlign: 'right' }}>Est. leakage</th>
        </tr>
      </thead>
      <tbody>
        {suppliers.map((s) => {
          const tone = reliabilityTone(s.reliabilityScore);
          return (
            <tr key={s.id} style={{ borderBottom: '1px solid var(--ds-color-surface-soft, #F9FAFB)' }}>
              <td style={{ padding: '0.4rem', fontWeight: 600 }}>{s.name}</td>
              <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                <span
                  style={{
                    background: tone.bg,
                    color: tone.text,
                    border: `1px solid ${tone.border}`,
                    padding: '0.15rem 0.55rem',
                    borderRadius: 999,
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                  }}
                >
                  {s.reliabilityScore} · {tone.label}
                </span>
              </td>
              <td style={{ padding: '0.4rem', textAlign: 'right' }}>{s.totalServices}</td>
              <td
                style={{
                  padding: '0.4rem',
                  textAlign: 'right',
                  color: s.incidentCount > 0 ? 'var(--ds-color-danger, #B42318)' : 'var(--ds-color-text-muted, #475569)',
                  fontWeight: 600,
                }}
              >
                {s.incidentCount}
              </td>
              <td style={{ padding: '0.4rem', textAlign: 'right' }}>{s.recoverySuccessPct}%</td>
              <td
                style={{
                  padding: '0.4rem',
                  textAlign: 'right',
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 700,
                  color: s.estimatedLeakage > 100 ? 'var(--ds-color-danger, #B42318)' : s.estimatedLeakage > 0 ? 'var(--ds-color-warning, #B54708)' : 'var(--ds-color-text-muted, #475569)',
                }}
              >
                {money(s.estimatedLeakage)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
