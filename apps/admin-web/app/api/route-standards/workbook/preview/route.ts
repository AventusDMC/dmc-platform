import { NextRequest } from 'next/server';
import { proxyRouteStandardsWorkbookUpload } from '../proxy';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

if (!API_BASE_URL) {
  throw new Error('NEXT_PUBLIC_API_URL is required for frontend API routes.');
}

export async function POST(request: NextRequest) {
  return proxyRouteStandardsWorkbookUpload(request, `${API_BASE_URL}/route-standards/workbook/preview`, 'preview');
}
