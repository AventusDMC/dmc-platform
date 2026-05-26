'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';

// Hotel Contract Correction Workspace v1 — focused repair UI.
//
// All mutations go through narrow, audit-safe endpoints:
//   - PATCH /api/hotel-contract-health/contracts/:id/confidence
//     (Mark Verified / Needs Review)
//   - PATCH /api/hotel-contract-health/supplements/:id
//     (DEACTIVATE / SET_CHARGE_BASIS / SET_AMOUNT / MARK_INTENTIONAL)
//
// Historical quotes + booking snapshots reference frozen rate rows
// and snapshot JSON, so supplement edits / confidence changes here
// never invalidate them.

type Finding = {
  kind: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  supplementIds?: string[];
  seasonIds?: string[];
};

type SupplementRow = {
  id: string;
  type: string;
  roomCategoryId: string | null;
  chargeBasis: string | null;
  amount: number | string | null;
  isMandatory: boolean;
  isActive: boolean;
  notes: string | null;
  roomCategory: { id: string; name: string; code: string | null } | null;
};

type RoomMappingEntry = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  suggestion: {
    sourceName: string;
    suggestedCategories: string[];
    confidence: 'high' | 'medium' | 'low';
    reason: string;
  };
};

type InterpretationRow = {
  rateId: string;
  roomCategoryId: string;
  reads: {
    occupancy: string;
    mealPlan: string;
    season: string;
    seasonRange: string;
    cost: string;
    pricingBasis: string;
  };
  warnings: string[];
};

export type CorrectionWorkspacePayload = {
  summary: {
    contractId: string;
    contractName: string;
    hotelId: string;
    hotelName: string;
    hotelCity: string;
    confidence: string;
    lastVerifiedAt: string | null;
    verifiedBy: string | null;
    verificationNotes: string | null;
    validFrom: string;
    validTo: string;
    currency: string;
    rateCount: number;
    supplementCount: number;
    roomCategoryCount: number;
    healthScore: number;
  };
  sections: {
    roomMappings: RoomMappingEntry[];
    supplements: { findings: Finding[]; rows: SupplementRow[] };
    seasons: {
      findings: Finding[];
      rows: Array<{ id: string; name: string; validFrom: string; validTo: string }>;
    };
    pricingCompleteness: {
      complete: boolean;
      missingCount: number;
      missing: Array<{ roomCategoryId: string; occupancy: string; mealPlan: string }>;
      totalExpected: number;
    };
  };
  interpretation: InterpretationRow[];
  operationalImpact: {
    activeQuoteItemCount: number;
    futureBookingCount: number;
    notes: string[];
  };
  verificationGate: { allowed: boolean; blockers: string[]; warnings: string[] };
  confidenceSuggestion: { recommended: string; reason: string };
};

const CONFIDENCE_LABEL: Record<string, { label: string; color: string }> = {
  IMPORTED_UNVERIFIED: { label: 'Imported / Unverified', color: '#94a3b8' },
  NEEDS_REVIEW: { label: 'Needs Review', color: '#f59e0b' },
  PRICING_INCOMPLETE: { label: 'Pricing Incomplete', color: '#ef4444' },
  SUPPLEMENT_REVIEW_REQUIRED: { label: 'Supplement Review Required', color: '#ef4444' },
  SEASON_CONFLICT: { label: 'Season Conflict', color: '#ef4444' },
  VERIFIED: { label: 'Verified ✓', color: '#10b981' },
};

