import { InlineEntityActions } from '../components/InlineEntityActions';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { TableSectionShell } from '../components/TableSectionShell';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { ServiceTypeOption } from '../lib/serviceTypes';
import { ServiceTypesForm } from '../service-types/ServiceTypesForm';

const API_BASE_URL = ADMIN_API_BASE_URL;

async function getServiceTypes(): Promise<ServiceTypeOption[]> {
  return adminPageFetchJson<ServiceTypeOption[]>(`${API_BASE_URL}/service-types`, 'Catalog service types', {
    cache: 'no-store',
  });
}

export async function ServiceTypesCatalogSection() {
  const serviceTypes = await getServiceTypes();

  return (
    <TableSectionShell
      title="Service types"
      description="Shared service types keep services and quote flows aligned around the same reusable hotel, transport, guide, activity, meal, and misc labels."
      context={<p>{serviceTypes.length} service types in scope</p>}
      createPanel={
        <CollapsibleCreatePanel title="Create service type" description="Add a shared classification without leaving the catalog list." triggerLabelOpen="Add service type">
          <ServiceTypesForm apiBaseUrl={API_BASE_URL} />
        </CollapsibleCreatePanel>
      }
      emptyState={serviceTypes.length === 0 ? <p className="empty-state">No service types yet.</p> : undefined}
    >
      {serviceTypes.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table allotment-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Code</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {serviceTypes.map((serviceType) => (
                <tr key={serviceType.id}>
                  <td>
                    <strong>{serviceType.name}</strong>
                  </td>
                  <td>{serviceType.code || 'No code'}</td>
                  <td>{serviceType.isActive ? 'Active' : 'Inactive'}</td>
                  <td>
                    <InlineEntityActions
                      apiBaseUrl={API_BASE_URL}
                      deletePath={`/service-types/${serviceType.id}`}
                      deleteLabel="service type"
                      confirmMessage={`Delete ${serviceType.name}?`}
                    >
                      <ServiceTypesForm
                        apiBaseUrl={API_BASE_URL}
                        serviceTypeId={serviceType.id}
                        submitLabel="Save service type"
                        initialValues={{
                          name: serviceType.name,
                          code: serviceType.code || '',
                          isActive: serviceType.isActive,
                        }}
                      />
                    </InlineEntityActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </TableSectionShell>
  );
}
