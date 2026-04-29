import { CityOption } from '../lib/cities';
import { PlaceTypeOption } from '../lib/placeTypes';
import { PlaceOption } from '../lib/places';
import { RouteOption } from '../lib/routes';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { TableSectionShell } from '../components/TableSectionShell';
import { TransportServiceTypeForm } from '../vehicle-rates/TransportServiceTypeForm';
import { VehicleRatesForm } from '../vehicle-rates/VehicleRatesForm';
import { TransportServiceTypesTable } from './TransportServiceTypesTable';
import { VehicleRatesTable } from './VehicleRatesTable';

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';

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
  vehicle: {
    name: string;
    supplierId?: string | null;
    supplier?: {
      name: string;
    } | null;
  };
  serviceType: {
    name: string;
    code: string;
  };
  route: RouteOption | null;
  fromPlace: PlaceOption | null;
  toPlace: PlaceOption | null;
};

async function getVehicles(): Promise<Vehicle[]> {
  return adminPageFetchJson<Vehicle[]>(`${API_BASE_URL}/vehicles`, 'Vehicle rates vehicles', {
    cache: 'no-store',
  });
}

async function getTransportServiceTypes(): Promise<TransportServiceType[]> {
  return adminPageFetchJson<TransportServiceType[]>(`${API_BASE_URL}/transport-service-types`, 'Vehicle rates service types', {
    cache: 'no-store',
  });
}

async function getVehicleRates(): Promise<VehicleRate[]> {
  return adminPageFetchJson<VehicleRate[]>(`${API_BASE_URL}/vehicle-rates`, 'Vehicle rates list', {
    cache: 'no-store',
  });
}

async function getPlaces(): Promise<PlaceOption[]> {
  return adminPageFetchJson<PlaceOption[]>(`${API_BASE_URL}/places`, 'Vehicle rates places', {
    cache: 'no-store',
  });
}

async function getRoutes(): Promise<RouteOption[]> {
  return adminPageFetchJson<RouteOption[]>(`${API_BASE_URL}/routes`, 'Vehicle rates routes', {
    cache: 'no-store',
  });
}

async function getCities(): Promise<CityOption[]> {
  return adminPageFetchJson<CityOption[]>(`${API_BASE_URL}/cities?active=true`, 'Vehicle rates active cities', {
    cache: 'no-store',
  });
}

async function getPlaceTypes(): Promise<PlaceTypeOption[]> {
  return adminPageFetchJson<PlaceTypeOption[]>(`${API_BASE_URL}/place-types?active=true`, 'Vehicle rates active place types', {
    cache: 'no-store',
  });
}

export async function VehicleRatesSection() {
  const [vehicles, serviceTypes, vehicleRates, places, routes, cities, placeTypes] = await Promise.all([
    getVehicles(),
    getTransportServiceTypes(),
    getVehicleRates(),
    getPlaces(),
    getRoutes(),
    getCities(),
    getPlaceTypes(),
  ]);

  return (
    <div className="section-stack">
      <TableSectionShell
        title="Transport Service Types"
        description="Maintain the reusable service-type taxonomy behind vehicle slabs and route pricing."
        context={<p>{serviceTypes.length} service types in scope</p>}
        createPanel={
          <CollapsibleCreatePanel title="Create service type" description="Add reusable transport service labels." triggerLabelOpen="Add service type">
            <TransportServiceTypeForm apiBaseUrl={ACTION_API_BASE_URL} />
          </CollapsibleCreatePanel>
        }
        emptyState={serviceTypes.length === 0 ? <p className="empty-state">No transport service types yet.</p> : undefined}
      >
        {serviceTypes.length > 0 ? <TransportServiceTypesTable apiBaseUrl={ACTION_API_BASE_URL} serviceTypes={serviceTypes} /> : null}
      </TableSectionShell>

      <TableSectionShell
        title="Supplier Rate Cards"
        description="Manage supplier transport rate cards, vehicle rates, routes, pax ranges, and validity periods."
        context={<p>{vehicleRates.length} rate lines in scope</p>}
        actions={
          <button type="button" className="primary-button transport-contract-new-button">
            + New Supplier Rate Card
          </button>
        }
        createPanel={
          <CollapsibleCreatePanel
            title="Create rate line"
            description="Add a supplier rate-card line using the current routes, vehicles, and service types."
            triggerLabelOpen="Create rate line"
          >
            <VehicleRatesForm
              apiBaseUrl={ACTION_API_BASE_URL}
              vehicles={vehicles}
              serviceTypes={serviceTypes}
              places={places}
              cities={cities}
              placeTypes={placeTypes}
              routes={routes}
            />
          </CollapsibleCreatePanel>
        }
        emptyState={vehicleRates.length === 0 ? <p className="empty-state">No supplier rate-card lines yet.</p> : undefined}
      >
        {vehicleRates.length > 0 ? (
          <VehicleRatesTable
            apiBaseUrl={ACTION_API_BASE_URL}
            vehicleRates={vehicleRates}
            vehicles={vehicles}
            serviceTypes={serviceTypes}
            places={places}
            cities={cities}
            placeTypes={placeTypes}
            routes={routes}
          />
        ) : null}
      </TableSectionShell>
    </div>
  );
}
