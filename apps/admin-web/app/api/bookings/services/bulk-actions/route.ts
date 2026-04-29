import { NextRequest, NextResponse } from 'next/server';
import { buildProtectedActionErrorRedirect } from '../../../auth/protected-response';
import { buildActorHeaders } from '../../actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const action = String(formData.get('action') || '').trim();
  const note = String(formData.get('note') || '').trim();
  const serviceIds = formData
    .getAll('serviceId')
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  const response = await fetch(`${API_BASE_URL}/bookings/services/bulk-actions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildActorHeaders(request),
    },
    body: JSON.stringify({
      serviceIds,
      action,
      note,
    }),
  });

  const referer = request.headers.get('referer');

  if (!response.ok) {
    return buildProtectedActionErrorRedirect(
      {
        request,
        referer,
        fallbackPath: '/operations',
        genericError: 'Failed to apply bulk service action.',
      },
      response,
    );
  }

  const redirectUrl = new URL(referer || '/operations', request.url);
  const payload = await response.json().catch(() => null);
  const updatedCount = Number(payload?.updatedCount ?? 0);
  const skippedCount = Number(payload?.skippedCount ?? 0);
  const skipped = Array.isArray(payload?.skipped) ? payload.skipped : [];

  const warningLines: string[] = [];
  if (payload?.warning) {
    warningLines.push(String(payload.warning));
  }

  if (skippedCount > 0) {
    const skippedMessage = skipped
      .slice(0, 5)
      .map((entry: { serviceId?: string; reason?: string }) => `${entry.serviceId || 'unknown'}: ${entry.reason || 'Skipped'}`)
      .join('\n');
    const prefix =
      updatedCount > 0
        ? `Processed ${updatedCount} service${updatedCount === 1 ? '' : 's'} and skipped ${skippedCount}.`
        : `No services were updated. Skipped ${skippedCount}.`;
    warningLines.push(prefix, skippedMessage);
  }

  if (warningLines.length > 0) {
    redirectUrl.searchParams.set('warningText', warningLines.filter(Boolean).join('\n'));
  }

  if (updatedCount > 0) {
    redirectUrl.searchParams.set(
      'success',
      action === 'request_confirmation'
        ? `Requested confirmation for ${updatedCount} service${updatedCount === 1 ? '' : 's'}.`
        : `Applied bulk action to ${updatedCount} service${updatedCount === 1 ? '' : 's'}.`,
    );
  }

  return NextResponse.redirect(redirectUrl, { status: 303 });
}
