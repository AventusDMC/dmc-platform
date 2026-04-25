'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage, logFetchUrl } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { QuoteBulkActionNotice, type QuoteBulkActionNoticeState } from './QuoteBulkActionNotice';
import { getQuoteServiceCategoryKey } from './quote-readiness';

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
  service: SupplierService;
};

type QuoteTransportBulkAssignProps = {
  apiBaseUrl: string;
  quoteId: string;
  services: SupplierService[];
  quoteItems: QuoteItem[];
  quoteOptions: Array<{
    id: string;
    name: string;
    quoteItems: QuoteItem[];
  }>;
};

type ScopeMode = 'unassigned-only' | 'all-transport';

type TargetItem = {
  id: string;
  optionId?: string;
  service: SupplierService;
};

const IMPORTED_SERVICE_SUPPLIER_ID = 'import-itinerary-system';

export function QuoteTransportBulkAssign({
  apiBaseUrl,
  quoteId,
  services,
  quoteItems,
  quoteOptions,
}: QuoteTransportBulkAssignProps) {
  const router = useRouter();
  const [scopeMode, setScopeMode] = useState<ScopeMode>('unassigned-only');
  const [serviceId, setServiceId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<QuoteBulkActionNoticeState | null>(null);

  const transportServices = useMemo(
    () =>
      services.filter(
        (service) =>
          getQuoteServiceCategoryKey(service) === 'transport' && service.supplierId !== IMPORTED_SERVICE_SUPPLIER_ID,
      ),
    [services],
  );

  const targetItems = useMemo<TargetItem[]>(() => {
    const baseItems = quoteItems.map((item) => ({ id: item.id, service: item.service }));
    const optionItems = quoteOptions.flatMap((option) =>
      option.quoteItems.map((item) => ({
        id: item.id,
        optionId: option.id,
        service: item.service,
      })),
    );

    return [...baseItems, ...optionItems].filter((item) => {
      if (getQuoteServiceCategoryKey(item.service) !== 'transport') {
        return false;
      }

      if (scopeMode === 'unassigned-only') {
        return item.service.supplierId === IMPORTED_SERVICE_SUPPLIER_ID;
      }

      return true;
    });
  }, [quoteItems, quoteOptions, scopeMode]);

  const selectedService = transportServices.find((service) => service.id === serviceId) || transportServices[0] || null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedService || targetItems.length === 0) {
      return;
    }

    setIsSubmitting(true);
    setNotice(null);

    try {
      await Promise.all(
        targetItems.map(async (item) => {
          const endpoint = item.optionId
            ? `${apiBaseUrl}/quotes/${quoteId}/options/${item.optionId}/items/${item.id}`
            : `${apiBaseUrl}/quotes/${quoteId}/items/${item.id}`;
          const response = await fetch(logFetchUrl(endpoint), {
            method: 'PATCH',
            headers: buildAuthHeaders({
              'Content-Type': 'application/json',
            }),
            body: JSON.stringify({ serviceId: selectedService.id }),
          });

          if (!response.ok) {
            throw new Error(await getErrorMessage(response, 'Could not bulk assign transport service.'));
          }
        }),
      );

      setNotice({
        tone: 'success',
        title: 'Transport supplier assignment applied',
        summary: `Assigned ${selectedService.name} to ${targetItems.length} transport row${targetItems.length === 1 ? '' : 's'}.`,
        affectedCount: targetItems.length,
        skippedCount: 0,
      });
      router.refresh();
    } catch (caughtError) {
      setNotice({
        tone: 'error',
        title: 'Transport assignment failed',
        summary: caughtError instanceof Error ? caughtError.message : 'Could not bulk assign transport service.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article className="workspace-section">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Bulk Action</p>
          <h2>Transport supplier assignment</h2>
        </div>
      </div>
      <p className="detail-copy">
        Apply one transport catalog service across matching transport rows to clear repeated supplier assignment work.
      </p>

      <form className="section-stack" onSubmit={handleSubmit}>
        <div className="support-text-grid">
          <label className="field-label">
            Scope
            <select value={scopeMode} onChange={(event) => setScopeMode(event.target.value as ScopeMode)}>
              <option value="unassigned-only">Only unassigned transport rows</option>
              <option value="all-transport">All transport rows in quote and options</option>
            </select>
          </label>
          <label className="field-label">
            Transport service
            <select value={serviceId} onChange={(event) => setServiceId(event.target.value)} disabled={transportServices.length === 0}>
              {transportServices.length === 0 ? <option value="">No transport services available</option> : null}
              {transportServices.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="quote-preview-total-list">
          <div>
            <span>Target rows</span>
            <strong>{targetItems.length}</strong>
          </div>
          <div>
            <span>Mode</span>
            <strong>{scopeMode === 'unassigned-only' ? 'Unassigned only' : 'All transport'}</strong>
          </div>
          <div>
            <span>Selected service</span>
            <strong>{selectedService?.name || 'Select a transport service'}</strong>
          </div>
        </div>

        <QuoteBulkActionNotice notice={notice} />

        <div>
          <button
            type="submit"
            className="secondary-button"
            disabled={isSubmitting || !selectedService || targetItems.length === 0}
          >
            {isSubmitting ? 'Applying...' : 'Apply transport service'}
          </button>
        </div>
      </form>
    </article>
  );
}
