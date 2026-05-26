'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

// Refinement Assistant v1 — accelerates per-row cleanup so the operator
// doesn't have to manually edit hundreds of route standards.
//
// Pulls actionable suggestions from /api/route-standards/refinement/queue:
//   - Suggested canonical code (from city fields, or recovered from a
//     messy legacy routeCode like JORDAN_AMMAN_CITY_JORDAN_QAIA_AIRPORT)
//   - Suggested duration inherited from the reverse route (AMM_PET=3.5h
//     → suggest PET_AMM=3.5h when PET_AMM's duration is null)
//   - Suggested distance inherited from the reverse route
//
// Each suggestion is one-click approvable. Bulk approve "all in section"
// and "all visible" sit at the top. VERIFIED + source=MANUAL rows are
// surfaced as Protected — visible for transparency but apply is blocked
// by the backend (the spec's no-forced-overwrite requirement).

type SuggestionField = 'canonicalRouteCode' | 'standardDurationHours' | 'standardDistanceKm';

type SuggestionTask = {
  rowId: string;
  routeCode: string;
  routeName: string;
  fromCity: string | null;
  toCity: string | null;
  canonicalRouteCode: string | null;
  field: SuggestionField;
  currentValue: string | number | null;
  suggestedValue: string | number;
  suggestionSource: 'legacy_code_parse' | 'reverse_route' | 'city_fields';
  reviewBucket: string;
  category: 'AIRPORT' | 'PETRA' | 'WADI_RUM' | 'DEAD_SEA' | 'AQABA' | 'BORDER' | 'OTHER';
  isProtected: boolean;
};

type QueueResponse = {
  tasks: SuggestionTask[];
  counters: {
    total: number;
    unresolvedLegacyCodes: number;
    missingDuration: number;
    missingDistance: number;
    protectedRows: number;
    airportPriority: number;
  };
};

const CATEGORY_LABELS: Record<SuggestionTask['category'], string> = {
  AIRPORT: 'Airport routes',
  PETRA: 'Petra',
  WADI_RUM: 'Wadi Rum',
  DEAD_SEA: 'Dead Sea',
  AQABA: 'Aqaba',
  BORDER: 'Border crossings',
  OTHER: 'Other',
};

const FIELD_LABELS: Record<SuggestionField, string> = {
  canonicalRouteCode: 'Canonical code',
  standardDurationHours: 'Duration (h)',
  standardDistanceKm: 'Distance (km)',
};

const SOURCE_LABELS: Record<SuggestionTask['suggestionSource'], string> = {
  city_fields: 'From city fields',
  legacy_code_parse: 'Parsed from legacy code',
  reverse_route: 'Inherited from reverse route',
};

