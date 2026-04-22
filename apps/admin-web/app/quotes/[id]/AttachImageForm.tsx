'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../../lib/api';

type GalleryImage = {
  id: string;
  title: string;
  imageUrl: string;
  destination: string | null;
  category: string | null;
};

type AttachImageFormProps = {
  apiBaseUrl: string;
  itineraryId: string;
  galleryImages: GalleryImage[];
  imageId?: string;
  submitLabel?: string;
  initialValues?: {
    galleryImageId: string;
    sortOrder: string;
  };
};

export function AttachImageForm({
  apiBaseUrl,
  itineraryId,
  galleryImages,
  imageId,
  submitLabel,
  initialValues,
}: AttachImageFormProps) {
  const router = useRouter();
  const [galleryImageId, setGalleryImageId] = useState(initialValues?.galleryImageId || galleryImages[0]?.id || '');
  const [sortOrder, setSortOrder] = useState(initialValues?.sortOrder || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(imageId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!galleryImageId) {
      setError('Select an image first.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/itineraries/${itineraryId}/images${imageId ? `/${imageId}` : ''}`, {
        method: imageId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          galleryImageId,
          sortOrder: sortOrder ? Number(sortOrder) : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'attach'} image.`));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'attach'} image.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (galleryImages.length === 0) {
    return <p className="empty-state">Add images in the gallery first.</p>;
  }

  return (
    <form className="attach-image-form" onSubmit={handleSubmit}>
      <label>
        {isEditing ? 'Edit image attachment' : 'Attach image'}
        <div className="attach-image-row">
          <select value={galleryImageId} onChange={(event) => setGalleryImageId(event.target.value)}>
            {galleryImages.map((image) => (
              <option key={image.id} value={image.id}>
                {image.title}
                {image.destination ? ` | ${image.destination}` : ''}
              </option>
            ))}
          </select>
          <input
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            type="number"
            min="0"
            placeholder="Sort"
          />
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Attach image')}
          </button>
        </div>
      </label>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
