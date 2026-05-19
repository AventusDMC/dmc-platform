export const MANUAL_SUPPLIER_RATE_CARDS_STORAGE_KEY = 'dmc.transport.manualSupplierRateCards';
export const MANUAL_SUPPLIER_RATE_CARDS_CHANGED_EVENT = 'dmc:manual-supplier-rate-cards-changed';

export type ManualSupplierRateLine = {
  id: string;
  vehicleId?: string | null;
  routeId: string | null;
  routeName: string;
  vehicleType: string;
  minPax?: number | null;
  maxPax?: number | null;
  price: number;
  currency: string;
  active: boolean;
  validFrom: string;
  validTo: string;
  supplierId: string;
  supplierName: string;
  vehicle?: {
    name?: string | null;
  } | null;
  route?: {
    id?: string | null;
    name?: string | null;
  } | null;
  serviceType?: {
    name: string;
    code: string;
    classification?: string | null;
  } | null;
  contractDiscountPercent?: number | null;
  grossRate?: number | null;
  discountAppliesTo?: string | null;
  discountNotes?: string | null;
};

export type ManualSupplierRateCard = {
  id: string;
  sourceRateCardId?: string;
  isVehicleSectionExtension?: boolean;
  supplierId: string;
  supplierName: string;
  name: string;
  category: string;
  vehicleType: string;
  routeId: string | null;
  routeOrServiceArea: string;
  status: string;
  effectiveFrom: string;
  currency: string;
  validFrom: string;
  validTo: string;
  notes: string;
  rates: ManualSupplierRateLine[];
};

function normalizeManualSupplierRateCards(value: unknown): ManualSupplierRateCard[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is ManualSupplierRateCard => Boolean(entry && typeof entry === 'object' && (entry as ManualSupplierRateCard).id))
    .map((entry) => ({
      ...entry,
      routeId: entry.routeId || null,
      rates: Array.isArray(entry.rates) ? entry.rates : [],
    }));
}

export function readManualSupplierRateCards() {
  if (typeof window === 'undefined') {
    return [] as ManualSupplierRateCard[];
  }

  try {
    return normalizeManualSupplierRateCards(JSON.parse(window.localStorage.getItem(MANUAL_SUPPLIER_RATE_CARDS_STORAGE_KEY) || '[]'));
  } catch {
    return [];
  }
}

export function writeManualSupplierRateCards(cards: ManualSupplierRateCard[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(MANUAL_SUPPLIER_RATE_CARDS_STORAGE_KEY, JSON.stringify(normalizeManualSupplierRateCards(cards)));
  window.dispatchEvent(new CustomEvent(MANUAL_SUPPLIER_RATE_CARDS_CHANGED_EVENT));
}

export function upsertManualSupplierRateCard(card: ManualSupplierRateCard) {
  const cards = readManualSupplierRateCards();
  writeManualSupplierRateCards([card, ...cards.filter((currentCard) => currentCard.id !== card.id)]);
}

export function deleteManualSupplierRateCard(cardId: string) {
  writeManualSupplierRateCards(readManualSupplierRateCards().filter((card) => card.id !== cardId));
}
