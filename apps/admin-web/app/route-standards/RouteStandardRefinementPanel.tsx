'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// Cleanup Phase v1 — Route Standards Refinement Dashboard.
//
// Surfaces the operational health of the route_standards table after
// bootstrap: how many rows have suspicious durations (inherited
// excursion day length instead of real transfer time), how many lack
// canonical FROM_TO codes, how many are duplicates pointing to the same
// canonical route, and how many are still in REVIEW_REQUIRED.
//
// Provides three operator actions:
//   1. Preview canonicalization  — no-write FROM_TO + sanity-flag preview
//   2. Apply canonical codes      — writes canonicalRouteCode + reviewStatus
//   3. Per-group Merge Duplicates — soft-merge competing rows into one

type RefinementCounters = {
  suspiciousDuration: number;
  missingDistance: number;
  missingDuration: number;
  missingCanonical: number;
  messyCode: number;
  duplicateCanonicalCodes: number;
  pendingReview: number;
};

type RefinementSummary = RefinementCounters & {
  totalActive: number;
  totalRows: number;
  duplicateGroups: Array<{
    canonicalRouteCode: string;
    members: Array<{
      id: string;
      routeCode: string;
      routeName: string;
      standardDurationHours: number | null;
      standardDistanceKm: number | null;
      isActive: boolean;
      suspiciousDuration: boolean;
    }>;
  }>;
};

type PreviewResponse = {
  totalRows: number;
  duplicateGroups: RefinementSummary['duplicateGroups'];
  counters: RefinementCounters;
};

type ApplyResponse = {
  scanned: number;
  assignedCanonical: number;
  flaggedReview: number;
  markedCanonicalized: number;
  skippedNoCanonical: number;
  duplicateCanonicalCodes: number;
};

const COUNTER_DEFINITIONS: Array<{ key: keyof RefinementCounters; label: string; helper: string }> = [
  {
    key: 'suspiciousDuration',
    label: 'Suspicious durations',
    helper: 'Inherited duration looks like an excursion day length, not real transfer time.',
  },
  {
    key: 'missingDuration',
    label: 'Missing duration',
    helper: 'Standard has no standardDurationHours — dispatch falls back to the global default.',
  },
  {
    key: 'missingDistance',
    label: 'Missing distance',
    helper: 'Standard has no standardDistanceKm — vouchers will omit the km headline.',
  },
  {
    key: 'missingCanonical',
    label: 'No canonical code',
    helper: "fromCity/toCity is incomplete so the FROM_TO short form can't be derived.",
  },
  {
    key: 'messyCode',
    label: 'Messy legacy code',
    helper: 'Bootstrap-style code (JORDAN_…, COPY_OF_…, long underscored). Canonical code rescues these.',
  },
  {
    key: 'duplicateCanonicalCodes',
    label: 'Duplicate canonical codes',
    helper: 'Multiple standards map to the same FROM_TO — pick one canonical row and merge the rest.',
  },
  {
    key: 'pendingReview',
    label: 'Pending review',
    helper: 'reviewStatus = REVIEW_REQUIRED. Operator needs to confirm or fix before VERIFIED.',
  },
];

