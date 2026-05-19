import { NextRequest } from 'next/server';
import { buildActorHeaders } from '../../../../bookings/actorHeaders';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function GET(request: NextRequest) {
  const response = await fetch(`${API_BASE_URL}/vehicle-rates/tariff-matrix/touring/export`, {
    method: 'GET',
    headers: buildActorHeaders(request),
    cache: 'no-store',
    redirect: 'manual',
  });

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': response.headers.get('Content-Disposition') || 'attachment; filename="touring-route-tariff-matrix.xlsx"',
    },
  });
}
