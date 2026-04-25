import Link from 'next/link';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { SummaryStrip } from '../components/SummaryStrip';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { adminPageFetchJson } from '../lib/admin-server';
import { HotelAllotmentsSection } from './HotelAllotmentsSection';
import { HotelContractsSection } from './HotelContractsSection';
import { HotelMealPlansSupplementsSection } from './HotelMealPlansSupplementsSection';
import { HotelOccupancyChildPolicySection } from './HotelOccupancyChildPolicySection';
import { HotelPoliciesSection } from './HotelPoliciesSection';
import { HotelPromotionsSection } from './HotelPromotionsSection';
import { HotelRatesSection } from './HotelRatesSection';
import { HotelsSection } from './HotelsSection';
import { RoomCategoriesSection } from './RoomCategoriesSection';

type HotelsTab =
  | 'hotels'
  | 'room-categories'
  | 'contracts'
  | 'allotments'
  | 'rates'
  | 'occupancy-child-policy'
  | 'meal-plans-supplements'
  | 'policies'
  | 'promotions';
const API_BASE_URL = '/api';

type HotelsPageProps = {
  searchParams?: Promise<{
    tab?: string;
    cityId?: string;
    hotelId?: string;
    contractId?: string;
    roomCategoryId?: string;
    mealPlan?: string;
    status?: string;
  }>;
};

const HOTEL_TABS: Array<{ id: HotelsTab; label: string }> = [
  { id: 'hotels', label: 'Hotels' },
  { id: 'room-categories', label: 'Room Categories' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'allotments', label: 'Allotments' },
  { id: 'rates', label: 'Rates' },
  { id: 'occupancy-child-policy', label: 'Occupancy & Child Policy' },
  { id: 'meal-plans-supplements', label: 'Meal Plans & Supplements' },
  { id: 'policies', label: 'Policies' },
  { id: 'promotions', label: 'Promotions' },
];

type HotelsPageHotel = {
  id: string;
  roomCategories: Array<{
    id: string;
    isActive: boolean;
  }>;
};

type HotelsPageContract = {
  id: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
  hotel: {
    name: string;
    city?: string;
  };
  _count: {
    rates: number;
    allotments: number;
  };
  hasOccupancyRules?: boolean;
  hasChildPolicy?: boolean;
  hasMealPlans?: boolean;
  hasSupplements?: boolean;
  hasCancellationPolicy?: boolean;
  readinessStatus?: 'draft' | 'in_progress' | 'ready';
};

type HotelsPagePromotion = {
  id: string;
  hotelContractId: string;
  isActive: boolean;
  combinable: boolean;
};

function resolveActiveTab(tab?: string): HotelsTab {
  return HOTEL_TABS.some((entry) => entry.id === tab) ? (tab as HotelsTab) : 'hotels';
}

function formatDateRange(from: string, to: string) {
  return `${new Date(from).toLocaleDateString()} - ${new Date(to).toLocaleDateString()}`;
}

async function getHotels(): Promise<HotelsPageHotel[]> {
  return adminPageFetchJson<HotelsPageHotel[]>(`${API_BASE_URL}/hotels`, 'Hotels workspace hotels', {
    cache: 'no-store',
  });
}

async function getHotelContracts(): Promise<HotelsPageContract[]> {
  return adminPageFetchJson<HotelsPageContract[]>(`${API_BASE_URL}/hotel-contracts`, 'Hotels workspace contracts', {
    cache: 'no-store',
  });
}

async function getPromotions(): Promise<HotelsPagePromotion[]> {
  return adminPageFetchJson<HotelsPagePromotion[]>(`${API_BASE_URL}/promotions`, 'Hotels workspace promotions', {
    cache: 'no-store',
  });
}

