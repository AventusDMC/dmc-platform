'use client';

import { useEffect, useState } from 'react';
import { buildAuthHeaders } from '../../lib/auth-client';

// PR10A/PR10B-2 — route-vs-package transport preview inside a display-only panel.
//
// Two independent client flags:
//  - NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTIONS_PREVIEW (preview): OFF → renders nothing, no fetch.
//  - NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTION_SELECTION (selection): adds Select route / Select
//    package / Clear controls + saved-selection display. OFF → display-only (PR10A), no PATCH.
//
// Data (incl. read-only savedSelection/selectionStale) comes from the PR9 pricing-shadow GET.
// Selection save/clear uses the PR10B-1 metadata endpoint via a PATCH-only proxy. NOTHING here
// applies the selection to quote totals or items — selection is metadata only.

function isPreviewEnabled(): boolean {
  const v = String(process.env.NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTIONS_PREVIEW ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

function isSelectionEnabled(): boolean {
  const v = String(process.env.NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTION_SELECTION ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

type ExcludedDay = { dayNumber: number; operationalType: string; routeCost: number; reason: string };
// PR12D — read-only shape of the PR12C-2 overnight/stationary SHADOW diagnostic. Display only:
// its totals live solely inside this object and are NEVER added to any existing preview total.
type OvernightCharge = {
  dayNumber: number;
  overnightCity?: string | null;
  baseCity?: string | null;
  vehicleReturnsToBase?: boolean | null;
  policy?: string | null;
  outcome: string;
  rateSource?: string | null;
  amount: number;
  currency?: string | null;
  reason: string;
  blocker?: string | null;
};
type StationaryCharge = {
  dayNumber: number;
  type: string;
  outcome: string;
  countsTowardMin?: boolean;
  packageDayWeightImpact?: number;
  rateSource?: string | null;
  amount: number;
  currency?: string | null;
  reason: string;
  blocker?: string | null;
};
type OvernightStationaryShadow = {
  notApplied?: boolean;
  baseCityResolution?: {
    supplierBaseCity?: string | null;
    contractOverride?: string | null;
    effectiveBaseCity?: string | null;
  };
  overnightCharges?: OvernightCharge[];
  stationaryCharges?: StationaryCharge[];
  totalOvernightShadow?: number;
  totalStationaryShadow?: number;
  currency?: string | null;
  blockers?: string[];
  warnings?: string[];
};
type SavedSelection = {
  option: string;
  contractId?: string | null;
  isManual?: boolean | null;
  at?: string | null;
  byUserId?: string | null;
};
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
  packageContractId?: string | null;
  reason?: string | null;
  countedFullPackageDays?: number;
  manualRequiredDays?: number;
  excludedDays?: ExcludedDay[];
  warnings?: string[];
  savedSelection?: SavedSelection | null;
  selectionStale?: boolean;
  overnightStationaryShadow?: OvernightStationaryShadow | null;
  notApplied?: boolean;
};

const ROUTE_OPTION = 'ROUTE_TRANSFER';
const PACKAGE_OPTION = 'PACKAGE_MIN_FULL_DAY';

export function PackagePricingPreview({ quoteId }: { quoteId: string }) {
  const enabled = isPreviewEnabled();
  const selectionEnabled = isSelectionEnabled();
  const [data, setData] = useState<PreviewData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(enabled);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

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

  // Save/clear the selection through the PR10B-1 metadata endpoint (PATCH only). Updates local
  // saved-selection state from the response echo — never refetches/recomputes quote totals.
  async function saveSelection(option: string | null) {
    setSaving(true);
    setSaveError('');
    try {
      const response = await fetch(`/api/transport-pricing/quotes/${quoteId}/package-selection`, {
        method: 'PATCH',
        headers: { ...buildAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ option }),
      });
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(detail || 'Could not save the selection.');
      }
      const json = (await response.json()) as {
        selectedTransportPricingOption?: string | null;
        selectedTransportContractId?: string | null;
        transportSelectionIsManual?: boolean | null;
        transportSelectionAt?: string | null;
        transportSelectionByUserId?: string | null;
      };
      setData((prev) =>
        prev
          ? {
              ...prev,
              savedSelection: json.selectedTransportPricingOption
                ? {
                    option: json.selectedTransportPricingOption,
                    contractId: json.selectedTransportContractId ?? null,
                    isManual: json.transportSelectionIsManual ?? null,
                    at: json.transportSelectionAt ?? null,
                    byUserId: json.transportSelectionByUserId ?? null,
                  }
                : null,
              // a fresh successful save is never stale (server resolved the active contract).
              selectionStale: false,
            }
          : prev,
      );
    } catch (caughtError) {
      setSaveError(caughtError instanceof Error ? caughtError.message : 'Could not save the selection.');
    } finally {
      setSaving(false);
    }
  }

  // flag OFF → render nothing at all (after hooks, to respect the rules of hooks).
  if (!enabled) return null;

  const money = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString());

  // Package is selectable only when currently eligible: an active package contract exists, no
  // manual-required days, and eligibility passed. The API re-validates on save regardless.
  const hasContract = Boolean(data?.packageContractId);
  const manualRequiredDays = data?.manualRequiredDays ?? 0;
  const packageSelectable = Boolean(data?.packageEligible) && manualRequiredDays === 0 && hasContract;
  const packageDisabledReason = !hasContract
    ? 'No package contract for this supplier / vehicle class.'
    : manualRequiredDays > 0
      ? `Resolve ${manualRequiredDays} manual-required day(s) first.`
      : !data?.packageEligible
        ? data?.reason || 'Below the package minimum.'
        : '';

  // PR12D — read-only overnight/stationary diagnostic (PR12C-2). Rendered in its own section only
  // when present; its totals are NEVER folded into the existing preview totals above.
  const osShadow = data?.overnightStationaryShadow ?? null;
  const osMoney = (amount: number | null | undefined, currency: string | null | undefined) =>
    `${money(amount)}${currency ? ` ${currency}` : ''}`;

  const saved = data?.savedSelection ?? null;
  const savedLabel = !saved
    ? 'None'
    : saved.option === ROUTE_OPTION
      ? 'Route / transfer'
      : saved.option === PACKAGE_OPTION
        ? 'Package (min full-day)'
        : saved.option;

  return (
    <details className="package-pricing-preview">
      <summary>Transport package preview (advanced)</summary>
      <p className="form-hint">
        Diagnostic only — route/transfer vs package full-day pricing. <strong>NOT APPLIED TO TOTALS.</strong>{' '}
        {selectionEnabled
          ? 'You can record a route-vs-package selection below — it is saved as metadata only and never applied to totals.'
          : 'Package option selection will be available in a future step.'}
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

          {selectionEnabled ? (
            <div className="package-pricing-preview-selection">
              <p className="form-hint">
                Recommended:{' '}
                <strong>
                  {data.difference != null && data.difference < 0 && packageSelectable ? 'Package' : 'Route / transfer'}
                </strong>{' '}
                (label only — nothing is selected or applied automatically).
              </p>

              <div className="package-pricing-preview-actions">
                <button type="button" onClick={() => saveSelection(ROUTE_OPTION)} disabled={saving}>
                  Select route
                </button>
                <button
                  type="button"
                  onClick={() => saveSelection(PACKAGE_OPTION)}
                  disabled={saving || !packageSelectable}
                  title={packageSelectable ? undefined : packageDisabledReason}
                >
                  Select package
                </button>
                <button type="button" onClick={() => saveSelection(null)} disabled={saving}>
                  Clear selection
                </button>
              </div>

              {!packageSelectable ? (
                <p className="form-hint">Package cannot be selected: {packageDisabledReason}</p>
              ) : null}
              {saveError ? <p className="form-error">{saveError}</p> : null}

              <ul className="package-pricing-preview-saved">
                <li>Selected option: <strong>{savedLabel}</strong></li>
                {saved && saved.option === PACKAGE_OPTION ? (
                  <li>Selected contract ID: <strong>{saved.contractId ?? '—'}</strong></li>
                ) : null}
                {saved ? <li>Selected at: <strong>{saved.at ?? '—'}</strong></li> : null}
                {saved ? <li>Selected by: <strong>{saved.byUserId ?? '—'}</strong></li> : null}
              </ul>

              {data.selectionStale ? (
                <p className="form-error">
                  ⚠ Saved selection is stale/invalid — the selected package contract is no longer
                  active/eligible. It is <strong>not applied</strong>. Re-select or clear.
                </p>
              ) : null}

              <p className="package-pricing-preview-not-applied"><strong>NOT APPLIED TO TOTALS.</strong></p>
            </div>
          ) : (
            <p className="package-pricing-preview-not-applied"><strong>NOT APPLIED TO TOTALS.</strong></p>
          )}

          {/* PR12D — overnight/stationary SHADOW diagnostic (PR12C-2). Display only; its totals are
              NEVER added to the preview totals above. Rendered solely when the shadow is present. */}
          {osShadow ? (
            <div className="overnight-stationary-shadow">
              <h4 className="overnight-stationary-shadow-title">Overnight / stationary diagnostic</h4>
              <p className="overnight-stationary-shadow-not-applied">
                <strong>Not applied to quote totals.</strong>
              </p>

              <ul className="overnight-stationary-shadow-base">
                <li>
                  Base city resolution: supplier{' '}
                  <strong>{osShadow.baseCityResolution?.supplierBaseCity ?? '—'}</strong>, contract override{' '}
                  <strong>{osShadow.baseCityResolution?.contractOverride ?? '—'}</strong> → effective{' '}
                  <strong>{osShadow.baseCityResolution?.effectiveBaseCity ?? '—'}</strong>
                </li>
              </ul>

              <div className="overnight-stationary-shadow-overnight">
                <p>Overnight charges:</p>
                {(osShadow.overnightCharges ?? []).length === 0 ? (
                  <p className="form-hint">none</p>
                ) : (
                  <ul>
                    {(osShadow.overnightCharges ?? []).map((c) => (
                      <li key={`os-overnight-${c.dayNumber}`}>
                        Day {c.dayNumber}: <strong>{c.outcome}</strong>
                        {c.overnightCity ? <> — {c.overnightCity}</> : null}
                        {c.outcome === 'separate' ? <> — <strong>{osMoney(c.amount, c.currency)}</strong></> : null}
                        {c.blocker ? <> — ⚠ {c.blocker}</> : <> ({c.reason})</>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="overnight-stationary-shadow-stationary">
                <p>Stationary charges:</p>
                {(osShadow.stationaryCharges ?? []).length === 0 ? (
                  <p className="form-hint">none</p>
                ) : (
                  <ul>
                    {(osShadow.stationaryCharges ?? []).map((c) => (
                      <li key={`os-stationary-${c.dayNumber}`}>
                        Day {c.dayNumber} ({c.type}): <strong>{c.outcome}</strong>
                        {c.outcome === 'separate' ? <> — <strong>{osMoney(c.amount, c.currency)}</strong></> : null}
                        {c.countsTowardMin ? <> — counts toward min</> : null}
                        {c.blocker ? <> — ⚠ {c.blocker}</> : <> ({c.reason})</>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <ul className="overnight-stationary-shadow-totals">
                <li>
                  Total overnight (shadow):{' '}
                  <strong>{osMoney(osShadow.totalOvernightShadow, osShadow.currency)}</strong>
                </li>
                <li>
                  Total stationary (shadow):{' '}
                  <strong>{osMoney(osShadow.totalStationaryShadow, osShadow.currency)}</strong>
                </li>
              </ul>

              {(osShadow.blockers ?? []).length > 0 ? (
                <ul className="overnight-stationary-shadow-blockers">
                  {(osShadow.blockers ?? []).map((b) => (
                    <li key={`os-blocker-${b}`}>⛔ {b}</li>
                  ))}
                </ul>
              ) : null}

              {(osShadow.warnings ?? []).length > 0 ? (
                <ul className="overnight-stationary-shadow-warnings">
                  {(osShadow.warnings ?? []).map((w) => (
                    <li key={`os-warning-${w}`}>⚠ {w}</li>
                  ))}
                </ul>
              ) : null}

              <p className="overnight-stationary-shadow-not-applied">
                <strong>Not applied to quote totals.</strong>
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </details>
  );
}
