'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildAuthHeaders } from '../../lib/auth-client';

// Phase 3B.1 — minimal operator UI to assign an ordered list of Points of
// Interest to a quote itinerary day. It only persists the assignment rows
// (poiId + order, with a fallback title/city snapshotted server-side). The
// proposal does not yet compose a narrative from these (Phase 3B.2).

type PoiTranslation = { locale?: string | null; title?: string | null };
type PoiOption = {
  id: string;
  code?: string | null;
  name: string;
  isActive?: boolean;
  translations?: PoiTranslation[] | null;
  city?: { id: string; name: string; country?: string | null } | null;
};

type DayPoiAssignment = {
  id: string;
  poiId: string | null;
  sourceTouringRouteStopId: string | null;
  fallbackTitle: string | null;
  fallbackCity: string | null;
  sortOrder: number;
  pointOfInterest: {
    id: string;
    name: string;
    displayTitle?: string | null;
    city?: { id: string; name: string; country?: string | null } | null;
  } | null;
};

// Local working row — keyed by the POI id (or a synthetic key for manual rows).
type WorkingRow = {
  poiId: string | null;
  label: string;
  city: string | null;
};

function englishTitle(poi: PoiOption): string {
  const en = (poi.translations || []).find((t) => t?.locale === 'en');
  const title = typeof en?.title === 'string' ? en.title.trim() : '';
  return title || poi.name;
}

function assignmentLabel(assignment: DayPoiAssignment): string {
  return (
    assignment.pointOfInterest?.displayTitle ||
    assignment.pointOfInterest?.name ||
    assignment.fallbackTitle ||
    'Unlabeled stop'
  );
}

function assignmentCity(assignment: DayPoiAssignment): string | null {
  return assignment.pointOfInterest?.city?.name || assignment.fallbackCity || null;
}

export default function QuoteDayPoiAssignments({
  dayId,
  apiBaseUrl,
  readOnly = false,
}: {
  dayId: string;
  apiBaseUrl: string;
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState<WorkingRow[]>([]);
  const [options, setOptions] = useState<PoiOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const [assignmentsRes, optionsRes] = await Promise.all([
          fetch(`${apiBaseUrl}/itinerary/day/${dayId}/pois`, {
            headers: buildAuthHeaders(),
            cache: 'no-store',
          }),
          fetch(`${apiBaseUrl}/points-of-interest?active=true`, {
            headers: buildAuthHeaders(),
            cache: 'no-store',
          }),
        ]);

        if (!assignmentsRes.ok) {
          throw new Error('Could not load the day’s points of interest.');
        }

        const assignmentsJson = await assignmentsRes.json().catch(() => ({ poiAssignments: [] }));
        const optionsJson = optionsRes.ok ? await optionsRes.json().catch(() => []) : [];

        if (cancelled) return;

        const loadedRows: WorkingRow[] = (assignmentsJson.poiAssignments || []).map((assignment: DayPoiAssignment) => ({
          poiId: assignment.poiId,
          label: assignmentLabel(assignment),
          city: assignmentCity(assignment),
        }));

        setRows(loadedRows);
        setOptions(Array.isArray(optionsJson) ? optionsJson : []);
        setDirty(false);
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : 'Could not load points of interest.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, dayId]);

  const assignedIds = useMemo(() => new Set(rows.map((row) => row.poiId).filter(Boolean)), [rows]);
  const availableOptions = useMemo(
    () => options.filter((option) => !assignedIds.has(option.id)),
    [options, assignedIds],
  );

  function addPoi(poiId: string) {
    const option = options.find((candidate) => candidate.id === poiId);
    if (!option) return;
    setRows((current) => [
      ...current,
      { poiId: option.id, label: englishTitle(option), city: option.city?.name || null },
    ]);
    setDirty(true);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, position) => position !== index));
    setDirty(true);
  }

  function moveRow(index: number, direction: -1 | 1) {
    setRows((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/itinerary/day/${dayId}/pois`, {
        method: 'PUT',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          assignments: rows.map((row) => ({ poiId: row.poiId })),
        }),
      });

      if (!response.ok) {
        throw new Error('Could not save points of interest for this day.');
      }

      const json = await response.json().catch(() => ({ poiAssignments: [] }));
      const savedRows: WorkingRow[] = (json.poiAssignments || []).map((assignment: DayPoiAssignment) => ({
        poiId: assignment.poiId,
        label: assignmentLabel(assignment),
        city: assignmentCity(assignment),
      }));
      setRows(savedRows);
      setDirty(false);
      setSavedAt(Date.now());
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save points of interest.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="quote-service-side-section">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Sightseeing</p>
          <h4>Points of interest</h4>
        </div>
      </div>

      {loading ? (
        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ds-color-muted, #475569)' }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {rows.length === 0 ? (
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--ds-color-muted, #475569)' }}>
              No points of interest assigned to this day yet.
            </p>
          ) : (
            <ol style={{ margin: 0, paddingLeft: '1.1rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {rows.map((row, index) => (
                <li key={`${row.poiId ?? 'manual'}-${index}`} style={{ fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <span>
                      {row.label}
                      {row.city ? <em style={{ color: 'var(--ds-color-muted, #475569)' }}> — {row.city}</em> : null}
                    </span>
                    {!readOnly ? (
                      <span style={{ display: 'flex', gap: '0.2rem' }}>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label="Move up"
                          disabled={index === 0}
                          onClick={() => moveRow(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label="Move down"
                          disabled={index === rows.length - 1}
                          onClick={() => moveRow(index, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label="Remove"
                          onClick={() => removeRow(index)}
                        >
                          ✕
                        </button>
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          )}

          {!readOnly ? (
            <>
              <select
                className="app-input"
                aria-label="Add a point of interest"
                value=""
                onChange={(event) => {
                  if (event.target.value) {
                    addPoi(event.target.value);
                    event.target.value = '';
                  }
                }}
                disabled={availableOptions.length === 0}
              >
                <option value="">
                  {availableOptions.length === 0 ? 'All points of interest added' : 'Add a point of interest…'}
                </option>
                {availableOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {englishTitle(option)}
                    {option.city?.name ? ` — ${option.city.name}` : ''}
                  </option>
                ))}
              </select>

              <button type="button" className="secondary-button" onClick={() => void save()} disabled={saving || !dirty}>
                {saving ? 'Saving…' : 'Save points of interest'}
              </button>

              <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--ds-color-muted, #475569)' }}>
                Order is preserved for the proposal narrative. Saving snapshots each stop&rsquo;s name and city.
              </p>
              {savedAt && !dirty ? (
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--ds-color-success, #047857)' }}>Saved.</p>
              ) : null}
            </>
          ) : null}
        </div>
      )}

      {error ? <p className="form-error">{error}</p> : null}
    </section>
  );
}
