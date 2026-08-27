'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage, readJsonResponse } from '../lib/api';
import { buildDirectAgentRequestBody, validateDirectAgentForm } from './direct-agent-create-logic';

// Staging-only direct Agent-create form (rendered by the Users page ONLY when the
// server flag is on). The owner privately enters a synthetic display name, email,
// password, and confirmation. role=agent, active=true and the company are forced
// by the server route — this form never sends them. Passwords use masked inputs
// with autocomplete="new-password" and are cleared after success, failure, or
// cancellation; they are never stored, logged, echoed, or placed in a URL.
export function DirectAgentCreateForm({ apiBaseUrl }: { apiBaseUrl: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function clearSecrets() {
    setPassword('');
    setConfirmPassword('');
  }

  function resetAll() {
    setName('');
    setEmail('');
    clearSecrets();
    setMessage('');
    setError('');
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    setError('');

    const values = { name, email, password, confirmPassword };
    const validation = validateDirectAgentForm(values);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${apiBaseUrl}/users/direct-agent`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(buildDirectAgentRequestBody(values)),
      });

      if (!response.ok) {
        // getErrorMessage never contains the submitted password.
        throw new Error(await getErrorMessage(response, 'Could not create agent.'));
      }

      await readJsonResponse(response, 'Could not create agent.');
      setMessage('Temporary agent created.');
      clearSecrets(); // never retain the password after completion
      setName('');
      setEmail('');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not create agent.');
      clearSecrets(); // never retain the password after a failure
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit} autoComplete="off">
      <p className="detail-copy">
        Staging-only: create a temporary Agent under your own company. Role is fixed to <strong>agent</strong>.
      </p>
      <label>
        Display name
        <input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="off" />
      </label>
      <label>
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="off" />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          autoComplete="new-password"
        />
      </label>
      <label>
        Confirm password
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          autoComplete="new-password"
        />
      </label>
      <div className="table-action-row">
        <button type="button" className="secondary-button" onClick={resetAll} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="primary-button" disabled={saving}>
          {saving ? 'Creating...' : 'Create temporary agent'}
        </button>
      </div>
      {message ? <p className="detail-copy">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