export function RouteStandardRefinementPanel() {
  const router = useRouter();
  const [summary, setSummary] = useState<RefinementSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [mergingGroup, setMergingGroup] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewBanner, setPreviewBanner] = useState<PreviewResponse | null>(null);
  const [applyBanner, setApplyBanner] = useState<ApplyResponse | null>(null);

  async function refreshSummary() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/route-standards/refinement/summary', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Failed to load (${response.status})`);
      setSummary(payload as RefinementSummary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load refinement summary');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshSummary();
    // Empty deps — first paint only; explicit refresh after apply / merge
    // pulls fresh counters.
  }, []);

  async function runPreview() {
    if (previewing) return;
    setPreviewing(true);
    setError(null);
    try {
      const response = await fetch('/api/route-standards/canonicalize/preview', { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Preview failed (${response.status})`);
      setPreviewBanner(payload as PreviewResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  }

  async function runApply() {
    if (applying) return;
    if (!confirm(
      'Apply canonical FROM_TO codes to every route standard? ' +
      'VERIFIED rows are NOT downgraded. Rows with suspicious durations or ' +
      'missing data get flagged REVIEW_REQUIRED so you can sweep them.',
    )) {
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const response = await fetch('/api/route-standards/canonicalize/apply', { method: 'POST' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Apply failed (${response.status})`);
      setApplyBanner(payload as ApplyResponse);
      await refreshSummary();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setApplying(false);
    }
  }

  async function runMerge(canonicalRouteCode: string, targetId: string, mergedIds: string[]) {
    if (mergingGroup) return;
    if (!confirm(
      `Merge ${mergedIds.length} duplicate${mergedIds.length === 1 ? '' : 's'} into the chosen target for ${canonicalRouteCode}? ` +
      'Duplicates are soft-deactivated (kept queryable) so legacy quote items / vouchers / dispatch references that captured an old code still resolve via the lookup helper.',
    )) {
      return;
    }
    setMergingGroup(canonicalRouteCode);
    setError(null);
    try {
      const response = await fetch('/api/route-standards/merge-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, mergedIds }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `Merge failed (${response.status})`);
      await refreshSummary();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setMergingGroup(null);
    }
  }

  return (
    <section
      style={{
        background: '#fcfaf5',
        border: '1px solid #e2dccc',
        borderRadius: 10,
        padding: '0.85rem 1rem',
        marginBottom: '1rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
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
            Refinement dashboard
          </p>
          <p style={{ margin: '0.2rem 0 0', color: '#475467', fontSize: '0.85rem' }}>
            Operational health of the canonical route catalog. After bootstrap,
            review the counters below and run <strong>Apply canonical codes</strong>{' '}
            to assign short FROM_TO identifiers (AMM_PET, PET_WR, etc.) and flag any
            inherited durations that look like full excursion days instead of real
            drive time. Original <code>routeCode</code> stays intact — legacy quote
            items and vouchers still resolve.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="secondary-button" onClick={runPreview} disabled={previewing || loading}>
            {previewing ? 'Previewing…' : 'Preview canonicalization'}
          </button>
          <button type="button" className="primary-button" onClick={runApply} disabled={applying || loading}>
            {applying ? 'Applying…' : 'Apply canonical codes'}
          </button>
        </div>
      </div>

      {error ? <p className="form-error" style={{ marginTop: '0.5rem' }}>{error}</p> : null}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '0.5rem',
          marginTop: '0.75rem',
        }}
      >
        {COUNTER_DEFINITIONS.map((def) => {
          const value = summary ? summary[def.key] : null;
          const highlight = (value ?? 0) > 0;
          return (
            <div
              key={def.key}
              title={def.helper}
              style={{
                background: highlight ? '#fff' : '#fdfcf8',
                border: highlight ? '1px solid #d6b97a' : '1px solid #e2dccc',
                borderRadius: 8,
                padding: '0.55rem 0.7rem',
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: '#7a5c2e',
                  fontSize: '0.7rem',
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                }}
              >
                {def.label}
              </p>
              <p
                style={{
                  margin: '0.1rem 0 0',
                  fontSize: '1.4rem',
                  fontWeight: 700,
                  color: highlight ? '#8b5e34' : '#475467',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {value ?? (loading ? '…' : 0)}
              </p>
            </div>
          );
        })}
      </div>

      {summary && summary.totalActive > 0 ? (
        <p style={{ margin: '0.5rem 0 0', color: '#667085', fontSize: '0.78rem' }}>
          {summary.totalActive} active row{summary.totalActive === 1 ? '' : 's'} / {summary.totalRows} total.
        </p>
      ) : null}

      {applyBanner ? (
        <div
          style={{
            marginTop: '0.7rem',
            background: '#f5f8f5',
            border: '1px solid #cdd7cd',
            borderRadius: 8,
            padding: '0.55rem 0.75rem',
            color: '#3a5a3a',
            fontSize: '0.85rem',
          }}
        >
          <strong>Canonicalization applied.</strong> Scanned {applyBanner.scanned} rows: assigned{' '}
          {applyBanner.assignedCanonical} canonical code{applyBanner.assignedCanonical === 1 ? '' : 's'},
          marked {applyBanner.markedCanonicalized} CANONICALIZED, flagged {applyBanner.flaggedReview}{' '}
          REVIEW_REQUIRED. {applyBanner.duplicateCanonicalCodes > 0
            ? `${applyBanner.duplicateCanonicalCodes} duplicate canonical code${applyBanner.duplicateCanonicalCodes === 1 ? '' : 's'} still need a merge decision below.`
            : 'No duplicate canonical codes detected.'}
        </div>
      ) : null}

      {previewBanner ? (
        <div
          style={{
            marginTop: '0.7rem',
            background: '#fff',
            border: '1px solid #e2dccc',
            borderRadius: 8,
            padding: '0.55rem 0.75rem',
            color: '#475467',
            fontSize: '0.85rem',
          }}
        >
          <strong>Preview only.</strong> {previewBanner.counters.duplicateCanonicalCodes} duplicate canonical code
          {previewBanner.counters.duplicateCanonicalCodes === 1 ? '' : 's'}, {previewBanner.counters.suspiciousDuration} suspicious duration
          {previewBanner.counters.suspiciousDuration === 1 ? '' : 's'}, {previewBanner.counters.messyCode} messy legacy code
          {previewBanner.counters.messyCode === 1 ? '' : 's'} would be flagged. Run <strong>Apply canonical codes</strong> to commit.
        </div>
      ) : null}

      {summary && summary.duplicateGroups.length > 0 ? (
        <div style={{ marginTop: '0.85rem' }}>
          <p
            style={{
              color: '#7a5c2e',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: '0 0 0.35rem',
            }}
          >
            Duplicate canonical codes — choose a target per group
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {summary.duplicateGroups.map((group) => (
              <DuplicateGroupCard
                key={group.canonicalRouteCode}
                group={group}
                onMerge={runMerge}
                busy={mergingGroup === group.canonicalRouteCode}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function DuplicateGroupCard({
  group,
  onMerge,
  busy,
}: {
  group: RefinementSummary['duplicateGroups'][number];
  onMerge: (canonicalRouteCode: string, targetId: string, mergedIds: string[]) => void;
  busy: boolean;
}) {
  // Default the target to the first ACTIVE row with a non-suspicious
  // duration — that's the most likely "right" answer and saves a click
  // for the common case. Operator can switch via the radio buttons.
  const defaultTarget =
    group.members.find((m) => m.isActive && !m.suspiciousDuration)?.id ??
    group.members.find((m) => m.isActive)?.id ??
    group.members[0]?.id;
  const [targetId, setTargetId] = useState<string>(defaultTarget);
  return (
    <div style={{ background: '#fff', border: '1px solid #e2dccc', borderRadius: 8, padding: '0.55rem 0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <p style={{ margin: 0, fontWeight: 600, fontFamily: 'monospace', color: '#101828' }}>
          {group.canonicalRouteCode}
        </p>
        <button
          type="button"
          className="secondary-button"
          style={{ fontSize: '0.78rem' }}
          disabled={busy || !targetId}
          onClick={() => onMerge(
            group.canonicalRouteCode,
            targetId,
            group.members.map((m) => m.id).filter((id) => id !== targetId),
          )}
        >
          {busy ? 'Merging…' : `Merge ${group.members.length - 1} into target`}
        </button>
      </div>
      <ul style={{ margin: '0.35rem 0 0', paddingLeft: 0, listStyle: 'none' }}>
        {group.members.map((m) => (
          <li key={m.id} style={{ padding: '0.2rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="radio"
              name={`target-${group.canonicalRouteCode}`}
              value={m.id}
              checked={targetId === m.id}
              onChange={() => setTargetId(m.id)}
            />
            <code style={{ fontSize: '0.78rem' }}>{m.routeCode}</code>
            <span style={{ color: '#475467', fontSize: '0.85rem' }}>— {m.routeName}</span>
            {m.standardDurationHours != null ? (
              <span style={{ color: '#667085', fontSize: '0.78rem' }}>· {m.standardDurationHours} h</span>
            ) : null}
            {m.standardDistanceKm != null ? (
              <span style={{ color: '#667085', fontSize: '0.78rem' }}>· {m.standardDistanceKm} km</span>
            ) : null}
            {m.suspiciousDuration ? (
              <span
                style={{
                  background: '#fbf6ea',
                  color: '#8b5e34',
                  padding: '0.05rem 0.4rem',
                  borderRadius: 999,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                }}
              >
                Suspicious
              </span>
            ) : null}
            {!m.isActive ? (
              <span style={{ color: '#98a2b3', fontSize: '0.78rem' }}>(inactive)</span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
