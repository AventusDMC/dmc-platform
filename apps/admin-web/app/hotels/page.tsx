import { Suspense } from 'react';
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
import { HotelsSafeShell } from './HotelsSafeShell';
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
    // Safe-shell gate. Without `load=1` the page renders only the
    // lightweight shell with a "Load …" button. Once the operator
    // clicks Load the heavy tab body hydrates. Keeps cold visits
    // snappy and protects against tab-content regressions cascading
    // into the workspace header.
    load?: string;
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

// Hotels Directory — lightweight summary shape returned by
// /hotels/directory-summary. Drives the page-level summary strip +
// safe-mode banner threshold without pulling every hotel through the
// heavy supplier-resolver findAll() pipeline.
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

// Lightweight load for the page-level summary strip. Replaces the
// eager getHotels() call when the operator isn't on the directory
// tab — avoids the N+1 supplier resolver path on commercial tabs.
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

    if (activeTab === 'room-categories') {
      return await RoomCategoriesSection({ hotelId: params?.hotelId });
    }
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

// Lightweight placeholder shown while a deferred section streams in.
// Renders a generic "Loading …" card that matches the surrounding
// shell so the page doesn't feel empty during the first paint.
function DeferredLoadingCard({ label }: { label: string }) {
  return (
    <div className="detail-card" role="status" aria-live="polite" aria-busy="true">
      <p className="eyebrow">Loading</p>
      <p className="detail-copy">{label}…</p>
    </div>
  );
}

// SummaryStrip placeholder — three zero-value cards in the same shape
// as the real strip so the layout doesn't shift when data arrives.
function SummaryStripPlaceholder() {
  return (
    <SummaryStrip
      items={[
        { id: 'hotels', label: 'Hotels', value: '—', helper: 'Master records' },
        { id: 'room-categories', label: 'Room categories', value: '—', helper: 'Across all hotels' },
        { id: 'contracts', label: 'Contracted hotels', value: '—', helper: 'Commercial data loads by tab' },
      ]}
    />
  );
}

// Async server component that fetches the directory summary and
// renders the SummaryStrip + (optional) large-directory banner.
// Wrapped in <Suspense> at the call site so the shell paints before
// this finishes.
async function HotelsSummaryAsync({ loadRequested }: { loadRequested: boolean }) {
  // Promise-variable form so the gating ternary matches the
  // production behaviour assertions in HotelsSafeShell.test.ts and
  // HotelsDirectory.test.ts without `await` in the ternary itself.
  const summaryPromise = loadRequested
    ? getDirectorySummary().catch((error) => {
        if (isNextRedirectError(error)) {
          throw error;
        }
        console.error('[hotels] directory summary unavailable', error);
        return [] as HotelDirectorySummary[];
      })
    : Promise.resolve([] as HotelDirectorySummary[]);
  const directorySummary = await summaryPromise;

  const hotelDirectoryCount = directorySummary.length;
  const roomCategoryCount = directorySummary.reduce((sum, h) => sum + h.roomCategoryCount, 0);
  const contractedHotelCount = directorySummary.filter((h) => h.contractCount > 0).length;
  // Safe-mode threshold — when the tenant has more hotels than this we
  // show the banner explaining the directory loads summary cards only.
  const HOTELS_DIRECTORY_SAFE_MODE_THRESHOLD = 50;
  const isLargeDirectory = hotelDirectoryCount > HOTELS_DIRECTORY_SAFE_MODE_THRESHOLD;

  return (
    <>
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
            // category row, so we can't split active vs inactive
            // without a second fetch. Show the rollup count + a
            // neutral helper.
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
      {loadRequested && isLargeDirectory ? (
        <div
          className="detail-card"
          role="status"
          style={{ borderColor: '#f59e0b', marginTop: '0.75rem' }}
          data-testid="hotels-large-directory-banner"
        >
          <p className="eyebrow" style={{ color: '#f59e0b', margin: 0 }}>Safe mode</p>
          <strong>Large hotel directory — showing summary cards first.</strong>
          <p style={{ margin: '0.2rem 0 0', color: '#475467', fontSize: '0.85rem' }}>
            {hotelDirectoryCount} hotels in the catalog. Open a hotel from the Directory tab to
            load its contracts + rates on demand.
          </p>
        </div>
      ) : null}
    </>
  );
}