export default async function HotelsPage({ searchParams }: HotelsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeTab = resolveActiveTab(resolvedSearchParams?.tab);
  const [hotels, contracts, promotions] = await Promise.all([getHotels(), getHotelContracts(), getPromotions()]);
  const roomCategoryCount = hotels.reduce((sum, hotel) => sum + hotel.roomCategories.length, 0);
  const activeRoomCategoryCount = hotels.reduce(
    (sum, hotel) => sum + hotel.roomCategories.filter((roomCategory) => roomCategory.isActive).length,
    0,
  );
  const allotmentCount = contracts.reduce((sum, contract) => sum + contract._count.allotments, 0);
  const rateCount = contracts.reduce((sum, contract) => sum + contract._count.rates, 0);
  const activePromotionCount = promotions.filter((promotion) => promotion.isActive).length;
  const isCommercialTab =
    activeTab === 'contracts' ||
    activeTab === 'allotments' ||
    activeTab === 'rates' ||
    activeTab === 'occupancy-child-policy' ||
    activeTab === 'meal-plans-supplements' ||
    activeTab === 'policies' ||
    activeTab === 'promotions';
  const currentContract = resolvedSearchParams?.contractId ? contracts.find((contract) => contract.id === resolvedSearchParams.contractId) || null : null;
  const currentContractPromotionCount = currentContract ? promotions.filter((promotion) => promotion.hotelContractId === currentContract.id).length : 0;
  const commercialDescription =
    activeTab === 'contracts'
      ? 'Manage agreement structure first, then move directly into allotments and rates without leaving the commercial flow.'
      : activeTab === 'allotments'
        ? 'Review room-control inventory inside the same commercial context as the underlying contract and rate setup.'
        : activeTab === 'rates'
          ? 'Review published cost rows with the surrounding contract and inventory context still visible.'
          : activeTab === 'occupancy-child-policy'
            ? 'Define occupancy limits and child charging bands alongside the current contract before publishing downstream rates.'
            : activeTab === 'meal-plans-supplements'
              ? 'Control which board bases are available and which sellable extras can be applied without changing the base pricing engine.'
              : activeTab === 'policies'
                ? 'Configure cancellation policy summary, no-show terms, and sliding penalty windows at the contract level.'
          : 'Layer promotional rules on top of contract pricing without changing the base rate matrix.';
  const commercialLinks: Array<{ id: HotelsTab; label: string; helper: string }> = [
    { id: 'contracts', label: 'Contracts', helper: 'Terms and validity' },
    { id: 'allotments', label: 'Allotments', helper: 'Inventory control' },
    { id: 'rates', label: 'Rates', helper: 'Published costs' },
    { id: 'occupancy-child-policy', label: 'Occupancy & Child Policy', helper: 'Guest mix rules' },
    { id: 'meal-plans-supplements', label: 'Meal Plans & Supplements', helper: 'Board and extras' },
    { id: 'policies', label: 'Policies', helper: 'Cancellation terms' },
    { id: 'promotions', label: 'Promotions', helper: 'Commercial offers' },
  ];

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Products & Pricing"
          title="Hotels"
          description="Manage hotel master data, supplier contracts, and rate setup from a single workspace."
          switcher={
            <ModuleSwitcher
              ariaLabel="Hotel modules"
              activeId={activeTab}
              items={HOTEL_TABS.map((tab) => ({
                id: tab.id,
                label: tab.label,
                href: `/hotels?tab=${tab.id}`,
                helper:
                  tab.id === 'hotels'
                    ? 'Directory'
                    : tab.id === 'room-categories'
                      ? 'Inventory types'
                      : tab.id === 'contracts'
                        ? 'Commercial terms'
                        : tab.id === 'allotments'
                          ? 'Inventory control'
                          : tab.id === 'rates'
                            ? 'Published costs'
                            : tab.id === 'meal-plans-supplements'
                              ? 'Board and extras'
                              : tab.id === 'policies'
                                ? 'Cancellation terms'
                            : 'Commercial offers',
              }))}
            />
          }
          summary={
            <SummaryStrip
              items={[
                {
                  id: 'hotels',
                  label: 'Hotels',
                  value: String(hotels.length),
                  helper: 'Master records',
                },
                {
                  id: 'room-categories',
                  label: 'Room categories',
                  value: String(roomCategoryCount),
                  helper: `${activeRoomCategoryCount} active`,
                },
                {
                  id: 'contracts',
                  label: 'Contracts',
                  value: String(contracts.length),
                  helper: `${allotmentCount} allotments`,
                },
                {
                  id: 'rates',
                  label: 'Rates',
                  value: String(rateCount),
                  helper: 'Across all contracts',
                },
                {
                  id: 'promotions',
                  label: 'Promotions',
                  value: String(promotions.length),
                  helper: `${activePromotionCount} active`,
                },
              ]}
            />
          }
        >
          <section className="section-stack">
            {isCommercialTab ? (
              <>
                <section className="commercial-subheader">
                  <div className="commercial-subheader-copy">
                    <p className="eyebrow">Commercial</p>
                    <h2>Hotel Commercial Setup</h2>
                    <p>{commercialDescription}</p>
                  </div>

                  <div className="commercial-subheader-side">
                    <nav className="commercial-subnav" aria-label="Hotel commercial modules">
                      {commercialLinks.map((link) => {
                        const href = resolvedSearchParams?.contractId
                          ? `/hotels?tab=${link.id}&contractId=${resolvedSearchParams.contractId}`
                          : `/hotels?tab=${link.id}`;

                        return (
                          <Link
                            key={link.id}
                            href={href}
                            aria-current={activeTab === link.id ? 'page' : undefined}
                            className={`commercial-subnav-link${activeTab === link.id ? ' commercial-subnav-link-active' : ''}`}
                          >
                            <strong>{link.label}</strong>
                            <span>{link.helper}</span>
                          </Link>
                        );
                      })}
                    </nav>

                    {currentContract ? (
                      <div className="commercial-context-card">
                        <span>Current contract</span>
                        <strong>{currentContract.name}</strong>
                        <p>
                          {currentContract.hotel.name}
                          {currentContract.hotel.city ? ` (${currentContract.hotel.city})` : ''}
                        </p>
                      </div>
                    ) : (
                      <div className="commercial-context-card">
                        <span>Current contract</span>
                        <strong>All contracts</strong>
                        <p>Showing the full commercial module scope.</p>
                      </div>
                    )}
                  </div>
                </section>

                {currentContract ? (
                  <>
                    <section className="commercial-contract-strip" aria-label="Current contract summary">
                      <article className="commercial-contract-chip">
                        <span>Contract</span>
                        <strong>{currentContract.name}</strong>
                      </article>
                      <article className="commercial-contract-chip">
                        <span>Validity</span>
                        <strong>{formatDateRange(currentContract.validFrom, currentContract.validTo)}</strong>
                      </article>
                      <article className="commercial-contract-chip">
                        <span>Rates</span>
                        <strong>{currentContract._count.rates}</strong>
                      </article>
                      <article className="commercial-contract-chip">
                        <span>Allotments</span>
                        <strong>{currentContract._count.allotments}</strong>
                      </article>
                      <article className="commercial-contract-chip">
                        <span>Promotions</span>
                        <strong>{currentContractPromotionCount}</strong>
                      </article>
                      <article className="commercial-contract-chip">
                        <span>Readiness</span>
                        <strong>{currentContract.readinessStatus || 'draft'}</strong>
                      </article>
                    </section>

                    <nav className="commercial-actions-row" aria-label="Commercial scope actions">
                      <Link className="commercial-action-link" href={`/hotels?tab=contracts&contractId=${currentContract.id}`}>
                        View contract
                      </Link>
                      <Link className="commercial-action-link" href={`/hotels?tab=allotments&contractId=${currentContract.id}`}>
                        View allotments
                      </Link>
                      <Link className="commercial-action-link" href={`/hotels?tab=rates&contractId=${currentContract.id}`}>
                        View rates
                      </Link>
                      <Link className="commercial-action-link" href={`/hotels?tab=occupancy-child-policy&contractId=${currentContract.id}`}>
                        View occupancy & child policy
                      </Link>
                      <Link className="commercial-action-link" href={`/hotels?tab=meal-plans-supplements&contractId=${currentContract.id}`}>
                        View meal plans & supplements
                      </Link>
                      <Link className="commercial-action-link" href={`/hotels?tab=policies&contractId=${currentContract.id}`}>
                        View policies
                      </Link>
                      <Link className="commercial-action-link" href={`/hotels?tab=promotions&contractId=${currentContract.id}`}>
                        View promotions
                      </Link>
                      <Link className="commercial-action-link" href="/hotels?tab=contracts">
                        Back to all contracts
                      </Link>
                    </nav>
                  </>
                ) : null}
              </>
            ) : null}

            {activeTab === 'hotels' ? (
              <HotelsSection
                filters={{
                  cityId: resolvedSearchParams?.cityId,
                  hotelId: resolvedSearchParams?.hotelId,
                  contractId: resolvedSearchParams?.contractId,
                  roomCategoryId: resolvedSearchParams?.roomCategoryId,
                  status: resolvedSearchParams?.status,
                }}
              />
            ) : null}
            {activeTab === 'room-categories' ? <RoomCategoriesSection /> : null}
            {activeTab === 'contracts' ? <HotelContractsSection contractId={resolvedSearchParams?.contractId} /> : null}
            {activeTab === 'allotments' ? <HotelAllotmentsSection contractId={resolvedSearchParams?.contractId} /> : null}
            {activeTab === 'rates' ? (
              <HotelRatesSection
                contractId={resolvedSearchParams?.contractId}
                filters={{
                  cityId: resolvedSearchParams?.cityId,
                  hotelId: resolvedSearchParams?.hotelId,
                  contractId: resolvedSearchParams?.contractId,
                  roomCategoryId: resolvedSearchParams?.roomCategoryId,
                  mealPlan: resolvedSearchParams?.mealPlan,
                  status: resolvedSearchParams?.status,
                }}
              />
            ) : null}
            {activeTab === 'occupancy-child-policy' ? <HotelOccupancyChildPolicySection contractId={resolvedSearchParams?.contractId} /> : null}
            {activeTab === 'meal-plans-supplements' ? <HotelMealPlansSupplementsSection contractId={resolvedSearchParams?.contractId} /> : null}
            {activeTab === 'policies' ? <HotelPoliciesSection contractId={resolvedSearchParams?.contractId} /> : null}
            {activeTab === 'promotions' ? <HotelPromotionsSection contractId={resolvedSearchParams?.contractId} /> : null}
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
