'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';

type HotelCategoriesFormProps = {
  apiBaseUrl: string;
  hotelCategoryId?: string;
  submitLabel?: string;
  initialValues?: {
    name: string;
    isActive: boolean;
  };
};

export function HotelCategoriesForm({
  apiBaseUrl,
  hotelCategoryId,
  submitLabel,
  initialValues,
}: HotelCategoriesFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name || '');
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(hotelCategoryId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/hotel-categories${hotelCategoryId ? `/${hotelCategoryId}` : ''}`, {
        method: hotelCategoryId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          isActive,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save hotel category.'));
      }

      if (!isEditing) {
        setName('');
        setIsActive(true);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save hotel category.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="4 Star" required />
      </label>

      <label className="checkbox-field">
        <input checked={isActive} onChange={(event) => setIsActive(event.target.checked)} type="checkbox" />
        Active
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save category' : 'Add category')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
