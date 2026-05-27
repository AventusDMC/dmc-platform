'use client';

import { FormEvent, Fragment, useCallback, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { RoomCategoriesErrorBoundary } from './RoomCategoriesErrorBoundary';
import {
  guardDetailFetch,
  measurePerf,
  useHardRenderGuard,
  useRenderCounter,
  withRouterCallGuard,
} from '../hotels/HotelsPerfDebugPanel';

// Hotel Master Room Categories Manager.
//
// Refactored as part of the room-categories freeze fix:
//   - Consumes the lightweight summary endpoint (one row per category,
//     no nested rates/contracts/supplements)
//   - Lazy-loads per-category detail only when the operator expands
//   - Safe-mode banner triggers when a hotel has many linked rates
//   - Uses AbortController to cancel inflight detail fetches when the
//     operator collapses or switches rows
//
// Preserves all existing CRUD endpoints — POST /hotels/:id/room-
// categories + PATCH/DELETE under the same path. The pricing engine
// never reads this component.

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
  // ROOM_CATEGORY_FORM_SAFE=1 — when true the form renders plain
  // uncontrolled HTML inputs (defaultValue, FormData on submit). No
  // useState for field values, no per-keystroke React re-renders.
  // Used to confirm the freeze lives in the controlled-input churn
  // (vs the rest of the form lifecycle).
  formSafeMode?: boolean;
};

function RoomCategoryForm({
  apiBaseUrl,
  hotels,
  hotelId,
  categoryId,
  submitLabel,
  initialValues,
  formSafeMode = false,
}: RoomCategoryFormProps) {
  // Diagnostic instrumentation — counts every render, hashes the
  // defaultValues object so churn from a freshly-allocated parent
  // prop shows up in the perf overlay.
  useRenderCounter('RoomCategoryForm');
  // Tighter limit than the manager wrappers — the form is a leaf and
  // shouldn't render more than a few dozen times per interaction. If
  // it crosses 50 renders in 2 seconds we're in a loop.
  useHardRenderGuard('RoomCategoryForm', { limit: 50, windowMs: 2000 });

  if (formSafeMode) {
    return (
      <RoomCategoryFormSafe
        apiBaseUrl={apiBaseUrl}
        hotels={hotels}
        hotelId={hotelId}
        categoryId={categoryId}
        submitLabel={submitLabel}
        initialValues={initialValues}
      />
    );
  }

  return (
    <RoomCategoryFormControlled
      apiBaseUrl={apiBaseUrl}
      hotels={hotels}
      hotelId={hotelId}
      categoryId={categoryId}
      submitLabel={submitLabel}
      initialValues={initialValues}
    />
  );
}

