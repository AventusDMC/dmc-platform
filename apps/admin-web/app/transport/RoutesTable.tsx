'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DuplicateRouteButton } from '../routes/DuplicateRouteButton';
import { RoutesForm } from '../routes/RoutesForm';
import { CityOption } from '../lib/cities';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { PlaceOption } from '../lib/places';
import { PlaceTypeOption } from '../lib/placeTypes';
import { RouteOption } from '../lib/routes';
import { getCanonicalRouteLabel, isSuspiciousPricingRoute } from '../lib/transport-routes';

type RoutesTableProps = {
  apiBaseUrl: string;
  routes: RouteOption[];
  places: PlaceOption[];
  cities: CityOption[];
  placeTypes: PlaceTypeOption[];
};

function formatDuration(value: number | null) {
  return value === null ? '—' : `${value} min`;
}

function formatDistance(value: number | null) {
  return value === null ? '—' : `${value} km`;
}

function formatRouteOperations(route: RouteOption) {
  const operations = route.routeOperations;
  if (!operations) {
    return [];
  }

  return [
    operations.region ? `Region: ${operations.region}` : null,
    operations.overnight ? 'Overnight' : null,
    operations.sicPossible ? 'SIC possible' : null,
    operations.longDistance ? 'Long distance' : null,
    operations.guideRecommended ? 'Guide recommended' : null,
  ].filter((item): item is string => Boolean(item));
}

function buildSelectHref(returnTo: string, routeId: string) {
  const url = new URL(returnTo, 'https://dmc.local');
  url.searchParams.set('catalogRouteId', routeId);
  return `${url.pathname}${url.search}`;
}

export function RoutesTable({ apiBaseUrl, routes, places, cities, placeTypes }: RoutesTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get('returnTo');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(route: RouteOption) {
    if (!window.confirm(`Delete ${route.name}?`)) {
      return;
    }

    setDeletingId(route.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/routes/${route.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete route.'));
      }

      if (editingId === route.id) {
        setEditingId(null);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete route.');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="entity-list allotment-table-stack">
      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-wrap">
        <table className="data-table allotment-table">
          <thead>
            <tr>
              <th>Route</th>
              <th>From</th>
              <th>To</th>
              <th>Type</th>
              <th>Duration</th>
              <th>Distance</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {routes.map((route) => {
              const isEditing = editingId === route.id;
              const suspiciousPricingRoute = isSuspiciousPricingRoute(route);
              const canonicalRouteLabel = getCanonicalRouteLabel(route.fromPlace.name, route.toPlace.name);
              const operationFlags = formatRouteOperations(route);

              return (
                <Fragment key={route.id}>
                  <tr>
                    <td>
                      <strong>{canonicalRouteLabel}</strong>
                      {route.name && route.name !== canonicalRouteLabel ? <div className="table-subcopy">{route.name}</div> : null}
                      {suspiciousPricingRoute ? <span className="page-tab-badge page-tab-badge-warning">Pricing item?</span> : null}
                      {route.routeOperations?.taxonomyReview ? <span className="page-tab-badge page-tab-badge-warning">Review taxonomy</span> : null}
                      {route.notes ? <div className="table-subcopy">{route.notes}</div> : null}
                      {operationFlags.length > 0 ? <div className="table-subcopy">{operationFlags.join(' | ')}</div> : null}
                    </td>
                    <td>
                      {route.fromPlace.name}
                      {route.fromPlace.city ? <div className="table-subcopy">{route.fromPlace.city}</div> : null}
                    </td>
                    <td>
                      {route.toPlace.name}
                      {route.toPlace.city ? <div className="table-subcopy">{route.toPlace.city}</div> : null}
                    </td>
                    <td>{route.routeType || '—'}</td>
                    <td>{formatDuration(route.durationMinutes)}</td>
                    <td>{formatDistance(route.distanceKm)}</td>
                    <td>{route.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      <div className="table-action-row">
                        {returnTo ? (
                          <Link href={buildSelectHref(returnTo, route.id)} className="compact-button">
                            Select
                          </Link>
                        ) : null}
                        <Link href={`/transport/routes/${route.id}`} className="compact-button">
                          Open route
                        </Link>
                        <button
                          type="button"
                          className="compact-button"
                          onClick={() => setEditingId((current) => (current === route.id ? null : route.id))}
                        >
                          {isEditing ? 'Close edit' : 'Edit'}
                        </button>
                        <DuplicateRouteButton apiBaseUrl={apiBaseUrl} routeId={route.id} />
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(route)}
                          disabled={deletingId === route.id}
                        >
                          {deletingId === route.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isEditing ? (
                    <tr>
                      <td colSpan={8}>
                        <InlineRowEditorShell>
                          <RoutesForm
                            apiBaseUrl={apiBaseUrl}
                            places={places}
                            cities={cities}
                            placeTypes={placeTypes}
                            routeId={route.id}
                            submitLabel="Save route"
                            initialValues={{
                              fromPlaceId: route.fromPlaceId,
                              toPlaceId: route.toPlaceId,
                              name: route.name,
                              routeType: route.routeType || '',
                              durationMinutes: route.durationMinutes === null ? '' : String(route.durationMinutes),
                              distanceKm: route.distanceKm === null ? '' : String(route.distanceKm),
                              notes: route.notes || '',
                              isActive: route.isActive,
                            }}
                          />
                        </InlineRowEditorShell>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
