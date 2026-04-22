'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';

type GalleryFormProps = {
  apiBaseUrl: string;
  imageId?: string;
  submitLabel?: string;
  initialValues?: {
    title: string;
    imageUrl: string;
    destination: string;
    category: string;
  };
};

export function GalleryForm({ apiBaseUrl, imageId, submitLabel, initialValues }: GalleryFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialValues?.title || '');
  const [imageUrl, setImageUrl] = useState(initialValues?.imageUrl || '');
  const [destination, setDestination] = useState(initialValues?.destination || '');
  const [category, setCategory] = useState(initialValues?.category || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(imageId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/gallery${imageId ? `/${imageId}` : ''}`, {
        method: imageId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          imageUrl,
          destination,
          category,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save image.'));
      }

      if (!isEditing) {
        setTitle('');
        setImageUrl('');
        setDestination('');
        setCategory('');
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save image.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>

      <label>
        Image URL
        <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} type="url" required />
      </label>

      <div className="form-row">
        <label>
          Destination
          <input value={destination} onChange={(event) => setDestination(event.target.value)} />
        </label>

        <label>
          Category
          <input value={category} onChange={(event) => setCategory(event.target.value)} />
        </label>
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Add image')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
