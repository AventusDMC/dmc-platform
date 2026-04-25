'use client';

import { Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { HotelAllotmentInventoryPanel } from './HotelAllotmentInventoryPanel';
import { HotelAllotmentsForm } from './HotelAllotmentsForm';

type HotelRoomCategory = {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

type HotelAllotment = {
  id: string;
  hotelContractId: string;
  roomCategoryId: string;
  dateFrom: string;
  dateTo: string;
  allotment: number;
  releaseDays: number;
  stopSale: boolean;
  notes: string | null;
  isActive: boolean;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  };
  consumption: {
    configuredAllotment: number;
    consumed: number;
    remainingAvailability: number;
    inventoryMode: 'live' | 'configured';
  };
};

type ContractOption = {
  id: string;
  name: string;
  validFrom: string;
  validTo: string;
  hotel: {
    id: string;
    name: string;
    roomCategories: HotelRoomCategory[];
  };
};

type HotelAllotmentsTableProps = {
  apiBaseUrl: string;
  contracts: ContractOption[];
  contract: ContractOption & {
    currency: string;
    hotel: ContractOption['hotel'] & {
      city: string;
    };
    allotments: HotelAllotment[];
  };
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatAllotmentStatus(allotment: HotelAllotment) {
  if (!allotment.isActive) {
    return 'Inactive';
  }

  if (allotment.stopSale) {
    return 'Stop sale';
  }

  return 'Open';
}

export function HotelAllotmentsTable({ apiBaseUrl, contracts, contract }: HotelAllotmentsTableProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [inventoryId, setInventoryId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(allotment: HotelAllotment) {
    if (!window.confirm(`Delete the ${allotment.roomCategory.name} allotment from ${contract.name}?`)) {
      return;
    }

    setDeletingId(allotment.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/contracts/${contract.id}/allotments/${allotment.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete hotel allotment.'));
      }

      if (editingId === allotment.id) {
        setEditingId(null);
      }

      if (inventoryId === allotment.id) {
        setInventoryId(null);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete hotel allotment.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="entity-list allotment-table-stack">
      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table allotment-table">
          <thead>
            <tr>
              <th>Room category</th>
              <th>Date range</th>
              <th>Allotment</th>
              <th>Release</th>
              <th>Stop sale</th>
              <th>Consumed</th>
              <th>Remaining</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {contract.allotments.map((allotment) => {
              const isEditing = editingId === allotment.id;
              const isInventoryOpen = inventoryId === allotment.id;

            return (
                <Fragment key={allotment.id}>
                  <tr key={allotment.id}>
                    <td>
                      <strong>{allotment.roomCategory.name}</strong>
                      {allotment.roomCategory.code ? <div className="table-subcopy">{allotment.roomCategory.code}</div> : null}
                    </td>
                    <td>{`${formatDate(allotment.dateFrom)} - ${formatDate(allotment.dateTo)}`}</td>
                    <td>{allotment.consumption.configuredAllotment}</td>
                    <td>{allotment.releaseDays}d</td>
                    <td>{allotment.stopSale ? 'Yes' : 'No'}</td>
                    <td>{allotment.consumption.consumed}</td>
                    <td>{allotment.consumption.remainingAvailability}</td>
                    <td>{formatAllotmentStatus(allotment)}</td>
                    <td>
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="compact-button"
                          onClick={() => setEditingId((current) => (current === allotment.id ? null : allotment.id))}
                        >
                          {isEditing ? 'Close edit' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="compact-button"
                          onClick={() => setInventoryId((current) => (current === allotment.id ? null : allotment.id))}
                        >
                          {isInventoryOpen ? 'Hide inventory' : 'View inventory'}
                        </button>
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(allotment)}
                          disabled={deletingId === allotment.id}
                        >
                          {deletingId === allotment.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isInventoryOpen ? (
                    <tr key={`${allotment.id}-inventory`}>
                      <td colSpan={9}>
                        <HotelAllotmentInventoryPanel
                          apiBaseUrl={apiBaseUrl}
                          contractId={contract.id}
                          allotmentId={allotment.id}
                          showTrigger={false}
                          initiallyOpen
                        />
                      </td>
                    </tr>
                  ) : null}

                  {isEditing ? (
                    <tr>
                      <td colSpan={9}>
                        <InlineRowEditorShell>
                          <HotelAllotmentsForm
                            apiBaseUrl={apiBaseUrl}
                            contracts={contracts}
                            contractId={contract.id}
                            allotmentId={allotment.id}
                            submitLabel="Save allotment"
                            initialValues={{
                              contractId: contract.id,
                              roomCategoryId: allotment.roomCategoryId,
                              dateFrom: allotment.dateFrom.slice(0, 10),
                              dateTo: allotment.dateTo.slice(0, 10),
                              allotment: String(allotment.allotment),
                              releaseDays: String(allotment.releaseDays),
                              stopSale: allotment.stopSale,
                              notes: allotment.notes || '',
                              isActive: allotment.isActive,
                            }}
                          />
                        </InlineRowEditorShell>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
