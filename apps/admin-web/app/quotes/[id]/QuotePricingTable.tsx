'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdvancedFiltersPanel } from '../../components/AdvancedFiltersPanel';
import { CompactFilterBar } from '../../components/CompactFilterBar';
import { InlineEntityActions } from '../../components/InlineEntityActions';
import { InlineRowEditorShell } from '../../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../../components/RowDetailsPanel';
import { TableSectionShell } from '../../components/TableSectionShell';
import { getMarginColor, getMarginMetrics } from '../../lib/financials';
import { HotelCategoryOption } from '../../lib/hotelCategories';
import { QuoteOptionsForm } from './QuoteOptionsForm';
import { QuotePricingBulkTools } from './QuotePricingBulkTools';
import { QuotePricingFocus } from './quote-readiness';

type PromotionExplanationItem =
  | string
  | {
      id?: string | null;
      name: string;
      effect?: string | null;
      type?: string | null;
      minStay?: string | number | null;
      boardBasis?: string | null;
    };

type QuoteItem = {
  id: string;
  paxCount: number | null;
  totalCost: number;
  baseSell?: number | null;
  totalSell: number;
  currency: string;
  markupPercent: number;
  promotionExplanation?: PromotionExplanationItem[] | null;
  service: {
    id: string;
    name: string;
    category: string;
    supplierId?: string;
  };
};

type QuoteOption = {
  id: string;
  name: string;
  notes: string | null;
  hotelCategoryId: string | null;
  hotelCategory: HotelCategoryOption | null;
  pricingMode: 'itemized' | 'package';
  packageMarginPercent: number | null;
  totalCost: number;
  totalSell: number;
  pricePerPax: number;
  quoteItems: QuoteItem[];
};

type QuoteScenario = {
  id: string;
  paxCount: number;
  totalCost: number;
  totalSell: number;
  pricePerPax: number;
};

type QuotePricingSlab = {
  id: string;
  minPax: number;
  maxPax: number | null;
  price: number;
  actualPax?: number;
  focPax?: number;
  payingPax?: number;
  totalCost?: number;
  totalSell?: number;
  pricePerPayingPax?: number;
  pricePerActualPax?: number | null;
  notes?: string | null;
};

type QuotePricingTableProps = {
  apiBaseUrl: string;
  quoteId: string;
  hotelCategories: HotelCategoryOption[];
  totalPax: number;
  initialFocus?: QuotePricingFocus;
  groupPricingHref: string;
  servicesHref: string;
  previewHref: string;
  quote: {
    pricingMode: 'SLAB' | 'FIXED';
    pricingType: 'simple' | 'group';
    fixedPricePerPerson: number;
    totalCost: number;
    totalSell: number;
    pricePerPax: number;
    quoteItems: QuoteItem[];
    quoteOptions: QuoteOption[];
    pricingSlabs: QuotePricingSlab[];
    scenarios: QuoteScenario[];
  };
  focImpactLabel: string;
  supplementsImpactLabel: string;
};

type PricingFilter = QuotePricingFocus;

type PricingRow =
  | {
      id: string;
      type: 'base';
      label: string;
      description: string;
      totalCost: number;
      totalSell: number;
      pricePerPax: number;
      issueMessages: string[];
      hasPromotions: boolean;
      itemIds: string[];
      detail: React.ReactNode;
    }
  | {
      id: string;
      type: 'option';
      label: string;
      description: string;
      totalCost: number;
      totalSell: number;
      pricePerPax: number;
      issueMessages: string[];
      hasPromotions: boolean;
      itemIds: string[];
      detail: React.ReactNode;
    }
  | {
      id: string;
      type: 'model';
      label: string;
      description: string;
      totalCost: number;
      totalSell: number;
      pricePerPax: number;
      issueMessages: string[];
      hasPromotions: boolean;
      itemIds: string[];
      detail: React.ReactNode;
    };

function formatMoney(value: number, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency && currency.trim() ? currency : 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  }
}

function formatMoneyOrPending(value: number | null | undefined, currency = 'USD') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return 'Pricing to be confirmed';
  }

  return formatMoney(value, currency);
}

function hasMissingRowPricing(row: PricingRow) {
  return (
    row.issueMessages.some((issue) => issue.includes('Missing price')) ||
    row.issueMessages.some((issue) => issue.includes('Missing cost')) ||
    row.issueMessages.some((issue) => issue.includes('Missing sell')) ||
    row.issueMessages.some((issue) => issue.includes('Missing currency')) ||
    row.issueMessages.some((issue) => issue.includes('Zero sell'))
  );
}

