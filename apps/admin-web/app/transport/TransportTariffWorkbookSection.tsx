import { QueryDropdownFilters, type QueryDropdownFilterOption } from '../components/QueryDropdownFilters';
import { SummaryStrip } from '../components/SummaryStrip';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { formatRouteLabel, formatSupplierName } from '../lib/transport-formatters';
import { deriveTransportPricingMode, TRANSPORT_RATE_CARD_PRICING_MODES } from '../lib/transport-pricing-modes';
import { normalizeVehicleTypeLabel } from '../lib/vehicle-types';
import { TransportTariffWorkbookGrid, type TransportTariffWorkbookRow } from './TransportTariffWorkbookGrid';

const API_BASE_URL = ADMIN_API_BASE_URL;

type Supplier = {
  id: string;
  name: string;
};

type Route = {
  id: string;
  name: string;
  isActive?: boolean;
};

type Vehicle = {
  id: string;
  name: string;
  vehicleType?: string | null;
};

type VehicleRate = {
  id: string;
  vehicleId: string;
  serviceTypeId: string;
  routeId: string | null;
  routeName: string;
  minPax: number;
  maxPax: number;
  price: number;
  currency: string;
  notes?: string | null;
  active: boolean;
  validFrom: string;
  validTo: string;
  supplierId?: string | null;
  supplierName?: string | null;
  supplier?: {
    id?: string | null;
    name?: string | null;
  } | null;
  transportService?: {
    supplier?: {
      name?: string | null;
    } | null;
  } | null;
  service?: {
    supplier?: {
      name?: string | null;
    } | null;
  } | null;
  vehicle: {
    name: string;
    vehicleType?: string | null;
  };
  serviceType: {
    name: string;
    code: string;
    classification?: string | null;
  };
  route: {
    id: string;
    name: string;
  } | null;
};

type TransportTariffWorkbookFilters = {
  supplierId?: string;
  routeId?: string;
  pricingMode?: string;
  vehicleType?: string;
  validity?: string;
  activeState?: string;
};

export type TransportTariffWorkbookRateFilter = TransportTariffWorkbookFilters;

type FilterableTransportTariffRate = {
  id: string;
  supplierId?: string | null;
  supplier?: {
    id?: string | null;
  } | null;
  routeId: string | null;
  routeName: string;
  validFrom: string;
  validTo: string;
  active: boolean;
  vehicle: {
    name: string;
    vehicleType?: string | null;
  };
  serviceType: {
    name: string;
    code: string;
    classification?: string | null;
  };
  route: {
    id: string;
    name: string;
  } | null;
};

async function getVehicleRates(): Promise<VehicleRate[]> {
  return adminPageFetchJson<VehicleRate[]>(`${API_BASE_URL}/vehicle-rates`, 'Transport tariff workbook rates', {
    cache: 'no-store',
  });
}

async function getSuppliers(): Promise<Supplier[]> {
  return adminPageFetchJson<Supplier[]>(`${API_BASE_URL}/suppliers`, 'Transport tariff workbook suppliers', {
    cache: 'no-store',
  });
}

async function getRoutes(): Promise<Route[]> {
  return adminPageFetchJson<Route[]>(`${API_BASE_URL}/routes?type=transfer&limit=200`, 'Transport tariff workbook routes', {
    cache: 'no-store',
  });
}

async function getVehicles(): Promise<Vehicle[]> {
  return adminPageFetchJson<Vehicle[]>(`${API_BASE_URL}/vehicles`, 'Transport tariff workbook vehicles', {
    cache: 'no-store',
  });
}

function buildOptions(entries: Array<{ value: string; label: string }>): QueryDropdownFilterOption[] {
  return entries
    .filter((entry, index, collection) => collection.findIndex((current) => current.value === entry.value) === index)
    .sort((left, right) => left.label.localeCompare(right.label));
}

function formatDateRange(from: string, to: string) {
  return `${new Date(from).toLocaleDateString()} - ${new Date(to).toLocaleDateString()}`;
}

function getValidityKey(rate: Pick<VehicleRate, 'validFrom' | 'validTo'>) {
  return `${rate.validFrom.slice(0, 10)}:${rate.validTo.slice(0, 10)}`;
}

function getSupplierId(rate: Pick<FilterableTransportTariffRate, 'supplierId' | 'supplier'>) {
  return rate.supplier?.id || rate.supplierId || '';
}

function getSupplierLabel(rate: VehicleRate) {
  return formatSupplierName(
    rate.supplier?.name ?? rate.supplierName ?? rate.transportService?.supplier?.name ?? rate.service?.supplier?.name,
    null,
  );
}

function getVehicleTypeLabel(rate: Pick<FilterableTransportTariffRate, 'vehicle'>) {
  return normalizeVehicleTypeLabel(rate.vehicle.vehicleType) || normalizeVehicleTypeLabel(rate.vehicle.name) || rate.vehicle.name || 'Unassigned vehicle';
}

function getRouteLabel(rate: Pick<FilterableTransportTariffRate, 'route' | 'routeName'>) {
  return formatRouteLabel(rate.route?.name || rate.routeName);
}

function getPricingMode(rate: FilterableTransportTariffRate) {
  return deriveTransportPricingMode(rate) || 'Point-to-Point';
}

