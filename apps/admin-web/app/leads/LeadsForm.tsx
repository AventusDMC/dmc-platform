'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { getLeadStatusLabel, LEAD_STATUS_OPTIONS } from './leadStatusOptions';

type LeadsFormProps = {
  apiBaseUrl: string;
  leadId?: string;
  submitLabel?: string;
  initialValues?: {
    inquiry: string;
    source: string;
    status: string;
  };
};

export function LeadsForm({ apiBaseUrl, leadId, submitLabel, initialValues }: LeadsFormProps) {
  const router = useRouter();
  const [inquiry, setInquiry] = useState(initialValues?.inquiry || '');
  const [source, setSource] = useState(initialValues?.source || '');
  const [status, setStatus] = useState(initialValues?.status || 'new');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(leadId);
  const hasKnownStatus = LEAD_STATUS_OPTIONS.some((option) => option.value === status);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/leads${leadId ? `/${leadId}` : ''}`, {
        method: leadId ? 'PATCH' : 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          inquiry,
          source,
          status,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} lead.`));
      }

      if (!isEditing) {
        setInquiry('');
        setSource('');
        setStatus('new');
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} lead.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="lead-form" onSubmit={handleSubmit}>
      <label>
        Inquiry
        <textarea
          value={inquiry}
          onChange={(event) => setInquiry(event.target.value)}
          required
          rows={4}
        />
      </label>

      <label>
        Source
        <input
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="Website, email, referral..."
        />
      </label>

      <label>
        Status
        <select value={status} onChange={(event) => setStatus(event.target.value)} required>
          <option value="">Select status</option>
          {!hasKnownStatus && status ? <option value={status}>{getLeadStatusLabel(status)}</option> : null}
          {LEAD_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Create lead')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
