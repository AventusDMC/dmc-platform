'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { readJsonResponseIfPresent } from '../lib/api';

export function SignupForm() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          firstName,
          lastName,
          companyName,
          email,
          password,
        }),
      });

      const payload = await readJsonResponseIfPresent<{ message?: string }>(response);

      if (!response.ok) {
        throw new Error(String(payload?.message || 'Could not create account.'));
      }

      router.push('/');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not create account.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <label>
        First name
        <input value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
      </label>

      <label>
        Last name
        <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
      </label>

      <label>
        Company
        <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required />
      </label>

      <label>
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
      </label>

      <label>
        Password
        <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
      </label>

      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating account...' : 'Create company'}
      </button>

      <p className="form-helper">Your company will be created automatically and your account will be its first admin.</p>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
