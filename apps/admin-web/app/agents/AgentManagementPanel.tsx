'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage, readJsonResponse } from '../lib/api';

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

type AgentManagementPanelProps = {
  apiBaseUrl: string;
  companies: Company[];
  agents: AgentUser[];
};

export function AgentManagementPanel({ apiBaseUrl, companies, agents }: AgentManagementPanelProps) {
  const router = useRouter();
  const agentCompanies = useMemo(
    () => companies.filter((company) => (company.type || '').toLowerCase() === 'agent'),
    [companies],
  );
  const [error, setError] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [companyCity, setCompanyCity] = useState('');
  const [companyCountry, setCompanyCountry] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState(agentCompanies[0]?.id || '');
  const [agentName, setAgentName] = useState('');
  const [agentEmail, setAgentEmail] = useState('');
  const [agentPassword, setAgentPassword] = useState('');
  const [agentActive, setAgentActive] = useState(true);

  async function createAgentCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCompany(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/companies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: companyName.trim(),
          type: 'agent',
          city: companyCity.trim() || undefined,
          country: companyCountry.trim() || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not create agent company.'));
      }

      const company = await readJsonResponse(response, 'Could not create agent company.') as Company;
      setCompanyName('');
      setCompanyCity('');
      setCompanyCountry('');
      setSelectedCompanyId(company.id);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not create agent company.');
    } finally {
      setSavingCompany(false);
    }
  }

  async function createAgentUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingAgent(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agentName.trim(),
          email: agentEmail.trim(),
          role: 'agent',
          companyId: selectedCompanyId,
          password: agentPassword.trim() || undefined,
          active: agentActive,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not create agent user.'));
      }

      await readJsonResponse(response, 'Could not create agent user.');
      setAgentName('');
      setAgentEmail('');
      setAgentPassword('');
      setAgentActive(true);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not create agent user.');
    } finally {
      setSavingAgent(false);
    }
  }

  return (
    <div className="section-stack">
      {error ? <p className="form-error">{error}</p> : null}

      <div className="form-grid">
        <section className="detail-card">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Agent Company</p>
              <h3>Create agent company</h3>
            </div>
          </div>
          <form className="entity-form" onSubmit={createAgentCompany}>
            <label>
              Company name
              <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required />
            </label>
            <div className="form-row">
              <label>
                City
                <input value={companyCity} onChange={(event) => setCompanyCity(event.target.value)} />
              </label>
              <label>
                Country
                <input value={companyCountry} onChange={(event) => setCompanyCountry(event.target.value)} />
              </label>
            </div>
            <button type="submit" className="primary-button" disabled={savingCompany}>
              {savingCompany ? 'Creating...' : 'Create Agent Company'}
            </button>
          </form>
        </section>

        <section className="detail-card">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Agent User</p>
              <h3>Create portal agent</h3>
            </div>
          </div>
          <form className="entity-form" onSubmit={createAgentUser}>
            <label>
              Agent company
              <select value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)} required>
                <option value="">Select agent company</option>
                {agentCompanies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Full name
              <input value={agentName} onChange={(event) => setAgentName(event.target.value)} required />
            </label>
            <label>
              Login email
              <input type="email" value={agentEmail} onChange={(event) => setAgentEmail(event.target.value)} required />
            </label>
            <label>
              Temporary password
              <input
                type="password"
                value={agentPassword}
                onChange={(event) => setAgentPassword(event.target.value)}
                placeholder="Defaults to changeme123"
              />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={agentActive} onChange={(event) => setAgentActive(event.target.checked)} />
              Active portal account
            </label>
            <p className="form-helper">Password reset remains available through the normal login reset flow.</p>
            <button type="submit" className="primary-button" disabled={savingAgent || !selectedCompanyId}>
              {savingAgent ? 'Creating...' : 'Create Agent User'}
            </button>
          </form>
        </section>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th>Company</th>
              <th>Email</th>
              <th>Status</th>
              <th>Quote dropdown</th>
            </tr>
          </thead>
          <tbody>
            {agents.length === 0 ? (
              <tr>
                <td colSpan={5}>No agent users yet.</td>
              </tr>
            ) : agents.map((agent) => (
              <tr key={agent.id}>
                <td><strong>{agent.name}</strong></td>
                <td>{agent.companyName || 'Unlinked company'}</td>
                <td>{agent.email}</td>
                <td><span className="status-badge">{agent.status}</span></td>
                <td>{agent.status === 'active' ? 'Visible' : 'Hidden until active'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
