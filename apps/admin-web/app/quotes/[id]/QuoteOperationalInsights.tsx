'use client';

import { useEffect, useState } from 'react';

// Quote Intelligence — calm, commercial-tone operational overlay.
// Design intent (Quote Experience Refinement spec):
//   * Neutral palette, soft accents — no dispatch-style alarm red unless
//     truly critical
//   * Default collapsed — progressive disclosure
//   * "Operationally Safe / Tight / High Coordination" feasibility framing
//     instead of dispatch-style warning labels
//   * Commercial-first, operations-aware

type WarningCategory = 'supplier' | 'capacity' | 'leakage' | 'saturation' | 'complexity';

type IntelligencePayload = {
  quoteId: string;
  summary: {
    operationalRisk: 'LOW' | 'MEDIUM' | 'HIGH';
    feasibility: 'Operationally Safe' | 'Operationally Tight' | 'High Coordination Required';
    warningCount: number;
    criticalCount: number;
    warnCount: number;
  };
  itemCount: number;
  paxCount: number;
  warnings: Array<{ category: WarningCategory; severity: 'INFO' | 'WARN' | 'CRITICAL'; message: string }>;
  heuristicNote: string;
};

const FEASIBILITY_TONE: Record<string, { bg: string; border: string; text: string; muted: string }> = {
  'Operationally Safe': { bg: '#f5f8f5', border: '#cdd7cd', text: '#3a5a3a', muted: '#6b7a6b' },
  'Operationally Tight': { bg: '#fbf8f1', border: '#e8dcc4', text: '#6b5933', muted: '#8b7a55' },
  'High Coordination Required': { bg: '#faf2f2', border: '#e8c8c8', text: '#7a4242', muted: '#9b6a6a' },
};

const CATEGORY_LABEL: Record<WarningCategory, string> = {
  supplier: 'Supplier',
  capacity: 'Capacity',
  leakage: 'Margin',
  saturation: 'Saturation',
  complexity: 'Complexity',
};

const SEVERITY_DOT: Record<string, string> = {
  INFO: '#94a3b8',
  WARN: '#c7956b',
  CRITICAL: '#a85454',
};

export function QuoteOperationalInsights({ quoteId }: { quoteId: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<IntelligencePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lazy-fetch on first expand so the panel never adds cost to the quote
  // page load when collapsed.
  useEffect(() => {
    if (!open || data || loading) return;
    setLoading(true);
    fetch(`/api/quotes/${quoteId}/operational-intelligence`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: IntelligencePayload) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(e?.message || String(e)))
      .finally(() => setLoading(false));
  }, [open, data, loading, quoteId]);

  const feasibility = data?.summary?.feasibility || 'Operationally Safe';
  const tone = FEASIBILITY_TONE[feasibility];

  return (
    <section
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderRadius: 10,
        padding: '0.75rem 1rem',
        marginBottom: '1rem',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          margin: 0,
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
        }}
        aria-expanded={open}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span style={{ color: tone.muted, fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Quote Readiness
          </span>
          <strong style={{ color: tone.text, fontSize: '0.95rem' }}>
            {data ? data.summary.feasibility : 'Loading insights…'}
          </strong>
          {data && data.summary.warningCount > 0 ? (
            <span style={{ color: tone.muted, fontSize: '0.8rem' }}>
              · {data.summary.warningCount} note{data.summary.warningCount === 1 ? '' : 's'}
            </span>
          ) : null}
        </div>
        <span style={{ color: tone.muted, fontSize: '0.82rem', fontWeight: 600 }}>
          {open ? 'Hide' : 'Show'} ▾
        </span>
      </button>

      {open ? (
        <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {loading ? (
            <p style={{ color: tone.muted, fontSize: '0.85rem', margin: 0 }}>Loading operational insights…</p>
          ) : error ? (
            <p style={{ color: '#7a4242', fontSize: '0.85rem', margin: 0 }}>
              Could not load insights: {error}
            </p>
          ) : data ? (
            <>
              {/* Compact metric strip — commercial first, operations second */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
                <MetricChip label="Risk level" value={data.summary.operationalRisk} tone={tone} />
                <MetricChip label="Pax" value={data.paxCount} tone={tone} />
                <MetricChip label="Line items" value={data.itemCount} tone={tone} />
                <MetricChip label="Notes" value={data.summary.warningCount} tone={tone} />
              </div>

              {/* Warning list — soft typography, no shouting */}
              {data.warnings.length > 0 ? (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                  {data.warnings.map((w, i) => (
                    <li
                      key={i}
                      style={{
                        display: 'flex',
                        gap: '0.55rem',
                        alignItems: 'flex-start',
                        padding: '0.4rem 0.6rem',
                        background: '#ffffff',
                        border: '1px solid #e8e8e8',
                        borderRadius: 6,
                        fontSize: '0.85rem',
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          display: 'inline-block',
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: SEVERITY_DOT[w.severity] || '#94a3b8',
                          marginTop: '0.4rem',
                          flexShrink: 0,
                        }}
                      />
                      <div style={{ flex: 1 }}>
                        <span
                          style={{
                            color: '#475467',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                            marginRight: '0.4rem',
                          }}
                        >
                          {CATEGORY_LABEL[w.category]}
                        </span>
                        <span style={{ color: '#334155' }}>{w.message}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ color: tone.muted, fontSize: '0.85rem', margin: 0 }}>
                  No operational notes for this quote.
                </p>
              )}

              <p style={{ color: tone.muted, fontSize: '0.72rem', margin: '0.2rem 0 0', fontStyle: 'italic' }}>
                {data.heuristicNote}
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function MetricChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: { bg: string; border: string; text: string; muted: string };
}) {
  return (
    <div
      style={{
        background: '#ffffff',
        border: `1px solid ${tone.border}`,
        borderRadius: 8,
        padding: '0.45rem 0.65rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.1rem',
      }}
    >
      <span style={{ color: tone.muted, fontSize: '0.66rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <strong style={{ color: tone.text, fontSize: '1.05rem', fontWeight: 700, lineHeight: 1 }}>{value}</strong>
    </div>
  );
}
