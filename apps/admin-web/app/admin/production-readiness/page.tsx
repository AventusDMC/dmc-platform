import Link from 'next/link';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { AppAlert } from '../../components/ui';
import { ADMIN_API_BASE_URL, adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';

export const dynamic = 'force-dynamic';

type Sample = { id: string; description?: string | null; href?: string };
type CheckResult = {
  key: string;
  label: string;
  severity: 'ok' | 'warn' | 'bad';
  message: string;
  count?: number;
  sample?: Sample[];
};

type ReadinessDashboard = {
  healthScore: number;
  summary: { total: number; ok: number; warn: number; bad: number };
  generatedAt: string;
  computeMs: number;
  sections: {
    dataIntegrity: CheckResult[];
    operationalRisks: CheckResult[];
    auditCoverage: CheckResult[];
    performance: CheckResult[];
    safetyAdvisories: CheckResult[];
  };
};

async function loadDashboard(): Promise<{ data: ReadinessDashboard | null; error: string | null }> {
  try {
    const data = await adminPageFetchJson<ReadinessDashboard>(
      `${ADMIN_API_BASE_URL}/admin/production-readiness`,
      'Production readiness',
      { cache: 'no-store' },
    );
    return { data, error: null };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    const message = error instanceof Error ? `${error.message}\n${error.stack || ''}` : String(error);
    return { data: null, error: message };
  }
}

const SEV_TONE: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  ok: { bg: '#f0fdf4', border: '#12b76a', text: '#067647', icon: '✓' },
  warn: { bg: '#fff8eb', border: '#f79009', text: '#b54708', icon: '⚠' },
  bad: { bg: '#fef3f2', border: '#f04438', text: '#b42318', icon: '✗' },
};

function healthTone(score: number) {
  if (score >= 90) return { bg: '#f0fdf4', border: '#12b76a', text: '#067647', label: 'Healthy' };
  if (score >= 70) return { bg: '#fff8eb', border: '#f79009', text: '#b54708', label: 'Watch' };
  return { bg: '#fef3f2', border: '#f04438', text: '#b42318', label: 'Critical' };
}

export default async function ProductionReadinessPage() {
  const { data, error } = await loadDashboard();

  if (!data) {
    return (
      <main className="admin-page-shell">
        <div className="admin-page-heading">
          <AdminBreadcrumbs items={[{ label: 'Admin' }, { label: 'Production Readiness' }]} />
          <h1>Production Readiness</h1>
        </div>
        <AppAlert tone="danger">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <strong>Could not load production readiness dashboard.</strong>
            {error ? (
              <details>
                <summary style={{ cursor: 'pointer', color: '#7a271a', fontWeight: 600 }}>Error details</summary>
                <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.78rem', color: '#7a271a', maxHeight: '20rem', overflow: 'auto', marginTop: '0.5rem' }}>
                  {error}
                </pre>
              </details>
            ) : null}
          </div>
        </AppAlert>
      </main>
    );
  }

  const tone = healthTone(data.healthScore);

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs items={[{ label: 'Admin' }, { label: 'Production Readiness' }]} />
        <h1>Production Readiness</h1>
        <p className="admin-muted-copy">
          Platform health view — data integrity / operational risks / audit coverage / performance / safety advisories. Generated{' '}
          {new Date(data.generatedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} in{' '}
          {data.computeMs}ms.
        </p>
      </div>

      {/* Top-line health score + check summary */}
      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) repeat(3, minmax(120px, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
        <div
          style={{
            background: tone.bg,
            border: `2px solid ${tone.border}`,
            borderRadius: 12,
            padding: '1rem 1.25rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '0.25rem',
          }}
        >
          <span style={{ color: tone.text, fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Platform Health
          </span>
          <strong style={{ color: tone.text, fontSize: '3rem', fontWeight: 800, lineHeight: 1 }}>
            {data.healthScore}<span style={{ fontSize: '1.2rem', opacity: 0.7 }}>/100</span>
          </strong>
          <span style={{ color: tone.text, fontSize: '0.95rem', fontWeight: 700 }}>{tone.label}</span>
        </div>
        <SummaryStat label="Checks OK" value={data.summary.ok} tone="ready" />
        <SummaryStat label="Warnings" value={data.summary.warn} tone="action" />
        <SummaryStat label="Failures" value={data.summary.bad} tone={data.summary.bad > 0 ? 'critical' : 'ready'} />
      </section>

      <CheckSection title="Operational Risks" accent="#b42318" checks={data.sections.operationalRisks} />
      <CheckSection title="Data Integrity" accent="#7e22ce" checks={data.sections.dataIntegrity} />
      <CheckSection title="Safety Advisories" accent="#b54708" checks={data.sections.safetyAdvisories} />
      <CheckSection title="Audit Trail Coverage" accent="#175cd3" checks={data.sections.auditCoverage} />
      <CheckSection title="Performance Signals" accent="#067647" checks={data.sections.performance} />

      <section
        style={{
          background: '#fafbfc',
          border: '1px dashed #d0d5dd',
          borderRadius: 10,
          padding: '0.85rem 1rem',
          color: '#475467',
          fontSize: '0.85rem',
        }}
      >
        <strong style={{ color: '#101828' }}>Hardening scope (v1)</strong>
        <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.2rem' }}>
          <li>Operational safety guards added inline (refuse to dispatch without supplier, etc.).</li>
          <li>Read-only checks here — nothing here mutates state.</li>
          <li>Heavy query optimisation deferred until specific bottlenecks are measured (premature).</li>
          <li>Permission tightening deferred — existing Roles guard remains in place.</li>
        </ul>
      </section>
    </main>
  );
}

function CheckSection({ title, accent, checks }: { title: string; accent: string; checks: CheckResult[] }) {
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
      {checks.length === 0 ? (
        <p style={{ color: '#667085', margin: 0 }}>No checks in this category.</p>
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          {checks.map((c) => {
            const tone = SEV_TONE[c.severity];
            return (
              <li
                key={c.key}
                style={{
                  background: tone.bg,
                  border: `1px solid ${tone.border}`,
                  borderRadius: 6,
                  padding: '0.55rem 0.75rem',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '0.55rem',
                }}
              >
                <span style={{ color: tone.text, fontWeight: 800, fontSize: '1rem', minWidth: '1.2rem' }}>{tone.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '0.92rem' }}>{c.label}</strong>
                    {c.count != null ? (
                      <span style={{ color: tone.text, fontVariantNumeric: 'tabular-nums', fontWeight: 700, fontSize: '0.85rem' }}>{c.count}</span>
                    ) : null}
                  </div>
                  <p style={{ margin: '0.15rem 0 0', color: tone.text, fontSize: '0.82rem' }}>{c.message}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: number; tone: 'info' | 'action' | 'critical' | 'ready' }) {
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
        justifyContent: 'center',
        gap: '0.15rem',
      }}
    >
      <span style={{ color: p.text, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ color: p.text, fontSize: '2rem', lineHeight: 1, fontWeight: 700 }}>{value}</strong>
    </div>
  );
}
