import { AdvancedFiltersPanel } from '../components/AdvancedFiltersPanel';
import Link from 'next/link';
import { LeadsForm } from './LeadsForm';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { LeadsTable } from './LeadsTable';

import { ADMIN_API_BASE_URL, adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';

type Lead = {
  id: string;
  inquiry: string;
  source: string | null;
  status: string;
  createdAt: string;
  clientName: string | null;
  tripRequest: string | null;
  travelStartDate: string | null;
  travelEndDate: string | null;
  pax: number | null;
  assignedAgentName: string | null;
};

function normalizeLead(value: unknown): Lead | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const lead = value as Record<string, unknown>;
  const id = typeof lead.id === 'string' ? lead.id : '';

  if (!id) {
    return null;
  }

  return {
    id,
    inquiry: typeof lead.inquiry === 'string' ? lead.inquiry : '',
    source: typeof lead.source === 'string' ? lead.source : null,
    status: typeof lead.status === 'string' && lead.status.trim() ? lead.status : 'new',
    createdAt: typeof lead.createdAt === 'string' ? lead.createdAt : '',
    clientName: getOptionalString(lead.clientName) || getOptionalString(lead.companyName) || getOptionalString(lead.client),
    tripRequest: getOptionalString(lead.tripRequest) || getOptionalString(lead.requestTitle) || null,
    travelStartDate: getOptionalString(lead.travelStartDate) || getOptionalString(lead.startDate),
    travelEndDate: getOptionalString(lead.travelEndDate) || getOptionalString(lead.endDate),
    pax: getOptionalNumber(lead.pax) ?? getOptionalNumber(lead.guestCount) ?? null,
    assignedAgentName: getOptionalString(lead.assignedAgentName) || getNestedName(lead.assignedAgent) || getNestedName(lead.agent),
  };
}

function getOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function getOptionalNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }

  return null;
}

function getNestedName(value: unknown) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  return getOptionalString(record.name) || getOptionalString(record.email);
}

function normalizeStatus(status: string) {
  return status.trim().toLowerCase().replaceAll(' ', '_').replaceAll('-', '_');
}

function countLeadsByStatus(leads: Lead[], statuses: string[]) {
  const normalizedStatuses = new Set(statuses.map(normalizeStatus));
  return leads.filter((lead) => normalizedStatuses.has(normalizeStatus(lead.status || 'new'))).length;
}

function isNextRenderControlError(error: unknown) {
  if (!error || typeof error !== 'object' || !('digest' in error)) {
    return false;
  }

  const digest = String((error as { digest?: unknown }).digest || '');
  return digest === 'DYNAMIC_SERVER_USAGE' || digest.startsWith('NEXT_HTTP_ERROR_FALLBACK');
}

async function getLeads(): Promise<Lead[]> {
  let leads: unknown;

  try {
    leads = await adminPageFetchJson<unknown>(`${API_BASE_URL}/leads`, 'Leads list', {
      cache: 'no-store',
    });
  } catch (error) {
    if (isNextRedirectError(error) || isNextRenderControlError(error)) {
      throw error;
    }

    console.error('[LeadsPage] Could not load leads list.', error);
    return [];
  }

  if (!Array.isArray(leads)) {
    console.error('[LeadsPage] Expected leads list to be an array.');
    return [];
  }

  return leads
    .map(normalizeLead)
    .filter((lead): lead is Lead => Boolean(lead));
}

export default async function LeadsPage() {
  const leads = await getLeads();
  const newLeads = countLeadsByStatus(leads, ['new']);
  const contactedLeads = countLeadsByStatus(leads, ['contacted']);
  const qualifiedLeads = countLeadsByStatus(leads, ['qualified']);
  const convertedLeads = countLeadsByStatus(leads, ['converted']);
  const lostLeads = countLeadsByStatus(leads, ['lost', 'closed']);

  return (
    <main className="page leads-crm-page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Sales"
          title="Leads"
          description="Triage incoming inquiries, qualify trips, and move ready opportunities into quote creation."
          switcher={
            <ModuleSwitcher
              ariaLabel="Sales modules"
              activeId="leads"
              items={[
                { id: 'quotes', label: 'Quotes', href: '/quotes', helper: 'Proposal pipeline' },
                { id: 'leads', label: 'Leads', href: '/leads', helper: 'Incoming inquiries' },
                { id: 'quote-blocks', label: 'Quote Blocks', href: '/quote-blocks', helper: 'Reusable content' },
                { id: 'import-itinerary', label: 'Import Itinerary', href: '/import-itinerary', helper: 'Draft intake' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'new', label: 'New', value: String(newLeads), helper: 'Needs triage' },
                { id: 'contacted', label: 'Contacted', value: String(contactedLeads), helper: 'Conversation started' },
                { id: 'qualified', label: 'Qualified', value: String(qualifiedLeads), helper: 'Ready to price' },
                { id: 'converted', label: 'Converted', value: String(convertedLeads), helper: 'Moved forward' },
                { id: 'lost', label: 'Lost', value: String(lostLeads), helper: 'Closed out' },
              ]}
            />
          }
        >
          <section className="section-stack leads-crm-stack">
            <WorkspaceSubheader
              eyebrow="Sales"
              title="CRM lead dashboard"
              description={`${leads.length} lead${leads.length === 1 ? '' : 's'} in the sales inbox.`}
              actions={
                <div className="table-action-row">
                  <Link href="#new-lead" className="primary-button">
                    New Lead
                  </Link>
                  <Link href="/quotes" className="secondary-button">
                    Quotes
                  </Link>
                </div>
              }
            />

            <TableSectionShell
              title="Lead pipeline"
              description="Review client interest, trip request, ownership, and next action in one scan."
              context={<p>{leads.length} total</p>}
              actions={
                <AdvancedFiltersPanel title="Sales tools" description="Adjacent proposal surfaces">
                  <div className="operations-filter-row">
                    <Link href="/quote-blocks" className="secondary-button">
                      Quote blocks
                    </Link>
                    <Link href="/import-itinerary" className="secondary-button">
                      Import itinerary
                    </Link>
                  </div>
                </AdvancedFiltersPanel>
              }
              createPanel={
                <div id="new-lead">
                <CollapsibleCreatePanel title="Create lead" description="Capture new inquiries while keeping the inbox visible." triggerLabelOpen="Add lead">
                  <LeadsForm apiBaseUrl={ACTION_API_BASE_URL} />
                </CollapsibleCreatePanel>
                </div>
              }
              emptyState={
                leads.length === 0 ? (
                  <div className="leads-crm-empty-state">
                    <h3>No leads yet</h3>
                    <p>Capture the first inquiry to start tracking status, ownership, and quote handoff from this dashboard.</p>
                    <Link href="#new-lead" className="primary-button">
                      New Lead
                    </Link>
                  </div>
                ) : undefined
              }
            >
              {leads.length > 0 ? <LeadsTable apiBaseUrl={ACTION_API_BASE_URL} leads={leads} /> : null}
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
