'use client';

import { Fragment, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { VehiclesForm } from '../vehicles/VehiclesForm';

type Vehicle = {
  id: string;
  supplierId: string;
  supplierName?: string | null;
  supplierStatus?: 'resolved' | 'unresolved' | null;
  name: string;
  maxPax: number;
  luggageCapacity: number;
};

type Supplier = {
  id: string;
  name: string;
};

type VehiclesTableProps = {
  apiBaseUrl: string;
  vehicles: Vehicle[];
  suppliers: Supplier[];
};

export function VehiclesTable({ apiBaseUrl, vehicles, suppliers }: VehiclesTableProps) {
  const router = useRouter();
  const [localVehicles, setLocalVehicles] = useState(vehicles);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assignmentFeedback, setAssignmentFeedback] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    setLocalVehicles(vehicles);
  }, [vehicles]);

  async function handleAssignSupplier(vehicle: Vehicle, supplierId: string) {
    if (!supplierId) {
      return;
    }

    setAssigningId(vehicle.id);
    setAssignmentFeedback((current) => {
      const next = { ...current };
      delete next[vehicle.id];
      return next;
    });
    try {
      const response = await fetch(`${apiBaseUrl}/vehicles/${vehicle.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...buildAuthHeaders(),
        },
        body: JSON.stringify({ supplierId }),
      });

      if (!response.ok) {
        setAssignmentFeedback((current) => ({ ...current, [vehicle.id]: { type: 'error', message: 'Failed to assign supplier' } }));
        return;
      }

      const supplier = suppliers.find((entry) => entry.id === supplierId);
      setLocalVehicles((current) =>
        current.map((entry) =>
          entry.id === vehicle.id
            ? {
                ...entry,
                supplierId,
                supplierName: supplier?.name || entry.supplierName,
                supplierStatus: null,
              }
            : entry,
        ),
      );
      setAssignmentFeedback((current) => ({ ...current, [vehicle.id]: { type: 'success', message: 'Supplier assigned' } }));
    } catch {
      setAssignmentFeedback((current) => ({ ...current, [vehicle.id]: { type: 'error', message: 'Failed to assign supplier' } }));
    } finally {
      setAssigningId(null);
    }
  }

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
            {localVehicles.map((vehicle) => {
              const isEditing = editingId === vehicle.id;

              return (
                <Fragment key={vehicle.id}>
                  <tr>
                    <td>
                      <strong>{vehicle.name}</strong>
                    </td>
                    <td>
                      {vehicle.supplierName || vehicle.supplierId}
                      {vehicle.supplierStatus === 'unresolved' ? <span className="status-pill warning supplier-warning-badge">Unresolved supplier</span> : null}
                      {vehicle.supplierStatus === 'unresolved' ? (
                        <select
                          defaultValue=""
                          disabled={assigningId === vehicle.id}
                          onChange={(event) => handleAssignSupplier(vehicle, event.target.value)}
                        >
                          <option value="">Assign supplier</option>
                          {suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </option>
                          ))}
                        </select>
                      ) : null}
                      {assignmentFeedback[vehicle.id]?.message ? (
                        <p className={assignmentFeedback[vehicle.id].type === 'error' ? 'form-error' : 'form-helper'}>
                          {assignmentFeedback[vehicle.id].message}
                        </p>
                      ) : null}
                    </td>
                    <td>{vehicle.maxPax}</td>
                    <td>{vehicle.luggageCapacity}</td>
                    <td>
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="compact-button"
                          onClick={() => setEditingId((current) => (current === vehicle.id ? null : vehicle.id))}
                        >
                          {isEditing ? 'Close edit' : vehicle.supplierStatus === 'unresolved' ? 'Assign supplier' : 'Edit'}
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
