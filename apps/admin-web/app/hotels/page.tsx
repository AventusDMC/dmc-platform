import Link from 'next/link';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { SummaryStrip } from '../components/SummaryStrip';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
import { HotelAllotmentsSection } from './HotelAllotmentsSection';
import { HotelContractsSection } from './HotelContractsSection';
import { HotelMealPlansSupplementsSection } from './HotelMealPlansSupplementsSection';
import { HotelOccupancyChildPolicySection } from './HotelOccupancyChildPolicySection';
import { HotelPoliciesSection } from './HotelPoliciesSection';
import { HotelPromotionsSection } from './HotelPromotionsSection';
import { HotelRatesSection } from './HotelRatesSection';
import { HotelTariffWorkbookSection } from './HotelTariffWorkbookSection';
import { HotelsSection } from './HotelsSection';
import { HotelsDirectoryErrorBoundary } from './HotelsDirectoryErrorBoundary';
import { RoomCategoriesSection } from './RoomCategoriesSection';

export const dynamic = 'force-dynamic';

type HotelsTab =
  | 'hotels'
  | 'room-categories'
  | 'contracts'
  | 'allotments'
  | 'rates'
  | 'tariff-workbook'
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
    validity?: string;
    activeState?: string;
  }>;
};

const HOTEL_TABS: Array<{ id: HotelsTab; label: string }> = [
  { id: 'hotels', label: 'Hotels' },
  { id: 'room-categories', label: 'Room Categories' },
  { id: 'contracts', label: 'Contracts' },
  { id: 'allotments', label: 'Allotments' },
  { id: 'rates', label: 'Rates' },
  { id: 'tariff-workbook', label: 'Tariff Workbook' },
  { id: 'occupancy-child-policy', label: 'Occupancy & Child Policy' },
  { id: 'meal-plans-supplements', label: 'Meal Plans & Supplements' },
  { id: 'policies', label: 'Policies' },
  { id: 'promotions', label: 'Promotions' },
];

type HotelsPageHotel = {
  id: string;
  name: string;
  cityId: string | null;
  city: string;
  hotelCategoryId: string | null;
  category: string;
  supplierId: string;
  cityRecord: unknown;
  hotelCategory: unknown;
  roomCategories: Array<{
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  }>;
  _count: {
    contracts: number;
  };
};

