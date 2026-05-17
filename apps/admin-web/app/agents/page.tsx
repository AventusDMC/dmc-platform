import Link from 'next/link';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { adminPageFetchJson } from '../lib/admin-server';
import { AgentManagementPanel } from './AgentManagementPanel';

export const dynamic = 'force-dynamic';

type Company = {
  id: string;
  name: string;
  type: string | null;
  city: string | null;
  country: string | null;
};

type AgentUser = {
  id: string;
  name: string;
  email: string;
  role: 'agent';
  companyId: string | null;
  companyName: string | null;
  status: 'active' | 'inactive';
  active?: boolean;
};

async function getCompanies(): Promise<Company[]> {
  return adminPageFetchJson<Company[]>('/api/companies', 'Agent companies', {
    cache: 'no-store',
  });
}

async function getAgents(): Promise<AgentUser[]> {
  return adminPageFetchJson<AgentUser[]>('/api/users/agents', 'Agent users', {
    cache: 'no-store',
  });
}

export default async function AgentsPage() {
  const [companies, agents] = await Promise.all([getCompanies(), getAgents()]);
  const agentCompanies = companies.filter((company) => (company.type || '').toLowerCase() === 'agent');
  const activeAgents = agents.filter((agent) => agent.status === 'active');

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Administration"
          title="Agent Management"
          description="Create external agent companies and portal users, then assign active agents from quote setup."
          switcher={
            <ModuleSwitcher
              ariaLabel="Administration modules"
              activeId="agents"
              items={[
                { id: 'agents', label: 'Agents', href: '/agents', helper: 'Agent companies and users' },
                { id: 'users', label: 'Users', href: '/users', helper: 'Internal platform users' },
                { id: 'companies', label: 'Companies', href: '/companies', helper: 'Client and partner companies' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'agent-companies', label: 'Agent Companies', value: String(agentCompanies.length), helper: 'Company type agent' },
                { id: 'agent-users', label: 'Agent Users', value: String(agents.length), helper: 'Portal accounts' },
                { id: 'active-agents', label: 'Dropdown Visible', value: String(activeAgents.length), helper: 'Active agent users' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Portal Ownership"
              title="Manage agents"
              description="Agent users created here are active portal accounts and appear in the Quote Assigned Agent dropdown."
              actions={<Link href="/quotes/new" className="secondary-button">Create quote</Link>}
            />

            <TableSectionShell
              title="Agent companies and users"
              description="Create the agency company first, then create the login account linked to that company."
              context={<p>{activeAgents.length} active agents selectable on quotes</p>}
            >
              <AgentManagementPanel apiBaseUrl="/api" companies={companies} agents={agents} />
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
