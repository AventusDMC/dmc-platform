import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { TableSectionShell } from '../components/TableSectionShell';
import { HotelContractInventoryPanel } from './HotelContractInventoryPanel';
import { HotelAllotmentsForm } from './HotelAllotmentsForm';
import { HotelAllotmentsTable } from './HotelAllotmentsTable';

const API_BASE_URL = ADMIN_API_BASE_URL;

type HotelRoomCategory = {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

type HotelContract = {
  id: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
  hotel: {
    id: string;
    name: string;
    city: string;
    roomCategories: HotelRoomCategory[];
  };
  allotments: Array<{
    id: string;
    hotelContractId: string;
    roomCategoryId: string;
    dateFrom: string;
    dateTo: string;
    allotment: number;
    releaseDays: number;
    stopSale: boolean;
    notes: string | null;
    isActive: boolean;
    roomCategory: {
      id: string;
      name: string;
      code: string | null;
    };
    consumption: {
      configuredAllotment: number;
      consumed: number;
      remainingAvailability: number;
      inventoryMode: 'live' | 'configured';
    };
  }>;
  _count: {
    allotments: number;
  };
};

async function getHotelContracts(): Promise<HotelContract[]> {
  return adminPageFetchJson<HotelContract[]>(`${API_BASE_URL}/hotel-contracts`, 'Hotel allotments contracts', {
    cache: 'no-store',
  });
}

type HotelAllotmentsSectionProps = {
  contractId?: string;
};

export async function HotelAllotmentsSection({ contractId }: HotelAllotmentsSectionProps) {
  const contracts = await getHotelContracts();
  const visibleContracts = contractId ? contracts.filter((contract) => contract.id === contractId) : contracts;

  return (
    <TableSectionShell
      title="Allotment Control"
      description="Track contract-controlled room inventory by room category and date range without merging allotment rules into hotel rates."
      context={<p>{visibleContracts.length} contract scopes visible</p>}
      createPanel={
        <CollapsibleCreatePanel
          title="Create allotment"
          description="Add inventory controls to the current contract scope."
          triggerLabelOpen="Add allotment"
        >
          <HotelAllotmentsForm apiBaseUrl={API_BASE_URL} contracts={contracts} contractId={contractId} />
        </CollapsibleCreatePanel>
      }
      emptyState={
        visibleContracts.length === 0 ? (
          <p className="empty-state">
            {contractId ? 'No matching contract was found for this allotment view.' : 'No hotel contracts yet. Create a contract before adding allotments.'}
          </p>
        ) : undefined
      }
    >
      {visibleContracts.length > 0 ? (
        <div className="entity-list">
          {visibleContracts.map((contract) => (
            <article key={contract.id} className="entity-card">
              <div className="entity-card-header">
                <div>
                  <h2>{contract.name}</h2>
                  <p>
                    {contract.hotel.name} ({contract.hotel.city})
                  </p>
                </div>
                <span>{contract._count.allotments} allotments</span>
              </div>

              <p>Valid: {new Date(contract.validFrom).toLocaleDateString()} - {new Date(contract.validTo).toLocaleDateString()}</p>
              <p>Currency: {contract.currency}</p>

              <HotelContractInventoryPanel apiBaseUrl={API_BASE_URL} contractId={contract.id} />

              {contract.allotments.length === 0 ? (
                <p className="empty-state">No allotments for this contract yet.</p>
              ) : (
                <HotelAllotmentsTable apiBaseUrl={API_BASE_URL} contracts={contracts} contract={contract} />
              )}
            </article>
          ))}
        </div>
      ) : null}
    </TableSectionShell>
  );
}
