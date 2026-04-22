'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../../lib/auth-client';

type QuoteScenario = {
  id: string;
  paxCount: number;
  totalCost: number;
  totalSell: number;
  pricePerPax: number;
};

type QuotePricingSlab = {
  id: string;
  minPax: number;
  maxPax: number | null;
  price: number;
  actualPax?: number;
  focPax?: number;
  payingPax?: number;
  totalCost?: number;
  totalSell?: number;
  pricePerPayingPax?: number;
  pricePerActualPax?: number | null;
  notes?: string | null;
};

type GenerateGroupPricingSectionProps = {
  apiBaseUrl: string;
  quoteId: string;
  initialScenarios: QuoteScenario[];
  initialSlabs: QuotePricingSlab[];
};

const DEFAULT_PAX_COUNTS = [1, 2, 4, 6, 8, 10, 15, 20, 25, 30, 35, 40, 45];

export function GenerateGroupPricingSection({
  apiBaseUrl,
  quoteId,
  initialScenarios,
  initialSlabs,
}: GenerateGroupPricingSectionProps) {
  const router = useRouter();
  const [paxCounts, setPaxCounts] = useState(DEFAULT_PAX_COUNTS.join(','));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    const parsedPaxCounts = paxCounts
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);

    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/scenarios/generate`, {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          paxCounts: parsedPaxCounts,
        }),
      });

      if (!response.ok) {
        throw new Error('Request failed');
      }

      router.refresh();
    } catch {
      setError('Could not generate group pricing.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="detail-card">
      <h2>Generate group pricing</h2>
      <form className="entity-form compact-form" onSubmit={handleSubmit}>
        <label>
          Pax counts
          <input
            value={paxCounts}
            onChange={(event) => setPaxCounts(event.target.value)}
            placeholder="1,2,4,6,8,10,15,20,25,30,35,40,45"
          />
        </label>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Generating...' : 'Generate group pricing'}
        </button>

        {error ? <p className="form-error">{error}</p> : null}
      </form>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pax range</th>
              <th>Actual</th>
              <th>FOC</th>
              <th>Paying</th>
              <th>Cost</th>
              <th>Total sell</th>
              <th>/ Paying pax</th>
              <th>/ Actual pax</th>
            </tr>
          </thead>
          <tbody>
            {initialSlabs.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  No pricing slabs configured yet.
                </td>
              </tr>
            ) : (
              initialSlabs.map((slab) => (
                <tr key={slab.id}>
                  <td>{slab.maxPax === null ? `${slab.minPax}+` : slab.minPax === slab.maxPax ? `${slab.minPax}` : `${slab.minPax}-${slab.maxPax}`}</td>
                  <td>{slab.actualPax ?? slab.minPax}</td>
                  <td>{slab.focPax ?? 0}</td>
                  <td>{slab.payingPax ?? slab.minPax}</td>
                  <td>${(slab.totalCost ?? 0).toFixed(2)}</td>
                  <td>${(slab.totalSell ?? 0).toFixed(2)}</td>
                  <td>${(slab.pricePerPayingPax ?? slab.price).toFixed(2)}</td>
                  <td>{slab.pricePerActualPax === null || slab.pricePerActualPax === undefined ? '-' : `$${slab.pricePerActualPax.toFixed(2)}`}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Pax count</th>
              <th>Total cost</th>
              <th>Total sell</th>
              <th>Per paying pax</th>
            </tr>
          </thead>
          <tbody>
            {initialScenarios.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty-state">
                  No group pricing generated yet.
                </td>
              </tr>
            ) : (
              initialScenarios.map((scenario) => (
                <tr key={scenario.id}>
                  <td>{scenario.paxCount}</td>
                  <td>${scenario.totalCost.toFixed(2)}</td>
                  <td>${scenario.totalSell.toFixed(2)}</td>
                  <td>${scenario.pricePerPax.toFixed(2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
