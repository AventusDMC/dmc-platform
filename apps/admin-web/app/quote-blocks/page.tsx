import Link from 'next/link';
import { QuoteBlocksManager } from './QuoteBlocksManager';

import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';

type ServiceType = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

type SupplierService = {
  id: string;
  name: string;
  category: string;
  serviceTypeId?: string | null;
  serviceType?: ServiceType | null;
  unitType: string;
  baseCost: number;
  currency: string;
};

type QuoteBlock = {
  id: string;
  name: string;
  type: 'ITINERARY_DAY' | 'SERVICE_BLOCK';
  title: string;
  description: string | null;
  defaultServiceId: string | null;
  defaultServiceTypeId: string | null;
  defaultCategory: string | null;
  defaultCost: number | null;
  defaultSell: number | null;
  defaultService?: SupplierService | null;
  defaultServiceType?: ServiceType | null;
};

async function getQuoteBlocks(): Promise<QuoteBlock[]> {
  return adminPageFetchJson<QuoteBlock[]>(`${API_BASE_URL}/quote-blocks`, 'Quote blocks', {
    cache: 'no-store',
  });
}

async function getServices(): Promise<SupplierService[]> {
  return adminPageFetchJson<SupplierService[]>(`${API_BASE_URL}/services`, 'Quote blocks services', {
    cache: 'no-store',
  });
}

async function getServiceTypes(): Promise<ServiceType[]> {
  return adminPageFetchJson<ServiceType[]>(`${API_BASE_URL}/service-types`, 'Quote blocks service types', {
    cache: 'no-store',
  });
}

export default async function QuoteBlocksPage() {
  const [blocks, services, serviceTypes] = await Promise.all([getQuoteBlocks(), getServices(), getServiceTypes()]);

  return (
    <main className="page">
      <section className="panel quote-workspace-page">
        <Link href="/quotes" className="back-link">
          Back to quotes
        </Link>
        <div className="workspace-summary-head">
          <div>
            <p className="eyebrow">Quote Tools</p>
            <h1 className="section-title quote-title">Reusable quote blocks</h1>
            <p className="detail-copy">Create reusable itinerary-day and service blocks that prefill quote editing forms.</p>
          </div>
        </div>
        <QuoteBlocksManager apiBaseUrl={ACTION_API_BASE_URL} blocks={blocks} services={services} serviceTypes={serviceTypes} />
      </section>
    </main>
  );
}
