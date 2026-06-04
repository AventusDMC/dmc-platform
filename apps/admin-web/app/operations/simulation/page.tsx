import Link from 'next/link';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { ADMIN_API_BASE_URL, adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';
import { OPERATIONS_TIME_ZONE } from '../../lib/operations-timezone';

export const dynamic = 'force-dynamic';

type Scenario = {
  key:
    | 'flight-delay'
    | 'driver-delay'
    | 'supplier-no-show'
    | 'hotel-overbooking'
    | 'missing-passenger'
    | 'guide-late';
  label: string;
  description: string;
  expectedTargetType: 'TRANSPORT' | 'HOTEL' | 'GUIDE' | 'ACTIVITY' | 'ANY';
  defaultSeverity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
};

type DispatchEvent = {
  id: string;
  bookingId: string;
  bookingServiceId: string | null;
  eventType: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL' | null;
  occurredAt: string;
  actor: string | null;
  payload: Record<string, unknown> | null;
  notes: string | null;
  booking: { id: string; bookingRef: string | null } | null;
  bookingService: { id: string; description: string | null; serviceType: string | null; operationType: string | null } | null;
};

type BookingOption = {
  id: string;
  bookingRef: string | null;
  title: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  services?: { id: string }[];
};

async function loadScenarios(): Promise<Scenario[]> {
  try {
    return await adminPageFetchJson<Scenario[]>(
      `${ADMIN_API_BASE_URL}/operations/simulation/scenarios`,
      'Simulation scenarios',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[simulation] scenarios fetch failed', error);
    return [];
  }
}

async function loadEvents(): Promise<DispatchEvent[]> {
  try {
    return await adminPageFetchJson<DispatchEvent[]>(
      `${ADMIN_API_BASE_URL}/dispatch-events?limit=80`,
      'Dispatch events',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[simulation] events fetch failed', error);
    return [];
  }
}

async function loadBookings(): Promise<BookingOption[]> {
  try {
    const data = await adminPageFetchJson<{ rows?: BookingOption[] } | BookingOption[]>(
      `${ADMIN_API_BASE_URL}/bookings?limit=50`,
      'Bookings list',
      { cache: 'no-store' },
    );
    if (Array.isArray(data)) return data;
    if (data && Array.isArray((data as any).rows)) return (data as any).rows;
    return [];
  } catch {
    return [];
  }
}

function formatEventTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: OPERATIONS_TIME_ZONE,
    });
  } catch {
    return iso;
  }
}

const EVENT_TONE: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  SIMULATION_SCENARIO_APPLIED: { bg: '#fffbeb', border: '#f59e0b', text: '#b45309', icon: '🧪' },
  ISSUE_RAISED: { bg: '#fef3f2', border: '#f04438', text: '#b42318', icon: '⚠' },
  ISSUE_ESCALATED: { bg: '#fef3f2', border: '#f04438', text: '#b42318', icon: '🚨' },
  ISSUE_RESOLVED: { bg: '#ecfdf3', border: '#12b76a', text: '#067647', icon: '✓' },
  DISPATCHED: { bg: '#eff8ff', border: '#84caff', text: '#175cd3', icon: '🚐' },
  STARTED: { bg: '#fff8eb', border: '#f79009', text: '#b54708', icon: '▶' },
  COMPLETED: { bg: '#ecfdf3', border: '#12b76a', text: '#067647', icon: '✓' },
  CANCELLED: { bg: '#f2f4f7', border: '#d0d5dd', text: '#475467', icon: '✕' },
  DELAYED: { bg: '#fff8eb', border: '#f79009', text: '#b54708', icon: '⏱' },
  REASSIGNED_SUPPLIER: { bg: '#eff8ff', border: '#84caff', text: '#175cd3', icon: '↻' },
  REASSIGNED_DRIVER: { bg: '#eff8ff', border: '#84caff', text: '#175cd3', icon: '↻' },
  REASSIGNED_VEHICLE: { bg: '#eff8ff', border: '#84caff', text: '#175cd3', icon: '↻' },
  REASSIGNED_GUIDE: { bg: '#eff8ff', border: '#84caff', text: '#175cd3', icon: '↻' },
  NOTE_ADDED: { bg: '#ffffff', border: '#e4e7ec', text: '#475467', icon: '📝' },
};

