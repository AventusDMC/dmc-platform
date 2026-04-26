type QuoteSummaryItem = {
  id: string;
  itineraryId?: string | null;
  serviceDate?: string | null;
  finalCost?: number | null;
  totalCost?: number | null;
  currency?: string | null;
  service: {
    name: string;
  };
};

type QuoteSummaryPanelProps = {
  items?: QuoteSummaryItem[] | null;
  totalCost?: number | null;
  totalSell?: number | null;
  pax?: number | null;
  currency?: string | null;
};

function formatMoney(value: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || 'USD'} ${value.toFixed(2)}`;
  }
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return '0.00%';
  }

  return `${value.toFixed(2)}%`;
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

  const safeTotalCost = Number(totalCost || 0);
  const safeTotalSell = Number(totalSell || 0);
  const safePax = Math.max(0, Number(pax || 0));
  const marginPercent = safeTotalCost > 0 ? ((safeTotalSell - safeTotalCost) / safeTotalCost) * 100 : 0;
  const pricePerPax = safePax > 0 ? safeTotalSell / safePax : 0;
  const groupedItems = groupItemsByDay(items);

  return (
    <article className="detail-card">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Quote Summary</p>
          <h3>Pricing summary</h3>
        </div>
      </div>

      <div className="quote-preview-total-list">
        <div>
          <span>Total Sell</span>
          <strong>{formatMoney(safeTotalSell, currency || 'USD')}</strong>
        </div>
        <div>
          <span>Total Cost</span>
          <strong>{formatMoney(safeTotalCost, currency || 'USD')}</strong>
        </div>
        <div>
          <span>Margin %</span>
          <strong>{formatPercent(marginPercent)}</strong>
        </div>
        <div>
          <span>Price per Pax</span>
          <strong>{formatMoney(pricePerPax, currency || 'USD')}</strong>
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

                  return (
                    <div key={item.id}>
                      <span>{item.service.name}</span>
                      <strong>{formatMoney(itemCost, item.currency || currency || 'USD')}</strong>
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </article>
  );
}
