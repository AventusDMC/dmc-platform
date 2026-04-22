'use client';

import { FormEvent, Fragment, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';

type HotelRoomCategory = {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
};

type Hotel = {
  id: string;
  name: string;
  city: string;
  roomCategories: HotelRoomCategory[];
};

type RoomCategoryFormProps = {
  apiBaseUrl: string;
  hotels: Hotel[];
  hotelId?: string;
  categoryId?: string;
  submitLabel?: string;
  initialValues?: {
    hotelId?: string;
    name: string;
    code: string;
    description: string;
    isActive: boolean;
  };
};

function RoomCategoryForm({ apiBaseUrl, hotels, hotelId, categoryId, submitLabel, initialValues }: RoomCategoryFormProps) {
  const router = useRouter();
  const [selectedHotelId, setSelectedHotelId] = useState(initialValues?.hotelId || hotelId || hotels[0]?.id || '');
  const [name, setName] = useState(initialValues?.name || '');
  const [code, setCode] = useState(initialValues?.code || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [isActive, setIsActive] = useState(initialValues?.isActive ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(categoryId);
  const targetHotelId = hotelId || selectedHotelId;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/hotels/${targetHotelId}/room-categories${categoryId ? `/${categoryId}` : ''}`, {
        method: categoryId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          code: code || undefined,
          description: description || undefined,
          isActive,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} hotel room category.`));
      }

      if (!isEditing) {
        setSelectedHotelId(hotels[0]?.id || '');
        setName('');
        setCode('');
        setDescription('');
        setIsActive(true);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} hotel room category.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form compact-form" onSubmit={handleSubmit}>
      <div className="form-row form-row-4">
        {!hotelId ? (
          <label>
            Hotel
            <select value={selectedHotelId} onChange={(event) => setSelectedHotelId(event.target.value)} required>
              {hotels.map((hotel) => (
                <option key={hotel.id} value={hotel.id}>
                  {hotel.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Standard" required />
        </label>

        <label>
          Code
          <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="STD" />
        </label>

        <label>
          Description
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Optional" />
        </label>

        <label>
          Status
          <select value={isActive ? 'active' : 'inactive'} onChange={(event) => setIsActive(event.target.value === 'active')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>

      <button type="submit" disabled={isSubmitting || !targetHotelId}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save category' : 'Add category')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}

type RoomCategoryRow = HotelRoomCategory & {
  hotelName: string;
  hotelCity: string;
};

export function RoomCategoriesManager({ apiBaseUrl, hotels }: { apiBaseUrl: string; hotels: Hotel[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const roomCategoryRows = useMemo<RoomCategoryRow[]>(
    () =>
      hotels
        .flatMap((hotel) =>
          hotel.roomCategories.map((category) => ({
            ...category,
            hotelName: hotel.name,
            hotelCity: hotel.city,
          })),
        )
        .sort((left, right) => {
          const hotelComparison = left.hotelName.localeCompare(right.hotelName);
          if (hotelComparison !== 0) {
            return hotelComparison;
          }

          return left.name.localeCompare(right.name);
        }),
    [hotels],
  );

  async function handleDelete(category: RoomCategoryRow) {
    if (!window.confirm(`Delete ${category.name}?`)) {
      return;
    }

    setDeletingId(category.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/hotels/${category.hotelId}/room-categories/${category.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete room category.'));
      }

      if (editingId === category.id) {
        setEditingId(null);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete room category.');
    } finally {
      setDeletingId(null);
    }
  }

  if (hotels.length === 0) {
    return <p className="empty-state">Create a hotel first to manage room categories.</p>;
  }

  return (
    <div className="entity-list">
      <RoomCategoryForm apiBaseUrl={apiBaseUrl} hotels={hotels} submitLabel="Add room category" />

      {error ? <p className="form-error">{error}</p> : null}

      {roomCategoryRows.length === 0 ? (
        <p className="empty-state">No room categories yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table allotment-table">
            <thead>
              <tr>
                <th>Hotel</th>
                <th>Category</th>
                <th>Code</th>
                <th>Status</th>
                <th>Context</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {roomCategoryRows.map((category) => {
                const isEditing = editingId === category.id;

                return (
                  <Fragment key={category.id}>
                    <tr>
                      <td>
                        <strong>{category.hotelName}</strong>
                        <div className="table-subcopy">{category.hotelCity}</div>
                      </td>
                      <td>
                        <strong>{category.name}</strong>
                      </td>
                      <td>{category.code || 'No code'}</td>
                      <td>{category.isActive ? 'Active' : 'Inactive'}</td>
                      <td>{category.description || 'No description'}</td>
                      <td>
                        <div className="table-action-row">
                          <button
                            type="button"
                            className="compact-button"
                            onClick={() => setEditingId((current) => (current === category.id ? null : category.id))}
                          >
                            {isEditing ? 'Close edit' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            className="compact-button compact-button-danger"
                            onClick={() => handleDelete(category)}
                            disabled={deletingId === category.id}
                          >
                            {deletingId === category.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isEditing ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="inline-entity-editor">
                            <RoomCategoryForm
                              apiBaseUrl={apiBaseUrl}
                              hotels={hotels}
                              hotelId={category.hotelId}
                              categoryId={category.id}
                              submitLabel="Save category"
                              initialValues={{
                                hotelId: category.hotelId,
                                name: category.name,
                                code: category.code || '',
                                description: category.description || '',
                                isActive: category.isActive,
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
