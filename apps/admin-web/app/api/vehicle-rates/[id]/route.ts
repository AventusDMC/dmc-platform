import { NextRequest, NextResponse } from 'next/server';
import { isBackendUuid } from '../../../lib/backend-uuid';
import { proxyRequest } from '../../proxy-request';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isBackendUuid(id)) {
    return NextResponse.json({ message: 'Vehicle rate id must be a backend UUID.' }, { status: 400 });
  }

  return proxyRequest(request, `${API_BASE_URL}/vehicle-rates/${id}`, 'PATCH');
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!isBackendUuid(id)) {
    return NextResponse.json({ message: 'Vehicle rate id must be a backend UUID.' }, { status: 400 });
  }

  return proxyRequest(request, `${API_BASE_URL}/vehicle-rates/${id}`, 'DELETE');
}
