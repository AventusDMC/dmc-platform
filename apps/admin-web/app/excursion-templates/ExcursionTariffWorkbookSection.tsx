import { QueryDropdownFilters, type QueryDropdownFilterOption } from '../components/QueryDropdownFilters';
import { SummaryStrip } from '../components/SummaryStrip';
import { adminPageFetchJson } from '../lib/admin-server';
import { Activity } from '../activities/types';
import { ExcursionTariffWorkbookGrid, type ExcursionTariffWorkbookRow } from './ExcursionTariffWorkbookGrid';

type ExcursionTariffWorkbookFilters = {
  category?: string;
  cityRegion?: string;
  supplierId?: string;
  pricingBasis?: string;
  activeState?: string;
};

type FilterableActivityVariant = {
  id?: string;
  name: string;
  pricingBasis?: string | null;
  active?: boolean | null;
};

type FilterableActivity = {
  id: string;
  name: string;
  category?: string | null;
  city?: string | null;
  region?: string | null;
  supplierCompanyId?: string | null;
  pricingBasis?: string | null;
  active: boolean;
  rateVariants?: FilterableActivityVariant[];
};

export type ExcursionTariffWorkbookRowSource = {
  activity: FilterableActivity;
  variant: FilterableActivityVariant | null;
};

async function getActivities() {
  return adminPageFetchJson<Activity[]>('/api/activities', 'Excursion tariff workbook activities', {
    cache: 'no-store',
  });
}

function buildOptions(entries: Array<{ value: string; label: string }>): QueryDropdownFilterOption[] {
  return entries
    .filter((entry, index, collection) => collection.findIndex((current) => current.value === entry.value) === index)
    .sort((left, right) => left.label.localeCompare(right.label));
}

function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '';
}

