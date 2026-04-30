import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SummaryStrip } from '../../../components/SummaryStrip';
import { WorkspaceShell } from '../../../components/WorkspaceShell';
import { adminPageFetchJson } from '../../../lib/admin-server';
import { HotelContractWorkspace } from './HotelContractWorkspace';

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

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
  city: string;
  roomCategories: HotelRoomCategory[];
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
  return adminPageFetchJson<HotelContract>(`${API_BASE_URL}/hotel-contracts/${contractId}`, 'Hotel contract detail', {
    cache: 'no-store',
    allow404: true,
  });
}

async function getHotels() {
  return adminPageFetchJson<Hotel[]>(`${API_BASE_URL}/hotels`, 'Hotel contract workspace hotels', {
    cache: 'no-store',
  });
}

async function getContracts() {
  return adminPageFetchJson<HotelContract[]>(`${API_BASE_URL}/hotel-contracts`, 'Hotel contract workspace contracts', {
    cache: 'no-store',
  });
}

async function getRates() {
  return adminPageFetchJson<HotelRate[]>(`${API_BASE_URL}/hotel-rates`, 'Hotel contract workspace rates', {
    cache: 'no-store',
  });
}

async function getSeasons() {
  return adminPageFetchJson<Season[]>(`${API_BASE_URL}/seasons`, 'Hotel contract workspace seasons', {
    cache: 'no-store',
  });
}

async function getSupplements(contractId: string) {
  return adminPageFetchJson<Supplement[]>(`${API_BASE_URL}/contracts/${contractId}/supplements`, 'Hotel contract workspace supplements', {
    cache: 'no-store',
  });
}

async function getMealPlans(contractId: string) {
  return adminPageFetchJson<MealPlan[]>(`${API_BASE_URL}/contracts/${contractId}/meal-plans`, 'Hotel contract workspace meal plans', {
    cache: 'no-store',
  });
}

async function getCancellationPolicy(contractId: string) {
  return adminPageFetchJson<CancellationPolicy>(`${API_BASE_URL}/hotel-contracts/${contractId}/cancellation-policy`, 'Hotel contract workspace cancellation policy', {
    cache: 'no-store',
    allow404: true,
  });
}

export default async function HotelContractDetailPage({ params }: PageProps) {
  const { contractId } = await params;
  const contract = await getContract(contractId);

  if (!contract) {
    notFound();
  }

  const [hotels, contracts, allRates, seasons, supplements, mealPlans, cancellationPolicy] = await Promise.all([
    getHotels(),
    getContracts(),
    getRates(),
    getSeasons(),
    getSupplements(contract.id),
    getMealPlans(contract.id),
    getCancellationPolicy(contract.id),
  ]);
  const rates = allRates.filter((rate) => rate.contractId === contract.id);
  const activeSupplements = supplements.filter((supplement) => supplement.isActive).length;
  const activeMealPlans = mealPlans.filter((mealPlan) => mealPlan.isActive).length;

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
                { id: 'rates', label: 'Rates', value: String(rates.length), helper: 'Contract rows' },
                { id: 'rooms', label: 'Room categories', value: String(contract.hotel.roomCategories.length), helper: 'Hotel inventory' },
                { id: 'supplements', label: 'Supplements', value: String(supplements.length), helper: `${activeSupplements} active` },
                { id: 'meal-plans', label: 'Meal plans', value: String(mealPlans.length), helper: `${activeMealPlans} active` },
              ]}
            />
          }
        >
          <HotelContractWorkspace
            apiBaseUrl="/api"
            contract={contract}
            hotels={hotels}
            contracts={contracts}
            rates={rates}
            seasons={seasons}
            supplements={supplements}
            mealPlans={mealPlans}
            cancellationPolicy={cancellationPolicy || contract.cancellationPolicy || null}
          />
        </WorkspaceShell>
      </section>
    </main>
  );
}
