'use client';

import { useCallback, useEffect, useState } from 'react';

// Hotel Contract Stabilization & Trustworthiness v2 — interactive
// dashboard component. Renders the lightweight dashboard sections, the
// correction queue, and (on demand) per-contract validation drill-down
// with the supplement / season findings + pricing interpretation
// preview.
//
// All mutations go through PATCH /hotel-contract-health/contracts/:id/
// confidence — the safe endpoint that never touches rates / supplements
// / seasons / quote references.

type DashboardResponse = {
  totals: {
    contracts: number;
    byConfidence: Record<string, number>;
  };
  sections: {
    missingMealPlans: Array<{ contractId: string; name: string; hotelName: string }>;
    suspiciousPricing: Array<{ contractId: string; name: string; hotelName: string; reason: string }>;
    missingOccupancyMapping: Array<{ contractId: string; name: string; hotelName: string; missing: number }>;
    supplementConflicts: Array<{ contractId: string; name: string; hotelName: string; findingCount: number }>;
    overlappingSeasons: Array<{ contractId: string; name: string; hotelName: string; findingCount: number }>;
    missingChildPolicy: Array<{ contractId: string; name: string; hotelName: string }>;
    importedUnverified: Array<{ contractId: string; name: string; hotelName: string }>;
  };
};

type QueueResponse = {
  queue: Array<{
    contractId: string;
    name: string;
    hotel: { id: string; name: string; city: string | null } | null;
    confidence: string;
    rateCount: number;
    supplementFindings: number;
    inActiveQuote: boolean;
    priorityScore: number;
  }>;
  totalCandidates: number;
};

type Finding = {
  kind: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  supplementIds?: string[];
  seasonIds?: string[];
};

type ValidationResponse = {
  contractId: string;
  name: string;
  confidence: string;
  lastVerifiedAt: string | null;
  verifiedBy: string | null;
  verificationNotes: string | null;
  findings: {
    supplements: Finding[];
    seasons: Finding[];
    pricing: {
      complete: boolean;
      missingCount: number;
      missingPreview: Array<{ roomCategoryId: string; occupancy: string; mealPlan: string }>;
    };
  };
  interpretation: Array<{
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
  }>;
  confidenceSuggestion: { recommended: string; reason: string };
};

const CONFIDENCE_OPTIONS: Array<{ value: string; label: string; color: string }> = [
  { value: 'IMPORTED_UNVERIFIED', label: 'Imported / Unverified', color: '#94a3b8' },
  { value: 'NEEDS_REVIEW', label: 'Needs Review', color: '#f59e0b' },
  { value: 'PRICING_INCOMPLETE', label: 'Pricing Incomplete', color: '#ef4444' },
  { value: 'SUPPLEMENT_REVIEW_REQUIRED', label: 'Supplement Review Required', color: '#ef4444' },
  { value: 'SEASON_CONFLICT', label: 'Season Conflict', color: '#ef4444' },
  { value: 'VERIFIED', label: 'Verified ✓', color: '#10b981' },
];

