'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ServiceTypeOption } from '../lib/serviceTypes';
import { getErrorMessage } from '../lib/api';
import { type SupportedCurrency } from '../lib/currencyOptions';
import { ServicesForm } from '../services/ServicesForm';
import { ServiceRatesManager } from './ServiceRatesManager';

type ServiceRate = {
  id: string;
  serviceId: string;
  supplierId: string | null;
  costBaseAmount: number;
  costCurrency: 'USD' | 'EUR' | 'JOD';
  pricingMode: 'PER_PERSON' | 'PER_GROUP' | 'PER_DAY';
  salesTaxPercent: number;
  salesTaxIncluded: boolean;
  serviceChargePercent: number;
  serviceChargeIncluded: boolean;
  tourismFeeAmount: number | null;
  tourismFeeCurrency: 'USD' | 'EUR' | 'JOD' | null;
  tourismFeeMode: 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM' | null;
};

type SupplierService = {
  id: string;
  supplierId: string;
  name: string;
  category: string;
  serviceTypeId: string | null;
  serviceType: ServiceTypeOption | null;
  unitType: string;
  baseCost: number;
  currency: string;
  serviceRates: ServiceRate[];
};

type ServicesCatalogBrowserProps = {
  apiBaseUrl: string;
  services: SupplierService[];
  serviceTypes: ServiceTypeOption[];
  suppliers: SupplierOption[];
};

type SupplierOption = {
  id: string;
  name: string;
};

function normalizeCategory(value: string) {
  return value.trim().toLowerCase();
}

