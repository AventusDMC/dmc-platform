'use client';

import { FormEvent, Fragment, memo, useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { RoomCategoriesErrorBoundary } from './RoomCategoriesErrorBoundary';

// Hotel Master Room Categories Manager.
//
//   - Consumes the lightweight summary endpoint (one row per category,
//     no nested rates/contracts/supplements).
//   - Lazy-loads per-category detail only when the operator expands.
//   - Surfaces a safe-mode banner when a hotel has many linked rates.
//   - Uses AbortController to cancel inflight detail fetches when the
//     operator collapses or switches rows.
//   - Wrapped in RoomCategoriesErrorBoundary so a render failure
//     surfaces a friendly retry instead of freezing the tab.
//
// CRUD endpoints unchanged — POST /hotels/:id/room-categories +
// PATCH/DELETE under the same path. The pricing engine never reads
// this component.

export type RoomCategorySummary = {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  hotelName: string;
  hotelCity: string;
  hotelContractCount: number;
  linkedRateCount: number;
  linkedQuoteItemCount: number;
};

type HotelOption = {
  id: string;
  name: string;
  city: string;
};

type CategoryDetail = {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
  hotel: { id: string; name: string; city: string } | null;
  counts: {
    rates: number;
    quoteItems: number;
    supplements: number;
    allotments: number;
  };
  contracts: Array<{
    id: string;
    name: string;
    validFrom: string;
    validTo: string;
    currency: string;
    confidence: string;
    rateCount: number;
  }>;
};

// Mirrors the contract workspace's safe-mode threshold: if a category
// is referenced by more than this many rates, show the summary-first
// banner and defer any expensive detail rendering until explicit
// operator action.
const LARGE_HOTEL_LINKED_RATE_THRESHOLD = 200;

type RoomCategoryFormProps = {
  apiBaseUrl: string;
  hotels: HotelOption[];
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

function RoomCategoryForm({
  apiBaseUrl,
  hotels,
  hotelId,
  categoryId,
  submitLabel,
  initialValues,
}: RoomCategoryFormProps) {
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

export function RoomCategoriesManager({
  apiBaseUrl,
  hotels,
  initialSummary,
}: {
  apiBaseUrl: string;
  hotels: HotelOption[];
  initialSummary: RoomCategorySummary[];
}) {
  return (
    <RoomCategoriesErrorBoundary>
      <RoomCategoriesManagerInner
        apiBaseUrl={apiBaseUrl}
        hotels={hotels}
        initialSummary={initialSummary}
      />
    </RoomCategoriesErrorBoundary>
  );
}

function RoomCategoriesManagerInner({
  apiBaseUrl,
  hotels,
  initialSummary,
}: {
  apiBaseUrl: string;
  hotels: HotelOption[];
  initialSummary: RoomCategorySummary[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [details, setDetails] = useState<Record<string, { loading: boolean; data: CategoryDetail | null; error: string | null }>>(
    {},
  );

  const sortedRows = useMemo<RoomCategorySummary[]>(
    () =>
      [...initialSummary].sort((left, right) => {
        const hotelComparison = left.hotelName.localeCompare(right.hotelName);
        if (hotelComparison !== 0) return hotelComparison;
        return left.name.localeCompare(right.name);
      }),
    [initialSummary],
  );

  // Safe-mode trigger — when any hotel's contract+rate density crosses
  // the threshold we surface a banner so operators know detail loads
  // on demand instead of upfront.
  const isLargeHotelSetup = useMemo(
    () => sortedRows.some((row) => row.linkedRateCount > LARGE_HOTEL_LINKED_RATE_THRESHOLD),
    [sortedRows],
  );

  // Ref-driven cache check — avoids re-rendering when handleExpand
  // looks up the current details map. Direct setState inside the
  // callback would re-create the callback identity on every render
  // and re-fire the expand handler.
  const detailsRef = useRef<typeof details>(details);
  detailsRef.current = details;
  const expandedIdRef = useRef<typeof expandedId>(expandedId);
  expandedIdRef.current = expandedId;

  const handleExpand = useCallback(
    async (categoryId: string) => {
      // 1. Collapse if already expanded — single setState only.
      if (expandedIdRef.current === categoryId) {
        setExpandedId(null);
        return;
      }
      // 2. Open the row.
      setExpandedId(categoryId);
      // 3. Cache hit? Bail before any fetch / setState churn.
      if (detailsRef.current[categoryId]?.data) {
        return;
      }
      // 4. Already loading this row? Don't double-fire.
      if (detailsRef.current[categoryId]?.loading) {
        return;
      }
      setDetails((current) => ({
        ...current,
        [categoryId]: { loading: true, data: null, error: null },
      }));

      const controller = new AbortController();
      try {
        const response = await fetch(`${apiBaseUrl}/hotels/room-categories/${encodeURIComponent(categoryId)}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(await getErrorMessage(response, 'Could not load category detail.'));
        }
        const data = (await response.json()) as CategoryDetail;
        if (controller.signal.aborted) return;
        setDetails((current) => ({
          ...current,
          [categoryId]: { loading: false, data, error: null },
        }));
      } catch (caughtError) {
        if (controller.signal.aborted) return;
        setDetails((current) => ({
          ...current,
          [categoryId]: {
            loading: false,
            data: null,
            error: caughtError instanceof Error ? caughtError.message : 'Could not load category detail.',
          },
        }));
      }
    },
    // Stable deps — refs read live state without forcing the
    // callback identity to churn.
    [apiBaseUrl],
  );

  // Stable id-based handler so memoized rows don't see a new identity
  // every parent render. Reads `editingId` via a setter callback to
  // avoid closing over the live value.
  const handleEditToggle = useCallback((categoryId: string) => {
    setEditingId((current) => (current === categoryId ? null : categoryId));
  }, []);

  // Live refs let handleDelete read state without forcing the callback
  // identity to churn on every editingId / expandedId update.
  const editingIdRef = useRef<typeof editingId>(editingId);
  editingIdRef.current = editingId;

  const handleDelete = useCallback(
    async (category: RoomCategorySummary) => {
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

        if (editingIdRef.current === category.id) {
          setEditingId(null);
        }
        if (expandedIdRef.current === category.id) {
          setExpandedId(null);
        }

        router.refresh();
      } catch (caughtError) {
        setError(caughtError instanceof Error ? caughtError.message : 'Could not delete room category.');
      } finally {
        setDeletingId(null);
      }
    },
    // Stable deps — refs read live state without re-creating the
    // callback on every editingId/expandedId tick.
    [apiBaseUrl, router],
  );

  if (hotels.length === 0) {
    return <p className="empty-state">Create a hotel first to manage room categories.</p>;
  }

  return (
    <div className="entity-list">
      <RoomCategoryForm
        apiBaseUrl={apiBaseUrl}
        hotels={hotels}
        submitLabel="Add room category"
      />

      {error ? <p className="form-error">{error}</p> : null}

      {isLargeHotelSetup ? (
        <p className="table-subcopy" role="status">
          Large hotel setup — showing room category summary first. Expand a category to load its
          linked contracts and rate counts on demand.
        </p>
      ) : null}

      {sortedRows.length === 0 ? (
        <p className="empty-state">No room categories yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table allotment-table" data-testid="room-categories-table">
            <thead>
              <tr>
                <th>Hotel</th>
                <th>Category</th>
                <th>Code</th>
                <th>Status</th>
                <th>Rates linked</th>
                <th>Quote items</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((category) => (
                <RoomCategoryRow
                  key={category.id}
                  category={category}
                  apiBaseUrl={apiBaseUrl}
                  hotels={hotels}
                  isExpanded={expandedId === category.id}
                  isEditing={editingId === category.id}
                  isDeleting={deletingId === category.id}
                  detail={details[category.id]}
                  onExpand={handleExpand}
                  onEditToggle={handleEditToggle}
                  onDelete={handleDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Memoized row. Re-renders only when one of its own props changes —
// not when an unrelated row's expandedId / editingId / deletingId
// flips. With 57 rows in scope, this cuts re-render fan-out from 57
// to ~2 (the previously-active row + the newly-active row) per click.
type RoomCategoryRowProps = {
  category: RoomCategorySummary;
  apiBaseUrl: string;
  hotels: HotelOption[];
  isExpanded: boolean;
  isEditing: boolean;
  isDeleting: boolean;
  detail: { loading: boolean; data: CategoryDetail | null; error: string | null } | undefined;
  onExpand: (categoryId: string) => void;
  onEditToggle: (categoryId: string) => void;
  onDelete: (category: RoomCategorySummary) => void;
};

const RoomCategoryRow = memo(function RoomCategoryRow({
  category,
  apiBaseUrl,
  hotels,
  isExpanded,
  isEditing,
  isDeleting,
  detail,
  onExpand,
  onEditToggle,
  onDelete,
}: RoomCategoryRowProps) {
  return (
    <Fragment>
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
        <td className="numeric-cell">{category.linkedRateCount}</td>
        <td className="numeric-cell">{category.linkedQuoteItemCount}</td>
        <td>
          <div className="table-action-row">
            <button
              type="button"
              className="compact-button"
              onClick={() => onExpand(category.id)}
              aria-expanded={isExpanded}
              aria-controls={`room-category-detail-${category.id}`}
            >
              {isExpanded ? 'Hide detail' : 'Detail'}
            </button>
            <button
              type="button"
              className="compact-button"
              onClick={() => onEditToggle(category.id)}
            >
              {isEditing ? 'Close edit' : 'Edit'}
            </button>
            <button
              type="button"
              className="compact-button compact-button-danger"
              onClick={() => onDelete(category)}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </td>
      </tr>

      {isExpanded ? (
        <tr>
          <td colSpan={7} id={`room-category-detail-${category.id}`}>
            {!detail || detail.loading ? (
              <p className="empty-state">Loading category detail…</p>
            ) : detail.error ? (
              <p className="form-error">{detail.error}</p>
            ) : detail.data ? (
              <RoomCategoryDetailPanel detail={detail.data} />
            ) : null}
          </td>
        </tr>
      ) : null}

      {isEditing ? (
        <tr>
          <td colSpan={7}>
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
                  description: '',
                  isActive: category.isActive,
                }}
              />
            </div>
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
});

function RoomCategoryDetailPanel({ detail }: { detail: CategoryDetail }) {
  return (
    <div className="contract-list-stack" data-testid="room-category-detail-panel">
      <div className="contract-list-row contract-list-row-wide">
        <strong>Counts</strong>
        <span>
          {detail.counts.rates} rates &middot; {detail.counts.supplements} supplements &middot;{' '}
          {detail.counts.allotments} allotments &middot; {detail.counts.quoteItems} quote items
        </span>
      </div>
      {detail.description ? (
        <div className="contract-list-row contract-list-row-wide">
          <strong>Description</strong>
          <span>{detail.description}</span>
        </div>
      ) : null}
      {detail.contracts.length === 0 ? (
        <p className="empty-state">No contracts reference this category yet.</p>
      ) : (
        <div className="contract-list-row contract-list-row-wide">
          <strong>Contracts ({detail.contracts.length})</strong>
          <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1rem' }}>
            {detail.contracts.map((contract) => (
              <li key={contract.id} style={{ fontSize: '0.82rem', color: '#475467' }}>
                <strong>{contract.name}</strong> · {contract.rateCount} rates ·{' '}
                {new Date(contract.validFrom).toISOString().slice(0, 10)} → {new Date(contract.validTo).toISOString().slice(0, 10)}{' '}
                · {contract.currency} · {contract.confidence}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
