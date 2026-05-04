import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminPageTabs } from '../../components/AdminPageTabs';
import { SummaryStrip } from '../../components/SummaryStrip';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { adminPageFetchJson } from '../../lib/admin-server';
import { HotelAllotmentsSection } from '../HotelAllotmentsSection';
import { HotelContractsSection } from '../HotelContractsSection';
import { HotelMealPlansSupplementsSection } from '../HotelMealPlansSupplementsSection';
import { HotelOccupancyChildPolicySection } from '../HotelOccupancyChildPolicySection';
import { HotelPoliciesSection } from '../HotelPoliciesSection';
import { HotelPromotionsSection } from '../HotelPromotionsSection';
import { HotelRatesSection } from '../HotelRatesSection';
import { RoomCategoriesSection } from '../RoomCategoriesSection';

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type HotelDetailTab =
  | 'overview'
  | 'room-categories'
  | 'contracts'
  | 'allotments'
  | 'rates'
  | 'occupancy-child-policy'
  | 'meal-plans-supplements'
  | 'policies'
  | 'promotions';

type Hotel = {
  id: string;
  name: string;
  city: string;
  category: string;
  supplierId: string;
  roomCategories?: Array<{
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  }>;
  _count?: {
    contracts?: number;
  };
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
  };
  _count: {
    rates: number;
    allotments: number;
  };
};

type HotelDetailPageProps = {
  params: Promise<{
    hotelId: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
    contractId?: string;
    roomCategoryId?: string;
    mealPlan?: string;
    status?: string;
  }>;
};

const HOTEL_DETAIL_TABS: Array<{ id: HotelDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'room-categories', label: 'Room Categories' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'allotments', label: 'Allotments' },
  { id: 'rates', label: 'Rates' },
  { id: 'occupancy-child-policy', label: 'Occupancy & Child Policy' },
  { id: 'meal-plans-supplements', label: 'Meal Plans & Supplements' },
  { id: 'policies', label: 'Policies' },
  { id: 'promotions', label: 'Promotions' },
];

function resolveActiveTab(tab?: string): HotelDetailTab {
  return HOTEL_DETAIL_TABS.some((entry) => entry.id === tab) ? (tab as HotelDetailTab) : 'overview';
}

async function getHotels(): Promise<Hotel[]> {
  return adminPageFetchJson<Hotel[]>(`${API_BASE_URL}/hotels`, 'Hotel detail hotels', {
    cache: 'no-store',
  });
}

