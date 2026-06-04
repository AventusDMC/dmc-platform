'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

// Route Code Generator + Duplicate Protection v1 — the operator-facing
// Route Builder. Three modes:
//   1. Single transfer: pick From + To, ERP generates AMM_PET (or
//      whatever), checks for duplicates, shows existing match warning
//      if found, optional "Also create reverse" toggle for symmetric
//      transfers.
//   2. Round trip: same form as single, but always creates both legs
//      (AMM_PET + PET_AMM).
//   3. Multi-stop touring: chain dropdown — operator picks an ordered
//      sequence of stops, ERP generates N-1 legs and tells them
//      "This is a Touring Route made from multiple legs."
//
// Replaces the old free-text "Add route standard" form on the listing
// page. Codes are NEVER typed by hand; everything is derived from the
// Operational Area dictionary.

type OperationalArea = {
  id: string;
  name: string;
  code: string;
  type: 'CITY' | 'AIRPORT' | 'ATTRACTION' | 'BORDER';
  city: string;
  defaultFlags?: Partial<{
    airportRouteFlag: boolean;
    borderCrossingFlag: boolean;
    mountainRoadFlag: boolean;
    overnightRisk: boolean;
  }>;
};

type PreviewResponse = {
  fromArea: OperationalArea;
  toArea: OperationalArea;
  suggestedCode: string;
  suggestedRouteName: string;
  existingMatch: {
    id: string;
    routeCode: string;
    canonicalRouteCode: string | null;
    routeName: string;
    standardDistanceKm: number | null;
    standardDurationHours: number | null;
    isActive: boolean;
    reviewStatus: string | null;
    matchReason: 'canonical_code' | 'legacy_code' | 'city_pair' | null;
  } | null;
  action: 'create' | 'use-existing';
  defaultFlags: {
    airportRouteFlag: boolean;
    borderCrossingFlag: boolean;
    mountainRoadFlag: boolean;
    overnightRisk: boolean;
  };
};

type Mode = 'single' | 'round-trip' | 'multi-stop';

const MODE_LABELS: Record<Mode, string> = {
  single: 'Single transfer',
  'round-trip': 'Round trip',
  'multi-stop': 'Multi-stop touring route',
};

