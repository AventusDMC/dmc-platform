import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { adminPageFetchJson } from '../lib/admin-server';
import { UsersTable } from './UsersTable';

type User = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'sales' | 'operations' | 'finance';
  status: 'active';
};

async function getUsers(): Promise<User[]> {
  return adminPageFetchJson<User[]>('/api/users', 'Users', {
    cache: 'no-store',
  });
}

export default async function UsersPage() {
  const users = await getUsers();

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Admin"
          title="Users"
          description="Manage the core platform users from a minimal admin surface."
          switcher={
            <ModuleSwitcher
              ariaLabel="Admin modules"
              activeId="users"
              items={[
                { id: 'users', label: 'Users', href: '/users', helper: 'People who use the platform' },
                { id: 'settings', label: 'Settings', href: '/branding', helper: 'Branding and admin setup' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'users-total', label: 'Users', value: String(users.length), helper: 'Platform accounts' },
                { id: 'users-admin', label: 'Admins', value: String(users.filter((user) => user.role === 'admin').length), helper: 'Full access' },
                { id: 'users-sales', label: 'Sales / Ops', value: String(users.filter((user) => user.role === 'sales' || user.role === 'operations').length), helper: 'Daily workflow roles' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader eyebrow="Admin" title="Users" description="A minimal user management surface with basic add, edit, and delete actions." />

            <TableSectionShell
              title="Users"
              description="Keep the user list simple for now while the route remains operational and editable."
              context={<p>{users.length} users in scope</p>}
            >
              <UsersTable apiBaseUrl="/api" users={users} />
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
