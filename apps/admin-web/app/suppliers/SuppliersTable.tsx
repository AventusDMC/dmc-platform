'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { SuppliersForm } from './SuppliersForm';

type Supplier = {
  id: string;
  name: string;
  type: 'hotel' | 'transport' | 'activity' | 'guide' | 'other';
  email: string | null;
  phone: string | null;
  notes: string | null;
};

type SuppliersTableProps = {
  apiBaseUrl: string;
  suppliers: Supplier[];
};

function formatSupplierType(value: Supplier['type']) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function SuppliersTable({ apiBaseUrl, suppliers }: SuppliersTableProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(supplier: Supplier) {
    if (!window.confirm(`Delete ${supplier.name}?`)) {
      return;
    }

    setDeletingId(supplier.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/suppliers/${supplier.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete supplier.'));
      }

      if (editingId === supplier.id) {
        setEditingId(null);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete supplier.');
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
              <th>Supplier</th>
              <th>Type</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((supplier) => {
              const isEditing = editingId === supplier.id;

              return (
                <Fragment key={supplier.id}>
                  <tr>
                    <td>
                      <strong>{supplier.name}</strong>
                    </td>
                    <td>{formatSupplierType(supplier.type)}</td>
                    <td>{supplier.email || 'No email'}</td>
                    <td>{supplier.phone || 'No phone'}</td>
                    <td>{supplier.notes || 'No notes'}</td>
                    <td>
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="compact-button"
                          onClick={() => setEditingId((current) => (current === supplier.id ? null : supplier.id))}
                        >
                          {isEditing ? 'Close edit' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(supplier)}
                          disabled={deletingId === supplier.id}
                        >
                          {deletingId === supplier.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isEditing ? (
                    <tr>
                      <td colSpan={6}>
                        <InlineRowEditorShell>
                          <SuppliersForm
                            apiBaseUrl={apiBaseUrl}
                            supplierId={supplier.id}
                            submitLabel="Save supplier"
                            initialValues={{
                              name: supplier.name,
                              type: supplier.type,
                              email: supplier.email || '',
                              phone: supplier.phone || '',
                              notes: supplier.notes || '',
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
