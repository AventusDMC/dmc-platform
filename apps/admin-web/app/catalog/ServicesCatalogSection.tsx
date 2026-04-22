import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { TableSectionShell } from '../components/TableSectionShell';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { ServiceTypeOption } from '../lib/serviceTypes';
import { ServicesForm } from '../services/ServicesForm';
import { ServicesCatalogBrowser } from './ServicesCatalogBrowser';

const API_BASE_URL = ADMIN_API_BASE_URL;

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

export async function ServicesCatalogSection() {
  const [services, serviceTypes] = await Promise.all([getServices(), getServiceTypes()]);

  return (
    <TableSectionShell
      title="Activities and services"
      description="Catalog the supplier-managed activities and service records that quoting and operations rely on."
      context={<p>{services.length} services in scope</p>}
      createPanel={
        <CollapsibleCreatePanel title="Create service" description="Add supplier-managed catalog services without leaving the list." triggerLabelOpen="Add service">
          <ServicesForm apiBaseUrl={API_BASE_URL} serviceTypes={serviceTypes} />
        </CollapsibleCreatePanel>
      }
      emptyState={services.length === 0 ? <p className="empty-state">No services yet.</p> : undefined}
    >
      {services.length > 0 ? <ServicesCatalogBrowser services={services} /> : null}
    </TableSectionShell>
  );
}
