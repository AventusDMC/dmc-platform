'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../components/RowDetailsPanel';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { LeadsForm } from './LeadsForm';

type Lead = {
  id: string;
  inquiry: string;
  source: string | null;
  status: string;
  createdAt: string;
};

type LeadsTableProps = {
  apiBaseUrl: string;
  leads: Lead[];
};

export function LeadsTable({ apiBaseUrl, leads }: LeadsTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(lead: Lead) {
    if (!window.confirm('Delete this lead?')) {
      return;
    }

    setDeletingId(lead.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/leads/${lead.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete lead.'));
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete lead.');
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
              <th>Created</th>
              <th>Inquiry</th>
              <th>Source</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => {
              return (
                <tr key={lead.id}>
                  <td>{new Date(lead.createdAt).toLocaleDateString()}</td>
                  <td>
                    <strong>{lead.inquiry}</strong>
                  </td>
                  <td>{lead.source || 'No source provided'}</td>
                  <td>{lead.status}</td>
                  <td>
                    <RowDetailsPanel summary="Open details" className="operations-row-details" bodyClassName="operations-row-details-body">
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(lead)}
                          disabled={deletingId === lead.id}
                        >
                          {deletingId === lead.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                      <p className="detail-copy">
                        {`Created ${new Date(lead.createdAt).toLocaleDateString()} | Source: ${lead.source || 'No source provided'}`}
                      </p>
                      <InlineRowEditorShell>
                        <LeadsForm
                          apiBaseUrl={apiBaseUrl}
                          leadId={lead.id}
                          submitLabel="Save lead"
                          initialValues={{ inquiry: lead.inquiry, source: lead.source || '', status: lead.status }}
                        />
                      </InlineRowEditorShell>
                    </RowDetailsPanel>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
