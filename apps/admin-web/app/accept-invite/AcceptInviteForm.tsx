'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { readJsonResponseIfPresent } from '../lib/api';

type InviteDetails = {
  email: string;
  role: 'admin' | 'viewer' | 'operations' | 'finance';
  company: {
    id: string;
    name: string;
  };
  expiresAt: string;
};

export function AcceptInviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [details, setDetails] = useState<InviteDetails | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch('/api/auth/invite-details', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token }),
        });

        const payload = await readJsonResponseIfPresent<InviteDetails & { message?: string }>(response);

        if (!response.ok) {
          throw new Error(String(payload?.message || 'Invitation not found.'));
        }

        if (!cancelled) {
          setDetails(payload as InviteDetails);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : 'Invitation not found.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadInvite();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/accept-invite', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token,
          firstName,
          lastName,
          password,
        }),
      });

      const payload = await readJsonResponseIfPresent<{ message?: string }>(response);

      if (!response.ok) {
        throw new Error(String(payload?.message || 'Could not accept invitation.'));
      }

      router.push('/');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not accept invitation.');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="form-helper">Loading invitation...</p>;
  }

  if (!details) {
    return <p className="form-error">{error || 'Invitation not found.'}</p>;
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <p className="form-helper">
        Joining <strong>{details.company.name}</strong> as <strong>{details.role}</strong>.
      </p>

      <label>
        Email
        <input value={details.email} readOnly disabled />
      </label>

      <label>
        First name
        <input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
      </label>

      <label>
        Last name
        <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
      </label>

      <label>
        Password
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </label>

      <button type="submit" disabled={submitting}>
        {submitting ? 'Joining company...' : 'Accept invitation'}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
