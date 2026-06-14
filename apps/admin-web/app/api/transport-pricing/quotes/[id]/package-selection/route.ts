import { NextRequest } from 'next/server';
import { proxyRequest } from '../../../../proxy-request';

// PR10B-2 — PATCH-only proxy for the route-vs-package selection save/clear (metadata only).
// Forwards to the PR10B-1 API endpoint (itself gated by transport.packageOptionSelection and
// @Roles('admin','finance')). No GET/POST/PUT/DELETE. Never mutates anything but the selection.

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return proxyRequest(request, `${API_BASE_URL}/transport-pricing/quotes/${id}/package-selection`, 'PATCH');
}
