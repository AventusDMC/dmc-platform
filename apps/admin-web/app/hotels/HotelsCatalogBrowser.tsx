'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type HotelContract = {
  id: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
};

type HotelRate = {
  id: string;
  contractId: string;
  seasonName: string;
  roomCategoryId: string;
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  mealPlan: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  currency: string;
  cost: number;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  };
};

type Hotel = {
  id: string;
  name: string;
  city: string;
  category: string;
  roomCategories?: Array<{
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  }>;
  _count: {
    contracts: number;
  };
  statusLabel: string;
  contracts: HotelContract[];
  rates: HotelRate[];
};

type HotelsCatalogBrowserProps = {
  hotels: Hotel[];
};

function buildSelectHref(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo, 'https://dmc.local');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return `${url.pathname}${url.search}`;
}

function formatDateRange(validFrom: string, validTo: string) {
  return `${new Date(validFrom).toLocaleDateString()} - ${new Date(validTo).toLocaleDateString()}`;
}

function formatMoney(value: number, currency = 'USD') {
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

export function HotelsCatalogBrowser({ hotels }: HotelsCatalogBrowserProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [cityFilter, setCityFilter] = useState(searchParams.get('city') || '');
  const [categoryFilter, setCategoryFilter] = useState(searchParams.get('category') || '');
  const [activeHotelId, setActiveHotelId] = useState<string | null>(null);
  const [activeContractId, setActiveContractId] = useState<string | null>(null);

  const cityOptions = useMemo(
    () => Array.from(new Set(hotels.map((hotel) => hotel.city).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [hotels],
  );

  const categoryOptions = useMemo(
    () => Array.from(new Set(hotels.map((hotel) => hotel.category).filter(Boolean))).sort((left, right) => left.localeCompare(right)),
    [hotels],
  );

  const filteredHotels = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return hotels.filter((hotel) => {
      const searchHaystack = [hotel.name, hotel.city, hotel.category, hotel.statusLabel].join(' ').toLowerCase();

      if (normalizedQuery && !searchHaystack.includes(normalizedQuery)) {
        return false;
      }

      if (cityFilter && hotel.city !== cityFilter) {
        return false;
      }

      if (categoryFilter && hotel.category !== categoryFilter) {
        return false;
      }

      return true;
    });
  }, [categoryFilter, cityFilter, hotels, query]);

  const activeHotel = filteredHotels.find((hotel) => hotel.id === activeHotelId) || hotels.find((hotel) => hotel.id === activeHotelId) || null;
  const activeContract =
    activeHotel?.contracts.find((contract) => contract.id === activeContractId) || activeHotel?.contracts[0] || null;
  const activeRates = useMemo(
    () => (activeHotel && activeContract ? activeHotel.rates.filter((rate) => rate.contractId === activeContract.id) : []),
    [activeContract, activeHotel],
  );
  const quoteContext = useMemo(() => {
    if (!returnTo) {
      return null;
    }

    const url = new URL(returnTo, 'https://dmc.local');
    const quoteMatch = url.pathname.match(/\/quotes\/([^/]+)/);

    return {
      quoteId: quoteMatch?.[1] || null,
      dayId: url.searchParams.get('day'),
      addCategory: url.searchParams.get('addCategory'),
    };
  }, [returnTo]);

  function closeWorkflowModal() {
    setActiveHotelId(null);
    setActiveContractId(null);
  }

  function applyRateToQuote(href: string) {
    router.push(href);
    closeWorkflowModal();
  }

  useEffect(() => {
    if (!activeHotel) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeWorkflowModal();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeHotel]);

  return (
    <div className="catalog-browser-shell">
      <section className="catalog-browser-toolbar">
        <div className="catalog-browser-search">
          <label htmlFor="catalog-hotels-search">Search hotels</label>
          <input
            id="catalog-hotels-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by hotel name, city, or keywords"
          />
        </div>

        <div className="catalog-browser-filters">
          <label>
            City
            <select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}>
              <option value="">All cities</option>
              {cityOptions.map((option) => (
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
            <h3>Select a hotel, then review contract rates without leaving the workflow</h3>
          </div>
          <Link href={returnTo} className="secondary-button">
            Back to Services
          </Link>
        </section>
      ) : null}

      <section className="catalog-results-grid">
        {filteredHotels.length === 0 ? (
          <article className="catalog-empty-state">
            <h3>No hotels match the current search</h3>
            <p>Try another city or broaden the search term.</p>
          </article>
        ) : (
          filteredHotels.map((hotel) => (
            <article key={hotel.id} className="catalog-result-card">
              <div className="catalog-result-head">
                <div>
                  <p className="eyebrow">{hotel.city}</p>
                  <h3>{hotel.name}</h3>
                </div>
                <span className="page-tab-badge">{hotel.category}</span>
              </div>

              <div className="catalog-result-meta">
                <span>{hotel.statusLabel}</span>
                <span>{hotel._count.contracts} contract{hotel._count.contracts === 1 ? '' : 's'}</span>
                <span>{hotel.roomCategories?.length || 0} room categories</span>
              </div>

              <p className="catalog-result-summary">
                {hotel._count.contracts > 0
                  ? 'Open the hotel workflow to choose contract coverage and apply a rate back into the quote.'
                  : 'Hotel record is ready, but commercial setup still needs contract coverage.'}
              </p>

              <div className="inline-actions">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setActiveHotelId(hotel.id);
                    setActiveContractId(hotel.contracts[0]?.id || null);
                  }}
                >
                  {returnTo ? 'Open hotel workflow' : 'View workflow'}
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      {activeHotel ? (
        <div className="quote-client-modal-backdrop" onClick={closeWorkflowModal}>
          <div className="detail-card quote-client-modal-card quote-hotel-workflow-modal" onClick={(event) => event.stopPropagation()}>
            <div className="quote-hotel-workflow-modal-bar">
              {returnTo ? (
                <Link href={returnTo} className="secondary-button">
                  ← Back to quote
                </Link>
              ) : (
                <span />
              )}
              <button type="button" className="quote-modal-close-button" onClick={closeWorkflowModal} aria-label="Close hotel workflow">
                X
              </button>
            </div>

            <div className="quote-hotel-workflow-head">
              <div>
                <p className="eyebrow">Hotel workflow</p>
                <h2 className="section-title">{activeHotel.name}</h2>
                <p className="detail-copy">
                  {activeHotel.city} | {activeHotel.category} | {activeHotel.statusLabel}
                </p>
              </div>
              <div className="quote-preview-total-list quote-hotel-workflow-summary">
                <div>
                  <span>Contracts</span>
                  <strong>{activeHotel.contracts.length}</strong>
                </div>
                <div>
                  <span>Rates</span>
                  <strong>{activeHotel.rates.length}</strong>
                </div>
                <div>
                  <span>Room categories</span>
                  <strong>{activeHotel.roomCategories?.length || 0}</strong>
                </div>
              </div>
            </div>

            {quoteContext?.quoteId ? (
              <section className="quote-hotel-workflow-context">
                <div>
                  <span>Quote ID</span>
                  <strong>{quoteContext.quoteId}</strong>
                </div>
                <div>
                  <span>Day</span>
                  <strong>{quoteContext.dayId || 'Current day context'}</strong>
                </div>
                <div>
                  <span>Requested type</span>
                  <strong>{quoteContext.addCategory || 'hotel'}</strong>
                </div>
              </section>
            ) : null}

            <section className="quote-hotel-workflow-layout">
              <article className="quote-hotel-workflow-contracts">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Contracts</p>
                    <h3>Choose a contract</h3>
                  </div>
                </div>
                <div className="section-stack">
                  {activeHotel.contracts.length === 0 ? (
                    <p className="detail-copy">No contracts available for this hotel yet.</p>
                  ) : (
                    activeHotel.contracts.map((contract) => (
                      <button
                        key={contract.id}
                        type="button"
                        className={`quote-hotel-contract-card${activeContract?.id === contract.id ? ' quote-hotel-contract-card-active' : ''}`}
                        onClick={() => setActiveContractId(contract.id)}
                      >
                        <strong>{contract.name}</strong>
                        <span>{contract.currency}</span>
                        <span>{formatDateRange(contract.validFrom, contract.validTo)}</span>
                      </button>
                    ))
                  )}
                </div>
              </article>

              <article className="quote-hotel-workflow-rates">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Contract rates</p>
                    <h3>{activeContract ? activeContract.name : 'Select a contract'}</h3>
                    {activeContract ? <p className="detail-copy">Using contract: {activeContract.name}</p> : null}
                    <p className="detail-copy">Rates here are view-only references. Quote-only changes happen in the quote form.</p>
                  </div>
                </div>

                {!activeContract ? (
                  <p className="detail-copy">Choose a contract to review available room and board combinations.</p>
                ) : activeRates.length === 0 ? (
                  <p className="detail-copy">No rate rows are available for this contract.</p>
                ) : (
                  <div className="quote-hotel-rate-option-list">
                    {activeRates.map((rate) => {
                      const href = returnTo
                        ? buildSelectHref(returnTo, {
                            catalogHotelId: activeHotel.id,
                            catalogContractId: activeContract.id,
                            catalogRoomCategoryId: rate.roomCategoryId,
                            catalogMealPlan: rate.mealPlan,
                            catalogOccupancyType: rate.occupancyType,
                            catalogRateCost: String(rate.cost),
                            catalogRateCurrency: rate.currency,
                            catalogRateNote: rate.seasonName,
                          })
                        : null;

                      return (
                        <article
                          key={rate.id}
                          className={`quote-hotel-rate-option-card${href ? ' quote-hotel-rate-option-card-clickable' : ''}`}
                          role={href ? 'link' : undefined}
                          tabIndex={href ? 0 : -1}
                          onClick={href ? () => applyRateToQuote(href) : undefined}
                          onKeyDown={
                            href
                              ? (event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    applyRateToQuote(href);
                                  }
                                }
                              : undefined
                          }
                        >
                          <div className="quote-hotel-rate-option-head">
                            <div>
                              <h4>
                                {rate.roomCategory.name}
                                {rate.roomCategory.code ? ` | ${rate.roomCategory.code}` : ''}
                              </h4>
                              <p>{rate.mealPlan} board | {rate.occupancyType} occupancy</p>
                              <p className="quote-hotel-rate-option-note">{rate.seasonName || 'Contract rate'}</p>
                            </div>
                            <div className="quote-hotel-rate-option-price-block">
                              <div className="quote-hotel-rate-option-price">{formatMoney(rate.cost, rate.currency)}</div>
                              <span>per room / night</span>
                            </div>
                          </div>

                          <div className="quote-hotel-rate-option-actions">
                            {href ? (
                              <button
                                type="button"
                                className="primary-button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  applyRateToQuote(href);
                                }}
                              >
                                Use as Reference
                              </button>
                            ) : (
                              <span className="detail-copy">Quote workflow only</span>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </article>
            </section>

            <div className="table-action-row quote-client-modal-actions">
              <button type="button" className="secondary-button" onClick={closeWorkflowModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
