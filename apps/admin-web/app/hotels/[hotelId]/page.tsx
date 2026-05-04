import { notFound } from 'next/navigation';
import { AdminPageTabs } from '../../components/AdminPageTabs';
import { SummaryStrip } from '../../components/SummaryStrip';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { adminPageFetchJson } from '../../lib/admin-server';
import { HotelContractsSection } from '../HotelContractsSection';
import { RoomCategoriesSection } from '../RoomCategoriesSection';

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type HotelDetailTab = 'overview' | 'room-categories' | 'contracts';

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

type HotelDetailPageProps = {
  params: Promise<{
    hotelId: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
  }>;
};

const HOTEL_DETAIL_TABS: Array<{ id: HotelDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'room-categories', label: 'Room Categories' },
  { id: 'contracts', label: 'Contracts' },
];

function resolveActiveTab(tab?: string): HotelDetailTab {
  return HOTEL_DETAIL_TABS.some((entry) => entry.id === tab) ? (tab as HotelDetailTab) : 'overview';
}

async function getHotels(): Promise<Hotel[]> {
  return adminPageFetchJson<Hotel[]>(`${API_BASE_URL}/hotels`, 'Hotel detail hotels', {
    cache: 'no-store',
  });
}

export default async function HotelDetailPage({ params, searchParams }: HotelDetailPageProps) {
  const [{ hotelId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const activeTab = resolveActiveTab(resolvedSearchParams?.tab);
  const hotels = await getHotels();
  const hotel = hotels.find((entry) => entry.id === hotelId);

  if (!hotel) {
    notFound();
  }

  const roomCategories = hotel.roomCategories || [];
  const activeRoomCategories = roomCategories.filter((roomCategory) => roomCategory.isActive).length;
  const contractCount = hotel._count?.contracts || 0;

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Hotel Detail"
          title={hotel.name}
          description={`${hotel.city || 'City not set'} | ${hotel.category || 'Category not set'}`}
          switcher={
            <AdminPageTabs
              ariaLabel="Hotel detail sections"
              activeTab={activeTab}
              tabs={HOTEL_DETAIL_TABS.map((tab) => ({
                id: tab.id,
                label: tab.label,
                href: `/hotels/${hotel.id}?tab=${tab.id}`,
              }))}
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
              <section className="detail-card">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Overview</p>
                    <h2>{hotel.name}</h2>
                    <p className="detail-copy">Basic hotel master data for this product record.</p>
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
                    <span>Room categories</span>
                    <strong>{roomCategories.length}</strong>
                  </div>
                  <div>
                    <span>Contracts</span>
                    <strong>{contractCount}</strong>
                  </div>
                </div>
              </section>
            ) : null}

            {activeTab === 'room-categories' ? <RoomCategoriesSection hotelId={hotel.id} /> : null}
            {activeTab === 'contracts' ? <HotelContractsSection hotelId={hotel.id} /> : null}
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
