import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { HotelPromotionsForm } from './HotelPromotionsForm';
import { HotelPromotionsTable } from './HotelPromotionsTable';

const API_BASE_URL = ADMIN_API_BASE_URL;

type HotelRoomCategory = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

type HotelContract = {
  id: string;
  name: string;
  currency: string;
  hotel: {
    id: string;
    name: string;
    roomCategories: HotelRoomCategory[];
  };
};

type Promotion = {
  id: string;
  hotelContractId: string;
  name: string;
  type: 'PERCENTAGE_DISCOUNT' | 'FIXED_DISCOUNT' | 'STAY_PAY' | 'FREE_NIGHT';
  value: number | null;
  stayPayNights: number | null;
  payNights: number | null;
  freeNightCount: number | null;
  isActive: boolean;
  priority: number;
  combinable: boolean;
  notes: string | null;
  hotelContract: {
    id: string;
    name: string;
    currency: string;
    hotel: {
      name: string;
    };
  };
  rules: Array<{
    id: string;
    roomCategoryId: string | null;
    travelDateFrom: string | null;
    travelDateTo: string | null;
    bookingDateFrom: string | null;
    bookingDateTo: string | null;
    boardBasis: 'RO' | 'BB' | 'HB' | 'FB' | 'AI' | null;
    minStay: number | null;
    isActive: boolean;
    roomCategory: {
      id: string;
      name: string;
      code: string | null;
    } | null;
  }>;
};

async function getHotelContracts(): Promise<HotelContract[]> {
  return adminPageFetchJson<HotelContract[]>(`${API_BASE_URL}/hotel-contracts`, 'Hotel promotions contracts', {
    cache: 'no-store',
  });
}

async function getPromotions(): Promise<Promotion[]> {
  return adminPageFetchJson<Promotion[]>(`${API_BASE_URL}/promotions`, 'Hotel promotions list', {
    cache: 'no-store',
  });
}

type HotelPromotionsSectionProps = {
  contractId?: string;
};

export async function HotelPromotionsSection({ contractId }: HotelPromotionsSectionProps) {
  const [contracts, promotions] = await Promise.all([getHotelContracts(), getPromotions()]);
  const visiblePromotions = contractId ? promotions.filter((promotion) => promotion.hotelContractId === contractId) : promotions;
  const activeCount = visiblePromotions.filter((promotion) => promotion.isActive).length;
  const combinableCount = visiblePromotions.filter((promotion) => promotion.combinable).length;
  const ruleCount = visiblePromotions.reduce((sum, promotion) => sum + promotion.rules.length, 0);

  return (
    <TableSectionShell
      title="Promotions"
      description="Apply commercial offers on top of hotel pricing without merging them into base contract rates."
      context={<p>{visiblePromotions.length} promotions configured</p>}
      createPanel={
        <CollapsibleCreatePanel
          title="Create promotion"
          description="Add a promotion rule set on top of existing contract pricing."
          triggerLabelOpen="Add promotion"
        >
          <HotelPromotionsForm apiBaseUrl={API_BASE_URL} contracts={contracts} />
        </CollapsibleCreatePanel>
      }
      emptyState={
        visiblePromotions.length === 0 ? (
          <p className="empty-state">
            {contractId ? 'No promotions for this contract yet.' : 'No promotions yet.'}
          </p>
        ) : undefined
      }
    >
      <>
        <SummaryStrip
          items={[
            {
              id: 'promotions-total',
              label: 'Promotions',
              value: String(visiblePromotions.length),
              helper: 'Foundation layer',
            },
            {
              id: 'promotions-active',
              label: 'Active',
              value: String(activeCount),
              helper: `${visiblePromotions.length - activeCount} inactive`,
            },
            {
              id: 'promotions-combinable',
              label: 'Combinable',
              value: String(combinableCount),
              helper: 'Can stack with peers',
            },
            {
              id: 'promotions-rules',
              label: 'Rules',
              value: String(ruleCount),
              helper: 'Travel and booking filters',
            },
          ]}
        />

        {visiblePromotions.length > 0 ? (
          <HotelPromotionsTable apiBaseUrl={API_BASE_URL} contracts={contracts} promotions={visiblePromotions} />
        ) : null}
      </>
    </TableSectionShell>
  );
}
