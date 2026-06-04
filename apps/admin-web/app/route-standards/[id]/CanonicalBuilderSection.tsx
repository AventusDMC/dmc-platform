'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

// Route Standard Edit Page Canonical Builder v1.
//
// Brings the Route Builder's auto-generated FROM_TO canonical code +
// duplicate detection workflow into the existing Route Standard edit
// page. Lives below the "Identity" section so operators see the
// current row's legacy code at the top and the canonical normalization
// flow right next to it.
//
// Safety:
//   - Never overwrites routeCode. The Apply button only PATCHes
//     canonicalRouteCode + reviewStatus.
//   - Duplicate detection excludes the CURRENT row from matches
//     (otherwise editing AMM_PET would report "duplicate of self").
//   - "Apply" button is disabled when a different row owns the
//     suggested canonical code, so operators can't accidentally
//     create two rows competing for the same canonical identifier.

type OperationalAreaType = 'CITY' | 'AIRPORT' | 'ATTRACTION' | 'BORDER';

type OperationalArea = {
  id: string;
  name: string;
  code: string;
  type: OperationalAreaType;
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
};

type Props = {
  standardId: string;
  currentRouteCode: string;
  currentCanonicalRouteCode: string | null;
  currentFromCity: string | null;
  currentToCity: string | null;
  // Edit Page Canonical Builder v1.1 — these power the "Create reverse
  // route" button. The reverse leg gets the current row's distance /
  // duration / buffer as defaults (symmetric transfers are the common
  // case), then operator can refine afterwards.
  currentStandardDistanceKm: number | null;
  currentStandardDurationHours: number | null;
  currentOperationalBufferMinutes: number | null;
  currentNotes: string | null;
};

const PREFERRED_TYPE_ORDER: OperationalAreaType[] = ['CITY', 'ATTRACTION', 'BORDER', 'AIRPORT'];

/** Best-match area for a city — mirrors the backend findAreaByCity helper
 *  so the dropdown preselects the same area the operator would expect. */
function findAreaByCity(areas: OperationalArea[], city: string | null | undefined): OperationalArea | null {
  if (!city) return null;
  const normalized = city.trim().toLowerCase();
  if (!normalized) return null;
  const matches = areas.filter((a) => a.city.toLowerCase() === normalized);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  for (const type of PREFERRED_TYPE_ORDER) {
    const found = matches.find((a) => a.type === type);
    if (found) return found;
  }
  return matches[0];
}

