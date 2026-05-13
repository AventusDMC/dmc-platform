import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SummaryStrip } from '../../../components/SummaryStrip';
import { WorkspaceShell } from '../../../components/WorkspaceShell';
import { adminPageFetchJson } from '../../../lib/admin-server';
import { HotelContractWorkspace } from './HotelContractWorkspace';

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';
const ENABLE_CONTRACT_WORKSPACE_TIMING_LOGS = process.env.NODE_ENV !== 'production';

function logContractWorkspaceTiming(message: string, details: Record<string, unknown>) {
  if (ENABLE_CONTRACT_WORKSPACE_TIMING_LOGS) {
    console.log(message, details);
  }
}

type HotelRoomCategory = {
  id: string;
  hotelId: string;
  name: string;
  code: string | null;
  description?: string | null;
  isActive: boolean;
};

type Hotel = {
  id: string;
  name: string;
  city?: string | null;
  roomCategories: HotelRoomCategory[];
  _count?: {
    roomCategories?: number;
  };
};

type HotelContract = {
  id: string;
  hotelId: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
  ratePolicies?: unknown;
  hotel: {
    id: string;
    name: string;
    city?: string | null;
    roomCategories: HotelRoomCategory[];
    _count?: {
      roomCategories?: number;
    };
  };
  cancellationPolicy?: CancellationPolicy | null;
  hasRates?: boolean;
  hasMealPlans?: boolean;
  hasSupplements?: boolean;
  hasCancellationPolicy?: boolean;
  readinessStatus?: 'draft' | 'in_progress' | 'ready';
  _count?: {
    rates?: number;
    allotments?: number;
    supplements?: number;
    mealPlans?: number;
  };
};

type HotelRate = {
  id: string;
  contractId: string;
  seasonId: string | null;
  seasonName: string;
  seasonFrom?: string | null;
  seasonTo?: string | null;
  roomCategoryId: string;
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  mealPlan: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  pricingMode?: 'PER_ROOM_PER_NIGHT' | 'PER_PERSON_PER_NIGHT' | null;
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM' | null;
  currency: string;
  cost: number;
  salesTaxPercent?: number | null;
  salesTaxIncluded?: boolean | null;
  serviceChargePercent?: number | null;
  serviceChargeIncluded?: boolean | null;
  tourismFeeAmount?: number | null;
  tourismFeeCurrency?: string | null;
  tourismFeeMode?: 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM' | null;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  };
};

type Season = {
  id: string;
  name: string;
};

type Supplement = {
  id: string;
  roomCategoryId: string | null;
  type: 'EXTRA_BREAKFAST' | 'EXTRA_LUNCH' | 'EXTRA_DINNER' | 'GALA_DINNER' | 'EXTRA_BED' | string | null;
  chargeBasis: 'PER_PERSON' | 'PER_ROOM' | 'PER_STAY' | 'PER_NIGHT' | string | null;
  amount: number | string | null;
  currency: string | null;
  isMandatory: boolean;
  isActive: boolean;
  notes: string | null;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  } | null;
};

type MealPlan = {
  id: string;
  code: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  isActive: boolean;
  notes: string | null;
};

type CancellationPolicy = {
  id: string;
  summary: string | null;
  notes: string | null;
  noShowPenaltyType: 'PERCENT' | 'NIGHTS' | 'FULL_STAY' | 'FIXED' | null;
  noShowPenaltyValue: number | null;
  rules: Array<{
    id: string;
    windowFromValue: number;
    windowToValue: number;
    deadlineUnit: 'DAYS' | 'HOURS';
    penaltyType: 'PERCENT' | 'NIGHTS' | 'FULL_STAY' | 'FIXED';
    penaltyValue: number | null;
    isActive: boolean;
    notes: string | null;
  }>;
} | null;

type PageProps = {
  params: Promise<{
    contractId: string;
  }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value));
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

