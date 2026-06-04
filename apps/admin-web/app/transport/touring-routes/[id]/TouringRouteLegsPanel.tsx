'use client';

import { useEffect, useMemo, useState } from 'react';

// Touring Route Legs v1 — ordered Route Standard movements that compose
// the touring-route operational flow. Pricing is NOT affected by this
// panel (TouringRoutePricing remains authoritative).

type OperationalArea = {
  id: string;
  code: string;
  name: string;
  type: string;
  city: string;
};

type RouteStandard = {
  id: string;
  routeCode: string;
  canonicalRouteCode: string | null;
  routeName: string;
  standardDistanceKm: number | null;
  standardDurationHours: number | null;
  operationalBufferMinutes: number | null;
  longDistanceFlag: boolean;
  overnightRisk: boolean;
  mountainRoadFlag: boolean;
  borderCrossingFlag: boolean;
  airportRouteFlag: boolean;
};

type TouringRouteLeg = {
  id: string;
  touringRouteId: string;
  sequence: number;
  routeStandardId: string | null;
  fromAreaId: string | null;
  toAreaId: string | null;
  legType: 'DRIVE' | 'STOP' | 'WAIT' | 'ACTIVITY_ANCHOR';
  notes: string | null;
  estimatedStopMinutes: number | null;
  routeStandard: RouteStandard | null;
  fromArea: OperationalArea | null;
  toArea: OperationalArea | null;
};

type LegsSummary = {
  legCount: number;
  driveLegCount: number;
  stopLegCount: number;
  missingRouteStandardCount: number;
  totalDriveDistanceKm: number;
  totalDriveDurationHours: number;
  totalBufferMinutes: number;
  totalEstimatedStopMinutes: number;
  totalOperationalDurationHours: number;
  totalOperationalDurationMinutes: number;
  riskFlags: {
    longDistanceFlag: boolean;
    overnightRisk: boolean;
    mountainRoadFlag: boolean;
    borderCrossingFlag: boolean;
    airportRouteFlag: boolean;
  };
  flow: string;
};

type GeneratedLeg = {
  sequence: number;
  fromStopId: string;
  toStopId: string;
  fromArea: OperationalArea | null;
  toArea: OperationalArea | null;
  suggestedCode: string | null;
  routeStandardId: string | null;
  routeStandard: RouteStandard | null;
  status: 'new' | 'reused' | 'skipped_same_area' | 'skipped_unmatched_area';
  reusedLegId: string | null;
};

type ResolvedStop = {
  stopId: string;
  order: number;
  city: string;
  location: string | null;
  matchedArea: OperationalArea | null;
};

type GenerateLegsResponse = {
  mode: 'preview' | 'apply';
  applied: boolean;
  stops: ResolvedStop[];
  legs: GeneratedLeg[];
  existingLegCount: number;
  newCount: number;
  reusedCount: number;
  skippedSameArea: number;
  skippedUnmatched: number;
  missingStandardCount: number;
  createdCount: number;
  replacedCount: number;
  message: string;
};

const LEG_TYPES = ['DRIVE', 'STOP', 'WAIT', 'ACTIVITY_ANCHOR'] as const;

const LEG_TYPE_LABELS: Record<string, string> = {
  DRIVE: 'Drive',
  STOP: 'Stop',
  WAIT: 'Wait',
  ACTIVITY_ANCHOR: 'Activity anchor',
};