export function CanonicalBuilderSection({
  standardId,
  currentRouteCode,
  currentCanonicalRouteCode,
  currentFromCity,
  currentToCity,
  currentStandardDistanceKm,
  currentStandardDurationHours,
  currentOperationalBufferMinutes,
  currentNotes,
}: Props) {
  const router = useRouter();
  const [areas, setAreas] = useState<OperationalArea[]>([]);
  const [areasLoading, setAreasLoading] = useState(true);
  const [areasError, setAreasError] = useState<string | null>(null);

  const [fromAreaId, setFromAreaId] = useState('');
  const [toAreaId, setToAreaId] = useState('');

  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [reversePreview, setReversePreview] = useState<PreviewResponse | null>(null);
  const [creatingReverse, setCreatingReverse] = useState(false);

  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load areas and seed dropdowns from the current fromCity/toCity.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAreasLoading(true);
      setAreasError(null);
      try {
        const response = await fetch('/api/route-standards/areas', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || `Failed to load areas (${response.status})`);
        if (cancelled) return;
        const loaded = payload as OperationalArea[];
        setAreas(loaded);
        // Auto-preselect from the row's current city fields.
        const fromGuess = findAreaByCity(loaded, currentFromCity);
        const toGuess = findAreaByCity(loaded, currentToCity);
        if (fromGuess) setFromAreaId(fromGuess.id);
        if (toGuess) setToAreaId(toGuess.id);
      } catch (err) {
        if (!cancelled) setAreasError(err instanceof Error ? err.message : 'Failed to load operational areas');
      } finally {
        if (!cancelled) setAreasLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentFromCity, currentToCity]);

  // Live preview when both areas are picked.
  useEffect(() => {
    if (!fromAreaId || !toAreaId || fromAreaId === toAreaId) {
      setPreview(null);
      setReversePreview(null);
      return;
    }
    let cancelled = false;
    setPreviewing(true);
    setError(null);
    (async () => {
      try {
        // Primary direction
        const response = await fetch('/api/route-standards/preview-creation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromAreaId, toAreaId }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || `Preview failed (${response.status})`);
        if (!cancelled) setPreview(payload as PreviewResponse);

        // Reverse direction — used by the reverse-route helper line.
        const reverseResponse = await fetch('/api/route-standards/preview-creation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromAreaId: toAreaId, toAreaId: fromAreaId }),
        });
        const reversePayload = await reverseResponse.json().catch(() => null);
        if (reverseResponse.ok && !cancelled) {
          setReversePreview(reversePayload as PreviewResponse);
        }
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setReversePreview(null);
          setError(err instanceof Error ? err.message : 'Preview failed');
        }
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fromAreaId, toAreaId]);

  const areaOptions = useMemo(() => areas.map((a) => ({ value: a.id, label: `${a.name} (${a.code})` })), [areas]);

  // The existingMatch may be the row being edited itself — that's NOT a
  // duplicate, it's the same identifier the operator already owns. Filter
  // it out before deciding whether to warn or to block.
  const conflictingMatch = preview?.existingMatch && preview.existingMatch.id !== standardId
    ? preview.existingMatch
    : null;

  const suggestionUnchanged =
    preview?.suggestedCode && preview.suggestedCode === currentCanonicalRouteCode;

  // Edit Page Canonical Builder v1.1 — create the reverse leg directly
  // from this page using the current row's distance / duration / buffer
  // as symmetric defaults. Calls the same create-with-generation endpoint
  // the listing-page Route Builder uses, so duplicate detection runs the
  // same way (refuses to create if PET_AMM already exists, which the
  // reverse-route helper guards against by checking first).
  async function createReverseRoute() {
    if (!fromAreaId || !toAreaId || creatingReverse) return;
    setCreatingReverse(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/route-standards/create-with-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Swap from/to: editing AMM_PET → create PET_AMM
          fromAreaId: toAreaId,
          toAreaId: fromAreaId,
          standardDistanceKm: currentStandardDistanceKm,
          standardDurationHours: currentStandardDurationHours,
          operationalBufferMinutes: currentOperationalBufferMinutes,
          notes: currentNotes,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Create reverse failed (${response.status})`);
      if (payload.action === 'use-existing') {
        setSuccess(
          `Reverse route ${reversePreview?.suggestedCode} already exists — nothing to create. Open it from the listing page.`,
        );
      } else {
        const code = payload.primary?.canonicalRouteCode || payload.primary?.routeCode || reversePreview?.suggestedCode;
        setSuccess(
          `Created reverse route ${code} using this row's distance / duration / buffer as defaults. Refine if needed.`,
        );
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create reverse failed');
    } finally {
      setCreatingReverse(false);
    }
  }

  async function applyCanonicalCode() {
    if (!preview || conflictingMatch || applying) return;
    setApplying(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/route-standards/${standardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // ONLY the canonical code + status — never touch routeCode.
          canonicalRouteCode: preview.suggestedCode,
          reviewStatus: 'CANONICALIZED',
          // Also write the routeName when it differs, since the area-
          // generated name is usually cleaner ("Amman City → Petra Visitor
          // Center" vs "JORDAN_AMMAN_CITY_JORDAN_PETRA_VISITOR_CENTER").
          // Operator can still rename via the Identity section.
          routeName: preview.suggestedRouteName,
          fromCity: preview.fromArea.city,
          toCity: preview.toArea.city,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Apply failed (${response.status})`);
      setSuccess(`Applied canonical code ${preview.suggestedCode}. Legacy routeCode ${currentRouteCode} preserved.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  }

  return (
    <section
      style={{
        background: '#f7f9fb',
        border: '1px solid #d8e0eb',
        borderRadius: 10,
        padding: '1rem',
      }}
    >
      <h3 style={{ marginTop: 0 }}>Canonical Builder</h3>
      <p style={{ marginTop: 0, color: '#475467', fontSize: '0.85rem' }}>
        Generate this row's canonical FROM_TO operational code from the operational-area
        dictionary. Legacy <code>routeCode</code> is <strong>never</strong> overwritten —
        only <code>canonicalRouteCode</code> is updated. Bookings / vouchers / dispatch
        rows that captured the legacy code continue to resolve via the dual-key lookup.
      </p>

      {areasLoading ? (
        <p style={{ color: '#667085', fontSize: '0.85rem', margin: 0 }}>Loading operational areas…</p>
      ) : null}
      {areasError ? <p className="form-error" style={{ margin: 0 }}>{areasError}</p> : null}

      {!areasLoading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>From area</span>
            <select value={fromAreaId} onChange={(e) => setFromAreaId(e.target.value)}>
              <option value="">— pick an area —</option>
              {areaOptions
                .filter((o) => o.value !== toAreaId)
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </select>
            {currentFromCity ? (
              <span style={{ fontSize: '0.72rem', color: '#98a2b3' }}>Row currently has fromCity = {currentFromCity}</span>
            ) : null}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>To area</span>
            <select value={toAreaId} onChange={(e) => setToAreaId(e.target.value)}>
              <option value="">— pick an area —</option>
              {areaOptions
                .filter((o) => o.value !== fromAreaId)
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </select>
            {currentToCity ? (
              <span style={{ fontSize: '0.72rem', color: '#98a2b3' }}>Row currently has toCity = {currentToCity}</span>
            ) : null}
          </div>
        </div>
      )}

      {/* Preview banner */}
      {previewing && !preview ? (
        <p style={{ marginTop: '0.5rem', color: '#667085', fontSize: '0.85rem' }}>Checking…</p>
      ) : null}
      {preview ? (
        <PreviewBanner
          preview={preview}
          conflictingMatch={conflictingMatch}
          standardId={standardId}
          suggestionUnchanged={Boolean(suggestionUnchanged)}
          currentCanonicalRouteCode={currentCanonicalRouteCode}
        />
      ) : null}

      {/* Reverse route helper — inline "Create reverse route" button when
          missing, so operators don't have to leave the edit page to add
          the symmetric leg. */}
      {reversePreview ? (
        reversePreview.existingMatch ? (
          <p style={{ marginTop: '0.5rem', color: 'var(--ds-color-success, #067647)', fontSize: '0.85rem' }}>
            ✓ Reverse route{' '}
            <code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3 }}>{reversePreview.suggestedCode}</code>{' '}
            exists ({reversePreview.existingMatch.routeName}).
          </p>
        ) : (
          <div
            style={{
              marginTop: '0.5rem',
              padding: '0.55rem 0.75rem',
              background: '#fff7ed',
              border: '1px solid #fed7aa',
              borderRadius: 8,
              display: 'flex',
              gap: '0.75rem',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <span style={{ color: '#8b5e34', fontSize: '0.88rem', flex: 1, minWidth: 240 }}>
              ⚠ Reverse route{' '}
              <code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3 }}>
                {reversePreview.suggestedCode}
              </code>{' '}
              is missing. Most symmetric transfers need both directions —{' '}
              {currentStandardDistanceKm != null || currentStandardDurationHours != null ? (
                <>this row's distance / duration / buffer will be copied as defaults.</>
              ) : (
                <>create with empty timing now and refine afterwards.</>
              )}
            </span>
            <button
              type="button"
              className="secondary-button"
              onClick={createReverseRoute}
              disabled={creatingReverse}
              style={{ fontSize: '0.85rem', whiteSpace: 'nowrap' }}
              title={`Create ${reversePreview.suggestedCode} now using this row's values as defaults`}
            >
              {creatingReverse ? 'Creating…' : `Create ${reversePreview.suggestedCode}`}
            </button>
          </div>
        )
      ) : null}

      {error ? <p className="form-error" style={{ marginTop: '0.5rem' }}>{error}</p> : null}
      {success ? (
        <p
          style={{
            marginTop: '0.5rem',
            background: '#ecfdf3',
            color: 'var(--ds-color-success, #067647)',
            border: '1px solid #abefc6',
            borderRadius: 6,
            padding: '0.5rem 0.7rem',
            fontSize: '0.88rem',
          }}
        >
          {success}
        </p>
      ) : null}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
        <button
          type="button"
          className="primary-button"
          disabled={
            applying ||
            previewing ||
            !preview ||
            Boolean(conflictingMatch) ||
            suggestionUnchanged ||
            !fromAreaId ||
            !toAreaId
          }
          onClick={applyCanonicalCode}
          title={
            conflictingMatch
              ? 'A different row already owns this canonical code. Resolve via the duplicate-merge tool on the listing page.'
              : suggestionUnchanged
                ? 'Canonical code already matches the suggestion. Nothing to apply.'
                : 'Write canonicalRouteCode to this row. Legacy routeCode untouched.'
          }
        >
          {applying
            ? 'Applying…'
            : preview
              ? `Apply ${preview.suggestedCode} as canonical route code`
              : 'Apply canonical code'}
        </button>
      </div>
    </section>
  );
}

function PreviewBanner({
  preview,
  conflictingMatch,
  standardId,
  suggestionUnchanged,
  currentCanonicalRouteCode,
}: {
  preview: PreviewResponse;
  conflictingMatch: PreviewResponse['existingMatch'] | null;
  standardId: string;
  suggestionUnchanged: boolean;
  currentCanonicalRouteCode: string | null;
}) {
  // Three states:
  //   1. Conflict — DIFFERENT row owns the suggested canonical code →
  //      red warning, Apply blocked. Operator must merge via the
  //      listing-page duplicate tool first.
  //   2. Suggestion already matches the current row's canonical code →
  //      neutral "no change needed".
  //   3. Match is the current row (self) or no match at all → green
  //      "ready to apply".
  if (conflictingMatch) {
    const reasonText = {
      canonical_code: 'matches by canonical route code',
      legacy_code: 'matches by legacy route code',
      city_pair: 'matches by from/to city pair',
    }[conflictingMatch.matchReason || 'canonical_code'];
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
          <strong>Cannot apply — different row owns this canonical code.</strong>{' '}
          <code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3 }}>{preview.suggestedCode}</code>{' '}
          {reasonText} <strong>{conflictingMatch.routeName}</strong>{' '}
          (<code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3 }}>{conflictingMatch.routeCode}</code>).
        </p>
        <p style={{ margin: '0.3rem 0 0', fontSize: '0.82rem' }}>
          Resolve via the <em>Merge duplicate canonical codes</em> tool on the listing page, then come back here.
        </p>
      </div>
    );
  }
  if (suggestionUnchanged) {
    return (
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
        Canonical code{' '}
        <code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3 }}>{currentCanonicalRouteCode}</code>{' '}
        already matches the suggestion. Nothing to apply.
      </div>
    );
  }
  return (
    <div
      style={{
        marginTop: '0.5rem',
        padding: '0.6rem 0.8rem',
        background: '#ecfdf3',
        border: '1px solid #abefc6',
        borderRadius: 8,
        color: 'var(--ds-color-success, #067647)',
        fontSize: '0.88rem',
      }}
    >
      <p style={{ margin: 0 }}>
        <strong>Ready to apply.</strong> Suggested canonical code:{' '}
        <code style={{ background: '#fff', padding: '0 0.3rem', borderRadius: 3, fontWeight: 700 }}>
          {preview.suggestedCode}
        </code>{' '}
        — {preview.suggestedRouteName}.
      </p>
      {preview.existingMatch?.id === standardId ? (
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#475467' }}>
          (This row already owns the canonical code — Apply rewrites it cleanly with the area-generated route name.)
        </p>
      ) : null}
    </div>
  );
}
