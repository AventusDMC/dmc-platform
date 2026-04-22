'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { QuoteBulkActionNotice, type QuoteBulkActionNoticeState } from './QuoteBulkActionNotice';
import { getQuoteServiceCategoryKey, type QuoteReadinessDay, type ServicePlannerCategory } from './quote-readiness';

type SupplierService = {
  id: string;
  supplierId: string;
  name: string;
  category: string;
  serviceType?: {
    id: string;
    name: string;
    code: string | null;
  } | null;
};

type QuoteItem = {
  id: string;
  itineraryId: string | null;
  service: SupplierService;
};

type QuoteUnresolvedBatchActionsProps = {
  apiBaseUrl: string;
  quoteId: string;
  optionId?: string;
  items: QuoteItem[];
  days: QuoteReadinessDay[];
  services: SupplierService[];
  scopeLabel: string;
};

const IMPORTED_SERVICE_SUPPLIER_ID = 'import-itinerary-system';
const CATEGORY_ORDER: ServicePlannerCategory[] = ['hotel', 'transport', 'guide', 'activity', 'meal', 'other'];

function isImportedPlaceholder(item: QuoteItem) {
  return item.service.supplierId === IMPORTED_SERVICE_SUPPLIER_ID;
}

export function QuoteUnresolvedBatchActions({
  apiBaseUrl,
  quoteId,
  optionId,
  items,
  days,
  services,
  scopeLabel,
}: QuoteUnresolvedBatchActionsProps) {
  const router = useRouter();
  const unresolvedItems = useMemo(() => items.filter(isImportedPlaceholder), [items]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dayId, setDayId] = useState('');
  const [category, setCategory] = useState<ServicePlannerCategory | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<QuoteBulkActionNoticeState | null>(null);

  const importedServicesByCategory = useMemo(() => {
    const map = new Map<ServicePlannerCategory, SupplierService>();

    for (const service of services) {
      if (service.supplierId !== IMPORTED_SERVICE_SUPPLIER_ID) {
        continue;
      }

      const categoryKey = getQuoteServiceCategoryKey(service);
      if (!map.has(categoryKey)) {
        map.set(categoryKey, service);
      }
    }

    return map;
  }, [services]);

  function toggleSelection(itemId: string) {
    setSelectedIds((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
    );
  }

  function toggleAll() {
    setSelectedIds((current) => (current.length === unresolvedItems.length ? [] : unresolvedItems.map((item) => item.id)));
  }

  async function handleApply() {
    if (selectedIds.length === 0) {
      setNotice({
        tone: 'error',
        title: 'No unresolved items selected',
        summary: 'Select at least one unresolved imported row before applying a cleanup action.',
      });
      return;
    }

    const selectedItems = unresolvedItems.filter((item) => selectedIds.includes(item.id));
    const selectedCategoryService = category ? importedServicesByCategory.get(category) : undefined;

    if (!dayId && !selectedCategoryService) {
      setNotice({
        tone: 'error',
        title: 'No cleanup change selected',
        summary: 'Choose a target day, a category, or both before applying unresolved cleanup.',
      });
      return;
    }

    setIsSubmitting(true);
    setNotice(null);

    let affectedCount = 0;
    let skippedCount = 0;

    try {
      await Promise.all(
        selectedItems.map(async (item) => {
          const body: Record<string, unknown> = {};

          if (dayId && item.itineraryId !== dayId) {
            body.itineraryId = dayId;
          }

          if (selectedCategoryService && item.service.id !== selectedCategoryService.id) {
            body.serviceId = selectedCategoryService.id;
          }

          if (Object.keys(body).length === 0) {
            skippedCount += 1;
            return;
          }

          const endpoint = optionId
            ? `${apiBaseUrl}/quotes/${quoteId}/options/${optionId}/items/${item.id}`
            : `${apiBaseUrl}/quotes/${quoteId}/items/${item.id}`;

          const response = await fetch(endpoint, {
            method: 'PATCH',
            headers: buildAuthHeaders({
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify(body),
          });

          if (!response.ok) {
            throw new Error(await getErrorMessage(response, 'Could not update unresolved imported items.'));
          }

          affectedCount += 1;
        }),
      );

      setNotice({
        tone: 'success',
        title: 'Unresolved cleanup applied',
        summary: `Updated unresolved imported rows in ${scopeLabel}.`,
        affectedCount,
        skippedCount,
      });
      setSelectedIds([]);
      router.refresh();
    } catch (caughtError) {
      setNotice({
        tone: 'error',
        title: 'Unresolved cleanup failed',
        summary: caughtError instanceof Error ? caughtError.message : 'Could not update unresolved imported items.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (unresolvedItems.length === 0) {
    return null;
  }

  return (
    <article className="workspace-section quote-unresolved-batch-tools">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Cleanup</p>
          <h3>Batch unresolved import cleanup</h3>
        </div>
        <span className="quote-ui-badge quote-ui-badge-info">{unresolvedItems.length} unresolved</span>
      </div>

      <p className="detail-copy">
        Batch-assign imported placeholder rows to a day, adjust their placeholder category, or do both before matching real supplier services.
      </p>

      <QuoteBulkActionNotice notice={notice} />

      <div className="quote-unresolved-batch-grid">
        <label className="field-label">
          Target day
          <select value={dayId} onChange={(event) => setDayId(event.target.value)}>
            <option value="">Keep current day</option>
            {days.map((day) => (
              <option key={day.id} value={day.id}>
                Day {day.dayNumber}: {day.title}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          Placeholder category
          <select value={category} onChange={(event) => setCategory(event.target.value as ServicePlannerCategory | '')}>
            <option value="">Keep current category</option>
            {CATEGORY_ORDER.map((categoryOption) => (
              <option key={categoryOption} value={categoryOption} disabled={!importedServicesByCategory.has(categoryOption)}>
                {categoryOption}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="quote-unresolved-batch-toolbar">
        <button type="button" className="secondary-button" onClick={toggleAll}>
          {selectedIds.length === unresolvedItems.length ? 'Clear selection' : 'Select all'}
        </button>
        <span className="detail-copy">{selectedIds.length} selected</span>
        <button type="button" className="secondary-button" disabled={isSubmitting} onClick={handleApply}>
          {isSubmitting ? 'Applying...' : 'Apply cleanup'}
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table quote-consistency-table">
          <thead>
            <tr>
              <th>Select</th>
              <th>Imported row</th>
              <th>Current day</th>
              <th>Current category</th>
            </tr>
          </thead>
          <tbody>
            {unresolvedItems.map((item) => {
              const currentDay = item.itineraryId ? days.find((day) => day.id === item.itineraryId) : null;
              const currentCategory = getQuoteServiceCategoryKey(item.service);
              return (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelection(item.id)}
                      aria-label={`Select ${item.service.name}`}
                    />
                  </td>
                  <td>
                    <strong>{item.service.name}</strong>
                  </td>
                  <td>{currentDay ? `Day ${currentDay.dayNumber}` : 'Unassigned'}</td>
                  <td>
                    <span className="quote-ui-badge quote-ui-badge-info">{currentCategory}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </article>
  );
}
