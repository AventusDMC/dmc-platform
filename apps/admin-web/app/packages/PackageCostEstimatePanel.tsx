'use client';

import { useState } from 'react';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { packageComponentTypeLabel } from './package-template-display';
import type { PackageTemplateComponentType } from './types';

type CostEstimateComponent = {
  componentId: string;
  dayNumber: number;
  label: string;
  componentType: PackageTemplateComponentType;
  resolved: boolean;
  unitCost: number;
  currency: string | null;
  perPerson: boolean;
  estimatedCost: number;
  note: string;
};

type CostEstimate = {
  packageTemplateId: string;
  packageName: string;
  pax: number;
  currencies: string[];
  totalsByCurrency: Record<string, number>;
  unresolvedCount: number;
  components: CostEstimateComponent[];
  disclaimer: string;
};

type PackageCostEstimatePanelProps = {
  apiBaseUrl: string;
  packageTemplateId: string;
};

function formatMoney(amount: number, currency: string | null) {
  const value = amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${value}` : value;
}

export function PackageCostEstimatePanel({ apiBaseUrl, packageTemplateId }: PackageCostEstimatePanelProps) {
  const [pax, setPax] = useState('2');
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function runEstimate() {
    setIsLoading(true);
    setError('');

    try {
      const normalizedPax = Math.max(1, Number(pax) || 1);
      const response = await fetch(`${apiBaseUrl}/package-templates/${packageTemplateId}/cost-estimate?pax=${normalizedPax}`, {
        headers: buildAuthHeaders(),
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not estimate package cost.'));
      }

      setEstimate((await response.json()) as CostEstimate);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not estimate package cost.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <article className="detail-card">
      <div className="section-header">
        <span>
          <span className="eyebrow">Indicative pricing</span>
          <h2>Cost estimate</h2>
        </span>
        <span className="table-action-group">
          <label className="compact-field">
            Pax
            <input
              type="number"
              min="1"
              value={pax}
              onChange={(event) => setPax(event.target.value)}
              style={{ width: '4rem' }}
              aria-label="Party size for the estimate"
            />
          </label>
          <button type="button" className="secondary-button" onClick={runEstimate} disabled={isLoading}>
            {isLoading ? 'Estimating...' : 'Estimate cost'}
          </button>
        </span>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {estimate ? (
        <div className="section-stack">
          <div className="table-action-group">
            {estimate.currencies.length > 0 ? (
              estimate.currencies.map((currency) => (
                <span key={currency} className="status-pill status-pill-success">
                  ~{formatMoney(estimate.totalsByCurrency[currency], currency)}
                </span>
              ))
            ) : (
              <span className="status-pill status-pill-muted">No priced components</span>
            )}
            <span className="table-cell-copy">for {estimate.pax} pax</span>
            {estimate.unresolvedCount > 0 ? (
              <span className="status-pill status-pill-warning">{estimate.unresolvedCount} without a rate</span>
            ) : null}
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Component</th>
                  <th>Type</th>
                  <th>Unit cost</th>
                  <th>Basis</th>
                  <th>Estimated</th>
                  <th>Basis note</th>
                </tr>
              </thead>
              <tbody>
                {estimate.components.map((component) => (
                  <tr key={component.componentId} className={!component.resolved ? 'muted-row' : undefined}>
                    <td>{component.dayNumber}</td>
                    <td>
                      <strong>{component.label}</strong>
                    </td>
                    <td>{packageComponentTypeLabel(component.componentType)}</td>
                    <td>{component.resolved ? formatMoney(component.unitCost, component.currency) : '—'}</td>
                    <td>{component.resolved ? (component.perPerson ? 'Per person' : 'Per unit') : '—'}</td>
                    <td>{component.resolved ? formatMoney(component.estimatedCost, component.currency) : '—'}</td>
                    <td className="table-cell-copy">{component.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="table-cell-copy">{estimate.disclaimer}</p>
        </div>
      ) : (
        <p className="detail-copy">
          Set a party size and run an estimate to see an indicative cost roll-up from the cheapest active rate on each linked component. This does not create or
          price a quote.
        </p>
      )}
    </article>
  );
}
