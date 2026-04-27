import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { adminPageFetchJson } from '../lib/admin-server';
import { HotelContractCancellationPolicyForm } from './HotelContractCancellationPolicyForm';
import { HotelContractCancellationRuleForm } from './HotelContractCancellationRuleForm';
import { HotelContractCancellationRulesTable } from './HotelContractCancellationRulesTable';
import {
  formatCancellationRule,
  formatChildPolicyValue,
  formatPolicyLabel,
  getCancellationFallback,
  getCancellationRules,
  getChildPolicies,
  toDisplayArray,
} from './hotel-contract-display';

const API_BASE_URL = '/api';

type ContractOption = {
  id: string;
  name: string;
  currency?: string | null;
  hotel: {
    name: string;
  };
  ratePolicies?: unknown;
  policies?: unknown;
  cancellationPolicy?: CancellationPolicy;
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
    daysBefore?: number | null;
    penaltyPercent?: number | null;
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

  const cancellationPolicy = (await getCancellationPolicy(currentContract.id)) || currentContract.cancellationPolicy || null;
  const cancellationRules = getCancellationRules(cancellationPolicy);
  const activeRuleCount = cancellationRules.filter((rule) => rule.isActive).length;
  const childPolicies = getChildPolicies(currentContract.ratePolicies);
  const contractPolicies = toDisplayArray<{ name?: string; value?: string; notes?: string }>(currentContract.policies);

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
            value: String(cancellationRules.length),
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
        context={<p>{cancellationRules.length} cancellation rules for {currentContract.name}</p>}
        createPanel={
          !cancellationPolicy ? (
            <CollapsibleCreatePanel
              title="Create cancellation policy"
              description="Set the contract summary and no-show penalty foundation."
              triggerLabelOpen="Create cancellation policy"
            >
              <HotelContractCancellationPolicyForm apiBaseUrl="/api" contractId={currentContract.id} />
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
              apiBaseUrl="/api"
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
        title="Rate Policies"
        description="Review imported child policies, discounts, extra beds, and meal rules."
        context={<p>{childPolicies.length} imported child policies for {currentContract.name}</p>}
        emptyState={childPolicies.length === 0 ? <p className="empty-state">No child policies available</p> : undefined}
      >
        {childPolicies.length > 0 ? (
          <div className="summary-strip">
            {childPolicies.map((policy, index) => (
              <div className="summary-card" key={`${formatPolicyLabel(policy)}-${index}`}>
                <span>{formatPolicyLabel(policy)}</span>
                <strong>{formatChildPolicyValue(policy, currentContract.currency || 'JOD')}</strong>
              </div>
            ))}
          </div>
        ) : null}
      </TableSectionShell>

      {contractPolicies.length > 0 ? (
        <TableSectionShell
          title="Contract Policies"
          description="General policy notes imported with this contract."
          context={<p>{contractPolicies.length} policy notes for {currentContract.name}</p>}
        >
          <div className="summary-strip">
            {contractPolicies.map((policy, index) => (
              <div className="summary-card" key={`${policy.name || 'Policy'}-${index}`}>
                <span>{policy.name || 'Policy'}</span>
                <strong>{policy.value || policy.notes || 'No details'}</strong>
              </div>
            ))}
          </div>
        </TableSectionShell>
      ) : null}

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
              <HotelContractCancellationRuleForm apiBaseUrl="/api" contractId={currentContract.id} />
            </CollapsibleCreatePanel>
          ) : undefined
        }
        emptyState={
          cancellationRules.length === 0 ? (
            <p className="empty-state">{getCancellationFallback(cancellationPolicy)}</p>
          ) : undefined
        }
      >
        {cancellationRules.length > 0 ? (
          <div className="summary-strip">
            {cancellationRules.map((rule) => (
              <div className="summary-card" key={rule.id}>
                <span>{rule.isActive ? 'Active' : 'Inactive'}</span>
                <strong>{formatCancellationRule(rule)}</strong>
              </div>
            ))}
          </div>
        ) : null}
        {cancellationPolicy && cancellationRules.length > 0 ? (
          <HotelContractCancellationRulesTable
            apiBaseUrl="/api"
            contractId={currentContract.id}
            policy={{ ...cancellationPolicy, rules: cancellationRules as NonNullable<CancellationPolicy>['rules'] }}
          />
        ) : null}
      </TableSectionShell>
    </section>
  );
}
