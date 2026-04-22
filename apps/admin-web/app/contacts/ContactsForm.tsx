'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';

type CompanyOption = {
  id: string;
  name: string;
};

type ContactsFormProps = {
  apiBaseUrl: string;
  companies: CompanyOption[];
  contactId?: string;
  submitLabel?: string;
  initialValues?: {
    companyId: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    title: string;
  };
};

export function ContactsForm({ apiBaseUrl, companies, contactId, submitLabel, initialValues }: ContactsFormProps) {
  const router = useRouter();
  const [companyId, setCompanyId] = useState(initialValues?.companyId || companies[0]?.id || '');
  const [firstName, setFirstName] = useState(initialValues?.firstName || '');
  const [lastName, setLastName] = useState(initialValues?.lastName || '');
  const [email, setEmail] = useState(initialValues?.email || '');
  const [phone, setPhone] = useState(initialValues?.phone || '');
  const [title, setTitle] = useState(initialValues?.title || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(contactId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/contacts${contactId ? `/${contactId}` : ''}`, {
        method: contactId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyId,
          firstName,
          lastName,
          email,
          phone,
          title,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} contact.`));
      }

      if (!isEditing) {
        setFirstName('');
        setLastName('');
        setEmail('');
        setPhone('');
        setTitle('');
        setCompanyId(companies[0]?.id || '');
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} contact.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <label>
        Company
        <select
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
          required
          disabled={companies.length === 0}
        >
          {companies.length === 0 ? (
            <option value="">Create a company first</option>
          ) : (
            companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))
          )}
        </select>
      </label>

      <div className="form-row">
        <label>
          First name
          <input
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            required
          />
        </label>

        <label>
          Last name
          <input value={lastName} onChange={(event) => setLastName(event.target.value)} required />
        </label>
      </div>

      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>

      <div className="form-row">
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        </label>

        <label>
          Phone
          <input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
      </div>

      <button type="submit" disabled={isSubmitting || companies.length === 0}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Create contact')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
