import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
import { AdminBreadcrumbs } from '../components/AdminBreadcrumbs';
import { HotelContractHealthDashboard } from './HotelContractHealthDashboard';

export const dynamic = 'force-dynamic';

// Hotel Contract Stabilization & Trustworthiness v2 — admin Dashboard.
// Renders:
//   - confidence totals (counts per status across all contracts)
//   - 7 health sections (missing meal plans / suspicious pricing / etc.)
//   - prioritized correction queue
// The page itself only loads the lightweight aggregates — per-contract
// validation drill-down loads on demand via the dashboard component.

type DashboardResponse = {
  totals: {
    contracts: number;
    byConfidence: Record<string, number>;
  };
  sections: {
    missingMealPlans: Array<{ contractId: string; name: string; hotelName: string }>;
    suspiciousPricing: Array<{ contractId: string; name: string; hotelName: string; reason: string }>;
    missingOccupancyMapping: Array<{ contractId: string; name: string; hotelName: string; missing: number }>;
    supplementConflicts: Array<{ contractId: string; name: string; hotelName: string; findingCount: number }>;
    overlappingSeasons: Array<{ contractId: string; name: string; hotelName: string; findingCount: number }>;
    missingChildPolicy: Array<{ contractId: string; name: string; hotelName: string }>;
    importedUnverified: Array<{ contractId: string; name: string; hotelName: string }>;
  };
};

type QueueResponse = {
  queue: Array<{
    contractId: string;
    name: string;
    hotel: { id: string; name: string; city: string | null } | null;
    confidence: string;
    rateCount: number;
    supplementFindings: number;
    inActiveQuote: boolean;
    priorityScore: number;
  }>;
  totalCandidates: number;
};

async function loadDashboard(): Promise<DashboardResponse | null> {
  try {
    return await adminPageFetchJson<DashboardResponse>(
      '/api/hotel-contract-health/dashboard',
      'Hotel contract health dashboard',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotel-contract-health] dashboard unavailable', error);
    return null;
  }
}

async function loadQueue(): Promise<QueueResponse | null> {
  try {
    return await adminPageFetchJson<QueueResponse>(
      '/api/hotel-contract-health/correction-queue?limit=25',
      'Hotel contract correction queue',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[hotel-contract-health] queue unavailable', error);
    return null;
  }
}

export default async function HotelContractHealthPage() {
  const [dashboard, queue] = await Promise.all([loadDashboard(), loadQueue()]);
  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs items={[{ label: 'Hotels' }, { label: 'Contract Health' }]} />
        <h1>Hotel Contract Health</h1>
        <p className="admin-muted-copy">
          Progressively transform imported hotel contracts into trusted operational pricing
          infrastructure. The dashboard surfaces messy mappings, supplement conflicts, season
          gaps, and unverified contracts. The correction queue prioritizes contracts whose
          hotels appear in active quotes. Verified contracts rank higher in Guided Hotel
          Suggestions and show "Operationally trusted" in the quote workspace.
        </p>
      </div>
      <HotelContractHealthDashboard initialDashboard={dashboard} initialQueue={queue} />
    </main>
  );
}