export function filterTransportTariffRates<T extends FilterableTransportTariffRate>(rates: T[], filters: TransportTariffWorkbookRateFilter) {
  const supplierId = filters.supplierId || '';
  const routeId = filters.routeId || '';
  const pricingMode = filters.pricingMode || '';
  const vehicleType = filters.vehicleType || '';
  const validity = filters.validity || '';
  const activeState = filters.activeState || '';

  return rates.filter((rate) => {
    if (supplierId && getSupplierId(rate) !== supplierId) return false;
    if (routeId && rate.routeId !== routeId && rate.route?.id !== routeId) return false;
    if (pricingMode && getPricingMode(rate) !== pricingMode) return false;
    if (vehicleType && getVehicleTypeLabel(rate) !== vehicleType) return false;
    if (validity && getValidityKey(rate) !== validity) return false;
    if (activeState === 'active' && !rate.active) return false;
    if (activeState === 'inactive' && rate.active) return false;

    return true;
  });
}

function buildRows(rates: VehicleRate[]): TransportTariffWorkbookRow[] {
  return rates
    .map((rate) => {
      const cost = Number(rate.price);

      return {
        id: rate.id,
        supplier: getSupplierLabel(rate),
        route: getRouteLabel(rate),
        pricingMode: getPricingMode(rate),
        vehicleType: getVehicleTypeLabel(rate),
        paxRange: `${rate.minPax}-${rate.maxPax}`,
        currency: rate.currency,
        validity: formatDateRange(rate.validFrom, rate.validTo),
        cost: Number.isFinite(cost) ? cost.toFixed(2) : '',
        notes: rate.notes || '',
        status: rate.active ? 'Active' : 'Inactive',
      };
    })
    .sort((left, right) =>
      [left.supplier, left.route, left.pricingMode, left.vehicleType, left.paxRange]
        .join('|')
        .localeCompare([right.supplier, right.route, right.pricingMode, right.vehicleType, right.paxRange].join('|')),
    );
}

type TransportTariffWorkbookSectionProps = {
  filters?: TransportTariffWorkbookFilters;
};

export async function TransportTariffWorkbookSection({ filters }: TransportTariffWorkbookSectionProps) {
  const [vehicleRates, suppliers, routes, vehicles] = await Promise.all([getVehicleRates(), getSuppliers(), getRoutes(), getVehicles()]);
  const supplierId = filters?.supplierId || '';
  const routeId = filters?.routeId || '';
  const pricingMode = filters?.pricingMode || '';
  const vehicleType = filters?.vehicleType || '';
  const validity = filters?.validity || '';
  const activeState = filters?.activeState || '';
  const visibleRates = filterTransportTariffRates(vehicleRates, {
    supplierId,
    routeId,
    pricingMode,
    vehicleType,
    validity,
    activeState,
  });
  const workbookRows = buildRows(visibleRates);
  const vehicleTypeOptions = buildOptions(
    Array.from(new Set([...vehicles.map((vehicle) => normalizeVehicleTypeLabel(vehicle.vehicleType) || normalizeVehicleTypeLabel(vehicle.name) || vehicle.name), ...vehicleRates.map(getVehicleTypeLabel)]))
      .filter(Boolean)
      .map((label) => ({ value: label, label })),
  );
  const validityOptions = buildOptions(
    vehicleRates.map((rate) => ({
      value: getValidityKey(rate),
      label: formatDateRange(rate.validFrom, rate.validTo),
    })),
  );

  return (
    <div className="section-stack">
      <QueryDropdownFilters
        eyebrow="Tariff workbook filters"
        title="Transportation tariff workbook filters"
        description="Filter supplier transport rates by supplier, route, pricing mode, vehicle type, validity, and active state."
        filters={[
          {
            key: 'supplierId',
            label: 'Supplier',
            placeholder: 'All suppliers',
            value: supplierId,
            options: buildOptions(suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))),
          },
          {
            key: 'routeId',
            label: 'Route',
            placeholder: 'All routes',
            value: routeId,
            options: buildOptions(routes.map((route) => ({ value: route.id, label: formatRouteLabel(route.name) }))),
          },
          {
            key: 'pricingMode',
            label: 'Pricing Mode',
            placeholder: 'All pricing modes',
            value: pricingMode,
            options: TRANSPORT_RATE_CARD_PRICING_MODES.map((mode) => ({ value: mode, label: mode })),
          },
          {
            key: 'vehicleType',
            label: 'Vehicle Type',
            placeholder: 'All vehicle types',
            value: vehicleType,
            options: vehicleTypeOptions,
            advanced: true,
          },
          {
            key: 'validity',
            label: 'Validity',
            placeholder: 'All validity ranges',
            value: validity,
            options: validityOptions,
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
        advancedDescription="Use advanced filters for vehicle type, validity, and active status without changing saved rate lines."
      />

      <div className="transport-rate-card-toolbar">
        <a className="primary-button" href="/api/vehicle-rates/tariff-matrix/transfer/export" download>
          Export Transfer Tariffs
        </a>
        <a className="secondary-button" href="/api/vehicle-rates/tariff-matrix/touring/export" download>
          Export Touring Tariffs
        </a>
      </div>

      <SummaryStrip
        items={[
          { id: 'rate-lines', label: 'Rate lines', value: String(workbookRows.length), helper: 'Workbook rows' },
          { id: 'suppliers', label: 'Suppliers', value: String(new Set(visibleRates.map(getSupplierLabel)).size), helper: 'In scope' },
          { id: 'routes', label: 'Transfer Routes', value: String(new Set(visibleRates.map(getRouteLabel)).size), helper: 'Geographic transfer routes' },
          { id: 'pricing-modes', label: 'Pricing modes', value: String(new Set(visibleRates.map(getPricingMode)).size), helper: 'Operational behavior' },
        ]}
      />

      {workbookRows.length === 0 ? (
        <p className="empty-state">No transportation tariff rows match the selected filters.</p>
      ) : (
        <TransportTariffWorkbookGrid rows={workbookRows} />
      )}
    </div>
  );
}