export function HotelContractHealthDashboard({
  initialDashboard,
  initialQueue,
}: {
  initialDashboard: DashboardResponse | null;
  initialQueue: QueueResponse | null;
}) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [queue, setQueue] = useState(initialQueue);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResponse | null>(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  const loadValidation = useCallback(async (contractId: string) => {
    setValidationLoading(true);
    setValidationError(null);
    try {
      const response = await fetch(
        `/api/hotel-contract-health/contracts/${encodeURIComponent(contractId)}/validation`,
        { cache: 'no-store' },
      );
      if (!response.ok) throw new Error(`Validation lookup failed (${response.status})`);
      const payload = (await response.json()) as ValidationResponse;
      setValidation(payload);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Validation lookup failed.');
      setValidation(null);
    } finally {
      setValidationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedContractId) {
      loadValidation(selectedContractId);
    } else {
      setValidation(null);
    }
  }, [selectedContractId, loadValidation]);

  const refreshAll = useCallback(async () => {
    const [d, q] = await Promise.all([
      fetch('/api/hotel-contract-health/dashboard', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/hotel-contract-health/correction-queue?limit=25', { cache: 'no-store' })
        .then((r) => r.json())
        .catch(() => null),
    ]);
    if (d) setDashboard(d as DashboardResponse);
    if (q) setQueue(q as QueueResponse);
  }, []);

  const updateConfidence = useCallback(
    async (contractId: string, status: string, notes?: string) => {
      setSaveBusy(true);
      try {
        const response = await fetch(
          `/api/hotel-contract-health/contracts/${encodeURIComponent(contractId)}/confidence`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, notes: notes ?? null, verifiedBy: status === 'VERIFIED' ? 'operator' : null }),
          },
        );
        if (!response.ok) throw new Error(`Save failed (${response.status})`);
        await loadValidation(contractId);
        await refreshAll();
      } catch (err) {
        setValidationError(err instanceof Error ? err.message : 'Save failed.');
      } finally {
        setSaveBusy(false);
      }
    },
    [loadValidation, refreshAll],
  );

  if (!dashboard) {
    return (
      <section className="contract-workspace-card" role="alert">
        <p className="form-error">Dashboard unavailable. Reload or check the API.</p>
      </section>
    );
  }

  return (
    <>
      {/* Confidence totals */}
      <section className="contract-workspace-card" style={{ marginBottom: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>Confidence overview</h2>
        <p style={{ color: '#475467', marginTop: 0, fontSize: '0.85rem' }}>
          {dashboard.totals.contracts} contracts. VERIFIED contracts rank higher in Guided Hotel Suggestions
          and show "Operationally trusted" in the quote workspace.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.5rem' }}>
          {CONFIDENCE_OPTIONS.map((opt) => (
            <div
              key={opt.value}
              style={{
                background: '#fff',
                border: `1px solid ${opt.color}`,
                borderRadius: 8,
                padding: '0.7rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.2rem',
              }}
            >
              <span style={{ color: opt.color, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase' }}>
                {opt.label}
              </span>
              <strong style={{ fontSize: '1.6rem' }}>{dashboard.totals.byConfidence[opt.value] || 0}</strong>
            </div>
          ))}
        </div>
      </section>

      {/* Health sections */}
      <section className="contract-section-grid" style={{ marginBottom: '1rem' }}>
        <HealthSection
          title="Imported but unverified"
          tone="warn"
          items={dashboard.sections.importedUnverified.map((c) => ({
            contractId: c.contractId,
            primary: c.name,
            secondary: c.hotelName,
          }))}
          onSelect={setSelectedContractId}
        />
        <HealthSection
          title="Missing meal plans"
          tone="warn"
          items={dashboard.sections.missingMealPlans.map((c) => ({
            contractId: c.contractId,
            primary: c.name,
            secondary: c.hotelName,
          }))}
          onSelect={setSelectedContractId}
        />
        <HealthSection
          title="Suspicious pricing"
          tone="danger"
          items={dashboard.sections.suspiciousPricing.map((c) => ({
            contractId: c.contractId,
            primary: c.name,
            secondary: `${c.hotelName} · ${c.reason}`,
          }))}
          onSelect={setSelectedContractId}
        />
        <HealthSection
          title="Missing occupancy mapping"
          tone="danger"
          items={dashboard.sections.missingOccupancyMapping.map((c) => ({
            contractId: c.contractId,
            primary: c.name,
            secondary: `${c.hotelName} · ${c.missing} rate row(s) unmapped`,
          }))}
          onSelect={setSelectedContractId}
        />
        <HealthSection
          title="Supplement conflicts"
          tone="warn"
          items={dashboard.sections.supplementConflicts.map((c) => ({
            contractId: c.contractId,
            primary: c.name,
            secondary: `${c.hotelName} · ${c.findingCount} finding(s)`,
          }))}
          onSelect={setSelectedContractId}
        />
        <HealthSection
          title="Overlapping seasons"
          tone="warn"
          items={dashboard.sections.overlappingSeasons.map((c) => ({
            contractId: c.contractId,
            primary: c.name,
            secondary: `${c.hotelName} · ${c.findingCount} finding(s)`,
          }))}
          onSelect={setSelectedContractId}
        />
        <HealthSection
          title="Missing child policy"
          tone="neutral"
          items={dashboard.sections.missingChildPolicy.map((c) => ({
            contractId: c.contractId,
            primary: c.name,
            secondary: c.hotelName,
          }))}
          onSelect={setSelectedContractId}
        />
      </section>

      {/* Correction Queue */}
      {queue ? (
        <section className="contract-workspace-card" style={{ marginBottom: '1rem' }}>
          <div className="section-header-inline">
            <div>
              <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Correction queue</h2>
              <p style={{ color: '#475467', margin: 0, fontSize: '0.85rem' }}>
                Top {queue.queue.length} of {queue.totalCandidates} candidates. Contracts whose hotels appear in
                active quotes are prioritized so operators fix high-impact contracts first.
              </p>
            </div>
            <button type="button" className="compact-button" onClick={refreshAll}>
              Refresh
            </button>
          </div>
          {queue.queue.length === 0 ? (
            <p className="empty-state">
              All contracts are VERIFIED or only have low-impact findings. Nothing in the queue.
            </p>
          ) : (
            <table className="data-table" style={{ marginTop: '0.5rem' }}>
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Contract</th>
                  <th>Hotel</th>
                  <th>Confidence</th>
                  <th>Findings</th>
                  <th>Active quote?</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {queue.queue.map((row) => (
                  <tr key={row.contractId}>
                    <td style={{ fontFamily: 'monospace' }}>{row.priorityScore}</td>
                    <td>
                      <strong>{row.name}</strong>
                    </td>
                    <td>
                      {row.hotel?.name || '—'}
                      {row.hotel?.city ? <small style={{ marginLeft: '0.4rem', color: '#667085' }}>{row.hotel.city}</small> : null}
                    </td>
                    <td>
                      <ConfidenceBadge status={row.confidence} />
                    </td>
                    <td>
                      {row.supplementFindings > 0
                        ? `${row.supplementFindings} supplement finding(s)`
                        : `${row.rateCount} rates`}
                    </td>
                    <td>{row.inActiveQuote ? 'Yes' : 'No'}</td>
                    <td>
                      <button
                        type="button"
                        className="compact-button"
                        onClick={() => setSelectedContractId(row.contractId)}
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ) : null}

      {/* Per-contract drill-down */}
      {selectedContractId ? (
        <section className="contract-workspace-card">
          <div className="section-header-inline">
            <div>
              <h2 style={{ marginTop: 0, marginBottom: '0.25rem' }}>Validation detail</h2>
              {validation ? <p style={{ margin: 0, color: '#475467', fontSize: '0.85rem' }}>{validation.name}</p> : null}
            </div>
            <button type="button" className="compact-button" onClick={() => setSelectedContractId(null)}>
              Close
            </button>
          </div>

          {validationLoading ? <p className="empty-state">Loading validation…</p> : null}
          {validationError ? <p className="form-error">{validationError}</p> : null}

          {validation && !validationLoading ? (
            <>
              {/* Confidence controls */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', alignItems: 'center', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Confidence:</span>
                <ConfidenceBadge status={validation.confidence} />
                <span style={{ marginLeft: '0.6rem', color: '#475467', fontSize: '0.78rem' }}>
                  Recommended: {validation.confidenceSuggestion.recommended} ({validation.confidenceSuggestion.reason})
                </span>
                <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                  {CONFIDENCE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className="compact-button"
                      style={{ borderColor: opt.color, color: opt.color }}
                      disabled={saveBusy || validation.confidence === opt.value}
                      onClick={() => updateConfidence(validation.contractId, opt.value)}
                    >
                      → {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Findings */}
              <FindingList title="Supplement findings" findings={validation.findings.supplements} />
              <FindingList title="Season findings" findings={validation.findings.seasons} />

              {/* Pricing completeness */}
              <div style={{ marginBottom: '1rem' }}>
                <strong>Pricing completeness:</strong>{' '}
                {validation.findings.pricing.complete ? (
                  <span style={{ color: '#10b981' }}>Complete</span>
                ) : (
                  <span style={{ color: '#ef4444' }}>
                    {validation.findings.pricing.missingCount} missing (room × occupancy × meal-plan) combo(s)
                  </span>
                )}
              </div>

              {/* Pricing interpretation preview */}
              {validation.interpretation.length > 0 ? (
                <div>
                  <h3 style={{ marginBottom: '0.4rem' }}>Pricing interpretation preview</h3>
                  <p style={{ color: '#475467', fontSize: '0.78rem', marginTop: 0 }}>
                    Read-only view of how the ERP interprets the first {validation.interpretation.length} rate rows.
                    Useful before saving corrections.
                  </p>
                  <table className="data-table">
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
                      {validation.interpretation.map((row) => (
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
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function HealthSection({
  title,
  tone,
  items,
  onSelect,
}: {
  title: string;
  tone: 'warn' | 'danger' | 'neutral';
  items: Array<{ contractId: string; primary: string; secondary: string }>;
  onSelect: (contractId: string) => void;
}) {
  const toneColor = tone === 'danger' ? '#ef4444' : tone === 'warn' ? '#f59e0b' : '#94a3b8';
  return (
    <article className="contract-workspace-card">
      <div className="section-header-inline">
        <div>
          <p className="eyebrow" style={{ color: toneColor }}>
            {tone === 'danger' ? 'Critical' : tone === 'warn' ? 'Review' : 'Tidy-up'}
          </p>
          <h3 style={{ margin: 0 }}>{title}</h3>
        </div>
        <span>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="empty-state">All clear.</p>
      ) : (
        <ul className="contract-list-stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {items.slice(0, 5).map((item) => (
            <li key={item.contractId} className="contract-list-row">
              <button
                type="button"
                onClick={() => onSelect(item.contractId)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: 0,
                  textAlign: 'left',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <strong>{item.primary}</strong>
                <div style={{ fontSize: '0.78rem', color: '#475467' }}>{item.secondary}</div>
              </button>
            </li>
          ))}
          {items.length > 5 ? (
            <li className="contract-list-row">
              <em style={{ color: '#667085' }}>+{items.length - 5} more</em>
            </li>
          ) : null}
        </ul>
      )}
    </article>
  );
}

function ConfidenceBadge({ status }: { status: string }) {
  const meta = CONFIDENCE_OPTIONS.find((o) => o.value === status) || { color: '#94a3b8', label: status };
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
        textTransform: 'uppercase',
      }}
    >
      {meta.label}
    </span>
  );
}

function FindingList({ title, findings }: { title: string; findings: Finding[] }) {
  if (findings.length === 0) return null;
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <strong>{title}</strong>
      <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1rem' }}>
        {findings.map((finding, idx) => (
          <li key={`${finding.kind}-${idx}`} style={{ color: finding.severity === 'high' ? '#7c2d12' : '#475467', fontSize: '0.82rem' }}>
            <strong>[{finding.severity}]</strong> {finding.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
