'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage, logFetchUrl } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { CurrencySelect } from '../../components/CurrencySelect';
import { type SupportedCurrency } from '../../lib/currencyOptions';
import { QuoteBulkActionNotice, type QuoteBulkActionNoticeState } from './QuoteBulkActionNotice';
import { QuotePricingFocus } from './quote-readiness';

type SupplierService = {
  id: string;
  supplierId?: string;
  name: string;
  category: string;
};

type QuoteItem = {
  id: string;
  totalCost: number;
  totalSell: number;
  currency: string;
  markupPercent: number;
  service: SupplierService;
};

type QuotePricingBulkToolsProps = {
  apiBaseUrl: string;
  quoteId: string;
  quoteItems: QuoteItem[];
  quoteOptions: Array<{
    id: string;
    name: string;
    quoteItems: QuoteItem[];
  }>;
  activeFilter: QuotePricingFocus;
  onFocusChange: (focus: QuotePricingFocus) => void;
  onRowsChanged: (itemIds: string[]) => void;
};

type PricingTargetItem = QuoteItem & {
  optionId?: string;
};

type BulkScope = 'current-slice' | 'missing-currency' | 'missing-sell' | 'missing-cost' | 'all-priced';
type MarkupScope = 'current-slice' | 'missing-sell' | 'zero-sell';

function isMissingCost(item: QuoteItem) {
  return item.totalCost <= 0;
}

function isMissingSell(item: QuoteItem) {
  return item.totalSell <= 0;
}

function isMissingCurrency(item: QuoteItem) {
  return !item.currency || !item.currency.trim();
}

function isNegativeMargin(item: QuoteItem) {
  return item.totalSell < item.totalCost;
}

function isLowMargin(item: QuoteItem) {
  if (item.totalSell <= 0 || item.totalCost <= 0) {
    return true;
  }

  const marginPercent = ((item.totalSell - item.totalCost) / item.totalSell) * 100;
  return marginPercent < 15;
}

function matchesPricingFocus(item: QuoteItem, focus: QuotePricingFocus) {
  if (focus === 'all') {
    return true;
  }

  if (focus === 'unpriced') {
    return isMissingCost(item) || isMissingSell(item);
  }

  if (focus === 'missing-cost') {
    return isMissingCost(item);
  }

  if (focus === 'missing-sell') {
    return isMissingSell(item);
  }

  if (focus === 'missing-currency') {
    return isMissingCurrency(item);
  }

  if (focus === 'margin-risk') {
    return (
      item.totalSell <= 0 ||
      isNegativeMargin(item) ||
      isLowMargin(item)
    );
  }

  return true;
}

function getCurrencyDefaults(items: PricingTargetItem[]) {
  const firstNonEmpty = items.find((item) => item.currency && item.currency.trim());
  return firstNonEmpty?.currency === 'EUR' || firstNonEmpty?.currency === 'JOD' || firstNonEmpty?.currency === 'USD'
    ? firstNonEmpty.currency
    : 'USD';
}

