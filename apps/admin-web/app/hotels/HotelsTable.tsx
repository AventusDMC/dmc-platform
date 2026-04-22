'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { HotelsForm } from './HotelsForm';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { CityOption, formatCityLabel } from '../lib/cities';
import { HotelCategoryOption, formatHotelCategoryLabel } from '../lib/hotelCategories';

type Hotel = {
  id: string;
  name: string;
  cityId: string | null;
  city: string;
  hotelCategoryId: string | null;
  category: string;
  supplierId: string;
  cityRecord: CityOption | null;
  hotelCategory: HotelCategoryOption | null;
  roomCategories?: Array<{ id: string }>;
  _count: {
    contracts: number;
  };
};

type HotelsTableProps = {
  apiBaseUrl: string;
  hotels: Hotel[];
  cities: CityOption[];
  hotelCategories: HotelCategoryOption[];
};

export function HotelsTable({ apiBaseUrl, hotels, cities, hotelCategories }: HotelsTableProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(hotel: Hotel) {
    if (!window.confirm(`Delete ${hotel.name}?`)) {
      return;
    }

    setDeletingId(hotel.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/hotels/${hotel.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete hotel.'));
      }

      if (editingId === hotel.id) {
        setEditingId(null);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete hotel.');
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
              <th>Hotel</th>
              <th>City</th>
              <th>Category</th>
              <th>Room categories</th>
              <th>Contracts</th>
              <th>Supplier</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {hotels.map((hotel) => {
              const isEditing = editingId === hotel.id;
              const roomCategoryCount = hotel.roomCategories?.length ?? 0;

              return (
                <Fragment key={hotel.id}>
                  <tr>
                    <td>
                      <strong>{hotel.name}</strong>
                    </td>
                    <td>{hotel.cityRecord ? formatCityLabel(hotel.cityRecord) : hotel.city || 'Unassigned'}</td>
                    <td>{hotel.hotelCategory ? formatHotelCategoryLabel(hotel.hotelCategory) : hotel.category || 'Unassigned'}</td>
                    <td>{roomCategoryCount}</td>
                    <td>{hotel._count.contracts}</td>
                    <td>{hotel.supplierId}</td>
                    <td>
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="compact-button"
                          onClick={() => setEditingId((current) => (current === hotel.id ? null : hotel.id))}
                        >
                          {isEditing ? 'Close edit' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(hotel)}
                          disabled={deletingId === hotel.id}
                        >
                          {deletingId === hotel.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>

                  {isEditing ? (
                    <tr>
                      <td colSpan={7}>
                        <InlineRowEditorShell>
                          <HotelsForm
                            apiBaseUrl={apiBaseUrl}
                            cities={cities}
                            hotelCategories={hotelCategories}
                            hotelId={hotel.id}
                            submitLabel="Save hotel"
                            initialValues={{
                              name: hotel.name,
                              cityId: hotel.cityId || '',
                              city: hotel.cityId ? '' : hotel.city,
                              hotelCategoryId: hotel.hotelCategoryId || '',
                              category: hotel.category,
                              supplierId: hotel.supplierId,
                            }}
                          />
                        </InlineRowEditorShell>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
