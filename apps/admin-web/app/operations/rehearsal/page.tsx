import Link from 'next/link';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { AppAlert } from '../../components/ui';
import { ADMIN_API_BASE_URL, adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';
import { OPERATIONS_TIME_ZONE } from '../../lib/operations-timezone';
import { STATUS_TONE } from '../../lib/status-tone';

export const dynamic = 'force-dynamic';

type Scenario = {
  key: string;
  label: string;
  description: string;
  recommendedSimAction: string;
  targetScore: number;
};

type ActorStat = {
  actor: string;
  totalActions: number;
  dispatches: number;
  resolutions: number;
  reassignments: number;
  escalations: number;
};

type EventReplayItem = {
  id: string;
  bookingServiceId: string | null;
  eventType: string;
  occurredAt: string;
  actor: string | null;
  notes: string | null;
};

type Scorecard = {
  window: { sinceMinutes: number; sinceIso: string };
  totals: {
    events: number;
    completedServices: number;
    openIncidentsInWindow: number;
    issuesRaised: number;
    issuesResolved: number;
    escalations: number;
    reassignments: number;
    dispatches: number;
    completions: number;
  };
  timing: {
    avgResolutionMinutes: number | null;
    fastestResolutionMinutes: number | null;
    slowestResolutionMinutes: number | null;
    sampleSize: number;
  };
  friction: {
    hesitationLoops: number;
    multiTouchServices: number;
  };
  scores: {
    aggregate: number | null;
    dispatchEfficiency: number | null;
    recoverySpeed: number | null;
    friction: number | null;
    completion: number | null;
  };
  actorStats: ActorStat[];
  eventReplay: EventReplayItem[];
};

async function loadScenarios(): Promise<Scenario[]> {
  try {
    return await adminPageFetchJson<Scenario[]>(
      `${ADMIN_API_BASE_URL}/operations/rehearsal/scenarios`,
      'Rehearsal scenarios',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    return [];
  }
}

async function loadScorecard(sinceMinutes: number): Promise<Scorecard | null> {
  try {
    return await adminPageFetchJson<Scorecard>(
      `${ADMIN_API_BASE_URL}/operations/rehearsal/scorecard?sinceMinutes=${sinceMinutes}`,
      'Rehearsal scorecard',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    return null;
  }
}

function scoreTone(score: number | null) {
  if (score == null) return { bg: '#f2f4f7', border: '#d0d5dd', text: '#475467', label: '—' };
  if (score >= 80) return { bg: '#f0fdf4', border: '#12b76a', text: '#067647', label: 'Strong' };
  if (score >= 60) return { bg: '#fff8eb', border: '#f79009', text: '#b54708', label: 'Acceptable' };
  return { bg: '#fef3f2', border: '#f04438', text: '#b42318', label: 'Needs work' };
}

function eventTypeTone(type: string) {
  if (type === 'ISSUE_RAISED' || type === 'ISSUE_ESCALATED') return { bg: '#fef3f2', text: '#b42318' };
  if (type === 'ISSUE_RESOLVED' || type === 'COMPLETED') return { bg: '#ecfdf3', text: '#067647' };
  if (type === 'DISPATCHED' || type === 'STARTED') return { bg: '#eff8ff', text: '#175cd3' };
  if (type === 'DELAYED' || type === 'CANCELLED') return { bg: '#fff8eb', text: '#b54708' };
  if (type.startsWith('REASSIGNED_')) return { bg: '#f3e8ff', text: '#7e22ce' };
  return { bg: '#f2f4f7', text: '#475467' };
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: OPERATIONS_TIME_ZONE,
    });
  } catch {
    return iso;
  }
}

