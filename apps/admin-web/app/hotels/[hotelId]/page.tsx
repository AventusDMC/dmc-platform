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
import { HotelFactSheetForm } from '../HotelFactSheetForm';
import { RoomCategoriesSection } from '../RoomCategoriesSection';

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type HotelDetailTab =
  | 'overview'
  | 'fact-sheet'
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
  factSheet?: {
    shortDescription: string | null;
    highlightsJson: unknown;
    amenitiesJson: unknown;
    checkInTime: string | null;
    checkOutTime: string | null;
    imageGalleryJson: unknown;
  } | null;
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
  { id: 'fact-sheet', label: 'Fact Sheet' },
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

async function getHotel(hotelId: string): Promise<Hotel | null> {
  return adminPageFetchJson<Hotel | null>(`${API_BASE_URL}/hotels/${hotelId}`, 'Hotel detail', {
    cache: 'no-store',
    allow404: true,
  });
}

export default async function HotelDetailPage({ params, searchParams }: HotelDetailPageProps) {
  const [{ hotelId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const activeTab = resolveActiveTab(resolvedSearchParams?.tab);
  let hotel: Hotel | null = null;
  let hotelLoadError = '';

  try {
    hotel = await getHotel(hotelId);
  } catch (error) {
    hotelLoadError = error instanceof Error ? error.message : 'Could not load hotel detail.';
  }

  if (!hotel) {
    if (hotelLoadError) {
      return (
        <main className="page">
          <section className="panel workspace-panel workspace-panel-wide">
            <WorkspaceShell
              eyebrow="Hotel Detail"
              title="Hotel unavailable"
              description="The selected hotel could not be loaded."
              className="hotel-detail-workspace"
            >
              <section className="detail-card">
                <p className="form-error">{hotelLoadError}</p>
                <Link href="/hotels" className="secondary-button">
                  Back to hotels
                </Link>
              </section>
            </WorkspaceShell>
          </section>
        </main>
      );
    }

    notFound();
  }

  const roomCategories = hotel.roomCategories || [];
  const activeRoomCategories = roomCategories.filter((roomCategory) => roomCategory.isActive).length;
  const inactiveRoomCategories = roomCategories.length - activeRoomCategories;
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
                      <span>Contract details</span>
                      <strong>{contractCount > 0 ? 'Available in Contracts tab' : 'Not configured'}</strong>
                    </div>
                  </div>

                  {contractCount === 0 ? (
                    <p className="empty-state">No contracts are linked to this hotel yet.</p>
                  ) : null}
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

            {activeTab === 'fact-sheet' ? (
              <section className="detail-card">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Hotel Fact Sheet</p>
                    <h2>Proposal-facing hotel content</h2>
                    <p className="detail-copy">
                      Store descriptive hotel content for future proposal output. This does not affect contracts, rates, allotments, policies, or pricing.
                    </p>
                  </div>
                </div>
                <HotelFactSheetForm apiBaseUrl="/api" hotelId={hotel.id} factSheet={hotel.factSheet} />
              </section>
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
