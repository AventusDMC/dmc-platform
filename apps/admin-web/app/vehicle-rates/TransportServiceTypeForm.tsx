'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';

type TransportServiceTypeFormProps = {
  apiBaseUrl: string;
  serviceTypeId?: string;
  submitLabel?: string;
  initialValues?: {
    name: string;
    code: string;
  };
};

export function TransportServiceTypeForm({ apiBaseUrl, serviceTypeId, submitLabel, initialValues }: TransportServiceTypeFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name || '');
  const [code, setCode] = useState(initialValues?.code || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(serviceTypeId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/transport-service-types${serviceTypeId ? `/${serviceTypeId}` : ''}`, {
        method: serviceTypeId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          code,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save transport service type.'));
      }

      if (!isEditing) {
        setName('');
        setCode('');
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save transport service type.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Service type name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>

        <label>
          Code
          <input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} required />
        </label>
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Add service type')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