export function TouringRouteLegsPanel({ touringRouteId }: { touringRouteId: string }) {
  const [legs, setLegs] = useState<TouringRouteLeg[]>([]);
  const [summary, setSummary] = useState<LegsSummary | null>(null);
  const [areas, setAreas] = useState<OperationalArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Auto-Leg Builder from Stops v1 — preview state. Null = closed; an
  // object = preview panel rendered with the proposed plan.
  const [generatePreview, setGeneratePreview] = useState<GenerateLegsResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);

  // Add-leg form state
  const [formFromAreaId, setFormFromAreaId] = useState('');
  const [formToAreaId, setFormToAreaId] = useState('');
  const [formLegType, setFormLegType] = useState<typeof LEG_TYPES[number]>('DRIVE');
  const [formStopMinutes, setFormStopMinutes] = useState('');
  const [formNotes, setFormNotes] = useState('');
  // Preview of the canonical FROM_TO code the new leg would resolve to,
  // and whether a matching Route Standard exists.
  const [resolvedStandard, setResolvedStandard] = useState<RouteStandard | null>(null);
  const [resolvedStandardLoading, setResolvedStandardLoading] = useState(false);

  async function refreshAll() {
    setLoading(true);
    setError(null);
    try {
      const [legsResp, summaryResp, areasResp] = await Promise.all([
        fetch(`/api/touring-routes/${touringRouteId}/legs`, { cache: 'no-store' }),
        fetch(`/api/touring-routes/${touringRouteId}/legs-summary`, { cache: 'no-store' }),
        fetch('/api/operational-areas?onlyActive=true', { cache: 'no-store' }),
      ]);
      if (!legsResp.ok) throw new Error(`Failed to load legs (${legsResp.status})`);
      if (!summaryResp.ok) throw new Error(`Failed to load summary (${summaryResp.status})`);
      if (!areasResp.ok) throw new Error(`Failed to load operational areas (${areasResp.status})`);
      const legsData = await legsResp.json();
      const summaryData = await summaryResp.json();
      const areasData = await areasResp.json();
      setLegs(legsData as TouringRouteLeg[]);
      setSummary(summaryData as LegsSummary);
      setAreas(areasData as OperationalArea[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Route Legs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touringRouteId]);

  // Live preview of the auto-resolved RouteStandard as operator picks
  // From + To. Calls the existing /api/route-standards/preview-creation
  // endpoint, which already does the canonical-FROM_TO lookup with
  // duplicate detection (we treat the "existingMatch" as our resolved
  // standard).
  useEffect(() => {
    if (!formFromAreaId || !formToAreaId || formFromAreaId === formToAreaId || formLegType !== 'DRIVE') {
      setResolvedStandard(null);
      return;
    }
    let cancelled = false;
    setResolvedStandardLoading(true);
    (async () => {
      try {
        const response = await fetch('/api/route-standards/preview-creation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromAreaId: formFromAreaId, toAreaId: formToAreaId }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || cancelled) {
          setResolvedStandard(null);
          return;
        }
        // existingMatch is the standard the new leg would link to.
        setResolvedStandard(payload?.existingMatch || null);
      } catch {
        if (!cancelled) setResolvedStandard(null);
      } finally {
        if (!cancelled) setResolvedStandardLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [formFromAreaId, formToAreaId, formLegType]);

  async function addLeg() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/touring-routes/${touringRouteId}/legs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          legType: formLegType,
          fromAreaId: formFromAreaId || null,
          toAreaId: formToAreaId || null,
          notes: formNotes || null,
          estimatedStopMinutes: formStopMinutes ? Number(formStopMinutes) : null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Add leg failed (${response.status})`);
      // Reset form + refresh.
      setFormFromAreaId('');
      setFormToAreaId('');
      setFormLegType('DRIVE');
      setFormStopMinutes('');
      setFormNotes('');
      setResolvedStandard(null);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Add leg failed');
    } finally {
      setBusy(false);
    }
  }

  async function previewGenerate(replace: boolean) {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/touring-routes/${touringRouteId}/legs/generate-from-stops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'preview', replaceExisting: replace }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Preview failed (${response.status})`);
      setGeneratePreview(payload as GenerateLegsResponse);
      setReplaceExisting(replace);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generate preview failed');
    } finally {
      setGenerating(false);
    }
  }

  async function applyGenerate() {
    if (generating) return;
    if (replaceExisting) {
      if (!confirm(
        `Replace existing legs? ${generatePreview?.existingLegCount ?? 0} current leg${
          generatePreview?.existingLegCount === 1 ? '' : 's'
        } will be deleted before the new legs are written. Touring route pricing is not affected.`,
      )) {
        return;
      }
    }
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch(`/api/touring-routes/${touringRouteId}/legs/generate-from-stops`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'apply', replaceExisting }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Apply failed (${response.status})`);
      setGeneratePreview(null);
      setReplaceExisting(false);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setGenerating(false);
    }
  }

  async function deleteLeg(id: string) {
    if (!confirm('Remove this leg? Touring route pricing is not affected.')) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/touring-route-legs/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Delete leg failed (${response.status})`);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete leg failed');
    } finally {
      setBusy(false);
    }
  }

  async function reorderLegs(direction: 'up' | 'down', leg: TouringRouteLeg) {
    if (busy) return;
    const idx = legs.findIndex((l) => l.id === leg.id);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= legs.length) return;
    const reordered = [...legs];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/touring-routes/${touringRouteId}/legs/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderedIds: reordered.map((l) => l.id) }),
      });
      if (!response.ok) throw new Error(`Reorder failed (${response.status})`);
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reorder failed');
    } finally {
      setBusy(false);
    }
  }

  const areaOptions = useMemo(
    () => areas.map((a) => ({ value: a.id, label: `${a.name} (${a.code})` })),
    [areas],
  );

  const projectedCode = useMemo(() => {
    if (!formFromAreaId || !formToAreaId || formLegType !== 'DRIVE') return null;
    const f = areas.find((a) => a.id === formFromAreaId);
    const t = areas.find((a) => a.id === formToAreaId);
    if (!f || !t || f.code === t.code) return null;
    return `${f.code}_${t.code}`;
  }, [areas, formFromAreaId, formToAreaId, formLegType]);

  return (
    <section className="workspace-section" style={{ display: 'grid', gap: '0.85rem' }}>
      <div>
        <h3 style={{ margin: 0 }}>Route Legs</h3>
        <p style={{ margin: '0.2rem 0 0', color: '#667085', fontSize: '0.85rem' }}>
          Ordered Route Standard movements that compose this touring route's operational flow.
          Pricing comes from the touring-route supplier rate — adding legs does <strong>not</strong>{' '}
          change pricing. Dispatch + quote display use these legs for timing and risk awareness.
        </p>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {/* Summary header */}
      {summary && summary.legCount > 0 ? (
        <SummaryHeader summary={summary} />
      ) : null}

      {/* Auto-Leg Builder from Stops v1 — preview button + result panel.
          Pricing is NOT affected by this builder. */}
      <GenerateFromStopsControls
        preview={generatePreview}
        generating={generating}
        replaceExisting={replaceExisting}
        setReplaceExisting={setReplaceExisting}
        onPreview={previewGenerate}
        onApply={applyGenerate}
        onDismiss={() => {
          setGeneratePreview(null);
          setReplaceExisting(false);
        }}
        existingLegCount={legs.length}
      />

      {/* Existing legs */}
      {loading ? (
        <p style={{ color: '#667085', fontSize: '0.85rem' }}>Loading legs…</p>
      ) : legs.length === 0 ? (
        <p style={{ color: '#667085', fontSize: '0.85rem' }}>
          No legs yet. Add the first one below — most Jordan touring routes are 3-4 legs (Amman → Madaba → Nebo → Petra,
          Petra → Wadi Rum, etc.).
        </p>
      ) : (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.4rem' }}>
          {legs.map((leg, idx) => (
            <LegRow
              key={leg.id}
              leg={leg}
              isFirst={idx === 0}
              isLast={idx === legs.length - 1}
              onMoveUp={() => reorderLegs('up', leg)}
              onMoveDown={() => reorderLegs('down', leg)}
              onDelete={() => deleteLeg(leg.id)}
              busy={busy}
            />
          ))}
        </ol>
      )}

      {/* Add leg form */}
      <div
        style={{
          background: 'var(--ds-color-surface-soft, #F9FAFB)',
          border: '1px solid #e4e7ec',
          borderRadius: 10,
          padding: '0.85rem 1rem',
        }}
      >
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
          Add leg
        </p>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '0.5rem',
            marginTop: '0.5rem',
          }}
        >
          <FieldPicker
            label="Leg type"
            value={formLegType}
            options={LEG_TYPES.map((t) => ({ value: t, label: LEG_TYPE_LABELS[t] }))}
            onChange={(v) => setFormLegType(v as typeof LEG_TYPES[number])}
          />
          <FieldPicker
            label="From area"
            value={formFromAreaId}
            options={areaOptions.filter((o) => o.value !== formToAreaId)}
            placeholder="— pick area —"
            onChange={setFormFromAreaId}
          />
          <FieldPicker
            label="To area"
            value={formToAreaId}
            options={areaOptions.filter((o) => o.value !== formFromAreaId)}
            placeholder="— pick area —"
            onChange={setFormToAreaId}
          />
          <FieldNumber
            label="Stop minutes"
            value={formStopMinutes}
            onChange={setFormStopMinutes}
            placeholder={formLegType === 'DRIVE' ? '0' : '30'}
          />
        </div>
        <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Notes</span>
          <input
            value={formNotes}
            onChange={(e) => setFormNotes(e.target.value)}
            placeholder="Operational notes (optional)"
          />
        </div>

        {/* Auto-resolved Route Standard preview */}
        {formLegType === 'DRIVE' && projectedCode ? (
          <ResolvedStandardPreview
            projectedCode={projectedCode}
            resolved={resolvedStandard}
            loading={resolvedStandardLoading}
          />
        ) : null}

        <div style={{ marginTop: '0.65rem', display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="primary-button"
            onClick={addLeg}
            disabled={busy || (formLegType === 'DRIVE' && (!formFromAreaId || !formToAreaId))}
          >
            {busy ? 'Adding…' : 'Add leg'}
          </button>
        </div>
      </div>
    </section>
  );
}

