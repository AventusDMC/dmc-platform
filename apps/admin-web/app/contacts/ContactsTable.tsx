'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../components/RowDetailsPanel';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { ContactsForm } from './ContactsForm';

type Company = {
  id: string;
  name: string;
};

type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: Company;
};

type ContactsTableProps = {
  apiBaseUrl: string;
  contacts: Contact[];
  companies: Company[];
};

export function ContactsTable({ apiBaseUrl, contacts, companies }: ContactsTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(contact: Contact) {
    if (!window.confirm(`Delete ${contact.firstName} ${contact.lastName}?`)) {
      return;
    }
    setDeletingId(contact.id);
    setError('');
    try {
      const response = await fetch(`${apiBaseUrl}/contacts/${contact.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete contact.'));
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete contact.');
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
              <th>Contact</th>
              <th>Company</th>
              <th>Title</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((contact) => {
              return (
                <tr key={contact.id}>
                  <td>
                    <strong>
                      {contact.firstName} {contact.lastName}
                    </strong>
                  </td>
                  <td>{contact.company.name}</td>
                  <td>{contact.title || 'No title provided'}</td>
                  <td>{contact.email || 'No email provided'}</td>
                  <td>{contact.phone || 'No phone provided'}</td>
                  <td>
                    <RowDetailsPanel summary="Open details" className="operations-row-details" bodyClassName="operations-row-details-body">
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(contact)}
                          disabled={deletingId === contact.id}
                        >
                          {deletingId === contact.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                      <p className="detail-copy">
                        {`Company: ${contact.company.name} | Title: ${contact.title || 'No title provided'}`}
                      </p>
                      <p className="detail-copy">
                        {`Email: ${contact.email || 'No email provided'} | Phone: ${contact.phone || 'No phone provided'}`}
                      </p>
                      <InlineRowEditorShell>
                        <ContactsForm
                          apiBaseUrl={apiBaseUrl}
                          companies={companies}
                          contactId={contact.id}
                          submitLabel="Save contact"
                          initialValues={{
                            companyId: contact.company.id,
                            firstName: contact.firstName,
                            lastName: contact.lastName,
                            email: contact.email || '',
                            phone: contact.phone || '',
                            title: contact.title || '',
                          }}
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
