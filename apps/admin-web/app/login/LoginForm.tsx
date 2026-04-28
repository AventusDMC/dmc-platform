'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type LoginFormProps = {
  nextPath?: string;
  initialMessage?: string;
};

export function LoginForm({ nextPath = '/', initialMessage = '' }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const payload = await readJsonResponseIfPresent<{ message?: string; actor?: { role?: string } }>(response);

      if (!response.ok) {
        throw new Error(String(payload?.message || 'Could not sign in.'));
      }

      const actorRole = String(payload?.actor?.role || '').trim().toLowerCase();
      const defaultPath = actorRole === 'agent' ? '/agent/dashboard' : '/';
      router.push(nextPath || defaultPath);
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
      <p className="form-helper">
        New company? <Link href="/signup">Create an account</Link>
      </p>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
import { readJsonResponseIfPresent } from '../lib/api';
