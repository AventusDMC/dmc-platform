'use client';

import { useState } from 'react';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';

type ContractDailyInventoryRow = {
  date: string;
  roomCategoryId: string;
  roomCategoryName: string;
  configuredAllotment: number;
  consumed: number;
  remainingAvailability: number;
  stopSaleActive: boolean;
  insideReleaseWindow: boolean;
  status: 'not_configured' | 'inactive' | 'stop_sale' | 'release_window' | 'sold_out' | 'available';
};

type ContractDailyInventoryResponse = {
  contractId: string;
  contractName: string;
  dateFrom: string;
  dateTo: string;
  roomCategoryId: string | null;
  dailySummary: ContractDailyInventoryRow[];
};

type HotelContractInventoryPanelProps = {
  apiBaseUrl: string;
  contractId: string;
};

function formatStatusLabel(value: ContractDailyInventoryRow['status']) {
  return value.replace(/_/g, ' ');
}

export function HotelContractInventoryPanel({ apiBaseUrl, contractId }: HotelContractInventoryPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ContractDailyInventoryResponse | null>(null);

  async function handleToggle() {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);

    if (!nextOpen || data || isLoading) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/contracts/${contractId}/allotments/daily-summary`, {
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not load contract allotment inventory.'));
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        const bodyPreview = await response.text();
        throw new Error(
          `Could not load contract allotment inventory. Expected JSON but received ${contentType || 'unknown'}: ${bodyPreview.slice(0, 160)}`,
        );
      }

      const payload = (await response.json()) as ContractDailyInventoryResponse;
      setData(payload);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not load contract allotment inventory.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="inline-entity-actions">
      <div className="inline-entity-action-bar">
        <button type="button" className="secondary-button" onClick={handleToggle} disabled={isLoading}>
          {isLoading ? 'Loading...' : isOpen ? 'Hide contract inventory' : 'View contract inventory'}
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}

      {isOpen && data ? (
        <div className="detail-card">
          <div className="entity-card-header">
            <div>
              <h2>Contract Inventory</h2>
              <p>
                {data.dateFrom} - {data.dateTo}
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Room category</th>
                  <th>Allotment</th>
                  <th>Consumed</th>
                  <th>Remaining</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.dailySummary.map((row) => (
                  <tr
                    key={`${row.date}-${row.roomCategoryId}`}
                    title={[
                      row.stopSaleActive ? 'stop sale active' : null,
                      row.insideReleaseWindow ? 'inside release window' : null,
                    ]
                      .filter(Boolean)
                      .join('\n')}
                  >
                    <td>{row.date}</td>
                    <td>{row.roomCategoryName}</td>
                    <td>{row.configuredAllotment}</td>
                    <td>{row.consumed}</td>
                    <td>{row.remainingAvailability}</td>
                    <td>{formatStatusLabel(row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