function SummaryHeader({ summary }: { summary: LegsSummary }) {
  const riskChips: string[] = [];
  if (summary.riskFlags.borderCrossingFlag) riskChips.push('Border crossing');
  if (summary.riskFlags.mountainRoadFlag) riskChips.push('Mountain road');
  if (summary.riskFlags.longDistanceFlag) riskChips.push('Long distance');
  if (summary.riskFlags.airportRouteFlag) riskChips.push('Airport route');
  if (summary.riskFlags.overnightRisk) riskChips.push('Overnight risk');
  return (
    <div
      style={{
        background: '#f0f9ff',
        border: '1px solid #bae6fd',
        borderRadius: 10,
        padding: '0.7rem 0.9rem',
      }}
    >
      {summary.flow ? (
        <p style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#0c4a6e' }}>{summary.flow}</p>
      ) : null}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.45rem',
          marginTop: '0.5rem',
        }}
      >
        <SummaryStat label="Total drive distance" value={`${summary.totalDriveDistanceKm} km`} />
        <SummaryStat label="Total drive duration" value={`${summary.totalDriveDurationHours} h`} />
        <SummaryStat label="Operational buffer" value={`${summary.totalBufferMinutes} min`} />
        <SummaryStat label="Total stop time" value={`${summary.totalEstimatedStopMinutes} min`} />
        <SummaryStat label="Total operational" value={`${summary.totalOperationalDurationHours} h`} highlight />
      </div>
      {riskChips.length > 0 ? (
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.55rem' }}>
          {riskChips.map((chip) => (
            <span
              key={chip}
              style={{
                background: '#fff',
                border: '1px solid #fcd34d',
                color: '#7c2d12',
                padding: '0.1rem 0.55rem',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontWeight: 600,
              }}
            >
              {chip}
            </span>
          ))}
        </div>
      ) : null}
      {summary.missingRouteStandardCount > 0 ? (
        <p style={{ margin: '0.45rem 0 0', color: '#7c2d12', fontSize: '0.82rem' }}>
          ⚠ {summary.missingRouteStandardCount} drive leg
          {summary.missingRouteStandardCount === 1 ? ' is' : 's are'} missing a Route Standard. Drive
          time / distance / buffer below excludes those.
        </p>
      ) : null}
    </div>
  );
}