function formatDuration(minutes: number | null | undefined) {
  if (!minutes) {
    return 'Duration pending';
  }

  if (minutes < 60) {
    return `${minutes} min`;
  }

  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} hr`;
}

function getCityRegion(activity: Pick<FilterableActivity, 'city' | 'region'>) {
  return [activity.city, activity.region].filter(Boolean).join(' / ') || 'Location pending';
}

function getSupplierLabel(activity: Pick<Activity, 'supplierCompany' | 'supplierCompanyId'>) {
  return activity.supplierCompany?.name || activity.supplierCompanyId || 'Supplier pending';
}

function getRowPricingBasis(source: ExcursionTariffWorkbookRowSource) {
  return source.variant?.pricingBasis || source.activity.pricingBasis || 'Pricing pending';
}

function getRowActive(source: ExcursionTariffWorkbookRowSource) {
  return source.activity.active && (source.variant ? source.variant.active !== false : true);
}

export function buildExcursionTariffRowSources(activities: FilterableActivity[]): ExcursionTariffWorkbookRowSource[] {
  return activities.flatMap((activity) => {
    const variants = activity.rateVariants || [];

    if (variants.length === 0) {
      return [{ activity, variant: null }];
    }

    return variants.map((variant) => ({ activity, variant }));
  });
}

export function filterExcursionTariffRowSources(
  sources: ExcursionTariffWorkbookRowSource[],
  filters: ExcursionTariffWorkbookFilters,
) {
  const category = filters.category || '';
  const cityRegion = filters.cityRegion || '';
  const supplierId = filters.supplierId || '';
  const pricingBasis = filters.pricingBasis || '';
  const activeState = filters.activeState || '';

  return sources.filter((source) => {
    if (category && source.activity.category !== category) return false;
    if (cityRegion && getCityRegion(source.activity) !== cityRegion) return false;
    if (supplierId && source.activity.supplierCompanyId !== supplierId) return false;
    if (pricingBasis && getRowPricingBasis(source) !== pricingBasis) return false;
    if (activeState === 'active' && !getRowActive(source)) return false;
    if (activeState === 'inactive' && getRowActive(source)) return false;

    return true;
  });
}

function buildWorkbookRows(sources: ExcursionTariffWorkbookRowSource[]): ExcursionTariffWorkbookRow[] {
  return sources
    .map((source) => {
      const activity = source.activity as Activity;
      const variant = source.variant as Activity['rateVariants'] extends Array<infer Variant> ? Variant : never;

      return {
        id: variant?.id || `${activity.id}:base`,
        activityName: activity.name,
        variant: variant?.name || 'Base rate',
        category: activity.category || 'Category pending',
        cityRegion: getCityRegion(activity),
        supplier: getSupplierLabel(activity),
        pricingBasis: getRowPricingBasis(source),
        currency: variant?.currency || activity.currency || 'Currency pending',
        duration: formatDuration(variant?.durationMinutes ?? activity.durationMinutes),
        cost: formatMoney(variant?.costPrice ?? activity.costPrice),
        sell: formatMoney(variant?.sellPrice ?? activity.sellPrice),
        operationalNotes: [variant?.notes, variant?.guideRequirement, variant?.seasonalNotes, activity.description].filter(Boolean).join(' | '),
        status: getRowActive(source) ? 'Active' : 'Inactive',
      };
    })
    .sort((left, right) =>
      [left.activityName, left.variant, left.cityRegion, left.supplier]
        .join('|')
        .localeCompare([right.activityName, right.variant, right.cityRegion, right.supplier].join('|')),
    );
}

type ExcursionTariffWorkbookSectionProps = {
  filters?: ExcursionTariffWorkbookFilters;
};

export async function ExcursionTariffWorkbookSection({ filters }: ExcursionTariffWorkbookSectionProps) {
  const activities = await getActivities();
  const category = filters?.category || '';
  const cityRegion = filters?.cityRegion || '';
  const supplierId = filters?.supplierId || '';
  const pricingBasis = filters?.pricingBasis || '';
  const activeState = filters?.activeState || '';
  const rowSources = buildExcursionTariffRowSources(activities);
  const visibleSources = filterExcursionTariffRowSources(rowSources, {
    category,
    cityRegion,
    supplierId,
    pricingBasis,
    activeState,
  });
  const workbookRows = buildWorkbookRows(visibleSources);
  const pricingBasisOptions = buildOptions(
    rowSources.map((source) => ({
      value: getRowPricingBasis(source),
      label: getRowPricingBasis(source),
    })),
  );

  return (
    <div className="section-stack">
      <QueryDropdownFilters
        eyebrow="Tariff workbook filters"
        title="Excursion tariff workbook filters"
        description="Filter Activity Master tariff rows by category, destination, supplier, pricing basis, and active state."
        filters={[
          {
            key: 'category',
            label: 'Category',
            placeholder: 'All categories',
            value: category,
            options: buildOptions(activities.map((activity) => ({ value: activity.category || 'Category pending', label: activity.category || 'Category pending' }))),
          },
          {
            key: 'cityRegion',
            label: 'City / Region',
            placeholder: 'All destinations',
            value: cityRegion,
            options: buildOptions(activities.map((activity) => ({ value: getCityRegion(activity), label: getCityRegion(activity) }))),
          },
          {
            key: 'supplierId',
            label: 'Supplier',
            placeholder: 'All suppliers',
            value: supplierId,
            options: buildOptions(
              activities.map((activity) => ({
                value: activity.supplierCompanyId,
                label: getSupplierLabel(activity),
              })),
            ),
          },
          {
            key: 'pricingBasis',
            label: 'Pricing Basis',
            placeholder: 'All pricing bases',
            value: pricingBasis,
            options: pricingBasisOptions,
            advanced: true,
          },
          {
            key: 'activeState',
            label: 'Active state',
            placeholder: 'All states',
            value: activeState,
            options: [
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
            ],
            advanced: true,
          },
        ]}
        advancedTitle="Workbook scope"
        advancedDescription="Use advanced filters for pricing basis and active status without changing Activity Master records."
      />

      <SummaryStrip
        items={[
          { id: 'masters', label: 'Activity masters', value: String(new Set(visibleSources.map((source) => source.activity.id)).size), helper: 'One master model' },
          { id: 'rows', label: 'Workbook rows', value: String(workbookRows.length), helper: 'Variant tariff rows' },
          { id: 'suppliers', label: 'Suppliers', value: String(new Set(visibleSources.map((source) => source.activity.supplierCompanyId)).size), helper: 'In scope' },
          { id: 'pricing-bases', label: 'Pricing bases', value: String(new Set(visibleSources.map(getRowPricingBasis)).size), helper: 'Existing behavior' },
        ]}
      />

      {workbookRows.length === 0 ? (
        <p className="empty-state">No excursion tariff rows match the selected filters.</p>
      ) : (
        <ExcursionTariffWorkbookGrid rows={workbookRows} />
      )}
    </div>
  );
}
