import { NextRequest } from 'next/server';
import { forwardProxyJsonResponse } from '../../../proxy-response';
import { buildActorHeaders } from '../../../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

// Same-origin proxy for revoking (deleting) a user invitation. The admin Users
// page Revoke control calls DELETE /api/users/invitations/:id; this forwards
// only the invitation id to the backend revoke endpoint (DELETE
// /users/invitations/:id), reusing the project's authenticated cookie/actor-
// header proxy convention and status/error forwarding. It intentionally logs
// nothing — no invitation email, token, cookie, authorization header, or
// response body is emitted here.
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const response = await fetch(`${API_BASE_URL}/users/invitations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: buildActorHeaders(request),
    redirect: 'manual',
  });

  return forwardProxyJsonResponse(response);
}
