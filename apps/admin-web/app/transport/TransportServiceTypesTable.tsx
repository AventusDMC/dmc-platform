'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { TransportServiceTypeForm } from '../vehicle-rates/TransportServiceTypeForm';

type TransportServiceType = {
  id: string;
  name: string;
  code: string;
};

type TransportServiceTypesTableProps = {
  apiBaseUrl: string;
  serviceTypes: TransportServiceType[];
};

export function TransportServiceTypesTable({ apiBaseUrl, serviceTypes }: TransportServiceTypesTableProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(serviceType: TransportServiceType) {
    if (!window.confirm(`Delete ${serviceType.name}?`)) {
      return;
    }

    setDeletingId(serviceType.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/transport-service-types/${serviceType.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete transport service type.'));
      }

      if (editingId === serviceType.id) {
        setEditingId(null);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete transport service type.');
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
              <th>Service type</th>
              <th>Code</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {serviceTypes.map((serviceType) => {
              const isEditing = editingId === serviceType.id;

              return (
                <Fragment key={serviceType.id}>
                  <tr>
                    <td>
                      <strong>{serviceType.name}</strong>
                    </td>
                    <td>{serviceType.code}</td>
                    <td>
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="compact-button"
                          onClick={() => setEditingId((current) => (current === serviceType.id ? null : serviceType.id))}
                        >
                          {isEditing ? 'Close edit' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(serviceType)}
                          disabled={deletingId === serviceType.id}
                        >
                          {deletingId === serviceType.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isEditing ? (
                    <tr>
                      <td colSpan={3}>
                        <InlineRowEditorShell>
                          <TransportServiceTypeForm
                            apiBaseUrl={apiBaseUrl}
                            serviceTypeId={serviceType.id}
                            submitLabel="Save service type"
                            initialValues={{ name: serviceType.name, code: serviceType.code }}
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
