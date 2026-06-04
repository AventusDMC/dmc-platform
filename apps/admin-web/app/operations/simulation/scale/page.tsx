import Link from 'next/link';
import { AdminBreadcrumbs } from '../../../components/AdminBreadcrumbs';
import { AppAlert } from '../../../components/ui';
import { ADMIN_API_BASE_URL, adminPageFetchJson, isNextRedirectError } from '../../../lib/admin-server';
import { STATUS_TONE } from '../../../lib/status-tone';

export const dynamic = 'force-dynamic';

type Preset = {
  key: 'small-day' | 'medium-day' | 'high-season' | 'crisis-day';
  label: string;
  description: string;
  bookingsToTouch: number;
  servicesPerBooking: number;
  incidentRatePct: number;
  delayRatePct: number;
  resourceConflictPct: number;
};

type ScaleStatus = { syntheticServiceCount: number };

type DispatchSnapshot = {
  counters: {
    totalRows: number;
    activeIncidentsCount: number;
    delayedOperationsCount: number;
    resolutionQueueCount: number;
    resourceConflictsCount?: number;
    overbookedResourcesCount?: number;
  };
};

async function loadPresets(): Promise<Preset[]> {
  try {
    return await adminPageFetchJson<Preset[]>(
      `${ADMIN_API_BASE_URL}/operations/simulation/scale/presets`,
      'Scale presets',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[scale-sim] presets fetch failed', error);
    return [];
  }
}

async function loadStatus(): Promise<ScaleStatus> {
  try {
    return await adminPageFetchJson<ScaleStatus>(
      `${ADMIN_API_BASE_URL}/operations/simulation/scale/status`,
      'Scale status',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    return { syntheticServiceCount: 0 };
  }
}

// Measure the SSR fetch time of the dispatch endpoint — that's our v1 dispatch
// query speed indicator. Server-side; rough but useful as a stress signal.
async function loadDispatchSnapshot(): Promise<{ data: DispatchSnapshot | null; elapsedMs: number; error: string | null }> {
  const started = Date.now();
  try {
    const data = await adminPageFetchJson<DispatchSnapshot>(
      `${ADMIN_API_BASE_URL}/operations/dispatch?range=next-7-days`,
      'Dispatch snapshot',
      { cache: 'no-store' },
    );
    return { data, elapsedMs: Date.now() - started, error: null };
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    return { data: null, elapsedMs: Date.now() - started, error: error instanceof Error ? error.message : String(error) };
  }
}

export default async function ScaleSimulationPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string }>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const [presets, status, dispatchSnapshot] = await Promise.all([loadPresets(), loadStatus(), loadDispatchSnapshot()]);
  const hasSynthetic = status.syntheticServiceCount > 0;

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs
          items={[
            { label: 'Operations', href: '/operations' },
            { label: 'Simulation', href: '/operations/simulation' },
            { label: 'Scale' },
          ]}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1>Scale & Stress Simulation</h1>
            <p className="admin-muted-copy">
              Generate synthetic operational load by spawning realistic BookingService rows across existing bookings. The dispatch / recovery /
              resources / intelligence / executive pages light up naturally — that is the stress test.
            </p>
          </div>
          <Link
            href="/operations/dispatch"
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
            Open Dispatch →
          </Link>
        </div>
      </div>

      {resolved?.success ? (
        <section className="success-banner" aria-label="Scale simulation result">
          <p>{resolved.success}</p>
        </section>
      ) : null}
      {resolved?.error ? (
        <section className="warning-banner" aria-label="Scale simulation error">
          <p className="form-error">{resolved.error}</p>
        </section>
      ) : null}

      {/* Status + performance */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem', marginBottom: '1rem' }}>
        <Stat
          label="Synthetic services active"
          value={status.syntheticServiceCount}
          tone={status.syntheticServiceCount > 0 ? 'action' : 'ready'}
          sub={hasSynthetic ? 'Tagged in sourceMetadata' : 'None — system idle'}
        />
        <Stat
          label="Dispatch query speed"
          value={`${dispatchSnapshot.elapsedMs}ms`}
          tone={dispatchSnapshot.elapsedMs > 3000 ? 'critical' : dispatchSnapshot.elapsedMs > 1500 ? 'action' : 'ready'}
          sub="SSR roundtrip"
        />
        <Stat
          label="Total dispatch rows"
          value={dispatchSnapshot.data?.counters.totalRows ?? 0}
          tone="info"
          sub="Next 7 days"
        />
        <Stat
          label="Active incidents"
          value={dispatchSnapshot.data?.counters.activeIncidentsCount ?? 0}
          tone={(dispatchSnapshot.data?.counters.activeIncidentsCount ?? 0) > 0 ? 'critical' : 'ready'}
        />
        <Stat
          label="Resource conflicts"
          value={dispatchSnapshot.data?.counters.resourceConflictsCount ?? 0}
          tone={(dispatchSnapshot.data?.counters.resourceConflictsCount ?? 0) > 0 ? 'critical' : 'ready'}
        />
      </section>

      {/* Clear synthetic data */}
      {hasSynthetic ? (
        <AppAlert tone="danger" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div>
              <strong>{status.syntheticServiceCount} synthetic services are currently in the system.</strong>
              <p style={{ margin: 0, color: '#7a271a', fontSize: '0.85rem' }}>
                Clear them before applying a new preset, or before going back to real operational work.
              </p>
            </div>
            <form method="POST" action="/api/operations/simulation/scale/clear" style={{ margin: 0 }}>
              <button
                type="submit"
                style={{
                  background: 'var(--ds-color-danger, #B42318)',
                  color: '#ffffff',
                  padding: '0.6rem 1rem',
                  borderRadius: 8,
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                🧹 Clear synthetic data
              </button>
            </form>
          </div>
        </AppAlert>
      ) : null}

      {/* Presets */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid var(--ds-color-border-subtle, #E4E7EC)',
          borderRadius: 10,
          padding: '1rem',
          marginBottom: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div>
          <h2 style={{ margin: 0 }}>Apply a preset</h2>
          <p style={{ margin: 0, color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.85rem' }}>
            Each preset spawns N synthetic services across the most-recent bookings. Resources (drivers / vehicles / guides) are reused to force
            conflicts. Some services land in ISSUE state with delayMinutes to generate immediate operational pressure.
          </p>
        </div>
        {presets.length === 0 ? (
          <p style={{ color: 'var(--ds-color-text-subtle, #667085)' }}>No presets available. Backend may still be deploying.</p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.6rem' }}>
            {presets.map((p) => (
              <PresetCard key={p.key} preset={p} disabled={hasSynthetic} />
            ))}
          </div>
        )}
      </section>

      {/* Quick links to verify stress */}
      <section
        style={{
          background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)',
          border: '1px solid var(--ds-color-info-border, #84CAFF)',
          borderRadius: 10,
          padding: '0.85rem 1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <strong style={{ color: 'var(--ds-color-info, #175CD3)' }}>After applying a preset, verify how the system responds:</strong>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          <Pill href="/operations/dispatch" label="Dispatch — should show all synthetic rows" />
          <Pill href="/operations/recovery" label="Recovery — should surface ISSUE-state rows" />
          <Pill href="/operations/resources/conflicts" label="Resources — should detect forced conflicts" />
          <Pill href="/operations/intelligence" label="Intelligence — should reflect new volume" />
          <Pill href="/operations/intelligence/financial" label="Financial — should estimate leakage" />
          <Pill href="/executive/operations" label="Executive — strategic rollup" />
        </div>
      </section>

      {/* Heuristic disclaimer */}
      <section
        style={{
          background: '#fafbfc',
          border: '1px dashed #d0d5dd',
          borderRadius: 10,
          padding: '0.85rem 1rem',
          color: 'var(--ds-color-text-muted, #475569)',
          fontSize: '0.85rem',
          marginTop: '1rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.3rem',
        }}
      >
        <strong style={{ color: 'var(--ds-color-text, #0F172A)' }}>Synthetic data caveats (v1)</strong>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li>Synthetic services attach to existing bookings (not new bookings). Booking-level counts (pax, rooms, etc.) don't change.</li>
          <li>All synthetic rows are tagged with <code>sourceMetadata.scaleSimMarker = true</code> for safe cleanup.</li>
          <li>Resources (drivers / vehicles / guides) reused across services to force conflicts.</li>
          <li>Replay mode (hour-by-hour playback) deferred to v2.</li>
        </ul>
      </section>
    </main>
  );
}

function PresetCard({ preset, disabled }: { preset: Preset; disabled: boolean }) {
  const expectedServices = preset.bookingsToTouch * preset.servicesPerBooking;
  const tone =
    preset.key === 'crisis-day'
      ? { bg: '#fef3f2', border: '#f04438', text: '#b42318' }
      : preset.key === 'high-season'
      ? { bg: '#fff8eb', border: '#f79009', text: '#b54708' }
      : preset.key === 'medium-day'
      ? { bg: '#eff8ff', border: '#84caff', text: '#175cd3' }
      : { bg: '#f0fdf4', border: '#12b76a', text: '#067647' };
  return (
    <form
      method="POST"
      action={`/api/operations/simulation/scale/presets/${preset.key}`}
      style={{
        background: tone.bg,
        border: `2px solid ${tone.border}`,
        borderRadius: 10,
        padding: '0.85rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.45rem',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ color: tone.text, fontSize: '1rem' }}>{preset.label}</strong>
        <span style={{ color: tone.text, fontSize: '0.78rem', fontWeight: 700 }}>~{expectedServices} services</span>
      </div>
      <p style={{ margin: 0, color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.82rem', lineHeight: 1.4 }}>{preset.description}</p>
      <ul style={{ margin: 0, paddingLeft: '1.1rem', color: tone.text, fontSize: '0.78rem' }}>
        <li>{preset.bookingsToTouch} bookings × {preset.servicesPerBooking} svcs</li>
        <li>Incident rate: {preset.incidentRatePct}%</li>
        <li>Delay rate: {preset.delayRatePct}%</li>
        <li>Forced conflicts: {preset.resourceConflictPct}%</li>
      </ul>
      <button
        type="submit"
        disabled={disabled}
        style={{
          background: tone.text,
          color: '#ffffff',
          border: 'none',
          padding: '0.55rem 0.9rem',
          borderRadius: 8,
          fontWeight: 700,
          cursor: disabled ? 'not-allowed' : 'pointer',
          alignSelf: 'flex-start',
        }}
      >
        Apply {preset.label} →
      </button>
    </form>
  );
}

function Pill({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        background: '#ffffff',
        color: 'var(--ds-color-info, #175CD3)',
        border: '1px solid var(--ds-color-info-border, #84CAFF)',
        padding: '0.4rem 0.75rem',
        borderRadius: 999,
        fontSize: '0.82rem',
        fontWeight: 600,
        textDecoration: 'none',
      }}
    >
      {label}
    </Link>
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
      <strong style={{ color: p.text, fontSize: '1.4rem', lineHeight: 1, fontWeight: 700 }}>{value}</strong>
      {sub ? <span style={{ color: p.text, fontSize: '0.74rem', opacity: 0.85 }}>{sub}</span> : null}
    </div>
  );
}
