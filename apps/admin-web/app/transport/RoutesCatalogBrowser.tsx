'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { RouteOption } from '../lib/routes';

type RoutesCatalogBrowserProps = {
  routes: RouteOption[];
};

function buildSelectHref(returnTo: string, routeId: string) {
  const url = new URL(returnTo, 'https://dmc.local');
  url.searchParams.set('catalogRouteId', routeId);
  return `${url.pathname}${url.search}`;
}

export function RoutesCatalogBrowser({ routes }: RoutesCatalogBrowserProps) {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [cityFilter, setCityFilter] = useState(searchParams.get('city') || '');
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') || '');

  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set(routes.flatMap((route) => [route.fromPlace.city || '', route.toPlace.city || '']).filter(Boolean)),
      ).sort((left, right) => left.localeCompare(right)),
    [routes],
  );

  const typeOptions = useMemo(
    () => Array.from(new Set(routes.map((route) => route.routeType || 'General'))).sort((left, right) => left.localeCompare(right)),
    [routes],
  );

  const filteredRoutes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return routes.filter((route) => {
      const searchHaystack = [
        route.name,
        route.routeType || '',
        route.notes || '',
        route.fromPlace.name,
        route.fromPlace.city || '',
        route.toPlace.name,
        route.toPlace.city || '',
      ]
        .join(' ')
        .toLowerCase();

      if (normalizedQuery && !searchHaystack.includes(normalizedQuery)) {
        return false;
      }

      if (cityFilter && route.fromPlace.city !== cityFilter && route.toPlace.city !== cityFilter) {
        return false;
      }

      if (typeFilter && (route.routeType || 'General') !== typeFilter) {
        return false;
      }

      return true;
    });
  }, [cityFilter, query, routes, typeFilter]);

  return (
    <div className="catalog-browser-shell">
      <section className="catalog-browser-toolbar">
        <div className="catalog-browser-search">
          <label htmlFor="catalog-routes-search">Search transfer routes</label>
          <input
            id="catalog-routes-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by route name, city, or keywords"
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
            Type
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="">All route types</option>
              {typeOptions.map((option) => (
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
            <h3>Select a transfer route and return to the Services step</h3>
          </div>
          <Link href={returnTo} className="secondary-button">
            Back to Services
          </Link>
        </section>
      ) : null}

      <section className="catalog-results-grid">
        {filteredRoutes.length === 0 ? (
          <article className="catalog-empty-state">
            <h3>No routes match the current search</h3>
            <p>Try another city or clear the route type filter.</p>
          </article>
        ) : (
          filteredRoutes.map((route) => (
            <article key={route.id} className="catalog-result-card">
              <div className="catalog-result-head">
                <div>
                  <p className="eyebrow">{route.routeType || 'General route'}</p>
                  <h3>{route.name || `${route.fromPlace.name} - ${route.toPlace.name}`}</h3>
                </div>
                <span className={`page-tab-badge${route.isActive ? '' : ' page-tab-badge-warning'}`}>{route.isActive ? 'Active' : 'Inactive'}</span>
              </div>

              <div className="catalog-result-meta">
                <span>{route.fromPlace.name}{route.fromPlace.city ? `, ${route.fromPlace.city}` : ''}</span>
                <span>{route.toPlace.name}{route.toPlace.city ? `, ${route.toPlace.city}` : ''}</span>
                {route.durationMinutes ? <span>{route.durationMinutes} min</span> : null}
              </div>

              <p className="catalog-result-summary">
                {route.distanceKm ? `${route.distanceKm} km` : 'Distance pending'}
                {route.notes ? ` · ${route.notes}` : ' · Reusable transfer definition for quote planning.'}
              </p>

              <div className="inline-actions">
                {returnTo ? (
                  <Link href={buildSelectHref(returnTo, route.id)} className="primary-button">
                    Select
                  </Link>
                ) : null}
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