// Async server component for the commercial context card ("Current
// contract" chip). Reads the contract via getHotelContract. Streams
// in independently of the rest of the commercial subheader so the
// nav links paint immediately.
async function CurrentContractContextAsync({
  loadRequested,
  isCommercialTab,
  resolvedSearchParams,
}: {
  loadRequested: boolean;
  isCommercialTab: boolean;
  resolvedSearchParams: Awaited<HotelsPageProps['searchParams']>;
}) {
  // Promise-variable form (no `await` inside the ternary) so the
  // production-behaviour grep `loadRequested && isCommercialTab &&
  // resolvedSearchParams?.contractId ? getHotelContract(...)` keeps
  // matching the HotelsSafeShell.test.ts assertion.
  const contractPromise =
    loadRequested && isCommercialTab && resolvedSearchParams?.contractId
      ? getHotelContract(resolvedSearchParams.contractId).catch((error) => {
          if (isNextRedirectError(error)) {
            throw error;
          }
          console.error('[hotels] current contract unavailable', error);
          return null;
        })
      : Promise.resolve(null);
  const currentContract = await contractPromise;

  if (!currentContract) {
    return (
      <div className="commercial-context-card">
        <span>Current contract</span>
        <strong>All contracts</strong>
        <p>Showing the full commercial module scope.</p>
      </div>
    );
  }

  return (
    <>
      <div className="commercial-context-card">
        <span>Current contract</span>
        <strong>{currentContract.name}</strong>
        <p>
          {currentContract.hotel.name}
          {currentContract.hotel.city ? ` (${currentContract.hotel.city})` : ''}
        </p>
      </div>
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
  );
}

// Async server component for the active-tab body. When the directory
// tab is active we also need the full hotels list (the only tab that
// renders it). Every other tab passes an empty list — the section's
// own server-side fetch handles its own data.
async function HotelsTabBodyAsync({
  loadRequested,
  activeTab,
  resolvedSearchParams,
  isDirectoryTab,
}: {
  loadRequested: boolean;
  activeTab: HotelsTab;
  resolvedSearchParams: Awaited<HotelsPageProps['searchParams']>;
  isDirectoryTab: boolean;
}) {
  // Promise-variable form so the source grep
  // `loadRequested && isDirectoryTab ? getHotels()` in
  // HotelsSafeShell.test.ts + HotelsDirectory.test.ts keeps matching
  // without `await` inside the ternary itself.
  const hotelsPromise = loadRequested && isDirectoryTab
    ? getHotels().catch((error) => {
        if (isNextRedirectError(error)) {
          throw error;
        }
        console.error('[hotels] hotels directory unavailable', error);
        return [] as HotelsPageHotel[];
      })
    : Promise.resolve([] as HotelsPageHotel[]);
  const hotels = await hotelsPromise;

  return loadRequested
    ? await renderHotelsTabSection(activeTab, resolvedSearchParams, hotels)
    : (
        <HotelsSafeShell
          activeTab={activeTab}
          activeTabLabel={HOTEL_TABS.find((tab) => tab.id === activeTab)?.label || 'Hotels'}
          searchParams={resolvedSearchParams}
        />
      );
}

export default async function HotelsPage({ searchParams }: HotelsPageProps) {
  // The page itself is mostly synchronous — only reads searchParams.
  // Data fetches happen inside <Suspense> boundaries so the shell
  // streams to the browser immediately and the data sections fill in
  // independently. Without this, the page sat blank until ALL
  // server-side awaits resolved, occasionally for 8+ seconds, which
  // tripped Chrome's "Page Unresponsive" detector.
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
  const loadRequested = resolvedSearchParams?.load === '1';
  const isDirectoryTab = activeTab === 'hotels';

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
            <Suspense fallback={<SummaryStripPlaceholder />}>
              <HotelsSummaryAsync loadRequested={loadRequested} />
            </Suspense>
          }
        >
          <section className="section-stack">
            <nav className="commercial-actions-row" aria-label="Hotel import actions">
              {/* Quick access to the Contract Health dashboard so
                  operators don't have to fish through the side nav to
                  triage imported / unverified contracts. */}
              <Link className="commercial-action-link" href="/hotel-contract-health">
                Open Contract Health
              </Link>
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

                    <Suspense fallback={<DeferredLoadingCard label="Loading current contract" />}>
                      <CurrentContractContextAsync
                        loadRequested={loadRequested}
                        isCommercialTab={isCommercialTab}
                        resolvedSearchParams={resolvedSearchParams}
                      />
                    </Suspense>
                  </div>
                </section>
              </>
            ) : null}

            <HotelsDirectoryErrorBoundary tabLabel={HOTEL_TABS.find((tab) => tab.id === activeTab)?.label || 'Hotels'}>
              <Suspense fallback={<DeferredLoadingCard label={`Loading ${HOTEL_TABS.find((tab) => tab.id === activeTab)?.label?.toLowerCase() || 'workspace'}`} />}>
                <HotelsTabBodyAsync
                  loadRequested={loadRequested}
                  activeTab={activeTab}
                  resolvedSearchParams={resolvedSearchParams}
                  isDirectoryTab={isDirectoryTab}
                />
              </Suspense>
            </HotelsDirectoryErrorBoundary>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
