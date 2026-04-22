'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../components/RowDetailsPanel';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { BrandingSettingsForm } from './BrandingSettingsForm';
import { CompaniesForm } from './CompaniesForm';

const BRANDING_PROXY_BASE_PATH = '/api';

type Company = {
  id: string;
  name: string;
  type: string | null;
  website: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  country: string | null;
  city: string | null;
  branding?: {
    displayName: string | null;
    logoUrl: string | null;
  } | null;
  _count: {
    contacts: number;
  };
};

type CompaniesTableProps = {
  apiBaseUrl: string;
  companies: Company[];
};

export function CompaniesTable({ apiBaseUrl, companies }: CompaniesTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(company: Company) {
    if (!window.confirm(`Delete ${company.name}?`)) {
      return;
    }
    setDeletingId(company.id);
    setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/companies/${company.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete company.'));
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete company.');
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
              <th>Company</th>
              <th>Type</th>
              <th>Website</th>
              <th>Location</th>
              <th>Contacts</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => {
              return (
                <tr key={company.id}>
                  <td>
                    <strong>{company.name}</strong>
                    <div className="table-subcopy">{company.branding?.displayName || company.name}</div>
                  </td>
                  <td>{company.type || 'No type provided'}</td>
                  <td>{company.website || 'No website provided'}</td>
                  <td>{[company.city, company.country].filter(Boolean).join(', ') || 'No location provided'}</td>
                  <td>{company._count.contacts}</td>
                  <td>
                    <RowDetailsPanel summary="Open details" className="operations-row-details" bodyClassName="operations-row-details-body">
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(company)}
                          disabled={deletingId === company.id}
                        >
                          {deletingId === company.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                      <p className="detail-copy">
                        {`Location: ${[company.city, company.country].filter(Boolean).join(', ') || 'No location provided'} | Contacts: ${company._count.contacts}`}
                      </p>
                      <p className="detail-copy">{`Website: ${company.website || 'No website provided'}`}</p>
                      <InlineRowEditorShell>
                        <div className="settings-stack">
                          <CompaniesForm
                            apiBaseUrl={apiBaseUrl}
                            companyId={company.id}
                            submitLabel="Save company"
                            initialValues={{
                              name: company.name,
                              type: company.type || '',
                              website: company.website || '',
                              logoUrl: company.logoUrl || '',
                              primaryColor: company.primaryColor || '#0F766E',
                              country: company.country || '',
                              city: company.city || '',
                            }}
                          />
                          <BrandingSettingsForm
                            apiBaseUrl={apiBaseUrl}
                            requestBasePath={BRANDING_PROXY_BASE_PATH}
                            companyId={company.id}
                            companyName={company.name}
                          />
                        </div>
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