async function getHotelContracts(): Promise<HotelContract[]> {
  return adminPageFetchJson<HotelContract[]>(`${API_BASE_URL}/hotel-contracts`, 'Hotel detail contracts', {
    cache: 'no-store',
  });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function getContractStatus(contract: HotelContract) {
  const now = new Date();
  const validFrom = new Date(contract.validFrom);
  const validTo = new Date(contract.validTo);

  if (validTo < now) {
    return 'Expired';
  }

  if (validFrom > now) {
    return 'Upcoming';
  }

  return 'Active';
}

export default async function HotelDetailPage({ params, searchParams }: HotelDetailPageProps) {
  const [{ hotelId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const activeTab = resolveActiveTab(resolvedSearchParams?.tab);
  const [hotels, hotelContracts] = await Promise.all([getHotels(), getHotelContracts()]);
  const hotel = hotels.find((entry) => entry.id === hotelId);

  if (!hotel) {
    notFound();
  }

  const roomCategories = hotel.roomCategories || [];
  const activeRoomCategories = roomCategories.filter((roomCategory) => roomCategory.isActive).length;
  const inactiveRoomCategories = roomCategories.length - activeRoomCategories;
  const contracts = hotelContracts.filter((contract) => contract.hotel.id === hotel.id);
  const activeContracts = contracts.filter((contract) => getContractStatus(contract) === 'Active').length;
  const totalRates = contracts.reduce((total, contract) => total + contract._count.rates, 0);
  const totalAllotments = contracts.reduce((total, contract) => total + contract._count.allotments, 0);
  const contractCount = hotel._count?.contracts || 0;
  const hotelDetailTabs = HOTEL_DETAIL_TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    href: `/hotels/${hotel.id}?tab=${tab.id}`,
  }));

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Hotel Detail"
          title={hotel.name}
          description={`${hotel.city || 'City not set'} | ${hotel.category || 'Category not set'}`}
          className="hotel-detail-workspace"
          switcher={
            <AdminPageTabs
              ariaLabel="Hotel detail sections"
              activeTab={activeTab}
              tabs={hotelDetailTabs}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'city', label: 'City', value: hotel.city || 'Not set', helper: 'Destination' },
                { id: 'category', label: 'Category', value: hotel.category || 'Not set', helper: 'Hotel type' },
                {
                  id: 'room-categories',
                  label: 'Room categories',
                  value: String(roomCategories.length),
                  helper: `${activeRoomCategories} active`,
                },
                { id: 'contracts', label: 'Contracts', value: String(contractCount), helper: 'Supplier agreements' },
              ]}
            />
          }
        >
          <section className="section-stack">
            {activeTab === 'overview' ? (
              <div className="section-stack">
                <section className="detail-card">
                  <div className="workspace-section-head">
                    <div>
                      <p className="eyebrow">Basic info</p>
                      <h2>{hotel.name}</h2>
                      <p className="detail-copy">Master hotel details used by room categories, contracts, and quote hotel selection.</p>
                    </div>
                  </div>

                  <div className="quote-preview-total-list">
                    <div>
                      <span>City</span>
                      <strong>{hotel.city || 'Not set'}</strong>
                    </div>
                    <div>
                      <span>Category</span>
                      <strong>{hotel.category || 'Not set'}</strong>
                    </div>
                    <div>
                      <span>Supplier ID</span>
                      <strong>{hotel.supplierId || 'Not set'}</strong>
                    </div>
                  </div>
                </section>

                <section className="detail-card">
                  <div className="workspace-section-head">
                    <div>
                      <p className="eyebrow">Contracts summary</p>
                      <h2>Commercial coverage</h2>
                      <p className="detail-copy">Supplier agreements connected to this hotel and their setup coverage.</p>
                    </div>
                    <Link href={`/hotels/${hotel.id}?tab=contracts`} className="secondary-button">
                      Manage contracts
                    </Link>
                  </div>

                  <div className="quote-preview-total-list">
                    <div>
                      <span>Total contracts</span>
                      <strong>{contractCount}</strong>
                    </div>
                    <div>
                      <span>Active contracts</span>
                      <strong>{activeContracts}</strong>
                    </div>
                    <div>
                      <span>Rate rows</span>
                      <strong>{totalRates}</strong>
                    </div>
                    <div>
                      <span>Allotment rows</span>
                      <strong>{totalAllotments}</strong>
                    </div>
                  </div>

                  {contracts.length > 0 ? (
                    <div className="table-wrap">
                      <table className="data-table allotment-table">
                        <thead>
                          <tr>
                            <th>Contract</th>
                            <th>Validity</th>
                            <th>Status</th>
                            <th>Setup</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contracts.slice(0, 3).map((contract) => (
                            <tr key={contract.id}>
                              <td>
                                <strong>{contract.name}</strong>
                                <div className="table-subcopy">{contract.currency}</div>
                              </td>
                              <td>{`${formatDate(contract.validFrom)} - ${formatDate(contract.validTo)}`}</td>
                              <td>{getContractStatus(contract)}</td>
                              <td>{`${contract._count.rates} rates | ${contract._count.allotments} allotments`}</td>
                              <td>
                                <div className="table-action-row">
                                  <Link href={`/hotels/contracts/${contract.id}`} className="compact-button">
                                    Open contract workspace
                                  </Link>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="empty-state">No contracts are linked to this hotel yet.</p>
                  )}
                </section>

                <section className="detail-card">
                  <div className="workspace-section-head">
                    <div>
                      <p className="eyebrow">Room categories summary</p>
                      <h2>Inventory structure</h2>
                      <p className="detail-copy">Sellable room categories available for contract rates and quote hotel services.</p>
                    </div>
                    <Link href={`/hotels/${hotel.id}?tab=room-categories`} className="secondary-button">
                      Manage room categories
                    </Link>
                  </div>

                  <div className="quote-preview-total-list">
                    <div>
                      <span>Total categories</span>
                      <strong>{roomCategories.length}</strong>
                    </div>
                    <div>
                      <span>Active</span>
                      <strong>{activeRoomCategories}</strong>
                    </div>
                    <div>
                      <span>Inactive</span>
                      <strong>{inactiveRoomCategories}</strong>
                    </div>
                  </div>

                  {roomCategories.length > 0 ? (
                    <div className="entity-card-grid">
                      {roomCategories.slice(0, 6).map((roomCategory) => (
                        <article key={roomCategory.id} className="entity-card">
                          <div className="entity-card-header">
                            <div>
                              <h3>{roomCategory.name}</h3>
                              <p>{roomCategory.code || 'No code'}</p>
                            </div>
                            <span className={roomCategory.isActive ? 'status-pill success' : 'status-pill'}>
                              {roomCategory.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">No room categories are linked to this hotel yet.</p>
                  )}
                </section>
              </div>
            ) : null}

            {activeTab === 'room-categories' ? <RoomCategoriesSection hotelId={hotel.id} /> : null}
            {activeTab === 'contracts' ? <HotelContractsSection hotelId={hotel.id} /> : null}
            {activeTab === 'allotments' ? (
              <HotelAllotmentsSection contractId={resolvedSearchParams?.contractId} hotelId={hotel.id} />
            ) : null}
            {activeTab === 'rates' ? (
              <HotelRatesSection
                contractId={resolvedSearchParams?.contractId}
                filters={{
                  hotelId: hotel.id,
                  contractId: resolvedSearchParams?.contractId,
                  roomCategoryId: resolvedSearchParams?.roomCategoryId,
                  mealPlan: resolvedSearchParams?.mealPlan,
                  status: resolvedSearchParams?.status,
                }}
              />
            ) : null}
            {activeTab === 'occupancy-child-policy' ? (
              <HotelOccupancyChildPolicySection contractId={resolvedSearchParams?.contractId} hotelId={hotel.id} />
            ) : null}
            {activeTab === 'meal-plans-supplements' ? (
              <HotelMealPlansSupplementsSection contractId={resolvedSearchParams?.contractId} hotelId={hotel.id} />
            ) : null}
            {activeTab === 'policies' ? (
              <HotelPoliciesSection contractId={resolvedSearchParams?.contractId} hotelId={hotel.id} />
            ) : null}
            {activeTab === 'promotions' ? (
              <HotelPromotionsSection contractId={resolvedSearchParams?.contractId} hotelId={hotel.id} />
            ) : null}
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