function SummaryStat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      style={{
        background: highlight ? '#fff' : '#fafdff',
        border: highlight ? '1px solid #7dd3fc' : '1px solid #e0f2fe',
        borderRadius: 8,
        padding: '0.4rem 0.55rem',
      }}
    >
      <p
        style={{
          margin: 0,
          color: '#0c4a6e',
          fontSize: '0.65rem',
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
          fontSize: highlight ? '1.1rem' : '0.95rem',
          fontWeight: 700,
          color: '#0c4a6e',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </p>
    </div>
  );
}

function LegRow({
  leg,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onDelete,
  busy,
}: {
  leg: TouringRouteLeg;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const isDrive = leg.legType === 'DRIVE';
  const fromLabel = leg.fromArea?.name || '—';
  const toLabel = leg.toArea?.name || '—';
  const std = leg.routeStandard;
  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: '0.65rem',
        padding: '0.55rem 0.7rem',
        background: '#fff',
        border: '1px solid #e4e7ec',
        borderRadius: 8,
        alignItems: 'center',
      }}
    >
      <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#475467', minWidth: 32 }}>
        {leg.sequence}
      </div>
      <div>
        <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#101828' }}>
          {fromLabel} → {toLabel}
          <span
            style={{
              marginLeft: '0.5rem',
              background: '#f0f9ff',
              color: '#0c4a6e',
              fontSize: '0.68rem',
              padding: '0.05rem 0.45rem',
              borderRadius: 999,
              fontWeight: 600,
            }}
          >
            {LEG_TYPE_LABELS[leg.legType]}
          </span>
        </div>
        <div style={{ marginTop: '0.2rem', color: '#475467', fontSize: '0.82rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {isDrive ? (
            std ? (
              <>
                <code style={{ background: 'var(--ds-color-surface-soft, #F9FAFB)', padding: '0.05rem 0.4rem', borderRadius: 4, fontSize: '0.78rem' }}>
                  {std.canonicalRouteCode || std.routeCode}
                </code>
                {std.standardDistanceKm != null ? <span>{std.standardDistanceKm} km</span> : null}
                {std.standardDurationHours != null ? <span>· {std.standardDurationHours} h</span> : null}
                {std.operationalBufferMinutes != null ? <span>· +{std.operationalBufferMinutes} min buffer</span> : null}
              </>
            ) : (
              <span style={{ color: '#7c2d12' }}>
                ⚠ No Route Standard for this from→to pair.{' '}
                <a
                  href={`/route-standards`}
                  style={{ color: '#0c4a6e', textDecoration: 'underline' }}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Create missing route standard
                </a>
              </span>
            )
          ) : (
            <>
              {leg.estimatedStopMinutes != null ? (
                <span>{leg.estimatedStopMinutes} min</span>
              ) : null}
            </>
          )}
        </div>
        {leg.notes ? (
          <div style={{ marginTop: '0.2rem', color: '#667085', fontSize: '0.78rem' }}>{leg.notes}</div>
        ) : null}
      </div>
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        <button
          type="button"
          className="secondary-button"
          onClick={onMoveUp}
          disabled={busy || isFirst}
          style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem' }}
          title="Move up"
        >
          ↑
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={onMoveDown}
          disabled={busy || isLast}
          style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem' }}
          title="Move down"
        >
          ↓
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={onDelete}
          disabled={busy}
          style={{ fontSize: '0.78rem', padding: '0.25rem 0.5rem', color: '#a85454' }}
          title="Remove leg"
        >
          ✕
        </button>
      </div>
    </li>
  );
}

