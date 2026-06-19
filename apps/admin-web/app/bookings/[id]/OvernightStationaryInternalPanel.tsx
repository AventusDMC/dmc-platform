'use client';

import { useEffect, useState } from 'react';
import { buildAuthHeaders } from '../../lib/auth-client';

// Phase 12F-3B1 — INTERNAL-ONLY overnight/stationary cost breakdown on the
// supplier-confirmation page. It reuses the already-merged 12F-3A recompute-on-
// demand breakdown (`overnightStationaryLiveApply`) via the existing read-only
// package-pricing-shadow endpoint, keyed by the booking's source quoteId.
//
// HARD RULES (12F-3B1):
//  - Internal display only — NEVER sent to the supplier, NEVER in the email body.
//  - Read-only: this is a GET; it applies/mutates nothing (the GET returns a
//    "would-apply" preview; the actual cost fold is a separate flag-gated path).
//  - Gated by the same diagnostic preview flag as 12F-3A
//    (NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTIONS_PREVIEW). OFF → renders nothing, no fetch.
//  - Supplier email subject/body, send action, gated send, and readiness are NOT
//    touched by this component.

function isPreviewEnabled(): boolean {
  const v = String(process.env.NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTIONS_PREVIEW ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

type LiveApplyLine = {
  dayNumber: number;
  kind: 'overnight' | 'stationary' | string;
  outcome: string;
  amount: number;
  currency?: string | null;
  city?: string | null;
  blocker?: string | null;
  supplierId?: string | null;
  vehicleClass?: string | null;
  vehicleName?: string | null;
};

type OvernightStationaryLiveApply = {
  apply?: boolean;
  reason?: string;
  costDelta?: number;
  sellDelta?: number;
  wouldApplyCost?: number;
  blockers?: string[];
  warnings?: string[];
  lines?: LiveApplyLine[];
};

type ShadowData = {
  enabled?: boolean;
  overnightStationaryLiveApply?: OvernightStationaryLiveApply | null;
  overnightStationaryLiveApplyEnabled?: boolean;
};

function money(amount: number | null | undefined): string {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return '—';
  return Number(amount).toFixed(2);
}

function osMoney(amount: number | null | undefined, currency: string | null | undefined): string {
  return `${money(amount)}${currency ? ` ${currency}` : ''}`;
}

export function OvernightStationaryInternalPanel({ quoteId }: { quoteId: string }) {
  const enabled = isPreviewEnabled();
  const [data, setData] = useState<ShadowData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled || !quoteId) return; // flag OFF or no quote → no fetch
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/transport-pricing/quotes/${quoteId}/package-pricing-shadow`, {
          headers: buildAuthHeaders(),
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Could not load the internal overnight/stationary breakdown.');
        const json = (await response.json()) as ShadowData;
        if (active) setData(json);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load the internal overnight/stationary breakdown.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [enabled, quoteId]);

  if (!enabled) return null; // diagnostic preview disabled → render nothing

  const osLiveApply = data?.overnightStationaryLiveApply ?? null;
  const liveApplyEnabled = data?.overnightStationaryLiveApplyEnabled === true;
  const lines = osLiveApply?.lines ?? [];
  const hasBreakdown = Boolean(osLiveApply) && (lines.length > 0 || Number(osLiveApply?.wouldApplyCost ?? 0) > 0 || Number(osLiveApply?.costDelta ?? 0) > 0);
  // 12F-3B1 — with the live-apply flag OFF, the breakdown is a preview only.
  const statusLabel = liveApplyEnabled
    ? osLiveApply?.apply
      ? 'Applied to internal cost'
      : 'No applicable charge'
    : 'Would apply / preview';

  return (
    <section className="detail-card supplier-confirmation-internal-os" aria-label="Internal overnight/stationary breakdown">
      <div className="supplier-confirmation-internal-os-head">
        <p className="eyebrow">Overnight / stationary — internal cost</p>
        {/* The single most important guard: this block is staff-facing only. */}
        <span className="badge badge-internal supplier-confirmation-internal-os-badge">Internal only — not sent to supplier</span>
      </div>

      {loading ? <p className="form-hint">Loading internal breakdown…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {!loading && !error && data?.enabled === false ? (
        <p className="form-hint">
          Internal breakdown unavailable — enable <code>transport.packagePricingShadowCompare</code> on the API.
        </p>
      ) : null}

      {!loading && !error && data?.enabled !== false && !hasBreakdown ? (
        <p className="form-hint">No overnight/stationary adjustment for this booking.</p>
      ) : null}

      {hasBreakdown ? (
        <div className="supplier-confirmation-internal-os-body">
          <p className="supplier-confirmation-internal-os-status">
            Status: <strong>{statusLabel}</strong>
            {liveApplyEnabled ? null : <> (live apply flag is OFF)</>}
          </p>
          <p className="supplier-confirmation-internal-os-note">
            <strong>Internal cost only — not added to client sell total.</strong>
          </p>
          <ul className="supplier-confirmation-internal-os-totals">
            <li>
              Cost delta: <strong>{osMoney(osLiveApply?.costDelta ?? osLiveApply?.wouldApplyCost, lines[0]?.currency ?? null)}</strong>
            </li>
            <li>
              Sell delta: <strong>{osLiveApply?.sellDelta ?? 0}</strong> (cost-only)
            </li>
          </ul>

          {lines.length > 0 ? (
            <ul className="supplier-confirmation-internal-os-lines">
              {lines.map((l) => (
                <li key={`os-internal-${l.kind}-${l.dayNumber}`}>
                  Day {l.dayNumber} ({l.kind}): <strong>{l.outcome}</strong>
                  {l.city ? <> — {l.city}</> : null}
                  {l.supplierId ? <> — supplier {l.supplierId}</> : null}
                  {l.vehicleClass ? <> — {l.vehicleClass}</> : null}
                  {l.vehicleName ? <> ({l.vehicleName})</> : null}
                  {l.outcome === 'separate' ? (
                    <>
                      {' '}
                      — <strong>{osMoney(l.amount, l.currency)}</strong>
                    </>
                  ) : null}
                  {l.blocker ? <> — ⚠ {l.blocker}</> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {(osLiveApply?.blockers ?? []).length > 0 ? (
            <ul className="supplier-confirmation-internal-os-blockers">
              {(osLiveApply?.blockers ?? []).map((b) => (
                <li key={`os-internal-blocker-${b}`}>⛔ {b}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
