import { adminPageFetchJson } from '../lib/admin-server';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { TableSectionShell } from '../components/TableSectionShell';
import { HotelContractsForm } from '../hotel-contracts/HotelContractsForm';
import { HotelContractsTable } from './HotelContractsTable';
import Link from 'next/link';

const API_BASE_URL = '/api';

type Hotel = {
  id: string;
  name: string;
  city: string;
};

type HotelContract = {
  id: string;
  name: string;
  validFrom: string;
  validTo: string;
  currency: string;
  hotel: {
    id: string;
    name: string;
    city: string;
  };
  _count: {
    rates: number;
    allotments: number;
  };
  hasOccupancyRules?: boolean;
  hasChildPolicy?: boolean;
  hasMealPlans?: boolean;
  hasSupplements?: boolean;
  hasCancellationPolicy?: boolean;
  readinessStatus?: 'draft' | 'in_progress' | 'ready';
};

async function getHotels(): Promise<Hotel[]> {
  return adminPageFetchJson<Hotel[]>(`${API_BASE_URL}/hotels`, 'Hotel contracts hotels', {
    cache: 'no-store',
  });
}

async function getHotelContracts(): Promise<HotelContract[]> {
  return adminPageFetchJson<HotelContract[]>(`${API_BASE_URL}/hotel-contracts`, 'Hotel contracts list', {
    cache: 'no-store',
  });
}

type HotelContractsSectionProps = {
  contractId?: string;
  hotelId?: string;
};

function formatDateRange(from: string, to: string) {
  return `${new Date(from).toLocaleDateString()} - ${new Date(to).toLocaleDateString()}`;
}

export async function HotelContractsSection({ contractId, hotelId }: HotelContractsSectionProps) {
  const [hotels, hotelContracts] = await Promise.all([getHotels(), getHotelContracts()]);
  const visibleHotels = hotelId ? hotels.filter((hotel) => hotel.id === hotelId) : hotels;
  const visibleContracts = hotelId ? hotelContracts.filter((contract) => contract.hotel.id === hotelId) : hotelContracts;
  const currentContract = contractId ? visibleContracts.find((contract) => contract.id === contractId) || null : null;
  const currentContractLinks = currentContract
    ? [
        { href: `/hotels/contracts/${currentContract.id}`, label: 'Overview', helper: 'Contract summary and validity' },
        { href: `/hotels?tab=rates&contractId=${currentContract.id}`, label: 'Rates', helper: 'Published costs' },
        {
          href: `/hotels?tab=occupancy-child-policy&contractId=${currentContract.id}`,
          label: 'Occupancy & Child Policy',
          helper: 'Guest mix rules',
        },
        {
          href: `/hotels?tab=meal-plans-supplements&contractId=${currentContract.id}`,
          label: 'Meal Plans & Supplements',
          helper: 'Board and extras',
        },
        { href: `/hotels?tab=promotions&contractId=${currentContract.id}`, label: 'Promotions', helper: 'Commercial offers' },
        { href: `/hotels?tab=allotments&contractId=${currentContract.id}`, label: 'Allotments', helper: 'Inventory control' },
        { href: `/hotels?tab=policies&contractId=${currentContract.id}`, label: 'Policies', helper: 'Cancellation terms' },
      ]
    : [];

  return (
    <div className="section-stack">
      {currentContract ? (
        <section className="detail-card">
          <p className="eyebrow">Contract Detail Workspace</p>
          <div className="entity-card-header">
            <div>
              <h2>{currentContract.name}</h2>
              <p>
                {currentContract.hotel.name} ({currentContract.hotel.city})
              </p>
            </div>
            <span>{currentContract.readinessStatus || 'draft'}</span>
          </div>

          <div className="quote-preview-total-list">
            <div>
              <span>Validity</span>
              <strong>{formatDateRange(currentContract.validFrom, currentContract.validTo)}</strong>
            </div>
            <div>
              <span>Rates</span>
              <strong>{currentContract._count.rates}</strong>
            </div>
            <div>
              <span>Allotments</span>
              <strong>{currentContract._count.allotments}</strong>
            </div>
            <div>
              <span>Currency</span>
              <strong>{currentContract.currency}</strong>
            </div>
          </div>

          <div className="commercial-actions-row" aria-label="Contract detail workspace">
            {currentContractLinks.map((link) => (
              <Link key={link.href} className="commercial-action-link" href={link.href}>
                {link.label}
              </Link>
            ))}
            <Link className="commercial-action-link" href="/hotels?tab=contracts">
              Back to all contracts
            </Link>
          </div>
        </section>
      ) : null}

      <TableSectionShell
        title="Contracts"
        description="Manage supplier agreements and jump directly into the related contract workspace, rate setup, and downstream commercial modules."
        context={<p>{visibleContracts.length} contracts in scope</p>}
        className="hotel-contracts-workspace-section"
        createPanel={
          <CollapsibleCreatePanel
            title="Create contract"
            description="Add a supplier agreement before configuring rates or allotments."
            triggerLabelOpen="Create contract"
            triggerClassName="primary-button"
          >
            <HotelContractsForm apiBaseUrl="/api" hotels={visibleHotels} />
          </CollapsibleCreatePanel>
        }
        emptyState={visibleContracts.length === 0 ? <p className="empty-state">No hotel contracts yet.</p> : undefined}
      >
        {visibleContracts.length > 0 ? (
          <HotelContractsTable apiBaseUrl="/api" hotels={visibleHotels} hotelContracts={visibleContracts} />
        ) : null}
      </TableSectionShell>
    </div>
  );
}