export function CorrectionWorkspace({
  contractId,
  initialWorkspace,
}: {
  contractId: string;
  initialWorkspace: CorrectionWorkspacePayload;
}) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(
        `/api/hotel-contract-health/contracts/${encodeURIComponent(contractId)}/correction-workspace`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error(`Workspace refresh failed (${response.status})`);
      const payload = (await response.json()) as CorrectionWorkspacePayload;
      setWorkspace(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Workspace refresh failed.');
    }
  }, [contractId]);

  const repairSupplement = useCallback(
    async (supplementId: string, action: string, extras: Record<string, unknown> = {}) => {
      setBusy(true);
      setError(null);
      setSuccess(null);
      try {
        const response = await fetch(
          `/api/hotel-contract-health/supplements/${encodeURIComponent(supplementId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...extras }),
          },
        );
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Repair failed (${response.status})`);
        }
        setSuccess(`Supplement updated (${action.toLowerCase().replace(/_/g, ' ')}).`);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Supplement repair failed.');
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const updateConfidence = useCallback(
    async (status: string, notes?: string) => {
      setBusy(true);
      setError(null);
      setSuccess(null);
      try {
        const response = await fetch(
          `/api/hotel-contract-health/contracts/${encodeURIComponent(contractId)}/confidence`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status,
              notes: notes ?? null,
              verifiedBy: status === 'VERIFIED' ? 'operator' : null,
            }),
          },
        );
        if (!response.ok) throw new Error(`Save failed (${response.status})`);
        setSuccess(`Confidence updated to ${status}.`);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Confidence save failed.');
      } finally {
        setBusy(false);
      }
    },
    [contractId, refresh],
  );

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <TopSummary summary={workspace.summary} />

      {error ? <p className="form-error">{error}</p> : null}
      {success ? (
        <p
          style={{
            background: '#ecfdf3',
            color: '#067647',
            border: '1px solid #abefc6',
            borderRadius: 6,
            padding: '0.5rem 0.7rem',
            fontSize: '0.88rem',
            margin: 0,
          }}
        >
          {success}
        </p>
      ) : null}

      <OperationalImpactCard impact={workspace.operationalImpact} />

      <VerificationGate
        gate={workspace.verificationGate}
        currentStatus={workspace.summary.confidence}
        suggestion={workspace.confidenceSuggestion}
        busy={busy}
        onChange={updateConfidence}
      />

      <RoomMappingSection mappings={workspace.sections.roomMappings} />

      <SupplementSection
        findings={workspace.sections.supplements.findings}
        rows={workspace.sections.supplements.rows}
        busy={busy}
        onRepair={repairSupplement}
      />

      <SeasonSection findings={workspace.sections.seasons.findings} rows={workspace.sections.seasons.rows} />

      <PricingCompletenessSection completeness={workspace.sections.pricingCompleteness} />

      <PricingInterpretationPreview interpretation={workspace.interpretation} />

      <ReuploadDiffPlaceholder contractId={contractId} />
    </div>
  );
}

function TopSummary({ summary }: { summary: CorrectionWorkspacePayload['summary'] }) {
  const conf = CONFIDENCE_LABEL[summary.confidence] || { label: summary.confidence, color: '#94a3b8' };
  const scoreColor = summary.healthScore >= 80 ? '#10b981' : summary.healthScore >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <section className="contract-workspace-card">
      <div className="section-header-inline">
        <div>
          <p className="eyebrow">Contract</p>
          <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>{summary.contractName}</h2>
          <p style={{ margin: 0, color: '#475467', fontSize: '0.85rem' }}>
            {summary.hotelName}
            {summary.hotelCity ? `, ${summary.hotelCity}` : ''} · {summary.currency} ·{' '}
            {new Date(summary.validFrom).toISOString().slice(0, 10)} →{' '}
            {new Date(summary.validTo).toISOString().slice(0, 10)}
          </p>
        </div>
        <Link className="compact-button" href={`/hotels/contracts/${summary.contractId}`}>
          Open contract detail
        </Link>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '0.5rem',
          marginTop: '0.6rem',
        }}
      >
        <Stat label="Confidence" value={conf.label} color={conf.color} />
        <Stat label="Health score" value={`${summary.healthScore}`} color={scoreColor} />
        <Stat label="Rates" value={String(summary.rateCount)} />
        <Stat label="Supplements" value={String(summary.supplementCount)} />
        <Stat label="Room categories" value={String(summary.roomCategoryCount)} />
        <Stat
          label="Last verified"
          value={summary.lastVerifiedAt ? new Date(summary.lastVerifiedAt).toISOString().slice(0, 10) : '—'}
          color="#475467"
        />
      </div>

      {summary.confidence === 'IMPORTED_UNVERIFIED' ? (
        <p
          role="status"
          style={{
            marginTop: '0.75rem',
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            borderRadius: 8,
            padding: '0.6rem 0.8rem',
            fontSize: '0.85rem',
            color: '#8b5e34',
          }}
        >
          ⚠ Imported from PDF — not yet verified by an operator. Resolve findings below, then click
          Mark Verified to promote.
        </p>
      ) : null}
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      style={{
        background: '#fff',
        border: `1px solid ${color || '#e4e7ec'}`,
        borderRadius: 8,
        padding: '0.55rem 0.7rem',
      }}
    >
      <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: color || '#475467' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, marginTop: '0.1rem' }}>{value}</div>
    </div>
  );
}