function ResolvedStandardPreview({
  projectedCode,
  resolved,
  loading,
}: {
  projectedCode: string;
  resolved: RouteStandard | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <p style={{ marginTop: '0.5rem', color: '#667085', fontSize: '0.85rem' }}>Checking for Route Standard…</p>
    );
  }
  if (!resolved) {
    return (
      <div
        style={{
          marginTop: '0.5rem',
          padding: '0.55rem 0.7rem',
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: 8,
          color: '#7c2d12',
          fontSize: '0.85rem',
        }}
      >
        ⚠ No Route Standard exists for{' '}
        <code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3 }}>{projectedCode}</code>.
        The leg will save without a standard link — drive duration / distance / buffer for this leg will be excluded
        from the operational summary until you{' '}
        <a
          href="/route-standards"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#0c4a6e', textDecoration: 'underline' }}
        >
          create the missing route standard
        </a>{' '}
        via the Route Builder.
      </div>
    );
  }
  return (
    <div
      style={{
        marginTop: '0.5rem',
        padding: '0.55rem 0.7rem',
        background: 'var(--ds-color-success-surface, #ECFDF3)',
        border: '1px solid var(--ds-color-success-border, #ABEFC6)',
        borderRadius: 8,
        color: 'var(--ds-color-success, #067647)',
        fontSize: '0.85rem',
      }}
    >
      ✓ Will link to <code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3 }}>{resolved.canonicalRouteCode || resolved.routeCode}</code>
      {' '}— {resolved.routeName}
      {resolved.standardDurationHours != null ? ` · ${resolved.standardDurationHours} h` : ''}
      {resolved.standardDistanceKm != null ? ` · ${resolved.standardDistanceKm} km` : ''}
      {resolved.operationalBufferMinutes != null ? ` · +${resolved.operationalBufferMinutes} min` : ''}
    </div>
  );
}

