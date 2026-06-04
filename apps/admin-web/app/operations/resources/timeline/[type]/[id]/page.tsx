import Link from 'next/link';
import { AdminBreadcrumbs } from '../../../../../components/AdminBreadcrumbs';
import { ADMIN_API_BASE_URL, adminPageFetchJson, isNextRedirectError } from '../../../../../lib/admin-server';
import { OPERATIONS_TIME_ZONE } from '../../../../../lib/operations-timezone';

export const dynamic = 'force-dynamic';

type TimelineItem = {
  bookingServiceId: string;
  bookingId: string;
  bookingRef: string | null;
  description: string;
  operationType: string;
  serviceDate: string | null;
  startTime: string | null;
  executionStatus: string;
  windowStart: string;
  windowEnd: string;
  gapToNextMinutes: number | null;
  conflictWithNext: 'OK' | 'TIGHT' | 'OVERLAP';
};

type TimelineResponse = {
  type: string;
  resourceId: string;
  rangeDays: number;
  items: TimelineItem[];
};

async function loadTimeline(type: string, id: string): Promise<TimelineResponse | null> {
  try {
    return await adminPageFetchJson<TimelineResponse>(
      `${ADMIN_API_BASE_URL}/operations/resources/timeline/${type}/${id}?rangeDays=14`,
      'Resource timeline',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[resources/timeline] fetch failed', error);
    return null;
  }
}

function formatTime(time: string | null) {
  if (!time) return '—';
  const match = String(time).match(/(\d{1,2}):(\d{2})/);
  if (!match) return time;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

function formatDate(value: string | null) {
  if (!value) return '—';
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

export default async function ResourceTimelinePage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  const timeline = await loadTimeline(type, id);

  // Group items by date for display.
  const byDate = new Map<string, TimelineItem[]>();
  for (const item of timeline?.items || []) {
    const dateKey = item.serviceDate ? new Date(item.serviceDate).toDateString() : 'unknown';
    const list = byDate.get(dateKey) || [];
    list.push(item);
    byDate.set(dateKey, list);
  }
  const orderedDates = [...byDate.keys()].sort();

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs
          items={[
            { label: 'Operations', href: '/operations' },
            { label: 'Resources' },
            { label: 'Conflicts', href: '/operations/resources/conflicts' },
            { label: 'Timeline' },
          ]}
        />
        <h1>
          {type.charAt(0).toUpperCase() + type.slice(1)} timeline
        </h1>
        <p className="admin-muted-copy">
          Chronological assignments over the next {timeline?.rangeDays ?? 14} days. Tight turnarounds (&lt;30 min) and overlapping windows are
          highlighted inline.
        </p>
      </div>

      {!timeline || timeline.items.length === 0 ? (
        <section
          style={{
            background: '#f0fdf4',
            border: '1px solid #12b76a',
            borderRadius: 12,
            padding: '1.5rem',
            textAlign: 'center',
            color: 'var(--ds-color-success, #067647)',
          }}
        >
          <strong style={{ fontSize: '1.1rem' }}>No upcoming assignments for this resource.</strong>
        </section>
      ) : (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {orderedDates.map((dateKey) => {
            const items = byDate.get(dateKey) || [];
            const niceDate =
              dateKey === 'unknown'
                ? 'Date TBC'
                : new Date(items[0].serviceDate || dateKey).toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'short',
                    timeZone: OPERATIONS_TIME_ZONE,
                  });
            return (
              <div
                key={dateKey}
                style={{
                  background: '#ffffff',
                  border: '1px solid var(--ds-color-border-subtle, #E4E7EC)',
                  borderRadius: 10,
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                }}
              >
                <h2 style={{ margin: 0, fontSize: '1rem', color: 'var(--ds-color-text, #0F172A)' }}>{niceDate}</h2>
                <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {items.map((item, idx) => {
                    const tone =
                      item.conflictWithNext === 'OVERLAP'
                        ? { bg: '#fef3f2', border: '#f04438', text: '#b42318', label: 'OVERLAP with next' }
                        : item.conflictWithNext === 'TIGHT'
                        ? { bg: '#fff8eb', border: '#f79009', text: '#b54708', label: `${item.gapToNextMinutes}m gap to next` }
                        : null;
                    return (
                      <li
                        key={item.bookingServiceId}
                        style={{
                          display: 'flex',
                          gap: '0.6rem',
                          padding: '0.55rem 0.75rem',
                          background: tone?.bg || '#fafbfc',
                          border: `1px solid ${tone?.border || 'var(--ds-color-border-subtle, #E4E7EC)'}`,
                          borderRadius: 6,
                          alignItems: 'center',
                          fontSize: '0.88rem',
                        }}
                      >
                        <strong style={{ fontVariantNumeric: 'tabular-nums', minWidth: '3.5rem', color: tone?.text || 'var(--ds-color-text, #0F172A)' }}>
                          {formatTime(item.startTime)}
                        </strong>
                        <span style={{ flex: 1 }}>
                          <Link
                            href={`/bookings/${item.bookingId}/operations`}
                            style={{ color: 'var(--ds-color-info, #175CD3)', textDecoration: 'none', fontWeight: 600 }}
                          >
                            {item.bookingRef || item.bookingId.slice(0, 8)}
                          </Link>
                          {' · '}
                          {item.description}
                        </span>
                        <span
                          style={{
                            background: 'var(--ds-color-surface-soft, #F9FAFB)',
                            color: 'var(--ds-color-text-muted, #475569)',
                            padding: '0.1rem 0.45rem',
                            borderRadius: 4,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                          }}
                        >
                          {item.operationType}
                        </span>
                        <span
                          style={{
                            background: item.executionStatus === 'READY' ? 'var(--ds-color-surface-soft, #F9FAFB)' : 'var(--ds-color-info-surface, #EFF8FF)',
                            color: item.executionStatus === 'READY' ? 'var(--ds-color-text-muted, #475569)' : 'var(--ds-color-info, #175CD3)',
                            padding: '0.1rem 0.45rem',
                            borderRadius: 4,
                            fontSize: '0.72rem',
                            fontWeight: 700,
                          }}
                        >
                          {item.executionStatus}
                        </span>
                        {tone ? (
                          <span
                            style={{
                              background: tone.border,
                              color: '#ffffff',
                              padding: '0.1rem 0.5rem',
                              borderRadius: 999,
                              fontSize: '0.7rem',
                              fontWeight: 800,
                              whiteSpace: 'nowrap',
                            }}
                            title={tone.label}
                          >
                            ⚠ {tone.label}
                          </span>
                        ) : idx < items.length - 1 ? (
                          <span style={{ color: 'var(--ds-color-success, #067647)', fontSize: '0.72rem', fontWeight: 600 }}>
                            {item.gapToNextMinutes}m gap
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}
