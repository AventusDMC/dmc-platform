'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { VehiclesForm } from '../vehicles/VehiclesForm';

type Vehicle = {
  id: string;
  supplierId: string;
  name: string;
  maxPax: number;
  luggageCapacity: number;
};

type VehiclesTableProps = {
  apiBaseUrl: string;
  vehicles: Vehicle[];
};

export function VehiclesTable({ apiBaseUrl, vehicles }: VehiclesTableProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(vehicle: Vehicle) {
    if (!window.confirm(`Delete ${vehicle.name}?`)) {
      return;
    }

    setDeletingId(vehicle.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/vehicles/${vehicle.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete vehicle.'));
      }

      if (editingId === vehicle.id) {
        setEditingId(null);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete vehicle.');
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
              <th>Vehicle</th>
              <th>Supplier</th>
              <th>Max pax</th>
              <th>Luggage</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.map((vehicle) => {
              const isEditing = editingId === vehicle.id;

              return (
                <Fragment key={vehicle.id}>
                  <tr>
                    <td>
                      <strong>{vehicle.name}</strong>
                    </td>
                    <td>{vehicle.supplierId}</td>
                    <td>{vehicle.maxPax}</td>
                    <td>{vehicle.luggageCapacity}</td>
                    <td>
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="compact-button"
                          onClick={() => setEditingId((current) => (current === vehicle.id ? null : vehicle.id))}
                        >
                          {isEditing ? 'Close edit' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(vehicle)}
                          disabled={deletingId === vehicle.id}
                        >
                          {deletingId === vehicle.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isEditing ? (
                    <tr>
                      <td colSpan={5}>
                        <InlineRowEditorShell>
                          <VehiclesForm
                            apiBaseUrl={apiBaseUrl}
                            vehicleId={vehicle.id}
                            submitLabel="Save vehicle"
                            initialValues={{
                              supplierId: vehicle.supplierId,
                              name: vehicle.name,
                              maxPax: String(vehicle.maxPax),
                              luggageCapacity: String(vehicle.luggageCapacity),
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