function FieldPicker({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function GenerateFromStopsControls({
  preview,
  generating,
  replaceExisting,
  setReplaceExisting,
  onPreview,
  onApply,
  onDismiss,
  existingLegCount,
}: {
  preview: GenerateLegsResponse | null;
  generating: boolean;
  replaceExisting: boolean;
  setReplaceExisting: (v: boolean) => void;
  onPreview: (replace: boolean) => void;
  onApply: () => void;
  onDismiss: () => void;
  existingLegCount: number;
}) {
  // No preview yet → just the button + replace-toggle.
  if (!preview) {
    return (
      <div
        style={{
          background: '#fcfaf5',
          border: '1px solid #e2dccc',
          borderRadius: 10,
          padding: '0.7rem 0.9rem',
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.75rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <p
            style={{
              color: '#7a5c2e',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Auto-build from stops
          </p>
          <p style={{ margin: '0.2rem 0 0', color: '#475467', fontSize: '0.82rem' }}>
            Generate ordered DRIVE legs by pairing this touring route's existing Stops. Each stop is matched to an
            Operational Area and a Route Standard is auto-resolved. Pricing is <strong>not</strong> affected.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {existingLegCount > 0 ? (
            <label style={{ fontSize: '0.82rem', color: '#475467', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              Replace existing legs
            </label>
          ) : null}
          <button
            type="button"
            className="secondary-button"
            onClick={() => onPreview(replaceExisting)}
            disabled={generating}
          >
            {generating ? 'Generating…' : 'Generate legs from stops'}
          </button>
        </div>
      </div>
    );
  }

  // Preview rendered — show plan + Apply / Dismiss.
  return (
    <div
      style={{
        background: '#fcfaf5',
        border: '1px solid #e2dccc',
        borderRadius: 10,
        padding: '0.8rem 1rem',
        display: 'grid',
        gap: '0.5rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div>
          <p
            style={{
              color: '#7a5c2e',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Auto-build preview
          </p>
          <p style={{ margin: '0.2rem 0 0', color: '#475467', fontSize: '0.85rem' }}>{preview.message}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button type="button" className="secondary-button" onClick={onDismiss} disabled={generating}>
            Dismiss
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onApply}
            disabled={generating || preview.newCount === 0}
            title={preview.newCount === 0 ? 'Nothing new to apply' : 'Write the new legs'}
          >
            {generating ? 'Applying…' : `Apply (${preview.newCount} new)`}
          </button>
        </div>
      </div>

      {/* Per-leg plan rows */}
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '0.3rem' }}>
        {preview.legs.map((leg, idx) => (
          <li
            key={idx}
            style={{
              background: '#fff',
              border: '1px solid #e2dccc',
              borderRadius: 6,
              padding: '0.4rem 0.6rem',
              display: 'flex',
              gap: '0.5rem',
              alignItems: 'baseline',
              flexWrap: 'wrap',
              fontSize: '0.82rem',
            }}
          >
            <span style={{ fontFamily: 'monospace', color: '#475467', minWidth: 24 }}>{leg.sequence}.</span>
            <span style={{ flex: 1, minWidth: 200 }}>
              {leg.fromArea?.name || '?'} → {leg.toArea?.name || '?'}
              {leg.suggestedCode ? (
                <code
                  style={{
                    marginLeft: '0.4rem',
                    background: 'var(--ds-color-surface-soft, #F9FAFB)',
                    padding: '0.05rem 0.4rem',
                    borderRadius: 4,
                    fontSize: '0.78rem',
                    color: '#0c4a6e',
                  }}
                >
                  {leg.suggestedCode}
                </code>
              ) : null}
            </span>
            <PreviewBadge leg={leg} />
          </li>
        ))}
      </ol>
      {preview.missingStandardCount > 0 ? (
        <p style={{ margin: 0, fontSize: '0.78rem', color: '#7c2d12' }}>
          ⚠ {preview.missingStandardCount} leg{preview.missingStandardCount === 1 ? '' : 's'} ha
          {preview.missingStandardCount === 1 ? 's' : 've'} no Route Standard yet —{' '}
          <a
            href="/route-standards"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#0c4a6e', textDecoration: 'underline' }}
          >
            create the missing standards
          </a>
          {' '}so dispatch + quote display pick up timing. Legs will still be created; drive totals will exclude them.
        </p>
      ) : null}
    </div>
  );
}

function PreviewBadge({ leg }: { leg: GeneratedLeg }) {
  if (leg.status === 'new') {
    return (
      <span
        style={{
          background: 'var(--ds-color-success-surface, #ECFDF3)',
          color: 'var(--ds-color-success, #067647)',
          border: '1px solid var(--ds-color-success-border, #ABEFC6)',
          padding: '0.05rem 0.45rem',
          borderRadius: 999,
          fontSize: '0.7rem',
          fontWeight: 600,
        }}
        title={leg.routeStandardId ? 'New leg — Route Standard auto-resolved' : 'New leg — Route Standard MISSING'}
      >
        + new {leg.routeStandardId ? '' : '· no standard'}
      </span>
    );
  }
  if (leg.status === 'reused') {
    return (
      <span
        style={{
          background: '#f0f9ff',
          color: '#0c4a6e',
          border: '1px solid #bae6fd',
          padding: '0.05rem 0.45rem',
          borderRadius: 999,
          fontSize: '0.7rem',
          fontWeight: 600,
        }}
        title="A matching leg already exists — will be skipped (or kept after Replace)"
      >
        ✓ exists
      </span>
    );
  }
  if (leg.status === 'skipped_same_area') {
    return (
      <span
        style={{
          background: 'var(--ds-color-surface-soft, #F9FAFB)',
          color: '#475467',
          border: '1px solid #d0d5dd',
          padding: '0.05rem 0.45rem',
          borderRadius: 999,
          fontSize: '0.7rem',
          fontWeight: 600,
        }}
        title="Both stops resolved to the same Operational Area — not modelled as a movement leg"
      >
        ⤵ same area
      </span>
    );
  }
  return (
    <span
      style={{
        background: '#fef3c7',
        color: '#7c2d12',
        border: '1px solid #fcd34d',
        padding: '0.05rem 0.45rem',
        borderRadius: 999,
        fontSize: '0.7rem',
        fontWeight: 600,
      }}
      title="Couldn't match one or both stops to an Operational Area — add the area in /operational-areas first"
    >
      ⚠ unmatched area
    </span>
  );
}

function FieldNumber({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>{label}</span>
      <input
        type="number"
        min="0"
        step="5"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
