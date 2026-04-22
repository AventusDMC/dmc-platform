import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ serviceId: string }> },
) {
  const { serviceId } = await params;
  const token = request.nextUrl.searchParams.get('token')?.trim() || '';
  const formData = await request.formData();

  if (!token) {
    return NextResponse.json({ error: 'Missing access token' }, { status: 400 });
  }

  const response = await fetch(
    `${API_BASE_URL}/bookings/services/${serviceId}/supplier-confirm?token=${encodeURIComponent(token)}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        confirmationNumber: String(formData.get('supplierReference') || '').trim() || null,
        supplierReference: String(formData.get('supplierReference') || '').trim() || null,
        notes: String(formData.get('notes') || '').trim() || null,
      }),
    },
  );

  const referer = request.headers.get('referer');
  const redirectUrl = new URL(referer || '/', request.url);

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    redirectUrl.searchParams.set('warningText', String(payload?.message || payload?.error || 'Failed to confirm service.'));
    return NextResponse.redirect(redirectUrl, { status: 303 });
  }

  redirectUrl.searchParams.set('success', 'Service confirmed successfully.');

  return NextResponse.redirect(redirectUrl, { status: 303 });
}