export default async function RehearsalPage({
  searchParams,
}: {
  searchParams?: Promise<{ started?: string; sinceMinutes?: string }>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  // Rehearsal session lives entirely in URL state — `?started=<iso>` is the
  // session start; everything since that timestamp counts. If sinceMinutes
  // is provided directly, use that (allows manual override).
  let sinceMinutes = 60;
  let sessionStartIso: string | null = null;
  if (resolved?.sinceMinutes) {
    sinceMinutes = Math.max(1, Math.min(Number(resolved.sinceMinutes), 24 * 60));
  } else if (resolved?.started) {
    const started = new Date(resolved.started).getTime();
    if (Number.isFinite(started)) {
      sessionStartIso = new Date(started).toISOString();
      sinceMinutes = Math.max(1, Math.round((Date.now() - started) / 60_000));
    }
  }
  const [scenarios, scorecard] = await Promise.all([loadScenarios(), loadScorecard(sinceMinutes)]);

  const sessionActive = Boolean(sessionStartIso);
  const elapsedLabel = sessionStartIso
    ? `${sinceMinutes}m elapsed since ${formatTime(sessionStartIso)}`
    : `Showing last ${sinceMinutes}m of activity`;

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs items={[{ label: 'Operations', href: '/operations' }, { label: 'Rehearsal' }]} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1>Operational Rehearsal</h1>
            <p className="admin-muted-copy">
              Timed operator validation — start a rehearsal, run scenarios, watch the scorecard update live. Measures detection time, recovery
              speed, friction, and completion rate. Reuses the existing simulation + scale infrastructure.
            </p>
          </div>
          {sessionActive ? (
            <Link
              href="/operations/rehearsal"
              style={{
                background: '#b42318',
                color: '#ffffff',
                padding: '0.6rem 1rem',
                borderRadius: 8,
                fontWeight: 700,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              ⏹ End rehearsal
            </Link>
          ) : (
            <Link
              href={`/operations/rehearsal?started=${new Date().toISOString()}`}
              style={{
                background: '#067647',
                color: '#ffffff',
                padding: '0.6rem 1rem',
                borderRadius: 8,
                fontWeight: 700,
                textDecoration: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              ▶ Start rehearsal session
            </Link>
          )}
        </div>
      </div>

      {/* Session banner */}
      <section
        style={{
          background: sessionActive ? '#ecfdf3' : '#eff8ff',
          border: `1px solid ${sessionActive ? '#12b76a' : '#84caff'}`,
          borderRadius: 10,
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <strong style={{ color: sessionActive ? '#067647' : '#175cd3' }}>
          {sessionActive ? '🟢 Rehearsal session active' : '⏸ No active session — showing baseline window'}
        </strong>
        <span style={{ color: sessionActive ? '#067647' : '#175cd3', fontSize: '0.85rem' }}>{elapsedLabel}</span>
      </section>

      {/* Aggregate scorecard */}
      {scorecard ? (
        <>
          <Panel title="Live Scorecard" accent="#101828">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
              <ScoreCard label="Aggregate" score={scorecard.scores.aggregate} large />
              <ScoreCard label="Dispatch Efficiency" score={scorecard.scores.dispatchEfficiency} />
              <ScoreCard label="Recovery Speed" score={scorecard.scores.recoverySpeed} />
              <ScoreCard label="Friction (less = worse)" score={scorecard.scores.friction} />
              <ScoreCard label="Completion" score={scorecard.scores.completion} />
            </div>
          </Panel>

          <Panel title="Operational Activity (this session)" accent="#175cd3">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.6rem' }}>
              <Stat label="Total events" value={scorecard.totals.events} tone="info" />
              <Stat label="Issues raised" value={scorecard.totals.issuesRaised} tone={scorecard.totals.issuesRaised > 0 ? 'action' : 'ready'} />
              <Stat label="Issues resolved" value={scorecard.totals.issuesResolved} tone="ready" />
              <Stat label="Escalations" value={scorecard.totals.escalations} tone={scorecard.totals.escalations > 0 ? 'critical' : 'ready'} />
              <Stat label="Reassignments" value={scorecard.totals.reassignments} tone="info" />
              <Stat label="Dispatches" value={scorecard.totals.dispatches} tone="info" />
              <Stat label="Completions" value={scorecard.totals.completions} tone="ready" />
              <Stat label="Open in window" value={scorecard.totals.openIncidentsInWindow} tone={scorecard.totals.openIncidentsInWindow > 0 ? 'critical' : 'ready'} />
            </div>
          </Panel>

          <Panel title="Recovery Timing" accent="#067647">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.6rem' }}>
              <Stat
                label="Avg resolution"
                value={scorecard.timing.avgResolutionMinutes != null ? `${scorecard.timing.avgResolutionMinutes}m` : '—'}
                tone={
                  scorecard.timing.avgResolutionMinutes == null
                    ? 'info'
                    : scorecard.timing.avgResolutionMinutes < 15
                    ? 'ready'
                    : scorecard.timing.avgResolutionMinutes < 30
                    ? 'action'
                    : 'critical'
                }
                sub={`${scorecard.timing.sampleSize} sample`}
              />
              <Stat
                label="Fastest"
                value={scorecard.timing.fastestResolutionMinutes != null ? `${scorecard.timing.fastestResolutionMinutes}m` : '—'}
                tone="ready"
              />
              <Stat
                label="Slowest"
                value={scorecard.timing.slowestResolutionMinutes != null ? `${scorecard.timing.slowestResolutionMinutes}m` : '—'}
                tone="action"
              />
              <Stat label="Hesitation loops" value={scorecard.friction.hesitationLoops} tone={scorecard.friction.hesitationLoops > 0 ? 'action' : 'ready'} sub="≥2 reassigns same type" />
              <Stat label="Multi-touch services" value={scorecard.friction.multiTouchServices} tone={scorecard.friction.multiTouchServices > 0 ? 'action' : 'ready'} sub="≥2 reassigns total" />
            </div>
          </Panel>

          {scorecard.actorStats.length > 0 ? (
            <Panel title="Operator Workload" accent="#7e22ce">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                    <th style={{ padding: '0.4rem' }}>Operator</th>
                    <th style={{ padding: '0.4rem', textAlign: 'right' }}>Total</th>
                    <th style={{ padding: '0.4rem', textAlign: 'right' }}>Dispatches</th>
                    <th style={{ padding: '0.4rem', textAlign: 'right' }}>Resolutions</th>
                    <th style={{ padding: '0.4rem', textAlign: 'right' }}>Reassignments</th>
                    <th style={{ padding: '0.4rem', textAlign: 'right' }}>Escalations</th>
                  </tr>
                </thead>
                <tbody>
                  {scorecard.actorStats.map((a) => (
                    <tr key={a.actor} style={{ borderBottom: '1px solid #f2f4f7' }}>
                      <td style={{ padding: '0.4rem', fontWeight: 600 }}>{a.actor}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'right', fontWeight: 700 }}>{a.totalActions}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'right' }}>{a.dispatches}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'right', color: '#067647' }}>{a.resolutions}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'right' }}>{a.reassignments}</td>
                      <td style={{ padding: '0.4rem', textAlign: 'right', color: a.escalations > 0 ? '#b42318' : '#475467' }}>{a.escalations}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          ) : null}
        </>
      ) : (
        <AppAlert tone="danger" style={{ marginBottom: '1rem' }}>
          <strong>Could not load scorecard.</strong>
        </AppAlert>
      )}

      {/* Scenario picker */}
      <Panel title="Rehearsal Scenarios" accent="#b54708">
        <p style={{ margin: '0 0 0.5rem', color: '#667085', fontSize: '0.85rem' }}>
          Open a scenario in the existing simulation tools. The rehearsal scorecard above updates with every action you take.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.6rem' }}>
          {scenarios.map((s) => (
            <ScenarioCard key={s.key} scenario={s} sessionStartIso={sessionStartIso} />
          ))}
        </div>
      </Panel>

      {/* Event replay */}
      {scorecard && scorecard.eventReplay.length > 0 ? (
        <Panel title="Event Replay · most recent first" accent="#475467">
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '24rem', overflow: 'auto' }}>
            {scorecard.eventReplay.map((e) => {
              const tone = eventTypeTone(e.eventType);
              return (
                <li
                  key={e.id}
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    padding: '0.4rem 0.6rem',
                    background: '#ffffff',
                    border: '1px solid #e4e7ec',
                    borderRadius: 6,
                    alignItems: 'center',
                    fontSize: '0.8rem',
                  }}
                >
                  <span style={{ color: '#667085', fontVariantNumeric: 'tabular-nums', minWidth: '5rem' }}>{formatTime(e.occurredAt)}</span>
                  <span
                    style={{
                      background: tone.bg,
                      color: tone.text,
                      padding: '0.1rem 0.5rem',
                      borderRadius: 4,
                      fontWeight: 700,
                      fontSize: '0.72rem',
                      letterSpacing: '0.04em',
                    }}
                  >
                    {e.eventType.replace(/_/g, ' ')}
                  </span>
                  <span style={{ flex: 1, color: '#475467' }}>{e.notes || ''}</span>
                  <span style={{ color: '#98a2b3', fontSize: '0.74rem' }}>{e.actor || 'system'}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      ) : null}
    </main>
  );
}

function ScenarioCard({ scenario, sessionStartIso }: { scenario: Scenario; sessionStartIso: string | null }) {
  // Deep-link directly into the appropriate simulation tool. Scale-crisis-day
  // → /operations/simulation/scale (Crisis Day preset). Everything else →
  // /operations/simulation (per-booking scenario picker).
  const href = scenario.recommendedSimAction.startsWith('scale-')
    ? '/operations/simulation/scale'
    : '/operations/simulation';
  return (
    <div
      style={{
        background: '#fafbfc',
        border: '1px solid #e4e7ec',
        borderRadius: 8,
        padding: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <strong style={{ fontSize: '0.95rem' }}>{scenario.label}</strong>
        <span
          style={{
            background: '#eff8ff',
            color: '#175cd3',
            padding: '0.1rem 0.45rem',
            borderRadius: 999,
            fontSize: '0.72rem',
            fontWeight: 700,
          }}
        >
          Target {scenario.targetScore}
        </span>
      </div>
      <p style={{ margin: 0, color: '#475467', fontSize: '0.82rem', lineHeight: 1.4 }}>{scenario.description}</p>
      <Link
        href={href}
        style={{
          background: '#175cd3',
          color: '#ffffff',
          padding: '0.4rem 0.75rem',
          borderRadius: 6,
          fontWeight: 600,
          fontSize: '0.82rem',
          textDecoration: 'none',
          alignSelf: 'flex-start',
        }}
      >
        Open {scenario.recommendedSimAction.startsWith('scale-') ? 'Scale Sim' : 'Simulation'} →
      </Link>
    </div>
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

function ScoreCard({ label, score, large = false }: { label: string; score: number | null; large?: boolean }) {
  const tone = scoreTone(score);
  return (
    <div
      style={{
        background: tone.bg,
        border: `2px solid ${tone.border}`,
        borderRadius: 10,
        padding: large ? '1rem 1.25rem' : '0.85rem 1rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
        textAlign: 'center',
      }}
    >
      <span style={{ color: tone.text, fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</span>
      <strong style={{ color: tone.text, fontSize: large ? '2.6rem' : '1.7rem', fontWeight: 800, lineHeight: 1 }}>
        {score != null ? score : '—'}
        {score != null ? <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>/100</span> : null}
      </strong>
      <span style={{ color: tone.text, fontSize: '0.78rem', fontWeight: 600 }}>{tone.label}</span>
    </div>
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
