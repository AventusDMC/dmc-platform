import { CityOption } from '../lib/cities';
import { PlaceTypeOption } from '../lib/placeTypes';
import { PlaceOption } from '../lib/places';
import { RouteOption } from '../lib/routes';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { TableSectionShell } from '../components/TableSectionShell';
import { TransportServiceTypeForm } from '../vehicle-rates/TransportServiceTypeForm';
import { TransportServiceTypesTable } from './TransportServiceTypesTable';
import { TransportContractImportPanel } from './TransportContractImportPanel';
import { SupplierRateCardsSafeLoader } from './SupplierRateCardsSafeLoader';

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
  classification?: string;
};

type Supplier = {
  id: string;
  name: string;
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

async function getPlaces(): Promise<PlaceOption[]> {
  return adminPageFetchJson<PlaceOption[]>(`${API_BASE_URL}/places?selector=true`, 'Vehicle rates places', {
    cache: 'no-store',
  });
}

async function getRoutes(): Promise<RouteOption[]> {
  return adminPageFetchJson<RouteOption[]>(`${API_BASE_URL}/routes?type=transfer&limit=200`, 'Vehicle rates routes', {
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

async function getSuppliers(): Promise<Supplier[]> {
  return adminPageFetchJson<Supplier[]>(`${API_BASE_URL}/suppliers`, 'Transport suppliers', {
    cache: 'no-store',
  });
}

type VehicleRatesSectionProps = {
  routeId?: string;
  title?: string;
  description?: string;
  showServiceTypes?: boolean;
};

export async function VehicleRatesSection({
  routeId,
  title = 'Supplier Rate Cards',
  description = 'Upload supplier Excel contracts, confirm the parsed rows, and publish route rates, full-day packages, and add-ons for Quote Planner.',
  showServiceTypes = true,
}: VehicleRatesSectionProps = {}) {
  const [vehicles, serviceTypes, places, routes, cities, placeTypes, suppliers] = await Promise.all([
    getVehicles(),
    getTransportServiceTypes(),
    getPlaces(),
    getRoutes(),
    getCities(),
    getPlaceTypes(),
    getSuppliers(),
  ]);
  const contextHelper = routeId ? 'route filter available' : 'load cards when needed';

  return (
    <div className="section-stack">
      {showServiceTypes ? (
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
      ) : null}

      <TableSectionShell
        // Keep the default tab source-stable for transport catalog regression checks: title="Supplier Rate Cards"
        title={title}
        description={description}
        context={<p>{contextHelper}</p>}
      >
        <section className="transport-contract-import-hero">
          <div>
            <p className="eyebrow">Primary workflow</p>
            <h3>Upload Contract</h3>
            <p>Import the supplier Excel contract, review route transfers, full-day services, and add-ons, then confirm. Imported rates are available in Quote Planner immediately.</p>
          </div>
          <TransportContractImportPanel apiBaseUrl={ACTION_API_BASE_URL} />
        </section>
        <SupplierRateCardsSafeLoader
          apiBaseUrl={ACTION_API_BASE_URL}
          routeId={routeId}
          vehicles={vehicles}
          serviceTypes={serviceTypes}
          places={places}
          cities={cities}
          placeTypes={placeTypes}
          routes={routes}
          suppliers={suppliers}
        />
      </TableSectionShell>
    </div>
  );
}