// Hotels Directory freeze fix — lightweight summary shape returned by
// /hotels/directory-summary. Used to drive the page-level summary
// strip + safe-mode banner threshold without pulling every hotel
// through the heavy supplier-resolver findAll() pipeline.
type HotelDirectorySummary = {
  id: string;
  name: string;
  city: string;
  category: string;
  isActive: boolean;
  supplierName: string | null;
  contractCount: number;
  roomCategoryCount: number;
  confidenceSummary: 'verified' | 'needs-review' | 'mixed' | 'no-contracts';
  hasVerifiedContract: boolean;
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

// Hotels Directory freeze fix — lightweight load for the page-level
// summary strip. Replaces the eager getHotels() call when the operator
// isn't on the directory tab. Avoids the N+1 supplier resolver path
// that froze the page when switching to room-categories or any other
// commercial tab.
async function getDirectorySummary(): Promise<HotelDirectorySummary[]> {
  return adminPageFetchJson<HotelDirectorySummary[]>(
    `${API_BASE_URL}/hotels/directory-summary`,
    'Hotels directory summary',
    { cache: 'no-store' },
  );
}

async function getHotelContract(contractId: string): Promise<HotelsPageContract | null> {
  return adminPageFetchJson<HotelsPageContract | null>(`${API_BASE_URL}/hotel-contracts/${contractId}`, 'Hotels workspace current contract', {
    cache: 'no-store',
    allow404: true,
  });
}

async function renderHotelsTabSection(activeTab: HotelsTab, params?: Awaited<HotelsPageProps['searchParams']>, initialHotels?: HotelsPageHotel[]) {
  try {
    if (activeTab === 'hotels') {
      return await HotelsSection({
        initialHotels: initialHotels as any,
        filters: {
          cityId: params?.cityId,
          hotelId: params?.hotelId,
          roomCategoryId: params?.roomCategoryId,
          status: params?.status,
        },
      });
    }

    if (activeTab === 'room-categories') return await RoomCategoriesSection();
    if (activeTab === 'contracts') return await HotelContractsSection({ contractId: params?.contractId });
    if (activeTab === 'allotments') return await HotelAllotmentsSection({ contractId: params?.contractId });
    if (activeTab === 'rates') {
      return await HotelRatesSection({
        contractId: params?.contractId,
        filters: {
          cityId: params?.cityId,
          hotelId: params?.hotelId,
          contractId: params?.contractId,
          roomCategoryId: params?.roomCategoryId,
          mealPlan: params?.mealPlan,
          status: params?.status,
        },
      });
    }
    if (activeTab === 'tariff-workbook') {
      return await HotelTariffWorkbookSection({
        filters: {
          cityId: params?.cityId,
          hotelId: params?.hotelId,
          contractId: params?.contractId,
          roomCategoryId: params?.roomCategoryId,
          mealPlan: params?.mealPlan,
          status: params?.status,
          validity: params?.validity,
          activeState: params?.activeState,
        },
      });
    }
    if (activeTab === 'occupancy-child-policy') return await HotelOccupancyChildPolicySection({ contractId: params?.contractId });
    if (activeTab === 'meal-plans-supplements') return await HotelMealPlansSupplementsSection({ contractId: params?.contractId });
    if (activeTab === 'policies') return await HotelPoliciesSection({ contractId: params?.contractId });
    if (activeTab === 'promotions') return await HotelPromotionsSection({ contractId: params?.contractId });
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error(`[hotels] ${activeTab} tab unavailable`, error);
    return (
      <section className="detail-card">
        <p className="eyebrow">Section unavailable</p>
        <h2>{HOTEL_TABS.find((tab) => tab.id === activeTab)?.label || 'Hotels'} could not load</h2>
        <p className="detail-copy">This workspace section failed to load. Other hotel tabs remain available.</p>
      </section>
    );
  }

  return null;
}

export default async function HotelsPage({ searchParams }: HotelsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeTab = resolveActiveTab(resolvedSearchParams?.tab);
  const isCommercialTab =
    activeTab === 'contracts' ||
    activeTab === 'allotments' ||
    activeTab === 'rates' ||
    activeTab === 'tariff-workbook' ||
    activeTab === 'occupancy-child-policy' ||
    activeTab === 'meal-plans-supplements' ||
    activeTab === 'policies' ||
    activeTab === 'promotions';
  // Hotels Directory freeze fix — split the heavy hotel fetch from
  // the lightweight summary used by the strip. Only load full hotels
  // when the operator is on the directory tab (the only tab that
  // actually renders the list). Every other tab uses the lightweight
  // /hotels/directory-summary endpoint.
  const isDirectoryTab = activeTab === 'hotels';
  const [hotelsForDirectory, directorySummary, currentContract] = await Promise.all([
    isDirectoryTab
      ? getHotels().catch((error) => {
          if (isNextRedirectError(error)) {
            throw error;
          }
          console.error('[hotels] hotels directory unavailable', error);
          return [] as HotelsPageHotel[];
        })
      : Promise.resolve([] as HotelsPageHotel[]),
    getDirectorySummary().catch((error) => {
      if (isNextRedirectError(error)) {
        throw error;
      }
      console.error('[hotels] directory summary unavailable', error);
      return [] as HotelDirectorySummary[];
    }),
    isCommercialTab && resolvedSearchParams?.contractId
      ? getHotelContract(resolvedSearchParams.contractId).catch((error) => {
          if (isNextRedirectError(error)) {
            throw error;
          }

          console.error('[hotels] current contract unavailable', error);
          return null;
        })
      : Promise.resolve(null),
  ]);
  // Counts derive from the lightweight summary — never from the heavy
  // hotel objects. roomCategoryCount uses the per-hotel rollup count
  // returned by the summary endpoint.
  const hotelDirectoryCount = directorySummary.length;
  const roomCategoryCount = directorySummary.reduce((sum, h) => sum + h.roomCategoryCount, 0);
  // "Active" count isn't surfaced in the summary (would require loading
  // each category) — show the rollup total as the helper label instead.
  const activeRoomCategoryCount = roomCategoryCount;
  const contractedHotelCount = directorySummary.filter((h) => h.contractCount > 0).length;
  // Safe-mode threshold — when the tenant has more hotels than this we
  // show the banner explaining the directory loads summary cards only.
  const HOTELS_DIRECTORY_SAFE_MODE_THRESHOLD = 50;
  const isLargeDirectory = hotelDirectoryCount > HOTELS_DIRECTORY_SAFE_MODE_THRESHOLD;
  // Hotels passed downstream — full data on the directory tab, empty
  // array otherwise so HotelsSection doesn't trigger its own fallback
  // fetch.
  const hotels = hotelsForDirectory;
  const commercialDescription =
    activeTab === 'contracts'
      ? 'Manage agreement structure first, then move directly into allotments and rates without leaving the commercial flow.'
      : activeTab === 'allotments'
        ? 'Review room-control inventory inside the same commercial context as the underlying contract and rate setup.'
        : activeTab === 'rates'
          ? 'Review published cost rows with the surrounding contract and inventory context still visible.'
          : activeTab === 'tariff-workbook'
            ? 'Maintain a workbook-style operational view across contracts, validity ranges, room categories, meal plans, supplements, and child policies.'
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
    { id: 'tariff-workbook', label: 'Tariff Workbook', helper: 'Bulk maintenance' },
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
                            : tab.id === 'tariff-workbook'
                              ? 'Bulk maintenance'
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
                  value: String(hotelDirectoryCount),
                  helper: 'Master records',
                },
                {
                  id: 'room-categories',
                  label: 'Room categories',
                  value: String(roomCategoryCount),
                  // The lightweight directory summary doesn't load each
                  // category row (PR #120 + #122 freeze fixes), so we
                  // can't split active vs inactive without a second
                  // fetch. Show the rollup count + a neutral helper.
                  helper: 'Across all hotels',
                },
                {
                  id: 'contracts',
                  label: 'Contracted hotels',
                  value: String(contractedHotelCount),
                  helper: 'Commercial data loads by tab',
                },
              ]}
            />
          }
        >
          <section className="section-stack">
            <nav className="commercial-actions-row" aria-label="Hotel import actions">
              <Link className="commercial-action-link" href="/contracts/import">
                Import Hotel Contract
              </Link>
              <Link className="commercial-action-link" href="/contracts/import/history">
                View Import History
              </Link>
            </nav>

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
                        <strong>Open tab</strong>
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
                      <Link className="commercial-action-link" href={`/hotels?tab=tariff-workbook&contractId=${currentContract.id}`}>
                        Open tariff workbook
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

            {isLargeDirectory ? (
              <div className="detail-card" role="status" style={{ borderColor: '#f59e0b', marginBottom: '0.75rem' }}>
                <p className="eyebrow" style={{ color: '#f59e0b', margin: 0 }}>Safe mode</p>
                <strong>Large hotel directory — showing summary cards first.</strong>
                <p style={{ margin: '0.2rem 0 0', color: '#475467', fontSize: '0.85rem' }}>
                  {hotelDirectoryCount} hotels in the catalog. Open a hotel from the Directory tab to
                  load its contracts + rates on demand.
                </p>
              </div>
            ) : null}

            <HotelsDirectoryErrorBoundary tabLabel={HOTEL_TABS.find((tab) => tab.id === activeTab)?.label || 'Hotels'}>
              {await renderHotelsTabSection(activeTab, resolvedSearchParams, hotels)}
            </HotelsDirectoryErrorBoundary>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