async function getContract(contractId: string) {
  const startedAt = Date.now();
  const contract = await adminPageFetchJson<HotelContract>(`${API_BASE_URL}/hotel-contracts/${contractId}?summary=1`, 'Hotel contract detail', {
    cache: 'no-store',
    allow404: true,
  });
  logContractWorkspaceTiming('[hotel-contract-workspace] contract summary fetched', {
    contractId,
    durationMs: Date.now() - startedAt,
    payloadBytes: contract ? JSON.stringify(contract).length : 0,
    ratesCount: contract?._count?.rates ?? 0,
    roomCategoriesReturned: contract?.hotel?.roomCategories?.length ?? 0,
    roomCategoriesTotal: contract?.hotel?._count?.roomCategories ?? contract?.hotel?.roomCategories?.length ?? 0,
    supplementsCount: contract?._count?.supplements ?? 0,
    mealPlansCount: contract?._count?.mealPlans ?? 0,
  });
  return contract;
}

async function getSeasons() {
  return adminPageFetchJson<Season[]>(`${API_BASE_URL}/seasons`, 'Hotel contract workspace seasons', {
    cache: 'no-store',
  });
}

export default async function HotelContractDetailPage({ params }: PageProps) {
  const { contractId } = await params;
  const contract = await getContract(contractId);

  if (!contract) {
    notFound();
  }

  const [seasons] = await Promise.all([
    getSeasons(),
  ]);
  const safeRoomCategories = Array.isArray(contract.hotel?.roomCategories) ? contract.hotel.roomCategories : [];
  const rates: HotelRate[] = [];
  const safeSupplements: Supplement[] = [];
  const safeMealPlans: MealPlan[] = [];
  const activeSupplements = safeSupplements.filter((supplement) => supplement.isActive).length;
  const activeMealPlans = safeMealPlans.filter((mealPlan) => mealPlan.isActive).length;
  const rateCount = contract._count?.rates ?? rates.length;
  const roomCategoryCount = contract.hotel?._count?.roomCategories ?? safeRoomCategories.length;
  const supplementCount = contract._count?.supplements ?? safeSupplements.length;
  const mealPlanCount = contract._count?.mealPlans ?? safeMealPlans.length;

  return (
    <main className="page hotel-contract-detail-page">
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Hotel Contract"
          title={contract.name}
          description={`${contract.hotel.name}${contract.hotel.city ? `, ${contract.hotel.city}` : ''} | ${formatDate(contract.validFrom)} - ${formatDate(contract.validTo)}`}
          switcher={
            <div className="contract-workspace-breadcrumbs">
              <Link className="compact-button" href="/hotels?tab=contracts">
                All contracts
              </Link>
              <Link className="compact-button" href={`/hotels?tab=rates&contractId=${contract.id}`}>
                Classic rates view
              </Link>
            </div>
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'status', label: 'Status', value: getContractStatus(contract), helper: contract.readinessStatus || 'draft' },
                { id: 'rates', label: 'Rates', value: String(rateCount), helper: 'Contract rows' },
                { id: 'rooms', label: 'Room categories', value: String(roomCategoryCount), helper: 'Hotel inventory' },
                { id: 'supplements', label: 'Supplements', value: String(supplementCount), helper: activeSupplements ? `${activeSupplements} active` : 'Lazy loaded' },
                { id: 'meal-plans', label: 'Meal plans', value: String(mealPlanCount), helper: activeMealPlans ? `${activeMealPlans} active` : 'Lazy loaded' },
              ]}
            />
          }
        >
          <HotelContractWorkspace
            apiBaseUrl="/api"
            contract={contract}
            hotels={[contract.hotel]}
            contracts={[contract]}
            rates={rates}
            seasons={seasons}
            supplements={safeSupplements}
            mealPlans={safeMealPlans}
            cancellationPolicy={contract.cancellationPolicy || null}
          />
        </WorkspaceShell>
      </section>
    </main>
  );
}
