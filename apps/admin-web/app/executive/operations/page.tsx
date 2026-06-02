import Link from 'next/link';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { AppAlert } from '../../components/ui';
import { ADMIN_API_BASE_URL, adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';

export const dynamic = 'force-dynamic';

type Kpis = {
  operationalHealthScore: number;
  operationalProfitabilityScore: number;
  marginLeakagePct: number;
  incidentFrequencyPct: number;
  slaBreachPct: number;
  dispatchCompletionPct: number;
  supplierReliabilityPct: number;
  recoverySuccessPct: number;
  delayedOperationsPct: number;
  onTimePct: number;
  unresolvedIssueAgeMinutes: number | null;
};

type FinancialExposure = {
  totalEstimatedLeakage: number;
  estimatedCompensationExposure: number;
  supplierRecoveryCost: number;
  reassignmentExposure: number;
  delayExposure: number;
  avgLeakagePerService: number;
};

type SummaryCards = {
  mostProfitableSupplier: { name: string; score: number; services: number } | null;
  highestRiskSupplier: { name: string; score: number; leakage: number } | null;
  biggestBottleneck: { label: string; category: string; insight: string } | null;
  mostOverloadedDay: { date: string; dayLabel: string; totalServices: number } | null;
  largestLeakageSource: {
    bookingRef: string | null;
    supplierName: string | null;
    estimatedCost: number;
    operationType: string;
  } | null;
};

type SupplierRank = {
  rank: number;
  id: string;
  name: string;
  totalServices: number;
  incidentCount: number;
  reliabilityScore: number;
  estimatedLeakage: number;
  recoverySuccessPct: number;
};

type TeamStat = {
  actor: string;
  totalActions: number;
  dispatches: number;
  resolutions: number;
  reassignments: number;
  escalations: number;
  avgResolutionMinutes: number | null;
};

type ForecastDay = {
  date: string;
  dayLabel: string;
  totalServices: number;
  driverUtilizationPct: number;
  vehicleUtilizationPct: number;
  loadLevel: 'low' | 'medium' | 'high' | 'overloaded';
};

type ExecutiveDashboard = {
  rangeDays: number;
  window: { from: string; to: string };
  kpis: Kpis;
  financialExposure: FinancialExposure;
  summaryCards: SummaryCards;
  strategicAlerts: string[];
  deltas: {
    current: { incidents: number; completed: number; delayed: number };
    previous: { incidents: number; completed: number; delayed: number };
    incidentsDelta: { absolute: number; changePct: number; direction: 'up' | 'down' | 'flat' };
    completedDelta: { absolute: number; changePct: number; direction: 'up' | 'down' | 'flat' };
    delayedDelta: { absolute: number; changePct: number; direction: 'up' | 'down' | 'flat' };
  };
  trends: Array<{ weekLabel: string; dispatchedCount: number; completedCount: number; incidentCount: number; delayedCount: number }>;
  capacityForecast: ForecastDay[];
  bottlenecks: Array<{ key: string; label: string; category: string; insight: string }>;
  supplierRanking: SupplierRank[];
  routeIntelligence: Array<{ label: string; category: string; insight: string }>;
  conflictsSummary: { total: number; blocking: number; critical: number };
  teamStats: TeamStat[];
};

async function loadDashboard(): Promise<{ data: ExecutiveDashboard | null; error: string | null }> {
  try {
    const data = await adminPageFetchJson<ExecutiveDashboard>(
      `${ADMIN_API_BASE_URL}/executive/operations?rangeDays=30`,
      'Executive operations',
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

function scoreTone(score: number) {
  if (score >= 80) return { bg: '#f0fdf4', border: '#12b76a', text: '#067647' };
  if (score >= 50) return { bg: '#fff8eb', border: '#f79009', text: '#b54708' };
  return { bg: '#fef3f2', border: '#f04438', text: '#b42318' };
}

function deltaArrow(d: { changePct: number; direction: 'up' | 'down' | 'flat' }, invertColor = false) {
  if (d.direction === 'flat') return { arrow: '→', color: '#475467', label: 'flat' };
  const isPositive = invertColor ? d.direction === 'down' : d.direction === 'up';
  return {
    arrow: d.direction === 'up' ? '↑' : '↓',
    color: isPositive ? '#067647' : '#b42318',
    label: `${Math.abs(d.changePct)}%`,
  };
}

export default async function ExecutivePage() {
  const { data, error } = await loadDashboard();

  if (!data) {
    return (
      <main className="admin-page-shell">
        <div className="admin-page-heading">
          <AdminBreadcrumbs items={[{ label: 'Executive' }, { label: 'Operations' }]} />
          <h1>Executive Operations</h1>
        </div>
        <AppAlert tone="danger">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <strong>Could not load executive dashboard.</strong>
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

  return (
    <main className="admin-page-shell executive-page">
      {/* Print-friendly stylesheet — hides nav + chrome, tightens spacing. */}
      <style>{`
        @media print {
          .admin-app-shell-nav, .admin-app-shell-sidebar, .admin-page-shell > .admin-page-heading > div:last-child { display: none !important; }
          .executive-page { padding: 0 !important; }
          .executive-no-print { display: none !important; }
          body { background: #ffffff !important; }
          .executive-panel { page-break-inside: avoid; }
          h1 { font-size: 1.5rem !important; }
          h2 { font-size: 1rem !important; }
        }
      `}</style>

      <div className="admin-page-heading">
        <AdminBreadcrumbs items={[{ label: 'Executive' }, { label: 'Operations' }]} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1>Executive Operations Intelligence</h1>
            <p className="admin-muted-copy">
              Strategic rollup over the last {data.rangeDays} days ({data.window.from} → {data.window.to}). Business health, operational profitability,
              strategic risk, and capacity outlook in one view.
            </p>
          </div>
          <div className="executive-no-print" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <form method="dialog">
              <button
                type="button"
                onClick={undefined}
                style={{
                  background: '#101828',
                  color: '#ffffff',
                  padding: '0.6rem 1rem',
                  borderRadius: 8,
                  fontWeight: 700,
                  border: '1px solid #101828',
                  cursor: 'pointer',
                }}
                aria-label="Print snapshot"
                data-print-trigger
              >
                🖨 Print snapshot
              </button>
            </form>
            <PrintScript />
            <Link
              href="/operations/intelligence"
              style={{
                background: '#175cd3',
                color: '#ffffff',
                padding: '0.6rem 1rem',
                borderRadius: 8,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Operations Intelligence →
            </Link>
          </div>
        </div>
      </div>

      {/* Strategic alerts banner */}
      {data.strategicAlerts.length > 0 ? (
        <section
          className="executive-panel"
          style={{
            background: '#fef3f2',
            border: '2px solid #b42318',
            borderRadius: 12,
            padding: '0.85rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.4rem',
          }}
        >
          <strong style={{ color: '#7a271a', fontSize: '0.85rem', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Strategic Alerts
          </strong>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#7a271a' }}>
            {data.strategicAlerts.map((a, i) => (
              <li key={i} style={{ marginBottom: '0.2rem' }}>{a}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* TOP-LINE EXECUTIVE KPIs */}
      <Panel title="Executive KPIs" accent="#101828">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
          <BigKpi label="Operational Health" value={`${data.kpis.operationalHealthScore}`} suffix="/100" score={data.kpis.operationalHealthScore} />
          <BigKpi label="Operational Profitability" value={`${data.kpis.operationalProfitabilityScore}`} suffix="/100" score={data.kpis.operationalProfitabilityScore} />
          <BigKpi label="Supplier Reliability" value={`${data.kpis.supplierReliabilityPct}`} suffix="/100" score={data.kpis.supplierReliabilityPct} />
          <BigKpi label="Dispatch Completion" value={`${data.kpis.dispatchCompletionPct}`} suffix="%" score={data.kpis.dispatchCompletionPct} />
          <BigKpi label="On-Time Rate" value={`${data.kpis.onTimePct}`} suffix="%" score={data.kpis.onTimePct} />
          <BigKpi label="Recovery Success" value={`${data.kpis.recoverySuccessPct}`} suffix="%" score={data.kpis.recoverySuccessPct} />
          <BigKpi label="Incident Frequency" value={`${data.kpis.incidentFrequencyPct}`} suffix="%" score={Math.max(0, 100 - data.kpis.incidentFrequencyPct * 2)} />
          <BigKpi label="Margin Leakage" value={`${data.kpis.marginLeakagePct}`} suffix="%" score={Math.max(0, 100 - data.kpis.marginLeakagePct * 2)} />
        </div>
      </Panel>

      {/* FINANCIAL EXPOSURE */}
      <Panel title="Financial Exposure" accent="#b54708">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
          <Stat label="Total estimated leakage" value={money(data.financialExposure.totalEstimatedLeakage)} tone={data.financialExposure.totalEstimatedLeakage > 1000 ? 'critical' : data.financialExposure.totalEstimatedLeakage > 100 ? 'action' : 'ready'} />
          <Stat label="Client compensation exposure" value={money(data.financialExposure.estimatedCompensationExposure)} tone={data.financialExposure.estimatedCompensationExposure > 0 ? 'action' : 'ready'} />
          <Stat label="Supplier recovery cost" value={money(data.financialExposure.supplierRecoveryCost)} tone={data.financialExposure.supplierRecoveryCost > 0 ? 'action' : 'ready'} />
          <Stat label="Reassignment overhead" value={money(data.financialExposure.reassignmentExposure)} tone={data.financialExposure.reassignmentExposure > 0 ? 'action' : 'ready'} />
          <Stat label="Delay cost" value={money(data.financialExposure.delayExposure)} tone={data.financialExposure.delayExposure > 0 ? 'action' : 'ready'} />
          <Stat label="Avg leakage per service" value={money(data.financialExposure.avgLeakagePerService)} tone="info" />
        </div>
        <p className="executive-no-print" style={{ margin: '0.5rem 0 0', color: '#667085', fontSize: '0.78rem' }}>
          All amounts are <strong>heuristic estimates</strong> — see <Link href="/operations/intelligence/financial" style={{ color: '#175cd3' }}>Financial Convergence</Link> for the underlying rate model.
        </p>
      </Panel>

      {/* AT-A-GLANCE summary cards */}
      <Panel title="Strategic Summary Cards" accent="#7e22ce">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.6rem' }}>
          <SummaryCard
            label="Most profitable supplier"
            primary={data.summaryCards.mostProfitableSupplier?.name || '—'}
            secondary={data.summaryCards.mostProfitableSupplier ? `${data.summaryCards.mostProfitableSupplier.score}/100 · ${data.summaryCards.mostProfitableSupplier.services} services` : 'Not enough data'}
            tone="ready"
          />
          <SummaryCard
            label="Highest-risk supplier"
            primary={data.summaryCards.highestRiskSupplier?.name || '—'}
            secondary={data.summaryCards.highestRiskSupplier ? `${data.summaryCards.highestRiskSupplier.score}/100 · ${money(data.summaryCards.highestRiskSupplier.leakage)} leakage` : 'No risk suppliers'}
            tone={data.summaryCards.highestRiskSupplier ? 'critical' : 'ready'}
          />
          <SummaryCard
            label="Biggest bottleneck"
            primary={data.summaryCards.biggestBottleneck?.label || '—'}
            secondary={data.summaryCards.biggestBottleneck?.insight || 'No bottlenecks detected'}
            tone={data.summaryCards.biggestBottleneck ? 'action' : 'ready'}
          />
          <SummaryCard
            label="Most overloaded day"
            primary={data.summaryCards.mostOverloadedDay?.dayLabel || '—'}
            secondary={data.summaryCards.mostOverloadedDay ? `${data.summaryCards.mostOverloadedDay.totalServices} services` : 'No overload forecast'}
            tone={data.summaryCards.mostOverloadedDay ? 'critical' : 'ready'}
          />
          <SummaryCard
            label="Largest leakage source"
            primary={data.summaryCards.largestLeakageSource?.bookingRef || '—'}
            secondary={data.summaryCards.largestLeakageSource ? `${data.summaryCards.largestLeakageSource.operationType} · ${money(data.summaryCards.largestLeakageSource.estimatedCost)}` : 'No cost-impact incidents'}
            tone={data.summaryCards.largestLeakageSource ? 'action' : 'ready'}
          />
        </div>
      </Panel>

      {/* TREND DELTAS */}
      <Panel title="Period-over-Period Movement" accent="#067647">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem' }}>
          <DeltaCard label="Incidents" current={data.deltas.current.incidents} previous={data.deltas.previous.incidents} delta={data.deltas.incidentsDelta} invertColor />
          <DeltaCard label="Completed" current={data.deltas.current.completed} previous={data.deltas.previous.completed} delta={data.deltas.completedDelta} />
          <DeltaCard label="Delayed" current={data.deltas.current.delayed} previous={data.deltas.previous.delayed} delta={data.deltas.delayedDelta} invertColor />
        </div>
        <p className="executive-no-print" style={{ margin: '0.5rem 0 0', color: '#667085', fontSize: '0.78rem' }}>
          Comparing this {data.rangeDays}-day window against the previous {data.rangeDays} days. Down on incidents and delayed is good (shown green).
        </p>
      </Panel>

      {/* CAPACITY FORECAST */}
      <Panel title="Capacity Outlook · next 14 days" accent="#175cd3">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14, minmax(0, 1fr))', gap: '0.25rem' }}>
          {data.capacityForecast.map((d) => {
            const tone =
              d.loadLevel === 'overloaded'
                ? { bg: '#fef3f2', text: '#b42318', border: '#f04438' }
                : d.loadLevel === 'high'
                ? { bg: '#fff8eb', text: '#b54708', border: '#f79009' }
                : d.loadLevel === 'medium'
                ? { bg: '#fffbeb', text: '#a16207', border: '#fde68a' }
                : { bg: '#f0fdf4', text: '#067647', border: '#12b76a' };
            return (
              <div
                key={d.date}
                style={{
                  background: tone.bg,
                  border: `1px solid ${tone.border}`,
                  borderRadius: 6,
                  padding: '0.3rem 0.2rem',
                  textAlign: 'center',
                  fontSize: '0.68rem',
                  color: tone.text,
                  fontWeight: 700,
                }}
              >
                <div>{d.dayLabel}</div>
                <div style={{ fontSize: '0.85rem' }}>{d.totalServices}</div>
                <div style={{ fontSize: '0.6rem' }}>D{d.driverUtilizationPct}</div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* SUPPLIER RANKING */}
      <Panel title="Supplier Intelligence Ranking" accent="#175cd3">
        {data.supplierRanking.length === 0 ? (
          <p style={{ color: '#667085' }}>No supplier activity in window.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: '0.4rem', textAlign: 'center' }}>#</th>
                <th style={{ padding: '0.4rem' }}>Supplier</th>
                <th style={{ padding: '0.4rem', textAlign: 'center' }}>Reliability</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>Services</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>Incidents</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>Recovery %</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>Leakage</th>
              </tr>
            </thead>
            <tbody>
              {data.supplierRanking.map((s) => {
                const tone = scoreTone(s.reliabilityScore);
                return (
                  <tr key={s.id} style={{ borderBottom: '1px solid #f2f4f7' }}>
                    <td style={{ padding: '0.4rem', textAlign: 'center', color: '#667085', fontWeight: 600 }}>{s.rank}</td>
                    <td style={{ padding: '0.4rem', fontWeight: 600 }}>{s.name}</td>
                    <td style={{ padding: '0.4rem', textAlign: 'center' }}>
                      <span style={{ background: tone.bg, color: tone.text, border: `1px solid ${tone.border}`, padding: '0.1rem 0.5rem', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700 }}>
                        {s.reliabilityScore}
                      </span>
                    </td>
                    <td style={{ padding: '0.4rem', textAlign: 'right' }}>{s.totalServices}</td>
                    <td style={{ padding: '0.4rem', textAlign: 'right', color: s.incidentCount > 0 ? '#b42318' : '#475467' }}>{s.incidentCount}</td>
                    <td style={{ padding: '0.4rem', textAlign: 'right' }}>{s.recoverySuccessPct}%</td>
                    <td style={{ padding: '0.4rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: s.estimatedLeakage > 100 ? '#b42318' : '#475467' }}>
                      {money(s.estimatedLeakage)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      {/* ROUTES + WEEKLY TRENDS in a 2-col grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1rem' }}>
        <Panel title="Routes & Destinations" accent="#b54708">
          {data.routeIntelligence.length === 0 ? (
            <p style={{ color: '#667085', margin: 0 }}>No route-level bottlenecks detected.</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {data.routeIntelligence.map((r, i) => (
                <li key={i} style={{ padding: '0.5rem 0.6rem', background: '#fafbfc', border: '1px solid #e4e7ec', borderRadius: 6 }}>
                  <strong>{r.label}</strong>
                  <span style={{ background: '#fef3f2', color: '#b42318', padding: '0.05rem 0.4rem', borderRadius: 4, fontSize: '0.7rem', fontWeight: 700, marginLeft: '0.5rem', textTransform: 'uppercase' }}>{r.category}</span>
                  <div style={{ color: '#475467', fontSize: '0.82rem', marginTop: '0.15rem' }}>{r.insight}</div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Weekly Trends · last 4 weeks" accent="#067647">
          {data.trends.length === 0 ? (
            <p style={{ color: '#667085', margin: 0 }}>No historical activity in window.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                  <th style={{ padding: '0.4rem' }}>Week</th>
                  <th style={{ padding: '0.4rem', textAlign: 'right' }}>Dispatched</th>
                  <th style={{ padding: '0.4rem', textAlign: 'right' }}>Completed</th>
                  <th style={{ padding: '0.4rem', textAlign: 'right' }}>Delayed</th>
                  <th style={{ padding: '0.4rem', textAlign: 'right' }}>Incidents</th>
                </tr>
              </thead>
              <tbody>
                {data.trends.map((t, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #f2f4f7' }}>
                    <td style={{ padding: '0.4rem', fontWeight: 600 }}>{t.weekLabel}</td>
                    <td style={{ padding: '0.4rem', textAlign: 'right' }}>{t.dispatchedCount}</td>
                    <td style={{ padding: '0.4rem', textAlign: 'right', color: '#067647' }}>{t.completedCount}</td>
                    <td style={{ padding: '0.4rem', textAlign: 'right', color: t.delayedCount > 0 ? '#b54708' : '#475467' }}>{t.delayedCount}</td>
                    <td style={{ padding: '0.4rem', textAlign: 'right', color: t.incidentCount > 0 ? '#b42318' : '#475467', fontWeight: 700 }}>{t.incidentCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {/* OPERATIONS TEAM */}
      <Panel title="Operations Team Performance" accent="#7e22ce">
        {data.teamStats.length === 0 ? (
          <p style={{ color: '#667085', margin: 0 }}>No operator activity logged in window.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: '0.4rem' }}>Operator</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>Total actions</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>Dispatches</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>Resolutions</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>Reassignments</th>
                <th style={{ padding: '0.4rem', textAlign: 'right' }}>Avg resolution</th>
              </tr>
            </thead>
            <tbody>
              {data.teamStats.map((s) => (
                <tr key={s.actor} style={{ borderBottom: '1px solid #f2f4f7' }}>
                  <td style={{ padding: '0.4rem', fontWeight: 600 }}>{s.actor}</td>
                  <td style={{ padding: '0.4rem', textAlign: 'right' }}>{s.totalActions}</td>
                  <td style={{ padding: '0.4rem', textAlign: 'right' }}>{s.dispatches}</td>
                  <td style={{ padding: '0.4rem', textAlign: 'right', color: '#067647', fontWeight: 600 }}>{s.resolutions}</td>
                  <td style={{ padding: '0.4rem', textAlign: 'right' }}>{s.reassignments}</td>
                  <td style={{ padding: '0.4rem', textAlign: 'right' }}>
                    {s.avgResolutionMinutes != null ? `${s.avgResolutionMinutes}m` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {/* RESOURCE CONFLICTS SUMMARY (just summary; full detail at /operations/resources/conflicts) */}
      <Panel title="Resource Conflicts" accent="#b42318">
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <Stat label="Total conflicts" value={data.conflictsSummary.total} tone={data.conflictsSummary.total > 0 ? 'critical' : 'ready'} />
          <Stat label="Blocking" value={data.conflictsSummary.blocking} tone={data.conflictsSummary.blocking > 0 ? 'critical' : 'ready'} />
          <Stat label="Critical" value={data.conflictsSummary.critical} tone={data.conflictsSummary.critical > 0 ? 'critical' : 'ready'} />
          <Link
            href="/operations/resources/conflicts"
            className="executive-no-print"
            style={{
              background: '#175cd3',
              color: '#ffffff',
              padding: '0.5rem 0.85rem',
              borderRadius: 8,
              fontWeight: 700,
              textDecoration: 'none',
              fontSize: '0.85rem',
            }}
          >
            Open Resource Conflict Center →
          </Link>
        </div>
      </Panel>
    </main>
  );
}

function Panel({ title, accent, children }: { title: string; accent: string; children: any }) {
  return (
    <section
      className="executive-panel"
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

function BigKpi({ label, value, suffix, score }: { label: string; value: string; suffix: string; score: number }) {
  const tone = scoreTone(score);
  return (
    <div
      style={{
        background: tone.bg,
        border: `2px solid ${tone.border}`,
        borderRadius: 10,
        padding: '0.85rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
        textAlign: 'center',
      }}
    >
      <span style={{ color: tone.text, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ color: tone.text, fontSize: '2.2rem', lineHeight: 1, fontWeight: 800 }}>
        {value}
        <span style={{ fontSize: '0.9rem', fontWeight: 600, opacity: 0.7 }}>{suffix}</span>
      </strong>
    </div>
  );
}

function Stat({ label, value, tone, sub }: { label: string; value: number | string; tone: 'info' | 'action' | 'critical' | 'ready'; sub?: string }) {
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
        padding: '0.75rem 0.9rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.15rem',
      }}
    >
      <span style={{ color: p.text, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ color: p.text, fontSize: '1.4rem', lineHeight: 1, fontWeight: 700 }}>{value}</strong>
      {sub ? <span style={{ color: p.text, fontSize: '0.74rem', opacity: 0.85 }}>{sub}</span> : null}
    </div>
  );
}

function SummaryCard({ label, primary, secondary, tone }: { label: string; primary: string; secondary: string; tone: 'ready' | 'action' | 'critical' | 'info' }) {
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
        gap: '0.25rem',
      }}
    >
      <span style={{ color: p.text, fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ color: p.text, fontSize: '1.05rem', lineHeight: 1.2 }}>{primary}</strong>
      <span style={{ color: p.text, fontSize: '0.8rem', opacity: 0.9 }}>{secondary}</span>
    </div>
  );
}

function DeltaCard({
  label,
  current,
  previous,
  delta,
  invertColor = false,
}: {
  label: string;
  current: number;
  previous: number;
  delta: { absolute: number; changePct: number; direction: 'up' | 'down' | 'flat' };
  invertColor?: boolean;
}) {
  const arrow = deltaArrow(delta, invertColor);
  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #e4e7ec',
        borderRadius: 10,
        padding: '0.85rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
      }}
    >
      <span style={{ color: '#475467', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
        <strong style={{ fontSize: '1.6rem', color: '#101828' }}>{current}</strong>
        <span style={{ color: arrow.color, fontSize: '1.1rem', fontWeight: 800 }}>
          {arrow.arrow} {arrow.label}
        </span>
      </div>
      <span style={{ color: '#667085', fontSize: '0.78rem' }}>vs {previous} previous period</span>
    </div>
  );
}

// Tiny inline script to wire the Print button — server components can't have
// onClick handlers, so we attach via DOM after hydration.
function PrintScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `
          document.addEventListener('DOMContentLoaded', function() {
            var btn = document.querySelector('[data-print-trigger]');
            if (btn) btn.addEventListener('click', function() { window.print(); });
          });
        `,
      }}
    />
  );
}