function OperationalImpactCard({ impact }: { impact: CorrectionWorkspacePayload['operationalImpact'] }) {
  const hot = impact.activeQuoteItemCount > 0 || impact.futureBookingCount > 0;
  return (
    <section
      className="contract-workspace-card"
      style={{ borderColor: hot ? '#f59e0b' : '#e4e7ec', position: 'sticky', top: '0.5rem', zIndex: 5 }}
    >
      <div className="section-header-inline">
        <div>
          <p className="eyebrow" style={{ color: hot ? '#f59e0b' : '#475467' }}>
            Operational impact
          </p>
          <h3 style={{ margin: 0 }}>{hot ? 'Live commercial usage' : 'No active downstream usage'}</h3>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem' }}>
        <Pill label="Active quote items" value={impact.activeQuoteItemCount} hot={impact.activeQuoteItemCount > 0} />
        <Pill label="Future bookings" value={impact.futureBookingCount} hot={impact.futureBookingCount > 0} />
      </div>
      {impact.notes.length > 0 ? (
        <ul style={{ marginTop: '0.4rem', paddingLeft: '1rem', color: '#475467', fontSize: '0.82rem' }}>
          {impact.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Pill({ label, value, hot }: { label: string; value: number; hot?: boolean }) {
  return (
    <span
      style={{
        background: hot ? '#fef3c7' : '#f9fafb',
        border: `1px solid ${hot ? '#fcd34d' : '#e4e7ec'}`,
        color: hot ? '#8b5e34' : '#475467',
        borderRadius: 999,
        padding: '0.2rem 0.6rem',
        fontSize: '0.78rem',
        fontWeight: 600,
      }}
    >
      {label}: <strong style={{ marginLeft: '0.25rem' }}>{value}</strong>
    </span>
  );
}

function VerificationGate({
  gate,
  currentStatus,
  suggestion,
  busy,
  onChange,
}: {
  gate: CorrectionWorkspacePayload['verificationGate'];
  currentStatus: string;
  suggestion: { recommended: string; reason: string };
  busy: boolean;
  onChange: (status: string, notes?: string) => void;
}) {
  return (
    <section className="contract-workspace-card">
      <div className="section-header-inline">
        <div>
          <p className="eyebrow">Verification</p>
          <h3 style={{ margin: 0 }}>Mark Verified / Needs Review</h3>
        </div>
      </div>
      <p style={{ color: '#475467', fontSize: '0.85rem', margin: '0.4rem 0' }}>
        Recommended next status: <strong>{suggestion.recommended}</strong>. {suggestion.reason}
      </p>
      {gate.blockers.length > 0 ? (
        <div style={{ marginBottom: '0.5rem' }}>
          <strong style={{ color: '#7c2d12' }}>Blockers (resolve before Verify):</strong>
          <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1rem' }}>
            {gate.blockers.map((blocker) => (
              <li key={blocker} style={{ color: '#7c2d12', fontSize: '0.85rem' }}>
                {blocker}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {gate.warnings.length > 0 ? (
        <div style={{ marginBottom: '0.5rem' }}>
          <strong style={{ color: '#8b5e34' }}>Warnings:</strong>
          <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1rem' }}>
            {gate.warnings.map((warning) => (
              <li key={warning} style={{ color: '#8b5e34', fontSize: '0.85rem' }}>
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="primary-button"
          disabled={busy || !gate.allowed || currentStatus === 'VERIFIED'}
          title={!gate.allowed ? gate.blockers.join(' ') : undefined}
          onClick={() => onChange('VERIFIED')}
        >
          Mark Verified
        </button>
        <button
          type="button"
          className="compact-button"
          disabled={busy || currentStatus === 'NEEDS_REVIEW'}
          onClick={() => onChange('NEEDS_REVIEW')}
        >
          Move to Needs Review
        </button>
        {currentStatus === 'VERIFIED' ? (
          <button
            type="button"
            className="compact-button"
            disabled={busy}
            onClick={() => onChange('NEEDS_REVIEW', 'Operator manually downgraded VERIFIED.')}
            style={{ borderColor: '#f59e0b', color: '#f59e0b' }}
          >
            ↻ Revert VERIFIED → Needs Review
          </button>
        ) : null}
      </div>
    </section>
  );
}

function RoomMappingSection({ mappings }: { mappings: RoomMappingEntry[] }) {
  if (mappings.length === 0) return null;
  return (
    <section className="contract-workspace-card">
      <div className="section-header-inline">
        <div>
          <p className="eyebrow">Repair</p>
          <h3 style={{ margin: 0 }}>Room Mapping Suggestions</h3>
          <p style={{ color: '#475467', fontSize: '0.82rem', margin: 0 }}>
            Imported room names mapped to standard categories. Operator confirms via the contract
            detail page — this view shows what the ERP guessed.
          </p>
        </div>
        <span>{mappings.length} rooms</span>
      </div>
      <table className="data-table" data-testid="room-mapping-table">
        <thead>
          <tr>
            <th>Imported name</th>
            <th>Code</th>
            <th>Suggested categories</th>
            <th>Confidence</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.name}</strong>
              </td>
              <td>{row.code || '—'}</td>
              <td style={{ fontFamily: 'monospace' }}>{row.suggestion.suggestedCategories.join(' / ') || '—'}</td>
              <td>
                <ConfidenceChip level={row.suggestion.confidence} />
              </td>
              <td style={{ fontSize: '0.78rem', color: '#475467' }}>{row.suggestion.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ConfidenceChip({ level }: { level: 'high' | 'medium' | 'low' }) {
  const meta =
    level === 'high'
      ? { color: '#10b981', label: 'High' }
      : level === 'medium'
        ? { color: '#f59e0b', label: 'Medium' }
        : { color: '#94a3b8', label: 'Low' };
  return (
    <span
      style={{
        background: '#fff',
        border: `1px solid ${meta.color}`,
        color: meta.color,
        padding: '0.1rem 0.55rem',
        borderRadius: 999,
        fontSize: '0.72rem',
        fontWeight: 700,
      }}
    >
      {meta.label}
    </span>
  );
}

function SupplementSection({
  findings,
  rows,
  busy,
  onRepair,
}: {
  findings: Finding[];
  rows: SupplementRow[];
  busy: boolean;
  onRepair: (supplementId: string, action: string, extras?: Record<string, unknown>) => void;
}) {
  const affectedIds = useMemo(() => {
    const set = new Set<string>();
    for (const finding of findings) {
      for (const id of finding.supplementIds || []) set.add(id);
    }
    return set;
  }, [findings]);

  return (
    <section className="contract-workspace-card">
      <div className="section-header-inline">
        <div>
          <p className="eyebrow">Repair</p>
          <h3 style={{ margin: 0 }}>Supplement Conflicts</h3>
        </div>
        <span>{findings.length} finding(s)</span>
      </div>

      {findings.length === 0 ? (
        <p className="empty-state">All clear — no supplement findings.</p>
      ) : (
        <ul style={{ margin: '0.4rem 0', paddingLeft: '1rem' }}>
          {findings.map((finding, idx) => (
            <li
              key={`${finding.kind}-${idx}`}
              style={{ color: finding.severity === 'high' ? '#7c2d12' : '#8b5e34', fontSize: '0.85rem' }}
            >
              <strong>[{finding.severity}]</strong> {finding.message}
            </li>
          ))}
        </ul>
      )}

      {rows.length === 0 ? null : (
        <table className="data-table" data-testid="supplement-table" style={{ marginTop: '0.5rem' }}>
          <thead>
            <tr>
              <th>Type</th>
              <th>Room scope</th>
              <th>Charge basis</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const flagged = affectedIds.has(row.id);
              return (
                <tr key={row.id} style={{ background: flagged ? '#fef3c7' : 'transparent' }}>
                  <td>{row.type}</td>
                  <td>{row.roomCategory ? row.roomCategory.name : 'All rooms'}</td>
                  <td>
                    {row.chargeBasis || (
                      <em style={{ color: '#ef4444' }}>missing</em>
                    )}
                    {row.chargeBasis ? null : (
                      <SupplementBasisFix
                        supplementId={row.id}
                        busy={busy}
                        onRepair={(basis) => onRepair(row.id, 'SET_CHARGE_BASIS', { chargeBasis: basis })}
                      />
                    )}
                  </td>
                  <td>{row.amount === null || row.amount === undefined ? '—' : String(row.amount)}</td>
                  <td>{row.isActive ? 'Active' : 'Inactive'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="compact-button"
                        disabled={busy || !row.isActive}
                        onClick={() => onRepair(row.id, 'DEACTIVATE')}
                      >
                        Deactivate
                      </button>
                      <button
                        type="button"
                        className="compact-button"
                        disabled={busy || !flagged}
                        onClick={() => onRepair(row.id, 'MARK_INTENTIONAL')}
                      >
                        Mark intentional
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function SupplementBasisFix({
  supplementId,
  busy,
  onRepair,
}: {
  supplementId: string;
  busy: boolean;
  onRepair: (basis: string) => void;
}) {
  const [basis, setBasis] = useState('PER_NIGHT');
  return (
    <div style={{ display: 'flex', gap: '0.2rem', marginTop: '0.3rem' }}>
      <select value={basis} onChange={(e) => setBasis(e.target.value)} disabled={busy}>
        <option value="PER_PERSON">PER_PERSON</option>
        <option value="PER_ROOM">PER_ROOM</option>
        <option value="PER_NIGHT">PER_NIGHT</option>
        <option value="PER_STAY">PER_STAY</option>
      </select>
      <button type="button" className="compact-button" disabled={busy} onClick={() => onRepair(basis)}>
        Set
      </button>
    </div>
  );
}

function SeasonSection({
  findings,
  rows,
}: {
  findings: Finding[];
  rows: Array<{ id: string; name: string; validFrom: string; validTo: string }>;
}) {
  return (
    <section className="contract-workspace-card">
      <div className="section-header-inline">
        <div>
          <p className="eyebrow">Repair</p>
          <h3 style={{ margin: 0 }}>Season Conflicts</h3>
          <p style={{ color: '#475467', fontSize: '0.82rem', margin: 0 }}>
            Findings derive from the rate matrix. Split / trim / merge happen on the contract Rates
            tab — this view summarises what needs fixing.
          </p>
        </div>
        <span>{findings.length} finding(s)</span>
      </div>
      {findings.length === 0 ? (
        <p className="empty-state">No season findings.</p>
      ) : (
        <ul style={{ margin: '0.4rem 0', paddingLeft: '1rem' }}>
          {findings.map((finding, idx) => (
            <li key={`${finding.kind}-${idx}`} style={{ color: '#7c2d12', fontSize: '0.85rem' }}>
              <strong>[{finding.severity}]</strong> {finding.message}
            </li>
          ))}
        </ul>
      )}
      {rows.length === 0 ? null : (
        <SeasonTimeline rows={rows} />
      )}
    </section>
  );
}

function SeasonTimeline({
  rows,
}: {
  rows: Array<{ id: string; name: string; validFrom: string; validTo: string }>;
}) {
  // Compute global min/max to scale a visual timeline. Pure geometry —
  // no animation, just a bar per season showing relative coverage.
  const dates = rows.flatMap((row) => [new Date(row.validFrom), new Date(row.validTo)]);
  if (dates.length === 0) return null;
  const min = Math.min(...dates.map((d) => d.getTime()));
  const max = Math.max(...dates.map((d) => d.getTime()));
  const span = Math.max(max - min, 1);
  return (
    <div data-testid="season-timeline" style={{ display: 'grid', gap: '0.3rem', marginTop: '0.5rem' }}>
      {rows.map((row) => {
        const from = new Date(row.validFrom).getTime();
        const to = new Date(row.validTo).getTime();
        const left = ((from - min) / span) * 100;
        const width = Math.max(((to - from) / span) * 100, 0.5);
        return (
          <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ minWidth: 120, fontSize: '0.78rem', fontWeight: 600 }}>{row.name}</span>
            <div
              style={{
                position: 'relative',
                flex: 1,
                background: '#f2f4f7',
                border: '1px solid #e4e7ec',
                borderRadius: 4,
                height: 12,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: `${left}%`,
                  width: `${width}%`,
                  height: '100%',
                  background: '#bae6fd',
                  borderRadius: 4,
                }}
                title={`${new Date(row.validFrom).toISOString().slice(0, 10)} → ${new Date(row.validTo).toISOString().slice(0, 10)}`}
              />
            </div>
            <span style={{ fontSize: '0.72rem', color: '#475467', minWidth: 160, textAlign: 'right' }}>
              {new Date(row.validFrom).toISOString().slice(0, 10)} →{' '}
              {new Date(row.validTo).toISOString().slice(0, 10)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PricingCompletenessSection({
  completeness,
}: {
  completeness: CorrectionWorkspacePayload['sections']['pricingCompleteness'];
}) {
  return (
    <section className="contract-workspace-card">
      <div className="section-header-inline">
        <div>
          <p className="eyebrow">Repair</p>
          <h3 style={{ margin: 0 }}>Pricing Completeness</h3>
        </div>
        <span>
          {completeness.complete
            ? 'Complete'
            : `${completeness.missingCount} of ${completeness.totalExpected} combos missing`}
        </span>
      </div>
      {completeness.complete ? (
        <p className="empty-state">All room × occupancy × meal-plan combinations have at least one rate row.</p>
      ) : (
        <>
          <p style={{ color: '#475467', fontSize: '0.82rem' }}>
            Missing rate rows are listed below. Use the contract Rates tab to clone or add — the
            corrections never overwrite historical quote items.
          </p>
          <table className="data-table" data-testid="pricing-completeness-table">
            <thead>
              <tr>
                <th>Room category</th>
                <th>Occupancy</th>
                <th>Meal plan</th>
              </tr>
            </thead>
            <tbody>
              {completeness.missing.slice(0, 25).map((row, idx) => (
                <tr key={`${row.roomCategoryId}-${row.occupancy}-${row.mealPlan}-${idx}`}>
                  <td style={{ fontFamily: 'monospace' }}>{row.roomCategoryId.slice(0, 8)}…</td>
                  <td>{row.occupancy}</td>
                  <td>{row.mealPlan}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {completeness.missing.length > 25 ? (
            <p className="table-subcopy">+{completeness.missing.length - 25} more</p>
          ) : null}
        </>
      )}
    </section>
  );
}

function PricingInterpretationPreview({ interpretation }: { interpretation: InterpretationRow[] }) {
  if (interpretation.length === 0) return null;
  return (
    <section className="contract-workspace-card">
      <div className="section-header-inline">
        <div>
          <p className="eyebrow">Preview</p>
          <h3 style={{ margin: 0 }}>Pricing Interpretation</h3>
          <p style={{ color: '#475467', fontSize: '0.82rem', margin: 0 }}>
            Read-only view of how the ERP interprets the first {interpretation.length} rate rows.
            No pricing math — just shows what the engine reads from each row.
          </p>
        </div>
      </div>
      <table className="data-table" data-testid="interpretation-table">
        <thead>
          <tr>
            <th>Occupancy</th>
            <th>Meal plan</th>
            <th>Season</th>
            <th>Range</th>
            <th>Cost</th>
            <th>Basis</th>
            <th>Warnings</th>
          </tr>
        </thead>
        <tbody>
          {interpretation.slice(0, 25).map((row) => (
            <tr key={row.rateId}>
              <td>{row.reads.occupancy}</td>
              <td>{row.reads.mealPlan}</td>
              <td>{row.reads.season}</td>
              <td>{row.reads.seasonRange}</td>
              <td className="numeric-cell">{row.reads.cost}</td>
              <td>{row.reads.pricingBasis}</td>
              <td style={{ color: row.warnings.length > 0 ? '#f59e0b' : '#475467', fontSize: '0.78rem' }}>
                {row.warnings.length > 0 ? row.warnings.join(' · ') : 'OK'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ReuploadDiffPlaceholder({ contractId }: { contractId: string }) {
  return (
    <section className="contract-workspace-card">
      <div className="section-header-inline">
        <div>
          <p className="eyebrow">Re-upload</p>
          <h3 style={{ margin: 0 }}>Side-by-side Diff</h3>
          <p style={{ color: '#475467', fontSize: '0.82rem', margin: 0 }}>
            Upload a revised PDF on the Contract Imports page to compare OLD vs NEW — the diff
            endpoint at POST /hotel-contract-health/contracts/{contractId}/diff returns added /
            changed / removed entries + suspicious flags before any overwrite.
          </p>
        </div>
        <Link className="compact-button" href={`/contracts/import?contractId=${contractId}`}>
          Open Import flow
        </Link>
      </div>
    </section>
  );
}