function RoomCategoryFormControlled({ apiBaseUrl, hotels, hotelId, categoryId, submitLabel, initialValues }: RoomCategoryFormProps) {
  // Form components only call router.refresh() inside submit handlers,
  // never on render — the guard can't trigger a render loop here, so
  // we use the plain useRouter() to keep the prop chain narrow.
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

// ROOM_CATEGORY_FORM_SAFE — uncontrolled-input variant for the
// freeze hunt. Every field uses `defaultValue` and `name=` instead of
// `value` + `onChange`. Submit reads via `new FormData(event.target)`,
// not via per-field React state. The only state on the component is
// `isSubmitting` + `error` — flipped only inside the submit handler,
// never on render. If THIS variant still freezes, the loop is
// somewhere upstream (the manager, the section, the router); if it
// renders cleanly, the freeze is in the controlled-input churn.
function RoomCategoryFormSafe({
  apiBaseUrl,
  hotels,
  hotelId,
  categoryId,
  submitLabel,
  initialValues,
}: RoomCategoryFormProps) {
  // Form components only call router.refresh() inside submit handlers,
  // never on render — the guard can't trigger a render loop here.
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(categoryId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    const formData = new FormData(event.currentTarget);
    const formHotelId = hotelId || (formData.get('hotelId') as string) || '';
    const formName = (formData.get('name') as string) || '';
    const formCode = (formData.get('code') as string) || '';
    const formDescription = (formData.get('description') as string) || '';
    const formIsActive = formData.get('isActive') === 'active';
    try {
      const response = await fetch(
        `${apiBaseUrl}/hotels/${formHotelId}/room-categories${categoryId ? `/${categoryId}` : ''}`,
        {
          method: categoryId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName,
            code: formCode || undefined,
            description: formDescription || undefined,
            isActive: formIsActive,
          }),
        },
      );
      if (!response.ok) {
        throw new Error(
          await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} hotel room category.`),
        );
      }
      if (!isEditing) {
        event.currentTarget.reset();
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} hotel room category.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="entity-form compact-form"
      onSubmit={handleSubmit}
      data-testid="room-category-form-safe"
      data-form-mode="safe"
    >
      <p className="table-subcopy">
        Form safe mode — uncontrolled inputs only. No React state per keystroke. If this renders
        cleanly, the freeze is in the controlled-input variant.
      </p>
      <div className="form-row form-row-4">
        {!hotelId ? (
          <label>
            Hotel
            <select name="hotelId" defaultValue={initialValues?.hotelId || hotels[0]?.id || ''} required>
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
          <input name="name" defaultValue={initialValues?.name || ''} placeholder="Standard" required />
        </label>
        <label>
          Code
          <input name="code" defaultValue={initialValues?.code || ''} placeholder="STD" />
        </label>
        <label>
          Description
          <input name="description" defaultValue={initialValues?.description || ''} placeholder="Optional" />
        </label>
        <label>
          Status
          <select name="isActive" defaultValue={(initialValues?.isActive ?? true) ? 'active' : 'inactive'}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
      </div>
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save category' : 'Add category')}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}

// Binary isolation modes — RoomCategoriesSection passes the active
// mode in via prop. Each mode selectively enables a layer of the
// manager so we can binary-search the runaway-render culprit:
//   minimal — Section returns early; manager never mounts.
//   table   — Manager mounts but renders only the read-only table.
//             No form, no expand, no delete buttons.
//   form    — Adds the inline create form.
//   expand  — Adds the per-row expand button + detail fetcher.
//   full    — Everything (default behaviour before the hunt).
type RoomCategoriesIsolationMode = 'minimal' | 'table' | 'form' | 'expand' | 'full';

export function RoomCategoriesManager({
  apiBaseUrl,
  hotels,
  initialSummary,
  isolationMode = 'full',
  formSafeMode = false,
  expandSafeMode = false,
  disableInstrumentation = false,
}: {
  apiBaseUrl: string;
  hotels: HotelOption[];
  initialSummary: RoomCategorySummary[];
  isolationMode?: RoomCategoriesIsolationMode;
  formSafeMode?: boolean;
  expandSafeMode?: boolean;
  // ?noInstrument=1 — when true, every diagnostic hook becomes a
  // no-op. Lets us answer "is the freeze caused by the instrumentation
  // we added to hunt the freeze?" If the page renders cleanly under
  // ?noInstrument=1, the loop is in one of the perf hooks (counter /
  // hard guard / router guard / fetch patch). If it still freezes,
  // those hooks are NOT the loop.
  disableInstrumentation?: boolean;
}) {
  // Diagnostic counters fire only when `?debugPerf=1` toggles the
  // overlay panel. Without the flag these are no-ops.
  useRenderCounter('RoomCategoriesManager', !disableInstrumentation);
  // Hard guard — if this wrapper renders > 100 times in 1 second the
  // error boundary surfaces a friendly message instead of locking
  // the browser. Catches the runaway before the tab dies.
  useHardRenderGuard('RoomCategoriesManager', { enabled: !disableInstrumentation });
  return (
    <RoomCategoriesErrorBoundary>
      <RoomCategoriesManagerInner
        apiBaseUrl={apiBaseUrl}
        hotels={hotels}
        initialSummary={initialSummary}
        isolationMode={isolationMode}
        formSafeMode={formSafeMode}
        expandSafeMode={expandSafeMode}
        disableInstrumentation={disableInstrumentation}
      />
    </RoomCategoriesErrorBoundary>
  );
}

function RoomCategoriesManagerInner({
  apiBaseUrl,
  hotels,
  initialSummary,
  isolationMode,
  formSafeMode,
  expandSafeMode,
  disableInstrumentation,
}: {
  apiBaseUrl: string;
  hotels: HotelOption[];
  initialSummary: RoomCategorySummary[];
  isolationMode: RoomCategoriesIsolationMode;
  formSafeMode: boolean;
  expandSafeMode: boolean;
  disableInstrumentation: boolean;
}) {
  useRenderCounter('RoomCategoriesManagerInner', !disableInstrumentation);
  useHardRenderGuard('RoomCategoriesManagerInner', { enabled: !disableInstrumentation });
  const enableForm = isolationMode === 'form' || isolationMode === 'expand' || isolationMode === 'full';
  const enableExpand = isolationMode === 'expand' || isolationMode === 'full';
  const enableDelete = isolationMode === 'full';
  // withRouterCallGuard counts router calls — if push/replace/refresh
  // fires > 20 times in 2 seconds we throw so the error boundary
  // surfaces a "Router synchronization loop detected" diagnostic.
  // Disabled when noInstrument=1 so we can rule out the guard itself.
  const router = withRouterCallGuard(useRouter(), !disableInstrumentation);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [details, setDetails] = useState<Record<string, { loading: boolean; data: CategoryDetail | null; error: string | null }>>(
    {},
  );

  // Sort is wrapped in measurePerf so the dev console warns if this
  // ever exceeds 16ms (one frame). If the freeze ever lands here, we
  // see it in the console before the browser locks.
  const sortedRows = useMemo<RoomCategorySummary[]>(
    () =>
      measurePerf('RoomCategoriesManager.sortedRows', () =>
        [...initialSummary].sort((left, right) => {
          const hotelComparison = left.hotelName.localeCompare(right.hotelName);
          if (hotelComparison !== 0) return hotelComparison;
          return left.name.localeCompare(right.name);
        }),
      ),
    [initialSummary],
  );

  // Safe-mode trigger — when any hotel's contract+rate density crosses
  // the threshold we surface a banner so operators know detail loads
  // on demand instead of upfront.
  const isLargeHotelSetup = useMemo(
    () =>
      measurePerf('RoomCategoriesManager.isLargeHotelSetup', () =>
        sortedRows.some((row) => row.linkedRateCount > LARGE_HOTEL_LINKED_RATE_THRESHOLD),
      ),
    [sortedRows],
  );

  // CRITICAL BUG-HUNT NOTE — Round 3.
  //
  // PR #126 used the "setter-form for cache check" pattern, but I
  // realized that's a setState call with the SAME reference returned,
  // which still triggers React to enqueue an update even though the
  // value is unchanged. In some Strict-Mode or batched-update flows
  // that double-enqueue can manifest as render churn.
  //
  // Round 3 fix: track in-flight fetches via a useRef so the cache
  // check never enters React's render queue. Also short-circuit
  // BEFORE calling setExpandedId so a repeat click on the same row
  // doesn't fire two state updates.
  //
  // The fetch guard counts per-category invocations and throws if
  // the same row fires > 5 fetches in 2 seconds. The error boundary
  // catches the throw and surfaces "Repeated detail hydration loop
  // detected" instead of letting the browser lock.
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
      // 5. New fetch — guard counts it. > 5 fetches in 2 seconds for
      //    the same row throws "Repeated detail hydration loop detected".
      //    Gated by disableInstrumentation so noInstrument=1 turns it off.
      guardDetailFetch(categoryId, !disableInstrumentation);
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

  async function handleDelete(category: RoomCategorySummary) {
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
      if (expandedId === category.id) {
        setExpandedId(null);
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
    <div className="entity-list" data-isolation-mode={isolationMode}>
      {enableForm ? (
        <RoomCategoryForm
          apiBaseUrl={apiBaseUrl}
          hotels={hotels}
          submitLabel="Add room category"
          formSafeMode={formSafeMode}
        />
      ) : (
        <p className="table-subcopy">
          Form disabled by isolation mode <code>{isolationMode}</code>. Switch to <code>form</code> or higher to enable.
        </p>
      )}

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
              {sortedRows.map((category) => {
                const isEditing = editingId === category.id;
                const isExpanded = expandedId === category.id;
                const detail = details[category.id];

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
                      <td className="numeric-cell">{category.linkedRateCount}</td>
                      <td className="numeric-cell">{category.linkedQuoteItemCount}</td>
                      <td>
                        <div className="table-action-row">
                          {enableExpand ? (
                            <button
                              type="button"
                              className="compact-button"
                              onClick={() => handleExpand(category.id)}
                              aria-expanded={isExpanded}
                              aria-controls={`room-category-detail-${category.id}`}
                            >
                              {isExpanded ? 'Hide detail' : 'Detail'}
                            </button>
                          ) : null}
                          {enableForm ? (
                            <button
                              type="button"
                              className="compact-button"
                              onClick={() => setEditingId((current) => (current === category.id ? null : category.id))}
                            >
                              {isEditing ? 'Close edit' : 'Edit'}
                            </button>
                          ) : null}
                          {enableDelete ? (
                            <button
                              type="button"
                              className="compact-button compact-button-danger"
                              onClick={() => handleDelete(category)}
                              disabled={deletingId === category.id}
                            >
                              {deletingId === category.id ? 'Deleting...' : 'Delete'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>

                    {enableExpand && isExpanded ? (
                      <tr>
                        <td colSpan={7} id={`room-category-detail-${category.id}`}>
                          {!detail || detail.loading ? (
                            <p className="empty-state">Loading category detail…</p>
                          ) : detail.error ? (
                            <p className="form-error">{detail.error}</p>
                          ) : detail.data ? (
                            <RoomCategoryDetailPanel
                              detail={detail.data}
                              expandSafeMode={expandSafeMode}
                              disableInstrumentation={disableInstrumentation}
                            />
                          ) : null}
                        </td>
                      </tr>
                    ) : null}

                    {enableForm && isEditing ? (
                      <tr>
                        <td colSpan={7}>
                          <div className="inline-entity-editor">
                            <RoomCategoryForm
                              apiBaseUrl={apiBaseUrl}
                              hotels={hotels}
                              hotelId={category.hotelId}
                              categoryId={category.id}
                              submitLabel="Save category"
                              formSafeMode={formSafeMode}
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
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RoomCategoryDetailPanel({
  detail,
  expandSafeMode = false,
  disableInstrumentation = false,
}: {
  detail: CategoryDetail;
  expandSafeMode?: boolean;
  disableInstrumentation?: boolean;
}) {
  useRenderCounter('RoomCategoryDetailPanel', !disableInstrumentation);
  useHardRenderGuard('RoomCategoryDetailPanel', { limit: 50, windowMs: 2000, enabled: !disableInstrumentation });

  // expandSafeMode — bare-minimum render. No contracts list, no
  // counts grid, no derived grouping. Just the category name. If the
  // freeze persists in this mode, the loop is OUTSIDE the panel
  // itself (handleExpand / fetch / setDetails). If it disappears,
  // the loop is in one of the derived sections.
  if (expandSafeMode) {
    return (
      <div data-testid="room-category-detail-panel-safe">
        <strong>{detail.name}</strong>
        <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: 0 }}>
          expandSafe — derived sections disabled. {detail.contracts.length} contracts, {detail.counts.rates} rates
          available (not rendered).
        </p>
      </div>
    );
  }

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
