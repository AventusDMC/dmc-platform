'use client';

import Link from 'next/link';
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
  clientName: string | null;
  tripRequest: string | null;
  travelStartDate: string | null;
  travelEndDate: string | null;
  pax: number | null;
  assignedAgentName: string | null;
};

type LeadsTableProps = {
  apiBaseUrl: string;
  leads: Lead[];
};

export function LeadsTable({ apiBaseUrl, leads }: LeadsTableProps) {
  const router = useRouter();
  const safeLeads = Array.isArray(leads) ? leads : [];
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
    <div className="entity-list allotment-table-stack leads-crm-table-shell">
      {error ? <p className="form-error">{error}</p> : null}
      <div className="table-wrap">
        <table className="data-table allotment-table leads-crm-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Trip request</th>
              <th>Dates</th>
              <th>Pax</th>
              <th>Status</th>
              <th>Assigned agent</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {safeLeads.map((lead) => {
              const createdLabel = lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : 'Unknown date';
              const status = lead.status || 'new';
              const statusTone = normalizeStatus(status);
              const tripRequest = lead.tripRequest || lead.inquiry || 'Untitled trip request';
              const clientLabel = lead.clientName || lead.source || 'Unassigned client';
              const dateLabel = formatLeadDates(lead.travelStartDate, lead.travelEndDate, createdLabel);
              const paxLabel = lead.pax && lead.pax > 0 ? `${lead.pax} pax` : 'TBD';
              const convertDisabled = ['converted', 'lost', 'closed'].includes(statusTone);

              return (
                <tr key={lead.id}>
                  <td>
                    <div className="leads-crm-primary-cell">
                      <strong>{clientLabel}</strong>
                      <span>{lead.source || `Created ${createdLabel}`}</span>
                    </div>
                  </td>
                  <td>
                    <div className="leads-crm-request-cell">
                      <strong>{tripRequest}</strong>
                      <span>{lead.inquiry && lead.tripRequest ? lead.inquiry : 'Inquiry details pending'}</span>
                    </div>
                  </td>
                  <td>{dateLabel}</td>
                  <td className="leads-crm-number-cell">{paxLabel}</td>
                  <td>
                    <span className={`lead-status-pill lead-status-pill-${statusTone}`}>{formatStatus(status)}</span>
                  </td>
                  <td>{lead.assignedAgentName || 'Unassigned'}</td>
                  <td>
                    <div className="leads-crm-row-actions">
                      {convertDisabled ? (
                        <span className="compact-button leads-crm-action-disabled">{statusTone === 'converted' ? 'Converted' : 'Closed'}</span>
                      ) : (
                        <Link href={`/quotes/new?leadId=${lead.id}`} className="compact-button">
                          Convert to Quote
                        </Link>
                      )}
                      <RowDetailsPanel summary="Details" className="operations-row-details" bodyClassName="operations-row-details-body">
                      <div className="table-action-row">
                        <Link href={`/leads/${lead.id}`} className="secondary-button">
                          Open lead
                        </Link>
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
                        {`Created ${createdLabel} | Source: ${lead.source || 'No source provided'}`}
                      </p>
                      <InlineRowEditorShell>
                        <LeadsForm
                          apiBaseUrl={apiBaseUrl}
                          leadId={lead.id}
                          submitLabel="Save lead"
                          initialValues={{ inquiry: lead.inquiry || '', source: lead.source || '', status }}
                        />
                      </InlineRowEditorShell>
                      </RowDetailsPanel>
                    </div>
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

function normalizeStatus(status: string) {
  return status.trim().toLowerCase().replaceAll(' ', '_').replaceAll('-', '_');
}

function formatStatus(status: string) {
  return status
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ') || 'New';
}

function formatLeadDates(startDate: string | null, endDate: string | null, fallback: string) {
  if (!startDate && !endDate) {
    return fallback;
  }

  const start = startDate ? new Date(startDate).toLocaleDateString() : null;
  const end = endDate ? new Date(endDate).toLocaleDateString() : null;

  if (start && end && start !== end) {
    return `${start} - ${end}`;
  }

  return start || end || fallback;
}