export function RouteStandardBuilderPanel() {
  const router = useRouter();
  const [areas, setAreas] = useState<OperationalArea[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [areasError, setAreasError] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('single');

  // Single + round-trip shared state
  const [fromAreaId, setFromAreaId] = useState('');
  const [toAreaId, setToAreaId] = useState('');
  const [distanceKm, setDistanceKm] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [bufferMinutes, setBufferMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [alsoCreateReverse, setAlsoCreateReverse] = useState(false);

  // Multi-stop state
  const [multiStops, setMultiStops] = useState<string[]>(['', '', '']);

  // Preview + result state
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAreasLoading(true);
      setAreasError(null);
      try {
        const response = await fetch('/api/route-standards/areas', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || `Failed to load areas (${response.status})`);
        if (!cancelled) setAreas(payload as OperationalArea[]);
      } catch (err) {
        if (!cancelled) setAreasError(err instanceof Error ? err.message : 'Failed to load operational areas');
      } finally {
        if (!cancelled) setAreasLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-preview when both areas are selected (single + round-trip).
  useEffect(() => {
    if (mode === 'multi-stop' || !fromAreaId || !toAreaId || fromAreaId === toAreaId) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    setError(null);
    (async () => {
      try {
        const response = await fetch('/api/route-standards/preview-creation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromAreaId, toAreaId }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || `Preview failed (${response.status})`);
        if (!cancelled) setPreview(payload as PreviewResponse);
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setError(err instanceof Error ? err.message : 'Preview failed');
        }
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, fromAreaId, toAreaId]);

  const areaOptions = useMemo(() => {
    return areas.map((a) => ({ value: a.id, label: `${a.name} (${a.code})` }));
  }, [areas]);

  const fromArea = useMemo(() => areas.find((a) => a.id === fromAreaId) || null, [areas, fromAreaId]);
  const toArea = useMemo(() => areas.find((a) => a.id === toAreaId) || null, [areas, toAreaId]);

  async function submitSingle(opts: { forceCreate: boolean; bothLegs: boolean }) {
    if (!fromAreaId || !toAreaId) {
      setError('Pick both From and To areas first');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccessBanner(null);
    try {
      const response = await fetch('/api/route-standards/create-with-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromAreaId,
          toAreaId,
          standardDistanceKm: distanceKm ? Number(distanceKm) : null,
          standardDurationHours: durationHours ? Number(durationHours) : null,
          operationalBufferMinutes: bufferMinutes ? Number(bufferMinutes) : null,
          notes: notes || null,
          longDistanceFlag: false,
          overnightRisk: preview?.defaultFlags.overnightRisk ?? false,
          mountainRoadFlag: preview?.defaultFlags.mountainRoadFlag ?? false,
          borderCrossingFlag: preview?.defaultFlags.borderCrossingFlag ?? false,
          airportRouteFlag: preview?.defaultFlags.airportRouteFlag ?? false,
          forceCreate: opts.forceCreate,
          alsoCreateReverse: opts.bothLegs,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Create failed (${response.status})`);
      if (payload.action === 'use-existing') {
        setSuccessBanner(
          `Route ${preview?.suggestedCode} already exists (${payload.existingMatch?.routeName}). Use the existing row or re-run with "Create anyway".`,
        );
      } else {
        const reverseSummary = payload.reverse
          ? payload.reverse.skipped
            ? ` Reverse leg already existed — skipped.`
            : ` Reverse leg ${payload.reverse.canonicalRouteCode ?? payload.reverse.routeCode} created.`
          : '';
        setSuccessBanner(`Created ${payload.primary.canonicalRouteCode ?? payload.primary.routeCode}.${reverseSummary}`);
        resetForm();
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitMultiStop() {
    const filled = multiStops.filter(Boolean);
    if (filled.length < 3) {
      setError('Multi-stop route requires at least 3 stops');
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccessBanner(null);
    try {
      const response = await fetch('/api/route-standards/create-multi-stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stops: filled.map((areaId) => ({ areaId })),
          sharedFields: {
            operationalBufferMinutes: bufferMinutes ? Number(bufferMinutes) : null,
            notes: notes || null,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Multi-stop create failed (${response.status})`);
      setSuccessBanner(
        `${payload.message} ${payload.createdCount} leg${payload.createdCount === 1 ? '' : 's'} created, ${payload.reusedCount} reused: ${payload.legs.map((l: any) => l.suggestedCode).join(', ')}`,
      );
      setMultiStops(['', '', '']);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Multi-stop create failed');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setFromAreaId('');
    setToAreaId('');
    setDistanceKm('');
    setDurationHours('');
    setBufferMinutes('');
    setNotes('');
    setAlsoCreateReverse(false);
    setPreview(null);
  }

  function setMultiStopAt(idx: number, value: string) {
    setMultiStops((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }

  return (
    <section
      style={{
        background: '#ffffff',
        border: '1px solid #e4e7ec',
        borderRadius: 10,
        padding: '1rem',
        marginBottom: '1rem',
      }}
    >
      <h2 style={{ marginTop: 0 }}>Route Builder</h2>
      <p style={{ color: 'var(--ds-color-text-subtle, #667085)', marginTop: 0, fontSize: '0.88rem' }}>
        Pick the operational From / To areas and the ERP generates the canonical route code
        for you (AMM_PET, PET_WR, etc.). Duplicate route standards are detected before save.
        Route codes are never typed by hand.
      </p>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {(['single', 'round-trip', 'multi-stop'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setError(null);
              setSuccessBanner(null);
            }}
            style={{
              padding: '0.4rem 0.85rem',
              borderRadius: 999,
              border: mode === m ? '1px solid #0c4a6e' : '1px solid #d0d5dd',
              background: mode === m ? '#e0f2fe' : '#fff',
              color: mode === m ? '#0c4a6e' : 'var(--ds-color-text-muted, #475569)',
              fontWeight: mode === m ? 700 : 500,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            {MODE_LABELS[m]}
          </button>
        ))}
      </div>

      {areasLoading ? (
        <p style={{ color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.85rem' }}>Loading operational areas…</p>
      ) : null}
      {areasError ? <p className="form-error">{areasError}</p> : null}

      {/* Single + Round-trip shared form */}
      {(mode === 'single' || mode === 'round-trip') && !areasLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <AreaPicker
            label="From area *"
            value={fromAreaId}
            options={areaOptions}
            onChange={setFromAreaId}
            excludeId={toAreaId}
          />
          <AreaPicker
            label="To area *"
            value={toAreaId}
            options={areaOptions}
            onChange={setToAreaId}
            excludeId={fromAreaId}
          />
          <NumberField label="Distance (km)" value={distanceKm} onChange={setDistanceKm} step="0.1" placeholder="235" />
          <NumberField label="Duration (hours)" value={durationHours} onChange={setDurationHours} step="0.1" placeholder="3.5" />
          <NumberField label="Operational buffer (min)" value={bufferMinutes} onChange={setBufferMinutes} step="5" placeholder="30" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', gridColumn: '1 / -1' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>Notes</span>
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Operational notes (e.g., construction zone, restroom stop suggested)"
            />
          </div>
        </div>
      )}

      {/* Live preview banner — single mode only */}
      {mode === 'single' && fromArea && toArea && fromArea.code !== toArea.code ? (
        <PreviewBanner
          preview={preview}
          previewing={previewing}
          fromArea={fromArea}
          toArea={toArea}
        />
      ) : null}

      {/* Round trip mode — shows both leg codes side by side */}
      {mode === 'round-trip' && fromArea && toArea && fromArea.code !== toArea.code ? (
        <div
          style={{
            marginTop: '0.5rem',
            padding: '0.6rem 0.8rem',
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: 8,
            color: '#0c4a6e',
            fontSize: '0.88rem',
          }}
        >
          <strong>Round trip:</strong> ERP will create two one-way legs —{' '}
          <code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3 }}>
            {fromArea.code}_{toArea.code}
          </code>{' '}
          and{' '}
          <code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3 }}>
            {toArea.code}_{fromArea.code}
          </code>
          . Same distance / duration / buffer applied to both. Existing legs are reused, not duplicated.
        </div>
      ) : null}

      {/* Multi-stop builder */}
      {mode === 'multi-stop' && !areasLoading && (
        <MultiStopBuilder
          stops={multiStops}
          onChange={setMultiStopAt}
          onAdd={() => setMultiStops((prev) => [...prev, ''])}
          onRemove={(idx) => setMultiStops((prev) => prev.filter((_, i) => i !== idx))}
          areaOptions={areaOptions}
          areas={areas}
        />
      )}

      {error ? <p className="form-error" style={{ marginTop: '0.5rem' }}>{error}</p> : null}
      {successBanner ? (
        <section className="success-banner" style={{ marginTop: '0.5rem' }}>
          <p>{successBanner}</p>
        </section>
      ) : null}

      {/* Submit buttons by mode */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.85rem' }}>
        {mode === 'single' && (
          <>
            <button
              type="button"
              className="primary-button"
              disabled={submitting || !fromAreaId || !toAreaId || fromAreaId === toAreaId || previewing}
              onClick={() => submitSingle({ forceCreate: false, bothLegs: alsoCreateReverse })}
            >
              {submitting ? 'Saving…' : 'Create route'}
            </button>
            {preview?.existingMatch ? (
              <button
                type="button"
                className="secondary-button"
                disabled={submitting}
                onClick={() => submitSingle({ forceCreate: true, bothLegs: alsoCreateReverse })}
                title="Bypass duplicate detection and create anyway (rare — usually the existing row is the right answer)"
              >
                Create anyway
              </button>
            ) : null}
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.85rem',
                color: 'var(--ds-color-text-muted, #475569)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={alsoCreateReverse}
                onChange={(e) => setAlsoCreateReverse(e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              Also create reverse leg
            </label>
          </>
        )}
        {mode === 'round-trip' && (
          <button
            type="button"
            className="primary-button"
            disabled={submitting || !fromAreaId || !toAreaId || fromAreaId === toAreaId}
            onClick={() => submitSingle({ forceCreate: false, bothLegs: true })}
          >
            {submitting ? 'Saving…' : 'Create both legs'}
          </button>
        )}
        {mode === 'multi-stop' && (
          <button
            type="button"
            className="primary-button"
            disabled={submitting || multiStops.filter(Boolean).length < 3}
            onClick={submitMultiStop}
          >
            {submitting ? 'Building…' : `Build ${Math.max(0, multiStops.filter(Boolean).length - 1)} leg${multiStops.filter(Boolean).length - 1 === 1 ? '' : 's'}`}
          </button>
        )}
      </div>
    </section>
  );
}

function AreaPicker({
  label,
  value,
  options,
  onChange,
  excludeId,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (v: string) => void;
  excludeId?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— pick an area —</option>
        {options
          .filter((o) => o.value !== excludeId)
          .map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
      </select>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step?: string;
  placeholder?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>{label}</span>
      <input type="number" step={step} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function PreviewBanner({
  preview,
  previewing,
  fromArea,
  toArea,
}: {
  preview: PreviewResponse | null;
  previewing: boolean;
  fromArea: OperationalArea;
  toArea: OperationalArea;
}) {
  if (previewing && !preview) {
    return (
      <p style={{ marginTop: '0.5rem', color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.85rem' }}>
        Checking for duplicates…
      </p>
    );
  }
  if (!preview) return null;
  if (preview.existingMatch) {
    const reasonText = {
      canonical_code: 'matches by canonical route code',
      legacy_code: 'matches by legacy route code',
      city_pair: 'matches by from/to city pair',
    }[preview.existingMatch.matchReason || 'canonical_code'];
    return (
      <div
        style={{
          marginTop: '0.5rem',
          padding: '0.6rem 0.8rem',
          background: '#fef3c7',
          border: '1px solid #fcd34d',
          borderRadius: 8,
          color: '#7c2d12',
          fontSize: '0.88rem',
        }}
      >
        <p style={{ margin: 0 }}>
          <strong>This route already exists.</strong> Suggested code{' '}
          <code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3 }}>{preview.suggestedCode}</code>{' '}
          {reasonText} an existing row:{' '}
          <strong>{preview.existingMatch.routeName}</strong>{' '}
          (<code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3 }}>{preview.existingMatch.routeCode}</code>
          {preview.existingMatch.canonicalRouteCode && preview.existingMatch.canonicalRouteCode !== preview.existingMatch.routeCode
            ? ` → ${preview.existingMatch.canonicalRouteCode}`
            : ''}
          {preview.existingMatch.standardDurationHours != null ? ` · ${preview.existingMatch.standardDurationHours} h` : ''}
          {preview.existingMatch.standardDistanceKm != null ? ` · ${preview.existingMatch.standardDistanceKm} km` : ''}
          ).
        </p>
        <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem' }}>
          Use the existing row, or click <em>Create anyway</em> to bypass — rare; usually the existing row is the right answer.
        </p>
      </div>
    );
  }
  return (
    <div
      style={{
        marginTop: '0.5rem',
        padding: '0.6rem 0.8rem',
        background: 'var(--ds-color-success-surface, #ECFDF3)',
        border: '1px solid var(--ds-color-success-border, #ABEFC6)',
        borderRadius: 8,
        color: 'var(--ds-color-success, #067647)',
        fontSize: '0.88rem',
      }}
    >
      <p style={{ margin: 0 }}>
        <strong>New route.</strong> Will create{' '}
        <code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3 }}>{preview.suggestedCode}</code> —{' '}
        {fromArea.name} → {toArea.name}.
      </p>
    </div>
  );
}

function MultiStopBuilder({
  stops,
  onChange,
  onAdd,
  onRemove,
  areaOptions,
  areas,
}: {
  stops: string[];
  onChange: (idx: number, value: string) => void;
  onAdd: () => void;
  onRemove: (idx: number) => void;
  areaOptions: Array<{ value: string; label: string }>;
  areas: OperationalArea[];
}) {
  const filled = stops.filter(Boolean);
  // Project the would-be legs to give the operator a live preview of the
  // codes that will get created/reused.
  const projectedLegs: Array<{ from: OperationalArea; to: OperationalArea; code: string }> = [];
  for (let i = 0; i < filled.length - 1; i++) {
    const f = areas.find((a) => a.id === filled[i]);
    const t = areas.find((a) => a.id === filled[i + 1]);
    if (f && t && f.code !== t.code) {
      projectedLegs.push({ from: f, to: t, code: `${f.code}_${t.code}` });
    }
  }
  return (
    <div>
      <p style={{ color: 'var(--ds-color-text-subtle, #667085)', fontSize: '0.85rem' }}>
        Pick an ordered sequence of stops. The ERP creates a separate Route Standard for each leg
        (AMM → MAD → NEB → PET becomes <code>AMM_MAD</code>, <code>MAD_NEB</code>, <code>NEB_PET</code>).
        Existing legs are reused; only missing legs are created.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
        {stops.map((stopId, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.85rem', minWidth: '4.5rem' }}>Stop {idx + 1}</span>
            <select
              value={stopId}
              onChange={(e) => onChange(idx, e.target.value)}
              style={{ flex: 1, maxWidth: 360 }}
            >
              <option value="">— pick an area —</option>
              {areaOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {stops.length > 2 ? (
              <button
                type="button"
                className="secondary-button"
                onClick={() => onRemove(idx)}
                style={{ fontSize: '0.78rem' }}
              >
                Remove
              </button>
            ) : null}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="secondary-button"
        onClick={onAdd}
        style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}
      >
        + Add stop
      </button>
      {projectedLegs.length > 0 ? (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.6rem 0.8rem',
            background: '#f0f9ff',
            border: '1px solid #bae6fd',
            borderRadius: 8,
            color: '#0c4a6e',
            fontSize: '0.88rem',
          }}
        >
          <p style={{ margin: 0 }}>
            <strong>Touring Route made from {projectedLegs.length} leg{projectedLegs.length === 1 ? '' : 's'}:</strong>{' '}
            {projectedLegs.map((l, i) => (
              <span key={i}>
                <code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3 }}>{l.code}</code>
                {i < projectedLegs.length - 1 ? ' · ' : ''}
              </span>
            ))}
          </p>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.82rem' }}>
            Each leg is a standalone Route Standard the operator can refine independently (distance, duration, buffer, risk flags).
          </p>
        </div>
      ) : null}
    </div>
  );
}
