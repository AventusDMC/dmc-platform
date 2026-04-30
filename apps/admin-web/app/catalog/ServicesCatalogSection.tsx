import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { TableSectionShell } from '../components/TableSectionShell';
import { adminPageFetchJson } from '../lib/admin-server';
import { ServiceTypeOption } from '../lib/serviceTypes';
import { ServicesForm } from '../services/ServicesForm';
import { ServicesCatalogBrowser } from './ServicesCatalogBrowser';

const API_BASE_URL = '/api';

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

type SupplierOption = {
  id: string;
  name: string;
};

async function getServices(): Promise<SupplierService[]> {
  return adminPageFetchJson<SupplierService[]>(`${API_BASE_URL}/services`, 'Catalog services', {
    cache: 'no-store',
  });
}

async function getServiceTypes(): Promise<ServiceTypeOption[]> {
  return adminPageFetchJson<ServiceTypeOption[]>(`${API_BASE_URL}/service-types`, 'Catalog service types', {
    cache: 'no-store',
  });
}

async function getSuppliers(): Promise<SupplierOption[]> {
  return adminPageFetchJson<SupplierOption[]>(`${API_BASE_URL}/suppliers`, 'Catalog service suppliers', {
    cache: 'no-store',
  });
}

export async function ServicesCatalogSection() {
  const [services, serviceTypes, suppliers] = await Promise.all([getServices(), getServiceTypes(), getSuppliers()]);

  return (
    <TableSectionShell
      title="Activities and services"
      description="Catalog the supplier-managed activities and service records that quoting and operations rely on."
      context={<p>{services.length} services in scope</p>}
      createPanel={
        <CollapsibleCreatePanel title="Create service" description="Add supplier-managed catalog services without leaving the list." triggerLabelOpen="Add service">
          <ServicesForm apiBaseUrl="/api" serviceTypes={serviceTypes} suppliers={suppliers} />
        </CollapsibleCreatePanel>
      }
      emptyState={
        services.length === 0 ? (
          <div className="empty-state ui-empty-state">
            <strong>No services yet.</strong>
            <p>Add supplier-managed services so quote builders can select reusable products with consistent pricing metadata.</p>
          </div>
        ) : undefined
      }
    >
      {services.length > 0 ? <ServicesCatalogBrowser apiBaseUrl="/api" services={services} serviceTypes={serviceTypes} suppliers={suppliers} /> : null}
    </TableSectionShell>
  );
}