export function QuotePricingBulkTools({
  apiBaseUrl,
  quoteId,
  quoteItems,
  quoteOptions,
  activeFilter,
  onFocusChange,
  onRowsChanged,
}: QuotePricingBulkToolsProps) {
  const router = useRouter();
  const allItems = useMemo<PricingTargetItem[]>(
    () => [
      ...quoteItems,
      ...quoteOptions.flatMap((option) => option.quoteItems.map((item) => ({ ...item, optionId: option.id }))),
    ],
    [quoteItems, quoteOptions],
  );
  const [currencyScope, setCurrencyScope] = useState<BulkScope>('missing-currency');
  const [currencyCode, setCurrencyCode] = useState<SupportedCurrency>(() => getCurrencyDefaults(allItems));
  const [markupScope, setMarkupScope] = useState<MarkupScope>('missing-sell');
  const [markupPercent, setMarkupPercent] = useState('20');
  const [isApplyingCurrency, setIsApplyingCurrency] = useState(false);
  const [isApplyingMarkup, setIsApplyingMarkup] = useState(false);
  const [notice, setNotice] = useState<QuoteBulkActionNoticeState | null>(null);

  const focusCounts = useMemo(
    () => ({
      missingCost: allItems.filter((item) => isMissingCost(item)).length,
      missingSell: allItems.filter((item) => isMissingSell(item)).length,
      missingCurrency: allItems.filter((item) => isMissingCurrency(item)).length,
      unpriced: allItems.filter((item) => isMissingCost(item) || isMissingSell(item)).length,
    }),
    [allItems],
  );

  const currencyTargets = useMemo(() => {
    if (currencyScope === 'missing-currency') {
      return allItems.filter((item) => isMissingCurrency(item));
    }

    if (currencyScope === 'missing-sell') {
      return allItems.filter((item) => isMissingSell(item));
    }

    if (currencyScope === 'missing-cost') {
      return allItems.filter((item) => isMissingCost(item));
    }

    if (currencyScope === 'all-priced') {
      return allItems.filter((item) => item.totalCost > 0 || item.totalSell > 0);
    }

    return allItems.filter((item) => matchesPricingFocus(item, activeFilter));
  }, [activeFilter, allItems, currencyScope]);

  const markupTargets = useMemo(() => {
    const baseTargets =
      markupScope === 'missing-sell'
        ? allItems.filter((item) => isMissingSell(item))
        : markupScope === 'zero-sell'
          ? allItems.filter((item) => item.totalSell <= 0)
          : allItems.filter((item) => matchesPricingFocus(item, activeFilter));

    return baseTargets.filter((item) => item.totalCost > 0);
  }, [activeFilter, allItems, markupScope]);

  async function patchItems(
    targets: PricingTargetItem[],
    buildBody: (item: PricingTargetItem) => Record<string, unknown>,
    fallbackError: string,
  ) {
    const results = await Promise.all(
      targets.map(async (item) => {
        const endpoint = item.optionId
          ? `${apiBaseUrl}/quotes/${quoteId}/options/${item.optionId}/items/${item.id}`
          : `${apiBaseUrl}/quotes/${quoteId}/items/${item.id}`;

        const response = await fetch(logFetchUrl(endpoint), {
          method: 'PATCH',
          headers: buildAuthHeaders({
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify(buildBody(item)),
        });

        if (!response.ok) {
          throw new Error(await getErrorMessage(response, fallbackError));
        }

        return item.id;
      }),
    );

    return results;
  }

  async function handleCurrencyApply() {
    const normalizedCurrency = currencyCode;
    const compatibleTargets = currencyTargets.filter((item) => item.currency.trim().toUpperCase() !== normalizedCurrency);
    const skippedCount = currencyTargets.length - compatibleTargets.length;

    if (compatibleTargets.length === 0) {
      setNotice({
        tone: 'success',
        title: 'No currency updates needed',
        summary: 'All targeted pricing rows already use that currency.',
        affectedCount: 0,
        skippedCount,
      });
      return;
    }

    setIsApplyingCurrency(true);
    setNotice(null);

    try {
      const updatedItemIds = await patchItems(
        compatibleTargets,
        () => ({ currency: normalizedCurrency }),
        'Could not bulk update currency.',
      );

      onRowsChanged(updatedItemIds);
      setNotice({
        tone: 'success',
        title: 'Currency applied',
        summary: `Applied ${normalizedCurrency} across the targeted pricing rows.`,
        affectedCount: updatedItemIds.length,
        skippedCount,
      });
      router.refresh();
    } catch (caughtError) {
      setNotice({
        tone: 'error',
        title: 'Currency update failed',
        summary: caughtError instanceof Error ? caughtError.message : 'Could not bulk update currency.',
      });
    } finally {
      setIsApplyingCurrency(false);
    }
  }

  async function handleMarkupApply() {
    const normalizedMarkup = Number(markupPercent);

    if (!Number.isFinite(normalizedMarkup) || normalizedMarkup < 0) {
      setNotice({
        tone: 'error',
        title: 'Markup is invalid',
        summary: 'Enter a markup percentage of 0 or greater before applying defaults.',
      });
      return;
    }

    const compatibleTargets = markupTargets.filter((item) => Math.abs(item.markupPercent - normalizedMarkup) > 0.01);
    const skippedCount = markupTargets.length - compatibleTargets.length;

    if (compatibleTargets.length === 0) {
      setNotice({
        tone: 'success',
        title: 'No markup updates needed',
        summary: 'All targeted pricing rows already use that markup or are not compatible.',
        affectedCount: 0,
        skippedCount,
      });
      return;
    }

    setIsApplyingMarkup(true);
    setNotice(null);

    try {
      const updatedItemIds = await patchItems(
        compatibleTargets,
        () => ({ markupPercent: normalizedMarkup }),
        'Could not bulk apply markup defaults.',
      );

      onRowsChanged(updatedItemIds);
      setNotice({
        tone: 'success',
        title: 'Markup defaults applied',
        summary: `Applied ${normalizedMarkup.toFixed(2)}% markup to compatible pricing rows.`,
        affectedCount: updatedItemIds.length,
        skippedCount,
      });
      router.refresh();
    } catch (caughtError) {
      setNotice({
        tone: 'error',
        title: 'Markup update failed',
        summary: caughtError instanceof Error ? caughtError.message : 'Could not bulk apply markup defaults.',
      });
    } finally {
      setIsApplyingMarkup(false);
    }
  }

  return (
    <article className="workspace-section quote-pricing-bulk-tools">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Bulk Pricing Assist</p>
          <h2>Commercial cleanup tools</h2>
        </div>
      </div>

      <p className="detail-copy">
        Use focused slices for missing sell, cost, and currency first, then apply safe bulk fixes where the current pricing setup allows it.
      </p>

      <div className="quote-bulk-focus-links">
        <button
          type="button"
          className={`secondary-button${activeFilter === 'unpriced' ? ' operations-filter-chip-active' : ''}`}
          onClick={() => onFocusChange('unpriced')}
        >
          Unpriced ({focusCounts.unpriced})
        </button>
        <button
          type="button"
          className={`secondary-button${activeFilter === 'missing-cost' ? ' operations-filter-chip-active' : ''}`}
          onClick={() => onFocusChange('missing-cost')}
        >
          Missing cost ({focusCounts.missingCost})
        </button>
        <button
          type="button"
          className={`secondary-button${activeFilter === 'missing-sell' ? ' operations-filter-chip-active' : ''}`}
          onClick={() => onFocusChange('missing-sell')}
        >
          Missing sell ({focusCounts.missingSell})
        </button>
        <button
          type="button"
          className={`secondary-button${activeFilter === 'missing-currency' ? ' operations-filter-chip-active' : ''}`}
          onClick={() => onFocusChange('missing-currency')}
        >
          Missing currency ({focusCounts.missingCurrency})
        </button>
      </div>

      <QuoteBulkActionNotice notice={notice} />

      <div className="quote-pricing-bulk-grid">
        <section className="quote-pricing-bulk-card">
          <div>
            <p className="eyebrow">Currency</p>
            <h3>Apply one currency</h3>
          </div>
          <label className="field-label">
            Scope
            <select value={currencyScope} onChange={(event) => setCurrencyScope(event.target.value as BulkScope)}>
              <option value="missing-currency">Missing currency only</option>
              <option value="current-slice">Current pricing slice</option>
              <option value="missing-sell">Rows missing sell</option>
              <option value="missing-cost">Rows missing cost</option>
              <option value="all-priced">All priced rows</option>
            </select>
          </label>
          <label className="field-label">
            Currency
            <CurrencySelect value={currencyCode} onChange={(value) => setCurrencyCode((value || 'USD') as SupportedCurrency)} required />
          </label>
          <div className="workspace-stat-list">
            <div>
              <span>Target rows</span>
              <strong>{currencyTargets.length}</strong>
            </div>
          </div>
          <button type="button" className="secondary-button" disabled={isApplyingCurrency} onClick={handleCurrencyApply}>
            {isApplyingCurrency ? 'Applying...' : 'Apply currency'}
          </button>
        </section>

        <section className="quote-pricing-bulk-card">
          <div>
            <p className="eyebrow">Markup</p>
            <h3>Apply default markup</h3>
          </div>
          <label className="field-label">
            Scope
            <select value={markupScope} onChange={(event) => setMarkupScope(event.target.value as MarkupScope)}>
              <option value="missing-sell">Rows missing sell</option>
              <option value="current-slice">Current pricing slice</option>
              <option value="zero-sell">Zero-sell rows</option>
            </select>
          </label>
          <label className="field-label">
            Markup %
            <input value={markupPercent} onChange={(event) => setMarkupPercent(event.target.value)} inputMode="decimal" />
          </label>
          <div className="workspace-stat-list">
            <div>
              <span>Compatible rows</span>
              <strong>{markupTargets.length}</strong>
            </div>
          </div>
          <button type="button" className="secondary-button" disabled={isApplyingMarkup} onClick={handleMarkupApply}>
            {isApplyingMarkup ? 'Applying...' : 'Apply markup default'}
          </button>
        </section>
      </div>
    </article>
  );
}