export function RouteStandardRefinementAssistantPanel() {
  const router = useRouter();
  const [queue, setQueue] = useState<QueueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set()); // session-only
  const [filterField, setFilterField] = useState<'all' | SuggestionField>('all');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/route-standards/refinement/queue', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Queue failed (${response.status})`);
      setQueue(payload as QueueResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load refinement queue');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // intentional: first paint only; the operator-driven actions below
    // call refresh() explicitly after applying.
  }, []);

  const visibleTasks = useMemo(() => {
    if (!queue) return [];
    return queue.tasks
      .filter((t) => !skippedIds.has(`${t.rowId}:${t.field}`))
      .filter((t) => filterField === 'all' || t.field === filterField);
  }, [queue, skippedIds, filterField]);

  const groupedTasks = useMemo(() => {
    const groups = new Map<SuggestionTask['category'], SuggestionTask[]>();
    for (const task of visibleTasks) {
      const list = groups.get(task.category) || [];
      list.push(task);
      groups.set(task.category, list);
    }
    return groups;
  }, [visibleTasks]);

  function taskKey(t: SuggestionTask) {
    return `${t.rowId}:${t.field}`;
  }

  async function approveOne(task: SuggestionTask) {
    if (task.isProtected) return;
    const key = taskKey(task);
    if (busyIds.has(key)) return;
    setBusyIds((prev) => new Set([...prev, key]));
    setError(null);
    try {
      const response = await fetch('/api/route-standards/refinement/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rowId: task.rowId, field: task.field, value: task.suggestedValue }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Apply failed (${response.status})`);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  async function approveBulk(tasks: SuggestionTask[]) {
    const applyable = tasks.filter((t) => !t.isProtected);
    if (applyable.length === 0) return;
    if (!confirm(`Approve ${applyable.length} suggestion${applyable.length === 1 ? '' : 's'}? Protected (VERIFIED / MANUAL) rows are automatically skipped.`)) {
      return;
    }
    setError(null);
    setBusyIds((prev) => new Set([...prev, ...applyable.map(taskKey)]));
    try {
      const response = await fetch('/api/route-standards/refinement/apply-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: applyable.map((t) => ({ rowId: t.rowId, field: t.field, value: t.suggestedValue })),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Bulk apply failed (${response.status})`);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk apply failed');
    } finally {
      setBusyIds(new Set());
    }
  }

  function skipOne(task: SuggestionTask) {
    setSkippedIds((prev) => new Set([...prev, taskKey(task)]));
  }

  function toggleCategory(category: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  const orderedCategories: Array<SuggestionTask['category']> = [
    'AIRPORT', 'PETRA', 'WADI_RUM', 'DEAD_SEA', 'AQABA', 'BORDER', 'OTHER',
  ];

  return (
    <section
      style={{
        background: '#f7f9fb',
        border: '1px solid #d8e0eb',
        borderRadius: 10,
        padding: '0.85rem 1rem',
        marginBottom: '1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <p
            style={{
              color: '#475467',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Refinement assistant
          </p>
          <p style={{ margin: '0.2rem 0 0', color: '#475467', fontSize: '0.85rem' }}>
            One-click suggestions to accelerate cleanup. Canonical codes are recovered
            from city fields or legacy routeCode parsing; missing duration/distance
            are inherited from the reverse route when it has valid timing. VERIFIED
            and operator-MANUAL rows are shown as Protected and never auto-changed.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.78rem', color: '#475467', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            Filter:
            <select value={filterField} onChange={(e) => setFilterField(e.target.value as any)}>
              <option value="all">All suggestions</option>
              <option value="canonicalRouteCode">Canonical code only</option>
              <option value="standardDurationHours">Duration only</option>
              <option value="standardDistanceKm">Distance only</option>
            </select>
          </label>
          <button
            type="button"
            className="primary-button"
            onClick={() => approveBulk(visibleTasks)}
            disabled={loading || visibleTasks.length === 0 || busyIds.size > 0}
          >
            Approve all visible ({visibleTasks.filter((t) => !t.isProtected).length})
          </button>
        </div>
      </div>

      {error ? <p className="form-error" style={{ marginTop: '0.5rem' }}>{error}</p> : null}

      {/* Counter row mirrors the spec's review categories. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '0.5rem',
          marginTop: '0.75rem',
        }}
      >
        <Counter label="Total suggestions" value={queue?.counters.total ?? null} loading={loading} />
        <Counter label="Unresolved legacy codes" value={queue?.counters.unresolvedLegacyCodes ?? null} loading={loading} />
        <Counter label="Missing duration" value={queue?.counters.missingDuration ?? null} loading={loading} />
        <Counter label="Missing distance" value={queue?.counters.missingDistance ?? null} loading={loading} />
        <Counter label="Airport priority" value={queue?.counters.airportPriority ?? null} loading={loading} tone="airport" />
        <Counter label="Protected (skip)" value={queue?.counters.protectedRows ?? null} loading={loading} />
      </div>

      {!loading && visibleTasks.length === 0 ? (
        <p style={{ marginTop: '0.85rem', color: '#475467', fontSize: '0.88rem' }}>
          No outstanding suggestions. Either the queue is empty or every actionable suggestion
          has been approved/skipped this session.
        </p>
      ) : null}

      {/* Sectioned by priority category. AIRPORT first, then PETRA / WR / DS / AQJ / BORDER / OTHER. */}
      <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {orderedCategories.map((category) => {
          const tasks = groupedTasks.get(category) || [];
          if (tasks.length === 0) return null;
          const collapsed = collapsedCategories.has(category);
          const applyableCount = tasks.filter((t) => !t.isProtected).length;
          return (
            <div key={category} style={{ background: '#fff', border: '1px solid #d8e0eb', borderRadius: 8 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'baseline',
                  padding: '0.55rem 0.85rem',
                  borderBottom: collapsed ? 'none' : '1px solid #eef2f6',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleCategory(category)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    color: '#101828',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <span style={{ fontSize: '0.7rem', color: '#475467' }}>{collapsed ? '▶' : '▼'}</span>
                  {CATEGORY_LABELS[category]}
                  <span style={{ color: '#667085', fontWeight: 500, fontSize: '0.78rem' }}>
                    · {tasks.length} suggestion{tasks.length === 1 ? '' : 's'}
                  </span>
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  style={{ fontSize: '0.78rem' }}
                  onClick={() => approveBulk(tasks)}
                  disabled={applyableCount === 0 || busyIds.size > 0}
                >
                  Approve all in section ({applyableCount})
                </button>
              </div>
              {collapsed ? null : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                  {tasks.map((task) => (
                    <SuggestionRow
                      key={taskKey(task)}
                      task={task}
                      busy={busyIds.has(taskKey(task))}
                      onApprove={() => approveOne(task)}
                      onSkip={() => skipOne(task)}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Counter({
  label,
  value,
  loading,
  tone,
}: {
  label: string;
  value: number | null;
  loading: boolean;
  tone?: 'airport';
}) {
  const display = value ?? (loading ? '…' : 0);
  const highlight = typeof value === 'number' && value > 0;
  const bg = tone === 'airport' ? '#fff7f0' : highlight ? '#fff' : '#f9fafb';
  const border = tone === 'airport' ? '1px solid #f0c8a8' : highlight ? '1px solid #d8e0eb' : '1px solid #eef2f6';
  const textColor = tone === 'airport' ? '#8b5e34' : highlight ? '#101828' : '#475467';
  return (
    <div style={{ background: bg, border, borderRadius: 8, padding: '0.5rem 0.65rem' }}>
      <p
        style={{
          margin: 0,
          color: '#475467',
          fontSize: '0.68rem',
          textTransform: 'uppercase',
          fontWeight: 700,
          letterSpacing: '0.05em',
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: '0.1rem 0 0',
          fontSize: '1.3rem',
          fontWeight: 700,
          color: textColor,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {display}
      </p>
    </div>
  );
}

function SuggestionRow({
  task,
  busy,
  onApprove,
  onSkip,
}: {
  task: SuggestionTask;
  busy: boolean;
  onApprove: () => void;
  onSkip: () => void;
}) {
  const currentDisplay = task.currentValue == null || task.currentValue === '' ? '—' : String(task.currentValue);
  const suggestedDisplay = String(task.suggestedValue);
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 1.4fr) minmax(120px, 1fr) minmax(160px, 1.2fr) auto',
        gap: '0.55rem',
        padding: '0.5rem 0.85rem',
        borderTop: '1px solid #f2f4f7',
        alignItems: 'baseline',
      }}
    >
      <div>
        <p style={{ margin: 0, fontFamily: 'monospace', fontSize: '0.78rem', color: '#101828' }}>
          <strong>{task.routeCode}</strong>
          {task.canonicalRouteCode ? (
            <span style={{ marginLeft: '0.35rem', color: '#7a5c2e' }}>→ {task.canonicalRouteCode}</span>
          ) : null}
        </p>
        <p style={{ margin: '0.1rem 0 0', color: '#475467', fontSize: '0.78rem' }}>
          {task.routeName}
          {task.fromCity || task.toCity ? (
            <span style={{ color: '#98a2b3' }}>
              {' '}· {task.fromCity || '?'} → {task.toCity || '?'}
            </span>
          ) : null}
        </p>
      </div>
      <div>
        <p style={{ margin: 0, color: '#475467', fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
          {FIELD_LABELS[task.field]}
        </p>
        <p style={{ margin: '0.1rem 0 0', fontSize: '0.85rem', color: '#101828' }}>
          <span style={{ color: '#98a2b3' }}>{currentDisplay}</span>
          {' → '}
          <strong style={{ fontFamily: task.field === 'canonicalRouteCode' ? 'monospace' : 'inherit' }}>{suggestedDisplay}</strong>
        </p>
      </div>
      <div>
        <p style={{ margin: 0, color: '#475467', fontSize: '0.72rem' }}>{SOURCE_LABELS[task.suggestionSource]}</p>
        {task.isProtected ? (
          <span
            style={{
              display: 'inline-block',
              marginTop: '0.2rem',
              background: '#ecfdf3',
              color: '#067647',
              padding: '0.05rem 0.45rem',
              borderRadius: 999,
              fontSize: '0.68rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
            title="Row is VERIFIED or MANUAL — assistant never auto-modifies operator-curated standards."
          >
            Protected
          </span>
        ) : (
          <span
            style={{
              display: 'inline-block',
              marginTop: '0.2rem',
              background: '#f0f4f8',
              color: '#475467',
              padding: '0.05rem 0.45rem',
              borderRadius: 999,
              fontSize: '0.68rem',
              fontWeight: 600,
            }}
          >
            {task.reviewBucket.toLowerCase().replace(/_/g, ' ')}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        <button
          type="button"
          className="primary-button"
          style={{ fontSize: '0.78rem' }}
          onClick={onApprove}
          disabled={busy || task.isProtected}
          title={task.isProtected ? 'Protected — apply blocked' : `Apply ${FIELD_LABELS[task.field]}`}
        >
          {busy ? '…' : 'Approve'}
        </button>
        <button
          type="button"
          className="secondary-button"
          style={{ fontSize: '0.78rem' }}
          onClick={onSkip}
          disabled={busy}
          title="Hide from this session — does not modify the row"
        >
          Skip
        </button>
      </div>
    </li>
  );
}
