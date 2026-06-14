'use client';

import { useEffect, useState } from 'react';
import { buildAuthHeaders } from '../../lib/auth-client';

// PR10A — DISPLAY-ONLY route-vs-package transport preview. Diagnostic only:
// no save, no apply, no selection, no quote-total change. Gated by
// NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTIONS_PREVIEW (default OFF → renders nothing, no fetch).
// Data comes from the read-only PR9 shadow endpoint via the /api proxy (GET only).

function isPreviewEnabled(): boolean {
  const v = String(process.env.NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTIONS_PREVIEW ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

type ExcludedDay = { dayNumber: number; operationalType: string; routeCost: number; reason: string };
type PreviewData = {
  enabled?: boolean;
  currentTransportTotal?: number;
  packageGrossTotal?: number | null;
  supplierDiscountPercent?: number;
  supplierDiscountAmount?: number | null;
  packageNetTotal?: number | null;
  packageCandidateTotal?: number | null;
  difference?: number | null;
  packageEligible?: boolean;
  reason?: string | null;
  countedFullPackageDays?: number;
  manualRequiredDays?: number;
  excludedDays?: ExcludedDay[];
  warnings?: string[];
  notApplied?: boolean;
};

export function PackagePricingPreview({ quoteId }: { quoteId: string }) {
  const enabled = isPreviewEnabled();
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(enabled);

  useEffect(() => {
    if (!enabled) return; // flag OFF → no fetch
    let active = true;
    (async () => {
      try {
        const response = await fetch(`/api/transport-pricing/quotes/${quoteId}/package-pricing-shadow`, {
          headers: buildAuthHeaders(),
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Could not load the package pricing preview.');
        const json = (await response.json()) as PreviewData;
        if (active) setData(json);
      } catch (caughtError) {
        if (active) setError(caughtError instanceof Error ? caughtError.message : 'Could not load the package pricing preview.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [enabled, quoteId]);

  // flag OFF → render nothing at all (after hooks, to respect the rules of hooks).
  if (!enabled) return null;

  const money = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());

  return (
    <details className="package-pricing-preview">
      <summary>Transport package preview (advanced)</summary>
      <p className="form-hint">
        Diagnostic only — route/transfer vs package full-day pricing. <strong>NOT APPLIED — preview only.</strong>{' '}
        Package option selection will be available in a future step.
      </p>

      {loading ? <p>Loading preview…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}

      {data && data.enabled === false ? (
        <p className="form-hint">Preview disabled — enable <code>transport.packagePricingShadowCompare</code> on the API.</p>
      ) : null}

      {data && data.enabled !== false ? (
        <div className="package-pricing-preview-body">
          <ul className="package-pricing-preview-totals">
            <li>Current route/transfer total: <strong>{money(data.currentTransportTotal)}</strong></li>
            <li>Package gross total: <strong>{money(data.packageGrossTotal)}</strong></li>
            <li>Supplier discount: <strong>{data.supplierDiscountPercent ?? 0}%</strong> ({money(data.supplierDiscountAmount)})</li>
            <li>Package net total: <strong>{money(data.packageNetTotal)}</strong></li>
            <li>Difference (net − current): <strong>{money(data.difference)}</strong></li>
          </ul>

          <p>
            Status:{' '}
            <strong>{data.packageEligible ? 'Package eligible' : 'Package ineligible'}</strong>
            {data.reason ? <> — {data.reason}</> : null}
          </p>
          <ul className="package-pricing-preview-meta">
            <li>Counted full package days: {data.countedFullPackageDays ?? 0}</li>
            <li>Manual-required days: {data.manualRequiredDays ?? 0}</li>
            <li>
              Excluded days:{' '}
              {(data.excludedDays ?? []).length === 0
                ? 'none'
                : (data.excludedDays ?? []).map((d) => `Day ${d.dayNumber} (${d.reason})`).join(', ')}
            </li>
          </ul>

          {(data.warnings ?? []).length > 0 ? (
            <ul className="package-pricing-preview-warnings">
              {(data.warnings ?? []).map((w) => (
                <li key={w}>⚠ {w}</li>
              ))}
            </ul>
          ) : null}

          <p className="form-hint">
            Pilot uses the standard Alpha Large Bus 49 rate only — not the VIP 31–33 live rate.
          </p>
          <p className="package-pricing-preview-not-applied"><strong>NOT APPLIED — preview only.</strong></p>
        </div>
      ) : null}
    </details>
  );
}
