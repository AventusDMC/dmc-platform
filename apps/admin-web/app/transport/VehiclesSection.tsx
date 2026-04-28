import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { TableSectionShell } from '../components/TableSectionShell';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { VehiclesForm } from '../vehicles/VehiclesForm';
import { VehiclesTable } from './VehiclesTable';

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';

type Vehicle = {
  id: string;
  supplierId: string;
  name: string;
  maxPax: number;
  luggageCapacity: number;
};

async function getVehicles(): Promise<Vehicle[]> {
  return adminPageFetchJson<Vehicle[]>(`${API_BASE_URL}/vehicles`, 'Transport vehicles', {
    cache: 'no-store',
  });
}

export async function VehiclesSection() {
  const vehicles = await getVehicles();

  return (
    <TableSectionShell
      title="Vehicle Fleet"
      description="Maintain the transport inventory used across route planning, pricing rules, and vehicle slab setup."
      context={<p>{vehicles.length} vehicles in scope</p>}
      createPanel={
        <CollapsibleCreatePanel title="Create vehicle" description="Add fleet inventory without leaving the Transport workspace." triggerLabelOpen="Add vehicle">
          <VehiclesForm apiBaseUrl={ACTION_API_BASE_URL} />
        </CollapsibleCreatePanel>
      }
      emptyState={vehicles.length === 0 ? <p className="empty-state">No vehicles yet.</p> : undefined}
    >
      {vehicles.length > 0 ? <VehiclesTable apiBaseUrl={ACTION_API_BASE_URL} vehicles={vehicles} /> : null}
    </TableSectionShell>
  );
}
