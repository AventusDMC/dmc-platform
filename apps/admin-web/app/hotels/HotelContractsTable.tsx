'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { HotelContractsForm } from '../hotel-contracts/HotelContractsForm';

type HotelOption = {
  id: string;
  name: string;
  city: string;
};

type HotelContract = {
  id: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
  hotel: {
    name: string;
    city: string;
  };
  _count: {
    rates: number;
    allotments: number;
  };
};

type HotelContractsTableProps = {
  apiBaseUrl: string;
  hotels: HotelOption[];
  hotelContracts: HotelContract[];
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatContractStatus(contract: HotelContract) {
  const now = new Date();
  const validFrom = new Date(contract.validFrom);
  const validTo = new Date(contract.validTo);

  if (validTo < now) {
    return 'Expired';
  }

  if (validFrom > now) {
    return 'Upcoming';
  }

  return 'Active';
}

export function HotelContractsTable({ apiBaseUrl, hotels, hotelContracts }: HotelContractsTableProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(contract: HotelContract) {
    if (!window.confirm(`Delete ${contract.name}?`)) {
      return;
    }

    setDeletingId(contract.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/hotel-contracts/${contract.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete hotel contract.'));
      }

      if (editingId === contract.id) {
        setEditingId(null);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete hotel contract.');
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
              <th>Contract</th>
              <th>Hotel</th>
              <th>Validity</th>
              <th>Status</th>
              <th>Rates</th>
              <th>Allotments</th>
              <th>Currency</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {hotelContracts.map((contract) => {
              const isEditing = editingId === contract.id;

              return (
                <Fragment key={contract.id}>
                  <tr>
                    <td>
                      <strong>{contract.name}</strong>
                    </td>
                    <td>
                      <strong>{contract.hotel.name}</strong>
                      <div className="table-subcopy">{contract.hotel.city}</div>
                    </td>
                    <td>{`${formatDate(contract.validFrom)} - ${formatDate(contract.validTo)}`}</td>
                    <td>{formatContractStatus(contract)}</td>
                    <td>{contract._count.rates}</td>
                    <td>{contract._count.allotments}</td>
                    <td>{contract.currency}</td>
                    <td>
                      <div className="table-action-row">
                        <Link className="compact-button" href={`/hotels?tab=contracts&contractId=${contract.id}`}>
                          Open contract
                        </Link>
                        <button
                          type="button"
                          className="compact-button"
                          onClick={() => setEditingId((current) => (current === contract.id ? null : contract.id))}
                        >
                          {isEditing ? 'Close edit' : 'Edit'}
                        </button>
                        <Link className="compact-button" href={`/hotels?tab=allotments&contractId=${contract.id}`}>
                          View allotments
                        </Link>
                        <Link className="compact-button" href={`/hotels?tab=rates&contractId=${contract.id}`}>
                          View rates
                        </Link>
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(contract)}
                          disabled={deletingId === contract.id}
                        >
                          {deletingId === contract.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isEditing ? (
                    <tr>
                      <td colSpan={8}>
                        <InlineRowEditorShell>
                          <HotelContractsForm
                            apiBaseUrl={apiBaseUrl}
                            hotels={hotels}
                            contractId={contract.id}
                            submitLabel="Save contract"
                            initialValues={{
                              hotelId: hotels.find((hotel) => hotel.name === contract.hotel.name)?.id || '',
                              name: contract.name,
                              validFrom: contract.validFrom.slice(0, 10),
                              validTo: contract.validTo.slice(0, 10),
                              currency: contract.currency,
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
