'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';

type LeadConvertFormProps = {
  apiBaseUrl: string;
  leadId: string;
  disabled?: boolean;
};

export function LeadConvertForm({ apiBaseUrl, leadId, disabled = false }: LeadConvertFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/leads/${leadId}/convert`, {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          companyName,
          contactName,
          email,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not convert lead.'));
      }

      router.push('/contacts');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not convert lead.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="convert-panel">
      <button
        type="button"
        className="secondary-button"
        onClick={() => setIsOpen((current) => !current)}
        disabled={disabled || isSubmitting}
      >
        {disabled ? 'Lead converted' : isOpen ? 'Cancel' : 'Convert Lead'}
      </button>

      {isOpen && !disabled ? (
        <form className="lead-form convert-form" onSubmit={handleSubmit}>
          <label>
            Company name
            <input
              value={companyName}
              onChange={(event) => setCompanyName(event.target.value)}
              required
            />
          </label>

          <label>
            Contact name
            <input
              value={contactName}
              onChange={(event) => setContactName(event.target.value)}
              required
            />
          </label>

          <label>
            Email
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
            />
          </label>

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Converting...' : 'Create company and contact'}
          </button>

          {error ? <p className="form-error">{error}</p> : null}
        </form>
      ) : null}
    </div>
  );
}