function buildServiceCostBreakdown(items: QuoteItem[]) {
  const grouped = new Map<
    string,
    {
      key: string;
      label: string;
      currency: string;
      itemCount: number;
      totalCost: number;
      totalSell: number;
    }
  >();

  items.forEach((item) => {
    const key = `${item.service.id}:${item.currency}`;
    const existing = grouped.get(key);

    if (existing) {
      existing.itemCount += 1;
      existing.totalCost += item.totalCost;
      existing.totalSell += item.totalSell;
      return;
    }

    grouped.set(key, {
      key,
      label: item.service.name,
      currency: item.currency,
      itemCount: 1,
      totalCost: item.totalCost,
      totalSell: item.totalSell,
    });
  });

  return Array.from(grouped.values()).map((row) => {
    const marginMetrics = getMarginMetrics(row.totalSell, row.totalCost);

    return {
      ...row,
      marginAmount: marginMetrics.margin,
      marginPercent: marginMetrics.marginPercent,
      tone: marginMetrics.tone,
    };
  });
}

function renderBreakdownTable(items: QuoteItem[]) {
  const breakdown = buildServiceCostBreakdown(items);

  if (breakdown.length === 0) {
    return <p className="empty-state">No pricing components added yet.</p>;
  }

  return (
    <div className="internal-costing-table-wrap">
      <table className="internal-costing-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>Items</th>
            <th>Cost</th>
            <th>Sell</th>
            <th>Margin</th>
            <th>Margin %</th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td>{row.itemCount}</td>
              <td>{formatMoneyOrPending(row.totalCost, row.currency)}</td>
              <td>{formatMoneyOrPending(row.totalSell, row.currency)}</td>
              <td>{row.totalCost > 0 && row.totalSell > 0 ? formatMoney(row.marginAmount, row.currency) : 'Pricing to be confirmed'}</td>
              <td style={{ color: getMarginColor(row.tone) }}>{row.totalCost > 0 && row.totalSell > 0 ? `${row.marginPercent.toFixed(2)}%` : 'Pending'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type PromotionDisplayLine = {
  id?: string | null;
  name: string;
  effect: string | null;
  type?: string | null;
  minStay?: string | number | null;
  boardBasis?: string | null;
};

function uniquePromotions(promos: PromotionDisplayLine[]) {
  const unique = new Map<string, PromotionDisplayLine>();

  promos.forEach((promo) => {
    const key = promo.id ?? [promo.name, promo.effect ?? '', promo.type ?? '', promo.minStay ?? '', promo.boardBasis ?? ''].join('|');

    if (!unique.has(key)) {
      unique.set(key, promo);
    }
  });

  return Array.from(unique.values());
}

function toPromotionDisplayLine(promo: PromotionExplanationItem): PromotionDisplayLine {
  if (typeof promo === 'string') {
    return {
      id: null,
      name: promo,
      effect: null,
    };
  }

  return {
    id: promo.id ?? null,
    name: promo.name,
    effect: promo.effect ?? null,
    type: promo.type ?? null,
    minStay: promo.minStay ?? null,
    boardBasis: promo.boardBasis ?? null,
  };
}

function normalizePromos(promos: PromotionExplanationItem[] | null | undefined) {
  if (!Array.isArray(promos) || promos.length === 0) {
    return [];
  }

  return promos.map((promo) => toPromotionDisplayLine(promo));
}

function sortPromos(promos: PromotionDisplayLine[]) {
  return [...promos].sort((left, right) => {
    const nameComparison = left.name.localeCompare(right.name);

    if (nameComparison !== 0) {
      return nameComparison;
    }

    return (left.effect ?? '').localeCompare(right.effect ?? '');
  });
}

function getResolvedBaseSell(item: QuoteItem) {
  return typeof item.baseSell === 'number' ? item.baseSell : item.totalSell;
}

function hasPromotion(item: QuoteItem) {
  return Array.isArray(item.promotionExplanation) && item.promotionExplanation.length > 0;
}

function hasDiscountImpact(item: QuoteItem) {
  return (
    hasPromotion(item) &&
    typeof item.baseSell === 'number' &&
    typeof item.totalSell === 'number' &&
    item.totalSell < item.baseSell
  );
}

function hasRowPromotion(items?: QuoteItem[] | null) {
  return items?.some((child) => hasPromotion(child)) ?? false;
}

function renderPromotionsSection(items: QuoteItem[]) {
  const itemsWithPromotions = items.filter((item) => hasPromotion(item));
  const discountedItems = items.filter((item) => hasDiscountImpact(item));
  const nonDiscountedPromotionItems = itemsWithPromotions.filter((item) => !hasDiscountImpact(item));
  const currency = items[0]?.currency ?? 'USD';
  const baseSell = items.reduce((sum, item) => sum + getResolvedBaseSell(item), 0);
  const finalSell = items.reduce((sum, item) => sum + item.totalSell, 0);
  const discount = discountedItems.reduce((sum, item) => sum + Math.max(getResolvedBaseSell(item) - item.totalSell, 0), 0);
  const discountPromos = sortPromos(uniquePromotions(normalizePromos(discountedItems.flatMap((item) => item.promotionExplanation ?? []))));
  const nonPricePromos = sortPromos(
    uniquePromotions(normalizePromos(nonDiscountedPromotionItems.flatMap((item) => item.promotionExplanation ?? []))),
  );

  return (
    <InlineRowEditorShell>
      <div className="section-stack">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Promotions Applied</p>
            <h3>Applied promotions</h3>
          </div>
        </div>
        <div className="quote-preview-total-list">
          <div>
            <span>Base Sell</span>
            <strong>{formatMoney(baseSell, currency)}</strong>
          </div>
          <div>
            <span>Promotions Applied</span>
            <strong>{itemsWithPromotions.length > 0 ? itemsWithPromotions.length : 'No promotions applied'}</strong>
          </div>
          <div>
            <span>Final Sell</span>
            <strong>{formatMoney(finalSell, currency)}</strong>
          </div>
          <div>
            <span>Discount</span>
            <strong>{discount > 0 ? formatMoney(discount, currency) : 'No discount impact'}</strong>
          </div>
        </div>
        {discountPromos.length === 0 && nonPricePromos.length === 0 ? (
          <p className="empty-state">No promotions applied</p>
        ) : (
          <div className="section-stack">
            {discountPromos.length > 0 ? (
              <div className="section-stack">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Discount Applied</p>
                    <h3>Price-reducing promotions</h3>
                  </div>
                </div>
                <div className="table-subcopy">{formatMoney(discount, currency)} total discount</div>
                {discountPromos.map((promotion, index) => (
                  <div key={`discount-${promotion.name}-${index}`} className="table-subcopy">
                    {promotion.name}
                  </div>
                ))}
              </div>
            ) : null}
            {nonPricePromos.length > 0 ? (
              <div className="section-stack">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Other Promotions</p>
                    <h3>Non-price promotions</h3>
                  </div>
                </div>
                {nonPricePromos.map((promotion, index) => (
                  <div key={`other-${promotion.name}-${index}`} className="table-subcopy">
                    {promotion.name}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </InlineRowEditorShell>
  );
}

function countItemsMissingPrice(items: QuoteItem[]) {
  return items.filter((item) => item.totalCost <= 0 || item.totalSell <= 0 || !item.paxCount).length;
}

function countItemsMissingCost(items: QuoteItem[]) {
  return items.filter((item) => item.totalCost <= 0).length;
}

function countItemsMissingSell(items: QuoteItem[]) {
  return items.filter((item) => item.totalSell <= 0).length;
}

function countItemsMissingSupplier(items: QuoteItem[]) {
  return items.filter((item) => item.service.supplierId === 'import-itinerary-system').length;
}

function countItemsZeroSell(items: QuoteItem[]) {
  return items.filter((item) => item.totalSell <= 0).length;
}

function countItemsNegativeMargin(items: QuoteItem[]) {
  return items.filter((item) => item.totalSell < item.totalCost).length;
}

function countItemsLowMargin(items: QuoteItem[]) {
  return items.filter((item) => {
    if (item.totalSell <= 0 || item.totalCost <= 0 || item.totalSell <= item.totalCost) {
      return false;
    }

    const marginPercent = ((item.totalSell - item.totalCost) / item.totalSell) * 100;
    return marginPercent < 15;
  }).length;
}

function countItemsMissingCurrency(items: QuoteItem[]) {
  return items.filter((item) => !item.currency || !item.currency.trim()).length;
}

function isLowMargin(totalSell: number, totalCost: number) {
  return getMarginMetrics(totalSell, totalCost).tone !== 'positive';
}

function getIssueTone(issueMessages: string[]) {
  if (issueMessages.length === 0) {
    return 'success';
  }

  if (issueMessages.some((issue) => issue.includes('Missing price'))) {
    return 'error';
  }

  return 'warning';
}

export function QuotePricingTable({
  apiBaseUrl,
  quoteId,
  hotelCategories,
  totalPax,
  initialFocus = 'all',
  groupPricingHref,
  servicesHref,
  previewHref,
  quote,
  focImpactLabel,
  supplementsImpactLabel,
}: QuotePricingTableProps) {
  const [activeFilter, setActiveFilter] = useState<PricingFilter>(initialFocus);
  const [highlightedItemIds, setHighlightedItemIds] = useState<string[]>([]);

  useEffect(() => {
    setActiveFilter(initialFocus);
  }, [initialFocus]);

  useEffect(() => {
    if (highlightedItemIds.length === 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setHighlightedItemIds([]);
    }, 2600);

    return () => window.clearTimeout(timeout);
  }, [highlightedItemIds]);

  const rows = useMemo<PricingRow[]>(() => {
    const baseMissingPriceCount = countItemsMissingPrice(quote.quoteItems);
    const baseMissingCostCount = countItemsMissingCost(quote.quoteItems);
    const baseMissingSellCount = countItemsMissingSell(quote.quoteItems);
    const baseMissingSupplierCount = countItemsMissingSupplier(quote.quoteItems);
    const baseZeroSellCount = countItemsZeroSell(quote.quoteItems);
    const baseNegativeMarginCount = countItemsNegativeMargin(quote.quoteItems);
    const baseLowMarginCount = countItemsLowMargin(quote.quoteItems);
    const baseMissingCurrencyCount = countItemsMissingCurrency(quote.quoteItems);
    const baseIssueMessages = [
      baseMissingPriceCount > 0 ? `${baseMissingPriceCount} services have Missing price.` : null,
      baseMissingCostCount > 0 ? `${baseMissingCostCount} services have Missing cost.` : null,
      baseMissingSellCount > 0 ? `${baseMissingSellCount} services have Missing sell.` : null,
      baseMissingSupplierCount > 0 ? `${baseMissingSupplierCount} services have Missing supplier.` : null,
      baseZeroSellCount > 0 ? `${baseZeroSellCount} services have Zero sell price.` : null,
      baseNegativeMarginCount > 0 ? `${baseNegativeMarginCount} services have Negative margin.` : null,
      baseLowMarginCount > 0 ? `${baseLowMarginCount} services have Low margin.` : null,
      baseMissingCurrencyCount > 0 ? `${baseMissingCurrencyCount} services have Missing currency.` : null,
      quote.totalSell <= quote.totalCost ? 'Low margin on base program.' : null,
      getMarginMetrics(quote.totalSell, quote.totalCost).tone === 'low' && quote.totalSell > quote.totalCost
        ? 'Low margin on base program.'
        : null,
    ].filter(Boolean) as string[];

    const optionRows: PricingRow[] = quote.quoteOptions.map((option) => {
      const optionMissingPriceCount = countItemsMissingPrice(option.quoteItems);
      const optionMissingCostCount = countItemsMissingCost(option.quoteItems);
      const optionMissingSellCount = countItemsMissingSell(option.quoteItems);
      const optionMissingSupplierCount = countItemsMissingSupplier(option.quoteItems);
      const optionZeroSellCount = countItemsZeroSell(option.quoteItems);
      const optionNegativeMarginCount = countItemsNegativeMargin(option.quoteItems);
      const optionLowMarginCount = countItemsLowMargin(option.quoteItems);
      const optionMissingCurrencyCount = countItemsMissingCurrency(option.quoteItems);
      const optionIssueMessages = [
        optionMissingPriceCount > 0 ? `${optionMissingPriceCount} services have Missing price.` : null,
        optionMissingCostCount > 0 ? `${optionMissingCostCount} services have Missing cost.` : null,
        optionMissingSellCount > 0 ? `${optionMissingSellCount} services have Missing sell.` : null,
        optionMissingSupplierCount > 0 ? `${optionMissingSupplierCount} services have Missing supplier.` : null,
        optionZeroSellCount > 0 ? `${optionZeroSellCount} services have Zero sell price.` : null,
        optionNegativeMarginCount > 0 ? `${optionNegativeMarginCount} services have Negative margin.` : null,
        optionLowMarginCount > 0 ? `${optionLowMarginCount} services have Low margin.` : null,
        optionMissingCurrencyCount > 0 ? `${optionMissingCurrencyCount} services have Missing currency.` : null,
        option.totalSell <= option.totalCost ? 'Low margin.' : null,
        getMarginMetrics(option.totalSell, option.totalCost).tone === 'low' && option.totalSell > option.totalCost
          ? 'Low margin.'
          : null,
      ].filter(Boolean) as string[];

      return {
        id: option.id,
        type: 'option',
        label: option.name,
        description: option.pricingMode === 'package' ? 'Package pricing option' : 'Itemized pricing option',
        totalCost: option.totalCost,
        totalSell: option.totalSell,
        pricePerPax: option.pricePerPax,
        issueMessages: optionIssueMessages,
        hasPromotions: hasRowPromotion(option.quoteItems),
        itemIds: option.quoteItems.map((item) => item.id),
        detail: (
          <div className="section-stack">
            <InlineRowEditorShell>
              <div className="quote-preview-total-list">
                <div>
                  <span>Pricing mode</span>
                  <strong>{option.pricingMode}</strong>
                </div>
                <div>
                  <span>Price per pax</span>
                  <strong>{formatMoneyOrPending(option.pricePerPax)}</strong>
                </div>
                <div>
                  <span>Package margin</span>
                  <strong>{option.packageMarginPercent === null ? 'Not set' : `${option.packageMarginPercent.toFixed(2)}%`}</strong>
                </div>
                <div>
                  <span>Notes</span>
                  <strong>{option.notes || 'No notes'}</strong>
                </div>
              </div>
            </InlineRowEditorShell>

            <InlineEntityActions
              apiBaseUrl={apiBaseUrl}
              deletePath={`/quotes/${quoteId}/options/${option.id}`}
              deleteLabel="quote option"
              confirmMessage={`Delete option ${option.name}?`}
            >
              <QuoteOptionsForm
                apiBaseUrl={apiBaseUrl}
                quoteId={quoteId}
                hotelCategories={hotelCategories}
                optionId={option.id}
                submitLabel="Save option"
                initialValues={{
                  name: option.hotelCategory && option.name === option.hotelCategory.name ? '' : option.name,
                  notes: option.notes || '',
                  hotelCategoryId: option.hotelCategoryId || '',
                  pricingMode: option.pricingMode,
                  packageMarginPercent: option.packageMarginPercent?.toString() || '',
                  totalCost: option.totalCost,
                  totalSell: option.totalSell,
                  totalPax,
                }}
              />
            </InlineEntityActions>

            <InlineRowEditorShell>
              <div className="section-stack">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Cost Breakdown</p>
                    <h3>{option.name} components</h3>
                  </div>
                </div>
                {renderBreakdownTable(option.quoteItems)}
              </div>
            </InlineRowEditorShell>

            {renderPromotionsSection(option.quoteItems)}
          </div>
        ),
      };
    });

    const modelIssueMessages = [
      quote.pricingMode === 'SLAB' && quote.pricingSlabs.length === 0 ? 'No group slabs configured yet.' : null,
      quote.pricingMode === 'FIXED' && quote.fixedPricePerPerson <= 0 ? 'Missing package sell price on group pricing setup.' : null,
    ].filter(Boolean) as string[];

    return [
      {
        id: 'base-program',
        type: 'base',
        label: 'Base program',
        description: `${quote.quoteItems.length} pricing components`,
        totalCost: quote.totalCost,
        totalSell: quote.totalSell,
        pricePerPax: quote.pricePerPax,
        issueMessages: baseIssueMessages,
        hasPromotions: hasRowPromotion(quote.quoteItems),
        itemIds: quote.quoteItems.map((item) => item.id),
        detail: (
          <div className="section-stack">
            <InlineRowEditorShell>
              <div className="quote-preview-total-list">
                <div>
                  <span>Pricing type</span>
                  <strong>{quote.pricingType}</strong>
                </div>
                <div>
                  <span>FOC impact</span>
                  <strong>{focImpactLabel}</strong>
                </div>
                <div>
                  <span>Supplement impact</span>
                  <strong>{supplementsImpactLabel}</strong>
                </div>
                <div>
                  <span>Price per pax</span>
                  <strong>{formatMoneyOrPending(quote.pricePerPax)}</strong>
                </div>
              </div>
            </InlineRowEditorShell>

            <InlineRowEditorShell>
              <div className="section-stack">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Cost Breakdown</p>
                    <h3>Base program components</h3>
                  </div>
                </div>
                {renderBreakdownTable(quote.quoteItems)}
              </div>
            </InlineRowEditorShell>

            {renderPromotionsSection(quote.quoteItems)}
          </div>
        ),
      },
      ...optionRows,
      {
        id: 'pricing-model',
        type: 'model',
        label: 'Group pricing setup',
        description:
          quote.pricingMode === 'SLAB'
            ? 'Slab editing now lives in the dedicated Group Pricing step.'
            : 'Package pricing is managed in the dedicated Group Pricing step.',
        totalCost: quote.totalCost,
        totalSell: quote.totalSell,
        pricePerPax: quote.pricingMode === 'SLAB' ? quote.pricePerPax : quote.fixedPricePerPerson,
        issueMessages: modelIssueMessages,
        hasPromotions:
          hasRowPromotion(quote.quoteItems) || quote.quoteOptions.some((option) => hasRowPromotion(option.quoteItems)),
        itemIds: [],
        detail: (
          <InlineRowEditorShell>
            <div className="section-stack">
              <div className="quote-preview-total-list">
                <div>
                  <span>Pricing mode</span>
                  <strong>{quote.pricingMode === 'SLAB' ? 'Group slabs' : 'Package price'}</strong>
                </div>
                <div>
                  <span>Configured slabs</span>
                  <strong>{quote.pricingSlabs.length}</strong>
                </div>
                <div>
                  <span>Basis</span>
                  <strong>{quote.pricingMode === 'SLAB' ? 'Per paying guest' : 'Per person package sell'}</strong>
                </div>
                <div>
                  <span>Current basis</span>
                  <strong>
                    {quote.pricingMode === 'FIXED'
                      ? quote.fixedPricePerPerson > 0
                        ? formatMoney(quote.fixedPricePerPerson)
                        : 'Pricing to be confirmed'
                      : quote.pricingSlabs.length > 0
                        ? `${quote.pricingSlabs.length} slab${quote.pricingSlabs.length === 1 ? '' : 's'} configured`
                        : 'Pricing to be confirmed'}
                  </strong>
                </div>
              </div>
              <p className="table-subcopy">
                Group pricing is edited in its own full-width step so service pricing can stay focused on cost, sell, currency, and margin cleanup.
              </p>
              <div className="inline-actions">
                <Link href={groupPricingHref} className="secondary-button">
                  Open Group Pricing
                </Link>
              </div>
            </div>
          </InlineRowEditorShell>
        ),
      },
    ];
  }, [apiBaseUrl, focImpactLabel, groupPricingHref, hotelCategories, quote, quoteId, supplementsImpactLabel, totalPax]);

  const filteredRows = rows.filter((row) => {
    if (activeFilter === 'unpriced') {
      return row.issueMessages.some((issue) => issue.includes('Missing price'));
    }

    if (activeFilter === 'missing-cost') {
      return row.issueMessages.some((issue) => issue.includes('Missing cost'));
    }

    if (activeFilter === 'missing-sell') {
      return row.issueMessages.some((issue) => issue.includes('Missing sell'));
    }

    if (activeFilter === 'margin-risk') {
      return (
        row.issueMessages.some((issue) => issue.includes('Zero sell')) ||
        row.issueMessages.some((issue) => issue.includes('Negative margin')) ||
        row.issueMessages.some((issue) => issue.includes('Low margin')) ||
        getMarginMetrics(row.totalSell, row.totalCost).tone === 'low'
      );
    }

    if (activeFilter === 'missing-currency') {
      return row.issueMessages.some((issue) => issue.includes('Missing currency'));
    }

    return true;
  });

  const filterCounts = {
    all: rows.length,
    unpriced: rows.filter((row) => row.issueMessages.some((issue) => issue.includes('Missing price'))).length,
    missingCost: rows.filter((row) => row.issueMessages.some((issue) => issue.includes('Missing cost'))).length,
    missingSell: rows.filter((row) => row.issueMessages.some((issue) => issue.includes('Missing sell'))).length,
    missingCurrency: rows.filter((row) => row.issueMessages.some((issue) => issue.includes('Missing currency'))).length,
    marginRisk: rows.filter(
      (row) =>
        row.issueMessages.some((issue) => issue.includes('Zero sell')) ||
        row.issueMessages.some((issue) => issue.includes('Negative margin')) ||
        row.issueMessages.some((issue) => issue.includes('Low margin')) ||
        isLowMargin(row.totalSell, row.totalCost),
    ).length,
  };

  const allItems = useMemo(() => [...quote.quoteItems, ...quote.quoteOptions.flatMap((option) => option.quoteItems)], [quote]);
  const missingPricingItems = useMemo(
    () =>
      allItems.filter((item) => item.totalCost <= 0 || item.totalSell <= 0 || !item.paxCount).map((item) => ({
        id: item.id,
        name: item.service.name,
        issue:
          item.totalCost <= 0
            ? 'Missing cost'
            : item.totalSell <= 0
              ? 'Missing sell'
              : 'Missing pax count',
      })),
    [allItems],
  );
  const pricingReady =
    missingPricingItems.length === 0 &&
    (quote.pricingMode === 'SLAB' ? quote.pricingSlabs.length > 0 : quote.fixedPricePerPerson > 0);
  const recommendedSlab = useMemo(() => {
    if (quote.pricingMode !== 'SLAB') {
      return null;
    }

    return (
      quote.pricingSlabs.find((slab) => {
        if (slab.minPax > totalPax) {
          return false;
        }
        if (slab.maxPax === null || slab.maxPax === undefined) {
          return totalPax >= slab.minPax;
        }
        return totalPax >= slab.minPax && totalPax <= slab.maxPax;
      }) || null
    );
  }, [quote.pricingMode, quote.pricingSlabs, totalPax]);

  return (
    <div className="section-stack">
      <section className="workspace-section quote-pricing-decision-panel">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Pricing Decision</p>
            <h2>{pricingReady ? 'Pricing Ready' : 'Pricing Not Ready'}</h2>
          </div>
          <span className={`quote-ui-badge ${pricingReady ? 'quote-ui-badge-success' : 'quote-ui-badge-warning'}`}>
            {pricingReady ? 'Ready to preview' : 'Needs fixes'}
          </span>
        </div>

        <div className="quote-pricing-decision-grid">
          <article className="detail-card">
            <p className="eyebrow">Current status</p>
            <div className="quote-preview-total-list">
              <div>
                <span>Missing items</span>
                <strong>{missingPricingItems.length}</strong>
              </div>
              <div>
                <span>Pricing mode</span>
                <strong>{quote.pricingMode === 'SLAB' ? 'Group slabs' : 'Package price'}</strong>
              </div>
              <div>
                <span>Current sell basis</span>
                <strong>
                  {quote.pricingMode === 'SLAB'
                    ? recommendedSlab
                      ? `${recommendedSlab.minPax}${recommendedSlab.maxPax ? `-${recommendedSlab.maxPax}` : '+'} pax`
                      : 'Pricing to be confirmed'
                    : formatMoneyOrPending(quote.fixedPricePerPerson)}
                </strong>
              </div>
              <div>
                <span>Preview state</span>
                <strong>{pricingReady ? 'Ready to send' : 'Hold for fixes'}</strong>
              </div>
            </div>
          </article>

          <article className="detail-card">
            <p className="eyebrow">Next actions</p>
            {missingPricingItems.length === 0 ? (
              <p className="detail-copy">Commercial inputs are in place. Review group pricing and continue to preview.</p>
            ) : (
              <div className="section-stack">
                {missingPricingItems.slice(0, 4).map((item) => (
                  <p key={item.id} className="form-error">
                    {item.name}: {item.issue}
                  </p>
                ))}
                {missingPricingItems.length > 4 ? (
                  <p className="detail-copy">+{missingPricingItems.length - 4} more services still need pricing inputs.</p>
                ) : null}
              </div>
            )}
            <div className="inline-actions">
              <Link href={servicesHref} className="secondary-button">
                Fix Issues
              </Link>
              <Link
                href={previewHref}
                className={`primary-button${pricingReady ? '' : ' disabled-link'}`}
                aria-disabled={!pricingReady}
                onClick={(event) => {
                  if (!pricingReady) {
                    event.preventDefault();
                  }
                }}
              >
                Continue / Preview
              </Link>
            </div>
          </article>
        </div>
      </section>

      <section className="workspace-section quote-pricing-group-panel">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Group Pricing</p>
            <h3>{quote.pricingMode === 'SLAB' ? 'Group slabs and FOC logic' : 'Package sell basis'}</h3>
          </div>
          <Link href={groupPricingHref} className="secondary-button">
            Open Group Pricing
          </Link>
        </div>

        <div className="quote-pricing-group-grid">
          <article className="detail-card">
            <p className="eyebrow">Commercial basis</p>
            <div className="quote-preview-total-list">
              <div>
                <span>Mode</span>
                <strong>{quote.pricingMode === 'SLAB' ? 'Group slabs' : 'Package price'}</strong>
              </div>
              <div>
                <span>FOC logic</span>
                <strong>{quote.pricingMode === 'SLAB' ? focImpactLabel : 'Not applied'}</strong>
              </div>
              <div>
                <span>Supplement logic</span>
                <strong>{supplementsImpactLabel}</strong>
              </div>
              <div>
                <span>Recommended slab</span>
                <strong>
                  {quote.pricingMode === 'SLAB'
                    ? recommendedSlab
                      ? `${recommendedSlab.minPax}${recommendedSlab.maxPax ? `-${recommendedSlab.maxPax}` : '+'} guests${recommendedSlab.focPax ? ` + ${recommendedSlab.focPax} FOC` : ''}`
                      : 'Pricing to be confirmed'
                    : formatMoneyOrPending(quote.fixedPricePerPerson)}
                </strong>
              </div>
            </div>
          </article>

          <article className="detail-card">
            <p className="eyebrow">Configured slabs</p>
            {quote.pricingMode !== 'SLAB' ? (
              <p className="detail-copy">This quote is using package pricing. Group slab editing is not active.</p>
            ) : quote.pricingSlabs.length === 0 ? (
              <p className="detail-copy">Pricing to be confirmed.</p>
            ) : (
              <div className="section-stack">
                {quote.pricingSlabs.map((slab) => {
                  const isRecommended = recommendedSlab?.id === slab.id;
                  const slabLabel = slab.maxPax === null ? `${slab.minPax}+ guests` : `${slab.minPax}-${slab.maxPax} guests`;
                  return (
                    <div key={slab.id} className={`quote-pricing-slab-row${isRecommended ? ' quote-pricing-slab-row-recommended' : ''}`}>
                      <div>
                        <strong>{slabLabel}{slab.focPax ? ` + ${slab.focPax} FOC` : ''}</strong>
                        {slab.notes ? <p className="table-subcopy">{slab.notes}</p> : null}
                      </div>
                      <div className="quote-pricing-slab-values">
                        <span>{formatMoneyOrPending(slab.pricePerPayingPax ?? slab.price)}</span>
                        {isRecommended ? <span className="quote-ui-badge quote-ui-badge-success">Recommended</span> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </article>
        </div>
      </section>

      {missingPricingItems.length > 0 ? (
        <section className="workspace-section quote-pricing-missing-panel">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Missing Data</p>
              <h3>Services still missing pricing</h3>
            </div>
            <Link href={servicesHref} className="secondary-button">
              Open Services
            </Link>
          </div>
          <div className="section-stack">
            {missingPricingItems.map((item) => (
              <div key={item.id} className="quote-pricing-missing-row">
                <strong>{item.name}</strong>
                <span>{item.issue}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <CompactFilterBar
        eyebrow="Pricing"
        title="Detailed pricing breakdown"
        description="Use the detailed rows below only when you need to review or adjust commercial components."
      >
        <div className="section-stack">
          <QuotePricingBulkTools
            apiBaseUrl={apiBaseUrl}
            quoteId={quoteId}
            quoteItems={quote.quoteItems}
            quoteOptions={quote.quoteOptions}
            activeFilter={activeFilter}
            onFocusChange={setActiveFilter}
            onRowsChanged={setHighlightedItemIds}
          />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="button"
              className={`secondary-button${activeFilter === 'all' ? ' operations-filter-chip-active' : ''}`}
              onClick={() => setActiveFilter('all')}
            >
              All ({filterCounts.all})
            </button>
            <button
              type="button"
              className={`secondary-button${activeFilter === 'unpriced' ? ' operations-filter-chip-active' : ''}`}
              onClick={() => setActiveFilter('unpriced')}
            >
              Unpriced ({filterCounts.unpriced})
            </button>
            <button
              type="button"
              className={`secondary-button${activeFilter === 'missing-cost' ? ' operations-filter-chip-active' : ''}`}
              onClick={() => setActiveFilter('missing-cost')}
            >
              Missing cost ({filterCounts.missingCost})
            </button>
            <button
              type="button"
              className={`secondary-button${activeFilter === 'missing-sell' ? ' operations-filter-chip-active' : ''}`}
              onClick={() => setActiveFilter('missing-sell')}
            >
              Missing sell ({filterCounts.missingSell})
            </button>
            <button
              type="button"
              className={`secondary-button${activeFilter === 'missing-currency' ? ' operations-filter-chip-active' : ''}`}
              onClick={() => setActiveFilter('missing-currency')}
            >
              Missing currency ({filterCounts.missingCurrency})
            </button>
            <button
              type="button"
              className={`secondary-button${activeFilter === 'margin-risk' ? ' operations-filter-chip-active' : ''}`}
              onClick={() => setActiveFilter('margin-risk')}
            >
              Margin risk ({filterCounts.marginRisk})
            </button>
          </div>

          <AdvancedFiltersPanel title="Pricing setup" description="Create or adjust pricing options without opening every row">
            <QuoteOptionsForm apiBaseUrl={apiBaseUrl} quoteId={quoteId} hotelCategories={hotelCategories} />
          </AdvancedFiltersPanel>
        </div>
      </CompactFilterBar>

      <TableSectionShell
        title="Pricing components"
        description="Commercial rows stay compact by default. Open details only for the component you are working on."
        context={<p>{filteredRows.length} rows in the current slice</p>}
      >
        <div className="table-wrap">
          <table className="data-table quote-consistency-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Cost</th>
                <th>Sell</th>
                <th>Margin</th>
                <th>Issue</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty-state">
                    No pricing rows match the current slice.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const marginMetrics = getMarginMetrics(row.totalSell, row.totalCost);
                  const isHighlighted =
                    highlightedItemIds.length > 0 && row.itemIds.some((itemId) => highlightedItemIds.includes(itemId));
                  const rowHasPendingPricing = hasMissingRowPricing(row) || row.totalCost <= 0 || row.totalSell <= 0;
                  const costDisplay = rowHasPendingPricing ? 'Pricing to be confirmed' : formatMoney(row.totalCost);
                  const sellDisplay = rowHasPendingPricing ? 'Pricing to be confirmed' : formatMoney(row.totalSell);
                  const marginDisplay = rowHasPendingPricing ? 'Pricing to be confirmed' : formatMoney(marginMetrics.margin);
                  const marginPercentDisplay = rowHasPendingPricing ? 'Pending' : `${marginMetrics.marginPercent.toFixed(2)}%`;

                  return (
                    <tr key={row.id} className={isHighlighted ? 'quote-pricing-row-highlight' : undefined}>
                      <td>
                        <strong>{row.label}</strong>
                        {row.hasPromotions ? (
                          <span className="quote-ui-badge quote-ui-badge-success" style={{ marginLeft: 8 }}>
                            Promotions
                          </span>
                        ) : null}
                        <div className="table-subcopy">{row.description}</div>
                      </td>
                      <td className="quote-table-number-cell">{costDisplay}</td>
                      <td className="quote-table-number-cell">{sellDisplay}</td>
                      <td className="quote-table-number-cell">
                        <strong style={{ color: getMarginColor(marginMetrics.tone) }}>{marginDisplay}</strong>
                        <div className="table-subcopy" style={{ color: getMarginColor(marginMetrics.tone) }}>
                          {marginPercentDisplay}
                        </div>
                      </td>
                      <td>
                        <span className={`quote-ui-badge quote-ui-badge-${getIssueTone(row.issueMessages)}`}>
                          {row.issueMessages.length === 0 ? 'Ready state' : row.issueMessages[0]}
                        </span>
                        <div className="table-subcopy">{row.issueMessages.length === 0 ? 'No pricing warnings' : `${row.issueMessages.length} issue${row.issueMessages.length === 1 ? '' : 's'}`}</div>
                      </td>
                      <td>
                        <RowDetailsPanel
                          summary="View details"
                          description="Cost breakdown, controls, overrides, adjustments, and notes"
                          className="operations-row-details"
                          bodyClassName="operations-row-details-body"
                          groupId="quote-pricing"
                        >
                          {row.detail}
                        </RowDetailsPanel>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </TableSectionShell>
    </div>
  );
}
