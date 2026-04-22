'use client';

import { Fragment, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RouteOption } from '../lib/routes';
import { DuplicateVehicleRateButton } from '../vehicle-rates/DuplicateVehicleRateButton';
import { VehicleRatesForm } from '../vehicle-rates/VehicleRatesForm';
import { CityOption } from '../lib/cities';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { PlaceOption } from '../lib/places';
import { PlaceTypeOption } from '../lib/placeTypes';

type Vehicle = {
  id: string;
  name: string;
};

type TransportServiceType = {
  id: string;
  name: string;
  code: string;
};

type VehicleRate = {
  id: string;
  vehicleId: string;
  serviceTypeId: string;
  routeId: string | null;
  fromPlaceId: string | null;
  toPlaceId: string | null;
  routeName: string;
  minPax: number;
  maxPax: number;
  price: number;
  currency: string;
  validFrom: string;
  validTo: string;
  vehicle: { name: string };
  serviceType: { name: string; code: string };
  route: RouteOption | null;
};

type VehicleRatesTableProps = {
  apiBaseUrl: string;
  vehicleRates: VehicleRate[];
  vehicles: Vehicle[];
  serviceTypes: TransportServiceType[];
  places: PlaceOption[];
  cities: CityOption[];
  placeTypes: PlaceTypeOption[];
  routes: RouteOption[];
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

export function VehicleRatesTable({
  apiBaseUrl,
  vehicleRates,
  vehicles,
  serviceTypes,
  places,
  cities,
  placeTypes,
  routes,
}: VehicleRatesTableProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleDelete(rate: VehicleRate) {
    if (!window.confirm(`Delete ${rate.routeName}?`)) {
      return;
    }

    setDeletingId(rate.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/vehicle-rates/${rate.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete vehicle rate.'));
      }

      if (editingId === rate.id) {
        setEditingId(null);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete vehicle rate.');
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
              <th>Service type</th>
              <th>Vehicle</th>
              <th>Pax</th>
              <th>Validity</th>
              <th>Price</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vehicleRates.map((rate) => {
              const isEditing = editingId === rate.id;

              return (
                <Fragment key={rate.id}>
                  <tr>
                    <td>
                      <strong>{rate.routeName}</strong>
                      {rate.route ? <div className="table-subcopy">{rate.route.name}</div> : null}
                    </td>
                    <td>
                      {rate.serviceType.name}
                      <div className="table-subcopy">{rate.serviceType.code}</div>
                    </td>
                    <td>{rate.vehicle.name}</td>
                    <td>
                      {rate.minPax} - {rate.maxPax}
                    </td>
                    <td>
                      {formatDate(rate.validFrom)} - {formatDate(rate.validTo)}
                    </td>
                    <td>
                      {rate.currency} {rate.price.toFixed(2)}
                    </td>
                    <td>
                      <div className="table-action-row">
                        <button
                          type="button"
                          className="compact-button"
                          onClick={() => setEditingId((current) => (current === rate.id ? null : rate.id))}
                        >
                          {isEditing ? 'Close edit' : 'Edit'}
                        </button>
                        <DuplicateVehicleRateButton apiBaseUrl={apiBaseUrl} rateId={rate.id} />
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(rate)}
                          disabled={deletingId === rate.id}
                        >
                          {deletingId === rate.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isEditing ? (
                    <tr>
                      <td colSpan={7}>
                        <InlineRowEditorShell>
                          <VehicleRatesForm
                            apiBaseUrl={apiBaseUrl}
                            vehicles={vehicles}
                            serviceTypes={serviceTypes}
                            places={places}
                            cities={cities}
                            placeTypes={placeTypes}
                            routes={routes}
                            rateId={rate.id}
                            submitLabel="Save vehicle rate"
                            initialValues={{
                              vehicleId: rate.vehicleId,
                              serviceTypeId: rate.serviceTypeId,
                              routeId: rate.routeId || '',
                              fromPlaceId: rate.fromPlaceId || '',
                              toPlaceId: rate.toPlaceId || '',
                              routeName: rate.routeName,
                              minPax: String(rate.minPax),
                              maxPax: String(rate.maxPax),
                              price: String(rate.price),
                              currency: rate.currency,
                              validFrom: rate.validFrom.slice(0, 10),
                              validTo: rate.validTo.slice(0, 10),
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
