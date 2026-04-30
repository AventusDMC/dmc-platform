import { InlineEntityActions } from '../components/InlineEntityActions';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { TableSectionShell } from '../components/TableSectionShell';
import { adminPageFetchJson } from '../lib/admin-server';
import { ServiceTypeOption } from '../lib/serviceTypes';
import { ServiceTypesForm } from '../service-types/ServiceTypesForm';

const API_BASE_URL = '/api';

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
          <ServiceTypesForm apiBaseUrl="/api" />
        </CollapsibleCreatePanel>
      }
      emptyState={
        serviceTypes.length === 0 ? (
          <div className="empty-state ui-empty-state">
            <strong>No service types yet.</strong>
            <p>Create shared classifications to keep service records and quote flows aligned.</p>
          </div>
        ) : undefined
      }
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
                      apiBaseUrl="/api"
                      deletePath={`/service-types/${serviceType.id}`}
                      deleteLabel="service type"
                      confirmMessage={`Delete ${serviceType.name}?`}
                    >
                      <ServiceTypesForm
                        apiBaseUrl="/api"
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
