import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { HotelContractCancellationPolicyForm } from './HotelContractCancellationPolicyForm';
import { HotelContractCancellationRuleForm } from './HotelContractCancellationRuleForm';
import { HotelContractCancellationRulesTable } from './HotelContractCancellationRulesTable';

const API_BASE_URL = ADMIN_API_BASE_URL;

type ContractOption = {
  id: string;
  name: string;
  hotel: {
    name: string;
  };
  hasCancellationPolicy?: boolean;
  readinessStatus?: 'draft' | 'in_progress' | 'ready';
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

async function getHotelContracts(): Promise<ContractOption[]> {
  return adminPageFetchJson<ContractOption[]>(`${API_BASE_URL}/hotel-contracts`, 'Hotel policies contracts', {
    cache: 'no-store',
  });
}

async function getCancellationPolicy(contractId: string): Promise<CancellationPolicy> {
  return adminPageFetchJson<CancellationPolicy>(`${API_BASE_URL}/hotel-contracts/${contractId}/cancellation-policy`, 'Hotel cancellation policy', {
    cache: 'no-store',
    allow404: true,
  });
}

type HotelPoliciesSectionProps = {
  contractId?: string;
};

export async function HotelPoliciesSection({ contractId }: HotelPoliciesSectionProps) {
  const contracts = await getHotelContracts();
  const currentContract = contractId ? contracts.find((contract) => contract.id === contractId) || null : null;

  if (!currentContract) {
    return (
      <TableSectionShell
        title="Policies"
        description="Select a contract first, then configure cancellation policy summary, no-show behavior, and sliding penalty windows."
        context={<p>Contract-scoped policy configuration</p>}
      >
        <p className="empty-state">Choose a contract from the Contracts tab, then open this module with a selected contract.</p>
      </TableSectionShell>
    );
  }

  const cancellationPolicy = await getCancellationPolicy(currentContract.id);
  const activeRuleCount = cancellationPolicy?.rules.filter((rule) => rule.isActive).length || 0;

  function formatNoShowValue() {
    if (!cancellationPolicy?.noShowPenaltyType) {
      return 'Not configured';
    }

    if (cancellationPolicy.noShowPenaltyType === 'FULL_STAY') {
      return 'Full stay';
    }

    if (cancellationPolicy.noShowPenaltyType === 'PERCENT') {
      return `${Number(cancellationPolicy.noShowPenaltyValue || 0).toFixed(2)}%`;
    }

    if (cancellationPolicy.noShowPenaltyType === 'NIGHTS') {
      return `${Number(cancellationPolicy.noShowPenaltyValue || 0)} nights`;
    }

    return `Fixed ${Number(cancellationPolicy.noShowPenaltyValue || 0).toFixed(2)}`;
  }

  return (
    <section className="section-stack">
      <SummaryStrip
        items={[
          {
            id: 'cancellation-policy',
            label: 'Cancellation policy',
            value: cancellationPolicy ? 'Configured' : 'Missing',
            helper: cancellationPolicy?.noShowPenaltyType ? 'No-show configured' : 'No-show pending',
          },
          {
            id: 'cancellation-rules',
            label: 'Cancellation rules',
            value: String(cancellationPolicy?.rules.length || 0),
            helper: `${activeRuleCount} active`,
          },
          {
            id: 'contract-readiness',
            label: 'Readiness',
            value: currentContract.readinessStatus || 'draft',
            helper: currentContract.hasCancellationPolicy ? 'Policy controls in place' : 'More setup needed',
          },
        ]}
      />

      <TableSectionShell
        title="Cancellation Policy"
        description="Capture the contract-level summary and no-show policy before defining individual deadline windows."
        context={<p>{cancellationPolicy ? cancellationPolicy.rules.length : 0} cancellation rules for {currentContract.name}</p>}
        createPanel={
          !cancellationPolicy ? (
            <CollapsibleCreatePanel
              title="Create cancellation policy"
              description="Set the contract summary and no-show penalty foundation."
              triggerLabelOpen="Create cancellation policy"
            >
              <HotelContractCancellationPolicyForm apiBaseUrl={API_BASE_URL} contractId={currentContract.id} />
            </CollapsibleCreatePanel>
          ) : undefined
        }
        emptyState={!cancellationPolicy ? <p className="empty-state">No cancellation policy configured for this contract yet.</p> : undefined}
      >
        {cancellationPolicy ? (
          <div className="section-stack">
            <div className="detail-card">
              <h3>{cancellationPolicy.summary || 'No summary'}</h3>
              <p className="table-subcopy">No-show: {formatNoShowValue()}</p>
              <p className="table-subcopy">{cancellationPolicy.notes || 'No notes'}</p>
            </div>
            <HotelContractCancellationPolicyForm
              apiBaseUrl={API_BASE_URL}
              contractId={currentContract.id}
              submitLabel="Save policy"
              initialValues={{
                summary: cancellationPolicy.summary || '',
                notes: cancellationPolicy.notes || '',
                noShowPenaltyType: cancellationPolicy.noShowPenaltyType || '',
                noShowPenaltyValue: cancellationPolicy.noShowPenaltyValue == null ? '' : String(cancellationPolicy.noShowPenaltyValue),
              }}
            />
          </div>
        ) : null}
      </TableSectionShell>

      <TableSectionShell
        title="Cancellation Rules"
        description="Define non-overlapping cancellation windows with their penalties in a compact list."
        context={<p>{activeRuleCount} active rules for {currentContract.name}</p>}
        createPanel={
          cancellationPolicy ? (
            <CollapsibleCreatePanel
              title="Add cancellation rule"
              description="Add a new active or inactive cancellation penalty window."
              triggerLabelOpen="Add cancellation rule"
            >
              <HotelContractCancellationRuleForm apiBaseUrl={API_BASE_URL} contractId={currentContract.id} />
            </CollapsibleCreatePanel>
          ) : undefined
        }
        emptyState={
          cancellationPolicy && cancellationPolicy.rules.length === 0 ? (
            <p className="empty-state">No cancellation rules configured for this contract yet.</p>
          ) : undefined
        }
      >
        {cancellationPolicy ? (
          <HotelContractCancellationRulesTable apiBaseUrl={API_BASE_URL} contractId={currentContract.id} policy={cancellationPolicy} />
        ) : null}
      </TableSectionShell>
    </section>
  );
}
