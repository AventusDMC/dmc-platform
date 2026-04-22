'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../components/RowDetailsPanel';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';
import { GalleryForm } from './GalleryForm';

type GalleryImage = {
  id: string;
  title: string;
  imageUrl: string;
  destination: string | null;
  category: string | null;
  createdAt: string;
};

type GalleryTableProps = {
  apiBaseUrl: string;
  images: GalleryImage[];
};

export function GalleryTable({ apiBaseUrl, images }: GalleryTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(image: GalleryImage) {
    if (!window.confirm(`Delete ${image.title}?`)) {
      return;
    }

    setDeletingId(image.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/gallery/${image.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete image.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete image.');
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
              <th>Image</th>
              <th>Destination</th>
              <th>Category</th>
              <th>Created</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {images.map((image) => (
              <tr key={image.id}>
                <td>
                  <strong>{image.title}</strong>
                  <div className="table-subcopy">{image.imageUrl}</div>
                </td>
                <td>{image.destination || 'No destination set'}</td>
                <td>{image.category || 'Uncategorized'}</td>
                <td>{new Date(image.createdAt).toLocaleDateString()}</td>
                <td>
                  <RowDetailsPanel summary="Open details" className="operations-row-details" bodyClassName="operations-row-details-body">
                    <img src={image.imageUrl} alt={image.title} className="gallery-card-image" />
                    <p className="detail-copy">
                      {`Destination: ${image.destination || 'No destination set'} | Category: ${image.category || 'Uncategorized'}`}
                    </p>
                    <div className="table-action-row">
                      <button
                        type="button"
                        className="compact-button compact-button-danger"
                        onClick={() => handleDelete(image)}
                        disabled={deletingId === image.id}
                      >
                        {deletingId === image.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                    <InlineRowEditorShell>
                      <GalleryForm
                        apiBaseUrl={apiBaseUrl}
                        imageId={image.id}
                        submitLabel="Save image"
                        initialValues={{
                          title: image.title,
                          imageUrl: image.imageUrl,
                          destination: image.destination || '',
                          category: image.category || '',
                        }}
                      />
                    </InlineRowEditorShell>
                  </RowDetailsPanel>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
