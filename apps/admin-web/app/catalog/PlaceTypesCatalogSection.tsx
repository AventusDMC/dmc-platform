import { InlineEntityActions } from '../components/InlineEntityActions';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { TableSectionShell } from '../components/TableSectionShell';
import { adminPageFetchJson } from '../lib/admin-server';
import { PlaceTypeOption } from '../lib/placeTypes';
import { PlaceTypesForm } from '../place-types/PlaceTypesForm';

const API_BASE_URL = '/api';

async function getPlaceTypes(): Promise<PlaceTypeOption[]> {
  return adminPageFetchJson<PlaceTypeOption[]>(`${API_BASE_URL}/place-types`, 'Catalog place types', {
    cache: 'no-store',
  });
}

export async function PlaceTypesCatalogSection() {
  const placeTypes = await getPlaceTypes();

  return (
    <TableSectionShell
      title="Place types"
      description="Shared place type records keep airports, attractions, cities, and hotel areas aligned around the same reusable labels."
      context={<p>{placeTypes.length} place types in scope</p>}
      createPanel={
        <CollapsibleCreatePanel title="Create place type" description="Add shared location labels without leaving the list." triggerLabelOpen="Add place type">
          <PlaceTypesForm apiBaseUrl="/api" />
        </CollapsibleCreatePanel>
      }
      emptyState={placeTypes.length === 0 ? <p className="empty-state">No place types yet.</p> : undefined}
    >
      {placeTypes.length > 0 ? (
        <div className="table-wrap">
          <table className="data-table allotment-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {placeTypes.map((placeType) => (
                <tr key={placeType.id}>
                  <td>
                    <strong>{placeType.name}</strong>
                  </td>
                  <td>{placeType.isActive ? 'Active' : 'Inactive'}</td>
                  <td>
                    <InlineEntityActions
                      apiBaseUrl="/api"
                      deletePath={`/place-types/${placeType.id}`}
                      deleteLabel="place type"
                      confirmMessage={`Delete ${placeType.name}?`}
                    >
                      <PlaceTypesForm
                        apiBaseUrl="/api"
                        placeTypeId={placeType.id}
                        submitLabel="Save place type"
                        initialValues={{
                          name: placeType.name,
                          isActive: placeType.isActive,
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
