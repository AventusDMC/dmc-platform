import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { adminPageFetchJson } from '../lib/admin-server';
import { HotelContractChildPolicyBandForm } from './HotelContractChildPolicyBandForm';
import { HotelContractChildPolicyForm } from './HotelContractChildPolicyForm';
import { HotelContractChildPolicyTable } from './HotelContractChildPolicyTable';
import { HotelContractOccupancyRuleForm } from './HotelContractOccupancyRuleForm';
import { HotelContractOccupancyRulesTable } from './HotelContractOccupancyRulesTable';

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
  hasOccupancyRules?: boolean;
  hasChildPolicy?: boolean;
  readinessStatus?: 'draft' | 'in_progress' | 'ready';
};

type OccupancyRule = {
  id: string;
  roomCategoryId: string | null;
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  minAdults: number;
  maxAdults: number;
  maxChildren: number;
  maxOccupants: number;
  isActive: boolean;
  notes: string | null;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  } | null;
};

type ChildPolicy = {
  id: string;
  infantMaxAge: number;
  childMaxAge: number;
  notes: string | null;
  bands: Array<{
    id: string;
    label: string;
    minAge: number;
    maxAge: number;
    chargeBasis: 'FREE' | 'PERCENT_OF_ADULT' | 'FIXED_AMOUNT';
    chargeValue: number | null;
    isActive: boolean;
    notes: string | null;
  }>;
} | null;

async function getHotelContracts(): Promise<ContractOption[]> {
  return adminPageFetchJson<ContractOption[]>(`${API_BASE_URL}/hotel-contracts`, 'Hotel occupancy contracts', {
    cache: 'no-store',
  });
}

async function getOccupancyRules(contractId: string): Promise<OccupancyRule[]> {
  return adminPageFetchJson<OccupancyRule[]>(`${API_BASE_URL}/contracts/${contractId}/occupancy-rules`, 'Hotel occupancy rules', {
    cache: 'no-store',
  });
}

async function getChildPolicy(contractId: string): Promise<ChildPolicy> {
  return adminPageFetchJson<ChildPolicy>(`${API_BASE_URL}/contracts/${contractId}/child-policy`, 'Hotel child policy', {
    cache: 'no-store',
    allow404: true,
  });
}

type HotelOccupancyChildPolicySectionProps = {
  contractId?: string;
};

export async function HotelOccupancyChildPolicySection({ contractId }: HotelOccupancyChildPolicySectionProps) {
  const contracts = await getHotelContracts();
  const currentContract = contractId ? contracts.find((contract) => contract.id === contractId) || null : null;

  if (!currentContract) {
    return (
      <TableSectionShell
        title="Occupancy & Child Policy"
        description="Select a contract first, then configure adult occupancy limits and child age-band charging rules."
        context={<p>Contract-scoped configuration</p>}
      >
        <p className="empty-state">Choose a contract from the Contracts tab, then open this module with a selected contract.</p>
      </TableSectionShell>
    );
  }

  const [occupancyRules, childPolicy] = await Promise.all([getOccupancyRules(currentContract.id), getChildPolicy(currentContract.id)]);
  const safeOccupancyRules = occupancyRules ?? [];
  const safeChildBands = childPolicy?.bands ?? [];
  const roomCategories = (currentContract.hotel.roomCategories ?? []).filter((roomCategory) => roomCategory.isActive);
  const activeOccupancyRuleCount = safeOccupancyRules.filter((rule) => rule.isActive).length;
  const activeChildBandCount = safeChildBands.filter((band) => band.isActive).length;

  return (
    <section className="section-stack">
      <SummaryStrip
        items={[
          {
            id: 'occupancy-rules',
            label: 'Occupancy rules',
            value: String(safeOccupancyRules.length),
            helper: `${activeOccupancyRuleCount} active`,
          },
          {
            id: 'child-policy',
            label: 'Child policy',
            value: childPolicy ? 'Configured' : 'Missing',
            helper: childPolicy ? `${activeChildBandCount} active bands` : 'Set age thresholds',
          },
          {
            id: 'contract-readiness',
            label: 'Readiness',
            value: currentContract.readinessStatus || 'draft',
            helper: currentContract.hasOccupancyRules && currentContract.hasChildPolicy ? 'Core rules in place' : 'More setup needed',
          },
        ]}
      />

      <TableSectionShell
        title="Occupancy Rules"
        description="Define the adult and child occupancy limits that each contract allows by room scope."
        context={<p>{safeOccupancyRules.length} rules for {currentContract.name}</p>}
        createPanel={
          <CollapsibleCreatePanel
            title="Add occupancy rule"
            description="Capture the allowed adult and child mix without opening a separate page."
            triggerLabelOpen="Add occupancy rule"
          >
            <HotelContractOccupancyRuleForm apiBaseUrl="/api" contractId={currentContract.id} roomCategories={roomCategories} />
          </CollapsibleCreatePanel>
        }
        emptyState={safeOccupancyRules.length === 0 ? <p className="empty-state">No occupancy rules for this contract yet.</p> : undefined}
      >
        {safeOccupancyRules.length > 0 ? (
          <HotelContractOccupancyRulesTable
            apiBaseUrl="/api"
            contractId={currentContract.id}
            roomCategories={roomCategories}
            rules={safeOccupancyRules}
          />
        ) : null}
      </TableSectionShell>

      <TableSectionShell
        title="Child Policy"
        description="Configure age thresholds first, then add charging bands for child occupancy scenarios."
        context={<p>{safeChildBands.length} child policy bands for {currentContract.name}</p>}
        createPanel={
          childPolicy ? (
            <CollapsibleCreatePanel
              title="Add child policy band"
              description="Add a new age band with its charging basis."
              triggerLabelOpen="Add child band"
            >
              <HotelContractChildPolicyBandForm apiBaseUrl="/api" contractId={currentContract.id} />
            </CollapsibleCreatePanel>
          ) : (
            <CollapsibleCreatePanel
              title="Create child policy"
              description="Set the age cutoffs before adding charge bands."
              triggerLabelOpen="Create child policy"
            >
              <HotelContractChildPolicyForm apiBaseUrl="/api" contractId={currentContract.id} />
            </CollapsibleCreatePanel>
          )
        }
        emptyState={!childPolicy ? <p className="empty-state">No child policy configured for this contract yet.</p> : undefined}
      >
        {childPolicy ? (
          <HotelContractChildPolicyTable apiBaseUrl="/api" contractId={currentContract.id} policy={childPolicy} />
        ) : null}
      </TableSectionShell>
    </section>
  );
}
