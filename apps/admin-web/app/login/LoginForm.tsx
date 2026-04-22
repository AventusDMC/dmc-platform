'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type LoginFormProps = {
  nextPath?: string;
  initialMessage?: string;
};

export function LoginForm({ nextPath = '/', initialMessage = '' }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('admin@dmc.local');
  const [password, setPassword] = useState('admin123');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const payload = await readJsonResponseIfPresent<{ message?: string }>(response);

      if (!response.ok) {
        throw new Error(String(payload?.message || 'Could not sign in.'));
      }

      router.push(nextPath || '/');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not sign in.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <label>
        Email
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required />
      </label>

      <label>
        Password
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          autoComplete="current-password"
          required
        />
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in...' : 'Sign in'}
      </button>

      {initialMessage ? <p className="form-helper">{initialMessage}</p> : null}
      <p className="form-helper">Seed users: `admin@dmc.local`, `sales@dmc.local`, `operations@dmc.local`, `finance@dmc.local`.</p>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
import { readJsonResponseIfPresent } from '../lib/api';
