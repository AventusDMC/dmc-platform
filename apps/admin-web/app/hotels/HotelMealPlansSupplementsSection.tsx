import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { adminPageFetchJson } from '../lib/admin-server';
import { HotelContractMealPlanForm } from './HotelContractMealPlanForm';
import { HotelContractMealPlansTable } from './HotelContractMealPlansTable';
import { HotelContractSupplementForm } from './HotelContractSupplementForm';
import { HotelContractSupplementsTable } from './HotelContractSupplementsTable';

const API_BASE_URL = '/api';

type ContractOption = {
  id: string;
  name: string;
  hotel: {
    name: string;
    roomCategories: Array<{
      id: string;
      name: string;
      code: string | null;
      isActive: boolean;
    }>;
  };
  hasMealPlans?: boolean;
  hasSupplements?: boolean;
  readinessStatus?: 'draft' | 'in_progress' | 'ready';
};

type MealPlan = {
  id: string;
  code: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  isActive: boolean;
  notes: string | null;
};

type Supplement = {
  id: string;
  roomCategoryId: string | null;
  type: 'EXTRA_BREAKFAST' | 'EXTRA_LUNCH' | 'EXTRA_DINNER' | 'GALA_DINNER' | 'EXTRA_BED';
  chargeBasis: 'PER_PERSON' | 'PER_ROOM' | 'PER_STAY' | 'PER_NIGHT';
  amount: number;
  currency: string;
  isMandatory: boolean;
  isActive: boolean;
  notes: string | null;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  } | null;
};

async function getHotelContracts(): Promise<ContractOption[]> {
  return adminPageFetchJson<ContractOption[]>(`${API_BASE_URL}/hotel-contracts`, 'Hotel meal plans contracts', {
    cache: 'no-store',
  });
}

async function getMealPlans(contractId: string): Promise<MealPlan[]> {
  return adminPageFetchJson<MealPlan[]>(`${API_BASE_URL}/contracts/${contractId}/meal-plans`, 'Hotel meal plans', {
    cache: 'no-store',
  });
}

async function getSupplements(contractId: string): Promise<Supplement[]> {
  return adminPageFetchJson<Supplement[]>(`${API_BASE_URL}/contracts/${contractId}/supplements`, 'Hotel supplements', {
    cache: 'no-store',
  });
}

type HotelMealPlansSupplementsSectionProps = {
  contractId?: string;
};

export async function HotelMealPlansSupplementsSection({ contractId }: HotelMealPlansSupplementsSectionProps) {
  const contracts = await getHotelContracts();
  const currentContract = contractId ? contracts.find((contract) => contract.id === contractId) || null : null;

  if (!currentContract) {
    return (
      <TableSectionShell
        title="Meal Plans & Supplements"
        description="Select a contract first, then define which meal plans are available and which supplements can be sold on top."
        context={<p>Contract-scoped commercial configuration</p>}
      >
        <p className="empty-state">Choose a contract from the Contracts tab, then open this module with a selected contract.</p>
      </TableSectionShell>
    );
  }

  const [mealPlans, supplements] = await Promise.all([getMealPlans(currentContract.id), getSupplements(currentContract.id)]);
  const roomCategories = currentContract.hotel.roomCategories.filter((roomCategory) => roomCategory.isActive);
  const activeMealPlanCount = mealPlans.filter((mealPlan) => mealPlan.isActive).length;
  const activeSupplementCount = supplements.filter((supplement) => supplement.isActive).length;

  return (
    <section className="section-stack">
      <SummaryStrip
        items={[
          {
            id: 'meal-plans',
            label: 'Meal plans',
            value: String(mealPlans.length),
            helper: `${activeMealPlanCount} active`,
          },
          {
            id: 'supplements',
            label: 'Supplements',
            value: String(supplements.length),
            helper: `${activeSupplementCount} active`,
          },
          {
            id: 'contract-readiness',
            label: 'Readiness',
            value: currentContract.readinessStatus || 'draft',
            helper: currentContract.hasMealPlans && currentContract.hasSupplements ? 'Commercial extras in place' : 'More setup needed',
          },
        ]}
      />

      <TableSectionShell
        title="Meal Plans"
        description="Record which board bases this contract can publish without mixing them into rate-entry screens."
        context={<p>{mealPlans.length} meal plans for {currentContract.name}</p>}
        createPanel={
          <CollapsibleCreatePanel
            title="Add meal plan"
            description="Enable another board basis for this contract."
            triggerLabelOpen="Add meal plan"
          >
            <HotelContractMealPlanForm apiBaseUrl="/api" contractId={currentContract.id} />
          </CollapsibleCreatePanel>
        }
        emptyState={mealPlans.length === 0 ? <p className="empty-state">No meal plans configured for this contract yet.</p> : undefined}
      >
        {mealPlans.length > 0 ? (
          <HotelContractMealPlansTable apiBaseUrl="/api" contractId={currentContract.id} mealPlans={mealPlans} />
        ) : null}
      </TableSectionShell>

      <TableSectionShell
        title="Supplements"
        description="Capture sellable extras like gala dinners and extra beds with scope, charge basis, and commercial status."
        context={<p>{supplements.length} supplements for {currentContract.name}</p>}
        createPanel={
          <CollapsibleCreatePanel
            title="Add supplement"
            description="Configure a contract-level or room-specific supplement."
            triggerLabelOpen="Add supplement"
          >
            <HotelContractSupplementForm apiBaseUrl="/api" contractId={currentContract.id} roomCategories={roomCategories} />
          </CollapsibleCreatePanel>
        }
        emptyState={supplements.length === 0 ? <p className="empty-state">No supplements configured for this contract yet.</p> : undefined}
      >
        {supplements.length > 0 ? (
          <HotelContractSupplementsTable
            apiBaseUrl="/api"
            contractId={currentContract.id}
            roomCategories={roomCategories}
            supplements={supplements}
          />
        ) : null}
      </TableSectionShell>
    </section>
  );
}
