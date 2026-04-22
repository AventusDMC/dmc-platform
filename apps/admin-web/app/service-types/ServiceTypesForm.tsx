'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';

type ServiceTypesFormProps = {
  apiBaseUrl: string;
  serviceTypeId?: string;
  submitLabel?: string;
  initialValues?: {
    name: string;
    code: string;
    isActive: boolean;
  };
};

export function ServiceTypesForm({ apiBaseUrl, serviceTypeId, submitLabel, initialValues }: ServiceTypesFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name || '');
  const [code, setCode] = useState(initialValues?.code || '');
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(serviceTypeId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/service-types${serviceTypeId ? `/${serviceTypeId}` : ''}`, {
        method: serviceTypeId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          code: code.trim() || null,
          isActive,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save service type.'));
      }

      if (!isEditing) {
        setName('');
        setCode('');
        setIsActive(true);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save service type.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Hotel" required />
      </label>

      <label>
        Code
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="hotel" />
      </label>

      <label className="checkbox-field">
        <input checked={isActive} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" />
        Active
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save service type' : 'Add service type')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