export default async function SimulationPage({
  searchParams,
}: {
  searchParams?: Promise<{ success?: string; error?: string; bookingId?: string }>;
}) {
  const resolved = searchParams ? await searchParams : undefined;
  const [scenarios, events, bookings] = await Promise.all([loadScenarios(), loadEvents(), loadBookings()]);
  const preselectedBookingId = resolved?.bookingId || (bookings[0]?.id ?? '');

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs items={[{ label: 'Operations', href: '/operations' }, { label: 'Simulation' }]} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1>Operational Simulation & Stability Testing</h1>
            <p className="admin-muted-copy">
              Inject realistic operational chaos to stress-test the dispatch workflow. Pick a booking, apply a scenario, then
              use the live dispatch dashboard to resolve. Every action lands in the event timeline below.
            </p>
          </div>
          <Link
            href="/operations/simulation/scale"
            style={{
              background: '#7e22ce',
              color: '#ffffff',
              padding: '0.6rem 1rem',
              borderRadius: 8,
              fontWeight: 700,
              textDecoration: 'none',
              whiteSpace: 'nowrap',
            }}
          >
            🌊 Scale Simulation →
          </Link>
        </div>
      </div>

      {resolved?.success ? (
        <section className="success-banner" aria-label="Simulation result">
          <p>{resolved.success}</p>
        </section>
      ) : null}
      {resolved?.error ? (
        <section className="warning-banner" aria-label="Simulation error">
          <p className="form-error">{resolved.error}</p>
        </section>
      ) : null}

      <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* SCENARIO PICKER */}
          <section
            style={{
              background: '#ffffff',
              border: '1px solid #e4e7ec',
              borderRadius: 10,
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>1. Pick a booking</h2>
              <p style={{ margin: 0, color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.85rem' }}>
                The scenario lands on a service inside this booking. The simulator picks the most operationally-relevant row
                (IN_PROGRESS &gt; DISPATCHED &gt; READY) of the right service type.
              </p>
            </div>
            <form
              method="GET"
              action="/operations/simulation"
              style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}
            >
              <select
                name="bookingId"
                defaultValue={preselectedBookingId}
                style={{ flex: 1, padding: '0.5rem 0.75rem', border: '1px solid #d0d5dd', borderRadius: 6 }}
              >
                {bookings.length === 0 ? <option value="">No bookings available</option> : null}
                {bookings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bookingRef || b.title || b.id.slice(0, 8)}
                    {b.startDate ? ` · ${new Date(b.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}` : ''}
                    {' · '}
                    {b.status}
                  </option>
                ))}
              </select>
              <button type="submit" className="button button-secondary">
                Switch booking
              </button>
            </form>
          </section>

          {/* SCENARIO CARDS */}
          <section
            style={{
              background: '#ffffff',
              border: '1px solid #e4e7ec',
              borderRadius: 10,
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>2. Apply a scenario</h2>
              <p style={{ margin: 0, color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.85rem' }}>
                Mutates the booking to look like the scenario happened. Use the dispatch dashboard to triage and resolve.
              </p>
            </div>
            {scenarios.length === 0 ? (
              <p style={{ color: 'var(--ds-color-text-subtle, #667085)' }}>
                No scenarios available. Verify the backend simulation module is deployed and the database migration ran.
              </p>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '0.6rem',
                }}
              >
                {scenarios.map((scenario) => (
                  <ScenarioCard
                    key={scenario.key}
                    scenario={scenario}
                    bookingId={preselectedBookingId}
                    disabled={!preselectedBookingId}
                  />
                ))}
              </div>
            )}
          </section>

          {/* DISPATCH SHORTCUT */}
          <section
            style={{
              background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)',
              border: '1px solid var(--ds-color-info-border, #84CAFF)',
              borderRadius: 10,
              padding: '0.85rem 1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.75rem',
            }}
          >
            <div>
              <strong style={{ color: 'var(--ds-color-info, #175CD3)' }}>3. Open Dispatch to triage</strong>
              <p style={{ margin: 0, color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.85rem' }}>
                Once a scenario is applied the row appears in Live Ops or the Critical Issues banner. Resolve via the
                existing execution actions (Mark complete / Resolve issue / Reassign supplier).
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
          </section>
        </div>

        {/* EVENT TIMELINE SIDEBAR */}
        <aside
          style={{
            background: '#ffffff',
            border: '1px solid #e4e7ec',
            borderRadius: 10,
            padding: '0.85rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            maxHeight: '80vh',
            overflow: 'auto',
            position: 'sticky',
            top: '1rem',
          }}
        >
          <div>
            <strong>Operational replay log</strong>
            <p style={{ margin: 0, color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.78rem' }}>Last {events.length} events</p>
          </div>
          {events.length === 0 ? (
            <p style={{ color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.85rem' }}>
              No events yet. Apply a scenario or run an execution action on the dispatch page.
            </p>
          ) : (
            <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {events.map((event) => {
                const tone = EVENT_TONE[event.eventType] || { bg: '#ffffff', border: '#e4e7ec', text: '#475467', icon: '•' };
                return (
                  <li
                    key={event.id}
                    style={{
                      background: tone.bg,
                      border: `1px solid ${tone.border}`,
                      borderLeft: `4px solid ${tone.border}`,
                      borderRadius: 6,
                      padding: '0.5rem 0.65rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.4rem' }}>
                      <strong style={{ color: tone.text, fontSize: '0.8rem' }}>
                        <span aria-hidden style={{ marginRight: '0.3rem' }}>{tone.icon}</span>
                        {event.eventType.replace(/_/g, ' ')}
                      </strong>
                      <time style={{ color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.72rem', fontVariantNumeric: 'tabular-nums' }}>
                        {formatEventTime(event.occurredAt)}
                      </time>
                    </div>
                    <div style={{ color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.78rem', marginTop: '0.2rem' }}>
                      {event.booking?.bookingRef ? <strong>{event.booking.bookingRef}</strong> : null}
                      {event.bookingService?.description ? ` · ${event.bookingService.description}` : ''}
                    </div>
                    {event.notes ? (
                      <div style={{ color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.78rem', marginTop: '0.2rem' }}>{event.notes}</div>
                    ) : null}
                    {event.actor ? (
                      <div style={{ color: 'var(--ds-color-text-faint, #94A3B8)', fontSize: '0.72rem', marginTop: '0.15rem' }}>by {event.actor}</div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </aside>
      </section>
    </main>
  );
}

function ScenarioCard({
  scenario,
  bookingId,
  disabled,
}: {
  scenario: Scenario;
  bookingId: string;
  disabled: boolean;
}) {
  const severityColor =
    scenario.defaultSeverity === 'CRITICAL'
      ? '#b42318'
      : scenario.defaultSeverity === 'HIGH'
      ? '#b54708'
      : scenario.defaultSeverity === 'MEDIUM'
      ? '#175cd3'
      : '#067647';
  return (
    <form
      method="POST"
      action={`/api/operations/simulation/scenarios/${scenario.key}`}
      style={{
        background: '#fafbfc',
        border: '1px solid #e4e7ec',
        borderRadius: 8,
        padding: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <input type="hidden" name="bookingId" value={bookingId} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <strong style={{ fontSize: '0.95rem' }}>{scenario.label}</strong>
        <span
          style={{
            background: severityColor,
            color: '#ffffff',
            padding: '0.1rem 0.45rem',
            borderRadius: 999,
            fontSize: '0.68rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
          }}
        >
          {scenario.defaultSeverity}
        </span>
      </div>
      <p style={{ margin: 0, color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.82rem', lineHeight: 1.4 }}>{scenario.description}</p>
      <div style={{ color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.72rem' }}>
        Target: <strong>{scenario.expectedTargetType}</strong>
      </div>
      <button
        type="submit"
        className="button button-primary"
        disabled={disabled}
        style={{ alignSelf: 'flex-start' }}
      >
        Apply scenario
      </button>
    </form>
  );
}