function getServiceCategoryKey(service: SupplierService) {
  const normalized = normalizeCategory(service.serviceType?.code || service.serviceType?.name || service.category);

  if (normalized.includes('hotel') || normalized.includes('accommodation')) {
    return 'hotel';
  }

  if (normalized.includes('transport') || normalized.includes('transfer') || normalized.includes('vehicle')) {
    return 'transport';
  }

  if (normalized.includes('guide')) {
    return 'guide';
  }

  if (
    normalized.includes('activity') ||
    normalized.includes('tour') ||
    normalized.includes('excursion') ||
    normalized.includes('sightseeing') ||
    normalized.includes('entrance') ||
    normalized.includes('ticket')
  ) {
    return 'activity';
  }

  if (
    normalized.includes('meal') ||
    normalized.includes('dinner') ||
    normalized.includes('lunch') ||
    normalized.includes('breakfast') ||
    normalized.includes('food')
  ) {
    return 'meal';
  }

  return 'other';
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency && currency.trim() ? currency : 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${currency || 'USD'} ${value.toFixed(2)}`;
  }
}

function buildSelectHref(returnTo: string, serviceId: string) {
  const url = new URL(returnTo, 'https://dmc.local');
  url.searchParams.set('catalogServiceId', serviceId);
  return `${url.pathname}${url.search}`;
}

export function ServicesCatalogBrowser({ apiBaseUrl, services, serviceTypes, suppliers }: ServicesCatalogBrowserProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || '');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [ratesServiceId, setRatesServiceId] = useState<string | null>(null);
  const [deletingServiceId, setDeletingServiceId] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');

  const typeOptions = useMemo(
    () =>
      Array.from(
        new Set(services.map((service) => service.serviceType?.name || service.category).filter(Boolean)),
      ).sort((left, right) => left.localeCompare(right)),
    [services],
  );

  const categoryOptions = useMemo(
    () => Array.from(new Set(services.map((service) => service.category).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [services],
  );

  const filteredServices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return services.filter((service) => {
      const searchHaystack = [
        service.name,
        service.category,
        service.serviceType?.name || '',
        service.serviceType?.code || '',
        service.unitType,
        service.supplierId,
      ]
        .join(' ')
        .toLowerCase();

      if (normalizedQuery && !searchHaystack.includes(normalizedQuery)) {
        return false;
      }

      if (typeFilter) {
        const serviceTypeLabel = service.serviceType?.name || service.category;
        if (serviceTypeLabel !== typeFilter && getServiceCategoryKey(service) !== typeFilter) {
          return false;
        }
      }

      if (categoryFilter && service.category !== categoryFilter) {
        return false;
      }

      return true;
    });
  }, [categoryFilter, query, services, typeFilter]);

  async function handleDelete(service: SupplierService) {
    if (!window.confirm(`Delete ${service.name}?`)) {
      return;
    }

    setDeletingServiceId(service.id);
    setActionError('');

    try {
      const response = await fetch(`${apiBaseUrl}/services/${service.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete service.'));
      }

      router.refresh();
    } catch (caughtError) {
      setActionError(caughtError instanceof Error ? caughtError.message : 'Could not delete service.');
    } finally {
      setDeletingServiceId(null);
    }
  }

  return (
    <div className="catalog-browser-shell">
      <section className="catalog-browser-toolbar">
        <div className="catalog-browser-search">
          <label htmlFor="catalog-services-search">Search experiences and services</label>
          <input
            id="catalog-services-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, type, supplier, or keywords"
          />
        </div>

        <div className="catalog-browser-filters">
          <label>
            Type
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">All types</option>
              {typeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <label>
            Category
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="">All categories</option>
              {categoryOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {returnTo ? (
        <section className="catalog-return-banner">
          <div>
            <p className="eyebrow">Quote selection</p>
            <h3>Select a catalog service and return to the Services step</h3>
          </div>
          <Link href={returnTo} className="secondary-button">
            Back to Services
          </Link>
        </section>
      ) : null}

      <section className="catalog-results-grid">
        {actionError ? <p className="form-error">{actionError}</p> : null}
        {filteredServices.length === 0 ? (
          <article className="catalog-empty-state">
            <h3>No services match the current search</h3>
            <p>Try a broader keyword or clear one of the filters.</p>
          </article>
        ) : (
          filteredServices.map((service) => (
            <article key={service.id} className="catalog-result-card">
              <div className="catalog-result-head">
                <div>
                  <p className="eyebrow">{service.serviceType?.name || service.category}</p>
                  <h3>{service.name}</h3>
                </div>
                <span className="page-tab-badge">{service.unitType.replaceAll('_', ' ')}</span>
              </div>

              <div className="catalog-result-meta">
                <span>{service.serviceType?.code || service.category}</span>
                <span>Supplier {service.supplierId}</span>
                <span>{formatMoney(service.baseCost, service.currency)}</span>
              </div>

              <p className="catalog-result-summary">
                Ready for quoting as a reusable {service.serviceType?.name?.toLowerCase() || service.category.toLowerCase()} item with a
                {` ${service.unitType.replaceAll('_', ' ')} `}basis.
              </p>

              <div className="inline-actions">
                {returnTo ? (
                  <Link href={buildSelectHref(returnTo, service.id)} className="primary-button">
                    Select
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setEditingServiceId((current) => (current === service.id ? null : service.id))}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setRatesServiceId((current) => (current === service.id ? null : service.id))}
                >
                  Rates
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={deletingServiceId === service.id}
                  onClick={() => handleDelete(service)}
                >
                  {deletingServiceId === service.id ? 'Deleting...' : 'Delete'}
                </button>
              </div>

              {editingServiceId === service.id ? (
                <div className="stacked-card">
                  <ServicesForm
                    apiBaseUrl={apiBaseUrl}
                    serviceTypes={serviceTypes}
                    suppliers={suppliers}
                    serviceId={service.id}
                    submitLabel="Save service"
                    initialValues={{
                      supplierId: service.supplierId,
                      name: service.name,
                      category: service.category,
                      serviceTypeId: service.serviceTypeId,
                      unitType: service.unitType as 'per_person',
                      baseCost: String(service.baseCost),
                      currency: service.currency as SupportedCurrency,
                    }}
                  />
                </div>
              ) : null}

              {ratesServiceId === service.id ? (
                <ServiceRatesManager
                  apiBaseUrl={apiBaseUrl}
                  serviceId={service.id}
                  initialRates={service.serviceRates || []}
                  showTourismFee={getServiceCategoryKey(service) === 'hotel'}
                  defaultOpen
                />
              ) : null}
            </article>
          ))
        )}
      </section>
    </div>
  );
}
