import { getQuoteItemOriginAwareExcursionName } from './excursion-origin-display';

type QuoteSummaryItem = {
  id: string;
  itineraryId?: string | null;
  serviceDate?: string | null;
  finalCost?: number | null;
  totalCost?: number | null;
  totalSell?: number | null;
  currency?: string | null;
  service: {
    name: string;
    category?: string | null;
  };
  overrideReason?: string | null;
  touringRoute?: {
    name?: string | null;
    startCity?: string | null;
  } | null;
};

type QuoteSummaryPanelProps = {
  items?: QuoteSummaryItem[] | null;
  totalCost?: number | null;
  totalSell?: number | null;
  pax?: number | null;
  currency?: string | null;
};

function formatMoney(value: number | null | undefined, currency = 'USD') {
  const numericValue = Number(value);
  const safeValue = Number.isFinite(numericValue) ? numericValue : 0;

  return `${currency || 'USD'} ${safeValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number | null | undefined) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return '0.00%';
  }

  return `${numericValue.toFixed(2)}%`;
}

function formatDayLabel(key: string, fallbackIndex: number) {
  if (key.startsWith('date:')) {
    const value = key.slice(5);
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return `Day ${fallbackIndex + 1} - ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date)}`;
    }
  }

  if (key.startsWith('itinerary:')) {
    return `Day ${fallbackIndex + 1}`;
  }

  return 'Unassigned services';
}

function getGroupKey(item: QuoteSummaryItem) {
  if (item.serviceDate) {
    return `date:${item.serviceDate.slice(0, 10)}`;
  }

  if (item.itineraryId) {
    return `itinerary:${item.itineraryId}`;
  }

  return 'unassigned';
}

function groupItemsByDay(items: QuoteSummaryItem[]) {
  const groups = new Map<string, QuoteSummaryItem[]>();

  for (const item of items) {
    const key = getGroupKey(item);
    groups.set(key, [...(groups.get(key) || []), item]);
  }

  return [...groups.entries()].sort(([left], [right]) => {
    if (left === 'unassigned') return 1;
    if (right === 'unassigned') return -1;
    return left.localeCompare(right);
  });
}

export function QuoteSummaryPanel({ items, totalCost, totalSell, pax, currency = 'USD' }: QuoteSummaryPanelProps) {
  if (!items) {
    return (
      <article className="detail-card">
        <p className="eyebrow">Quote Summary</p>
        <p className="detail-copy">Loading quote pricing summary...</p>
      </article>
    );
  }

  const safeTotalCost = Number.isFinite(Number(totalCost)) ? Number(totalCost) : 0;
  const safeTotalSell = Number.isFinite(Number(totalSell)) ? Number(totalSell) : 0;
  const safePax = Math.max(0, Number.isFinite(Number(pax)) ? Number(pax) : 0);
  const profit = safeTotalSell - safeTotalCost;
  const marginPercent = safeTotalSell > 0 ? (profit / safeTotalSell) * 100 : 0;
  const pricePerPax = safePax > 0 ? safeTotalSell / safePax : 0;
  const groupedItems = groupItemsByDay(items);
  const getDisplayName = (item: QuoteSummaryItem) =>
    item.touringRoute
      ? getQuoteItemOriginAwareExcursionName({
          serviceName: item.service.name,
          overrideReason: item.overrideReason,
          touringRoute: item.touringRoute,
        })
      : item.service.name;

  return (
    <article className="detail-card quote-commercial-summary-panel">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Commercial Summary</p>
          <h3>Operator and client views</h3>
        </div>
      </div>

      <div className="quote-commercial-metric-grid">
        <div>
          <span>Total cost</span>
          <strong>{formatMoney(safeTotalCost, currency || 'USD')}</strong>
        </div>
        <div>
          <span>Total sell</span>
          <strong>{formatMoney(safeTotalSell, currency || 'USD')}</strong>
        </div>
        <div>
          <span>Profit</span>
          <strong>{formatMoney(profit, currency || 'USD')}</strong>
        </div>
        <div>
          <span>Margin</span>
          <strong>{formatPercent(marginPercent)}</strong>
        </div>
        <div>
          <span>Price per pax</span>
          <strong>{formatMoney(pricePerPax, currency || 'USD')}</strong>
        </div>
      </div>

      <div className="quote-commercial-view-grid">
        <section className="quote-commercial-view-card quote-commercial-view-card-internal">
          <div className="workspace-section-head quote-service-group-head">
            <div>
              <p className="eyebrow">Operator / Internal Cost View</p>
              <h4>Cost, sell, and profit control</h4>
            </div>
          </div>
          <div className="quote-preview-total-list">
            <div>
              <span>Total cost</span>
              <strong>{formatMoney(safeTotalCost, currency || 'USD')}</strong>
            </div>
            <div>
              <span>Total sell</span>
              <strong>{formatMoney(safeTotalSell, currency || 'USD')}</strong>
            </div>
            <div>
              <span>Profit</span>
              <strong>{formatMoney(profit, currency || 'USD')}</strong>
            </div>
            <div>
              <span>Margin</span>
              <strong>{formatPercent(marginPercent)}</strong>
            </div>
          </div>

          <div className="section-stack">
            {groupedItems.length === 0 ? (
              <p className="detail-copy">No services have been added yet.</p>
            ) : (
              groupedItems.map(([key, dayItems], index) => (
                <section key={key} className="quote-service-category-group">
                  <div className="workspace-section-head quote-service-group-head">
                    <div>
                      <h4>{formatDayLabel(key, index)}</h4>
                    </div>
                    <span className="page-tab-badge">{dayItems.length}</span>
                  </div>
                  <div className="quote-preview-total-list">
                    {dayItems.map((item) => {
                      const itemCost = Number(item.finalCost ?? item.totalCost ?? 0);
                      const itemSell = Number(item.totalSell ?? 0);

                      return (
                        <div key={item.id}>
                          <span>{getDisplayName(item)}</span>
                          <strong>{formatMoney(itemCost, item.currency || currency || 'USD')}</strong>
                          <em>{formatMoney(itemSell, item.currency || currency || 'USD')} sell</em>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        </section>

        <section className="quote-commercial-view-card quote-commercial-view-card-client">
          <div className="workspace-section-head quote-service-group-head">
            <div>
              <p className="eyebrow">Client Proposal / Sell View</p>
              <h4>Client-safe commercial view</h4>
            </div>
          </div>
          <div className="quote-preview-total-list">
            <div>
              <span>Total package price</span>
              <strong>{formatMoney(safeTotalSell, currency || 'USD')}</strong>
            </div>
            <div>
              <span>Price per pax</span>
              <strong>{formatMoney(pricePerPax, currency || 'USD')}</strong>
            </div>
            <div>
              <span>Passengers</span>
              <strong>{safePax > 0 ? `${safePax} pax` : 'Pax to confirm'}</strong>
            </div>
          </div>
          <div className="section-stack">
            {groupedItems.length === 0 ? (
              <p className="detail-copy">No proposal services have been added yet.</p>
            ) : (
              groupedItems.map(([key, dayItems], index) => (
                <section key={key} className="quote-service-category-group">
                  <div className="workspace-section-head quote-service-group-head">
                    <div>
                      <h4>{formatDayLabel(key, index)}</h4>
                    </div>
                    <span className="page-tab-badge">{dayItems.length}</span>
                  </div>
                  <div className="quote-client-sell-list">
                    {dayItems.map((item) => (
                      <div key={item.id}>
                        <span>{getDisplayName(item)}</span>
                        <strong>{formatMoney(Number(item.totalSell ?? 0), item.currency || currency || 'USD')}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
            <p className="detail-copy">Internal costing stays in the operator view only.</p>
          </div>
        </section>
      </div>
    </article>
  );
}
