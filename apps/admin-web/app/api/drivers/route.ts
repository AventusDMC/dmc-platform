import { NextRequest, NextResponse } from 'next/server';
import { proxyRequest } from '../proxy-request';
import { buildActorHeaders } from '../bookings/actorHeaders';
import { buildProtectedActionErrorRedirect } from '../auth/protected-response';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

function normalizeFormValue(value: FormDataEntryValue | null) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export async function GET(request: NextRequest) {
  return proxyRequest(request, `${API_BASE_URL}/drivers${request.nextUrl.search}`, 'GET');
}

// POST handles two cases:
//   - JSON body  → forward as-is (for programmatic clients)
//   - form body  → parse, convert to JSON, redirect back to /drivers with
//                  success or error param so the operator sees feedback.
export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return proxyRequest(request, `${API_BASE_URL}/drivers`, 'POST');
  }
  // Form submit from /drivers page.
  const formData = await request.formData();
  const languagesRaw = normalizeFormValue(formData.get('languages')) || '';
  const payload = {
    fullName: normalizeFormValue(formData.get('fullName')),
    phone: normalizeFormValue(formData.get('phone')),
    licenseNumber: normalizeFormValue(formData.get('licenseNumber')),
    languages: languagesRaw
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean),
    supplierId: normalizeFormValue(formData.get('supplierId')),
    notes: normalizeFormValue(formData.get('notes')),
  };

  const response = await fetch(`${API_BASE_URL}/drivers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
    redirect: 'manual',
  });

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer: request.headers.get('referer'),
        fallbackPath: '/drivers',
        genericError: 'Failed to add driver.',
      },
      response,
    );
  }

  const target = new URL('/drivers', request.url);
  target.searchParams.set('success', `Driver ${payload.fullName || ''} added.`);
  return NextResponse.redirect(target, { status: 303 });
}
