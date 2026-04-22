'use client';

import { useEffect, useState } from 'react';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';

type DailyInventoryRow = {
  date: string;
  configuredAllotment: number;
  consumed: number;
  remainingAvailability: number;
  stopSaleActive: boolean;
  insideReleaseWindow: boolean;
  status: 'not_configured' | 'inactive' | 'stop_sale' | 'release_window' | 'sold_out' | 'available';
};

type DailyInventoryResponse = {
  allotmentId: string;
  contractId: string;
  contractName: string;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  };
  dateFrom: string;
  dateTo: string;
  dailySummary: DailyInventoryRow[];
};

type HotelAllotmentInventoryPanelProps = {
  apiBaseUrl: string;
  contractId: string;
  allotmentId: string;
  showTrigger?: boolean;
  initiallyOpen?: boolean;
};

function formatStatusLabel(value: DailyInventoryRow['status']) {
  return value.replace(/_/g, ' ');
}

export function HotelAllotmentInventoryPanel({
  apiBaseUrl,
  contractId,
  allotmentId,
  showTrigger = true,
  initiallyOpen = false,
}: HotelAllotmentInventoryPanelProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<DailyInventoryResponse | null>(null);

  async function loadInventory() {
    if (data || isLoading) {
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/hotel-contracts/${contractId}/allotments/${allotmentId}/daily-summary`, {
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not load daily allotment inventory.'));
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.toLowerCase().includes('application/json')) {
        const bodyPreview = await response.text();
        throw new Error(
          `Could not load daily allotment inventory. Expected JSON but received ${contentType || 'unknown'}: ${bodyPreview.slice(0, 160)}`,
        );
      }

      const payload = (await response.json()) as DailyInventoryResponse;
      setData(payload);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not load daily allotment inventory.');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (isOpen && !data && !isLoading) {
      void loadInventory();
    }
  }, [data, isLoading, isOpen]);

  function handleToggle() {
    setIsOpen((current) => !current);
  }

  return (
    <div className="inline-entity-actions">
      {showTrigger ? (
        <div className="inline-entity-action-bar">
          <button type="button" className="secondary-button" onClick={handleToggle} disabled={isLoading}>
            {isLoading ? 'Loading...' : isOpen ? 'Hide inventory' : 'View inventory'}
          </button>
        </div>
      ) : null}

      {error ? <p className="form-error">{error}</p> : null}

      {isOpen && data ? (
        <div className="detail-card">
          <div className="entity-card-header">
            <div>
              <h2>Daily Inventory</h2>
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
                  <th>Allotment</th>
                  <th>Consumed</th>
                  <th>Remaining</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.dailySummary.map((row) => (
                  <tr
                    key={row.date}
                    title={[
                      row.stopSaleActive ? 'stop sale active' : null,
                      row.insideReleaseWindow ? 'inside release window' : null,
                    ]
                      .filter(Boolean)
                      .join('\n')}
                  >
                    <td>{row.date}</td>
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
