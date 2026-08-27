import { NextRequest, NextResponse } from 'next/server';
import { forwardProxyJsonResponse } from '../../proxy-response';
import { buildActorHeaders } from '../../bookings/actorHeaders';
import { isStagingDirectAgentCreateEnabled } from '../../../users/direct-agent-create-flag';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ message }, { status });
}

// Staging-only direct Agent-create proxy.
//
// - Server-gated: returns 404 unless ENABLE_STAGING_DIRECT_AGENT_CREATE === 'true'
//   (the flag is read here on the server, not via a NEXT_PUBLIC_ value). When the
//   flag is off the request body is never read.
// - Reuses the authenticated backend POST /users path and the established proxy /
//   actor-header convention (buildActorHeaders + forwardProxyJsonResponse).
// - Forces role=agent and active=true, and derives the company from the
//   authenticated Admin by intentionally NOT forwarding any companyId. Any
//   client-supplied role/companyId/active is ignored.
// - Rejects missing/blank/mismatched passwords BEFORE calling the backend, so the
//   backend's insecure default-password fallback can never be reached here.
// - Logs nothing; the password exists only in the forwarded request body and is
//   never placed in a URL, query string, log, or the returned response.
export async function POST(request: NextRequest) {
  if (!isStagingDirectAgentCreateEnabled()) {
    // Behave like a non-existent route when the surface is disabled.
    return new NextResponse(null, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim();
  const password = typeof body.password === 'string' ? body.password : '';
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';

  if (!name) return jsonError('Display name is required.', 400);
  if (!email) return jsonError('Email is required.', 400);
  if (!password.trim()) return jsonError('Password is required.', 400);
  if (password !== confirmPassword) return jsonError('Passwords do not match.', 400);

  // Server-forced, sanitized payload. role/active hardcoded; companyId omitted so
  // the backend derives the company from the authenticated actor; the client
  // cannot influence role, company, or active state.
  const forwardBody = {
    name,
    email,
    password,
    role: 'agent' as const,
    active: true as const,
  };

  const response = await fetch(`${API_BASE_URL}/users`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify(forwardBody),
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
