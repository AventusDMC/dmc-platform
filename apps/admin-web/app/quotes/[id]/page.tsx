import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { AdminBackButton } from '../../components/AdminBackButton';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { AdminHeaderActions } from '../../components/AdminHeaderActions';
import { AdvancedFiltersPanel } from '../../components/AdvancedFiltersPanel';
import { CompactFilterBar } from '../../components/CompactFilterBar';
import { InlineEntityActions } from '../../components/InlineEntityActions';
import { SummaryStrip } from '../../components/SummaryStrip';
import { TableSectionShell } from '../../components/TableSectionShell';
import { RowDetailsPanel } from '../../components/RowDetailsPanel';
import { QuotePreviewLink } from './preview-link';
import { DownloadPdfButton } from './preview/DownloadPdfButton';
import { QuoteOptionsForm } from './QuoteOptionsForm';
import { QuotePricingTable } from './QuotePricingTable';
import { QuoteSummaryPanel } from './QuoteSummaryPanel';
import { ShareQuoteButton } from './ShareQuoteButton';
import { SaveQuoteVersionButton } from './SaveQuoteVersionButton';
import { SendQuoteButton } from './SendQuoteButton';
import { QuoteHotelOptionSets } from './QuoteHotelOptionSets';
import { QuoteInvoiceSection } from './QuoteInvoiceSection';
import { QuoteBuilderEmptyState } from './QuoteBuilderEmptyState';
import { QuoteBuilderStatusBadge } from './QuoteBuilderStatusBadge';
import { QuotePricingSummaryCard } from './QuotePricingSummaryCard';
import { QuoteStatusForm } from './QuoteStatusForm';
import { SupportTextForm } from './SupportTextForm';
import { getAutoItineraryDayCount } from './QuoteAutoItineraryBuilder.logic';
import { QuoteGroupPricing } from './QuoteGroupPricing';
import { QuotesForm } from '../QuotesForm';
import { ConvertToBookingButton } from './ConvertToBookingButton';
import type { QuoteItineraryResponse } from './QuoteItineraryTab';
import { QuoteServicePlanner } from './QuoteServicePlanner';
import { QuoteTransportBulkAssign } from './QuoteTransportBulkAssign';
import { CancelQuoteButton } from './CancelQuoteButton';
import { ReviseQuoteButton } from './ReviseQuoteButton';
import { HotelCategoryOption } from '../../lib/hotelCategories';
import { RouteOption } from '../../lib/routes';
import { formatNightCountLabel } from '../../lib/formatters';
import { calculateMarginPercent, calculateProfit, formatMarginPercent, getQuoteMarginWarning } from '../../lib/financials';
import { getValidatedTripSummary } from '../../lib/tripSummary';
import { buildQuoteReadinessModel, buildQuoteWorkspaceHref, type QuotePricingFocus, type ServicePlannerCategory } from './quote-readiness';

import { ADMIN_API_BASE_URL, adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';
import { readSessionActor } from '../../lib/auth-session';

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';
const DATA_API_BASE_URL = '/api';

type QuoteStatus = 'DRAFT' | 'READY' | 'SENT' | 'ACCEPTED' | 'CONFIRMED' | 'REVISION_REQUESTED' | 'EXPIRED' | 'CANCELLED';

type Company = {
  id: string;
  name: string;
};

type Contact = {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
};

type User = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'viewer' | 'operations' | 'finance' | 'agent';
  status: 'active';
};

type Itinerary = {
  id: string;
  dayNumber: number;
  title: string;
  description: string | null;
  images: {
    id: string;
    sortOrder: number;
    galleryImage: {
      id: string;
      title: string;
      imageUrl: string;
      destination: string | null;
      category: string | null;
    };
  }[];
};

type SupplierService = {
  id: string;
  supplierId: string;
  name: string;
  category: string;
  serviceTypeId?: string | null;
  serviceType?: {
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  } | null;
  supplier?: {
    id?: string | null;
    name?: string | null;
  } | null;
  unitType: string;
  baseCost: number;
  currency: string;
  ticketRateVariants?: Array<{
    id: string;
    label: string;
    costPrice: number;
    sellPrice?: number | null;
    currency: string;
    pricingBasis: 'PER_PERSON' | 'PER_GROUP' | 'PER_DAY';
    notes?: string | null;
    active: boolean;
    sortOrder?: number | null;
  }> | null;
  serviceRates?: Array<{
    id?: string | null;
    pricingMode?: string | null;
    maxPaxPerUnit?: number | null;
    costBaseAmount?: number | null;
    costCurrency?: string | null;
  }>;
};

type ActivityCatalogItem = {
  id: string;
  name: string;
  description: string | null;
  supplierCompanyId: string;
  supplierCompany?: {
    id: string;
    name: string;
    city?: string | null;
    country?: string | null;
  } | null;
  pricingBasis: 'PER_PERSON' | 'PER_GROUP';
  costPrice: number;
  sellPrice: number;
  durationMinutes: number | null;
  currency?: string | null;
  active: boolean;
  rateVariants?: Array<{
    id: string;
    name: string;
    durationMinutes: number | null;
    pricingBasis: 'PER_PERSON' | 'PER_GROUP';
    currency: string;
    costPrice: number;
    sellPrice: number;
    maxPaxPerUnit: number | null;
    active: boolean;
    notes?: string | null;
  }> | null;
};

type Hotel = {
  id: string;
  name: string;
  city: string;
  category: string;
  hotelCategoryId?: string | null;
  factSheet?: {
    shortDescription?: string | null;
    highlightsJson?: unknown;
    amenitiesJson?: unknown;
    checkInTime?: string | null;
    checkOutTime?: string | null;
  } | null;
  roomCategories: {
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  }[];
};

type HotelContract = {
  id: string;
  hotelId: string;
  name: string;
  currency: string;
  validFrom: string;
  validTo: string;
  hotel: {
    id: string;
    name: string;
  };
};

type TransportServiceType = {
  id: string;
  name: string;
  code: string;
};

type TransportVehicle = {
  id: string;
  supplierId?: string | null;
  supplierName?: string | null;
  name: string;
  vehicleType?: string | null;
  maxPax: number;
  luggageCapacity?: number | null;
  active?: boolean | null;
  isActive?: boolean | null;
};

type TransportSupplierRateCard = {
  id: string;
  vehicleId: string;
  routeId: string | null;
  routeName: string;
  price: number;
  currency: string;
  active: boolean;
  validFrom: string;
  validTo: string;
  supplierId?: string | null;
  supplierName?: string | null;
  supplier?: {
    id?: string;
    name?: string | null;
  } | null;
  vehicle?: {
    name?: string | null;
    vehicleType?: string | null;
  } | null;
  serviceType?: {
    name: string;
    code: string;
    classification?: string | null;
  } | null;
  pricingMode?: string | null;
  contractDiscountPercent?: number | null;
  grossRate?: number | null;
};

function normalizeTransportSupplierRateRows(payload: unknown): TransportSupplierRateCard[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) => {
      if (entry && typeof entry === 'object' && Array.isArray((entry as { rates?: unknown }).rates)) {
        return normalizeTransportSupplierRateRows((entry as { rates: unknown }).rates);
      }

      return [entry as TransportSupplierRateCard];
    });
  }

  if (payload && typeof payload === 'object') {
    const record = payload as {
      supplierRateCards?: unknown;
      vehicleRates?: unknown;
      rateLines?: unknown;
      transportRates?: unknown;
      data?: unknown;
      items?: unknown;
    };

    return normalizeTransportSupplierRateRows(
      record.supplierRateCards ?? record.vehicleRates ?? record.rateLines ?? record.transportRates ?? record.data ?? record.items ?? [],
    );
  }

  return [];
}

type HotelRate = {
  id: string;
  contractId: string;
  seasonName: string;
  roomCategoryId: string;
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  mealPlan: 'BB' | 'HB' | 'FB';
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM' | null;
  currency: string;
  cost: number;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  };
};

type Season = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

type PromotionExplanationItem =
  | string
  | {
      id?: string | null;
      name: string;
      effect?: string | null;
      type?: string | null;
      minStay?: string | number | null;
      boardBasis?: string | null;
    };

type QuoteItem = {
  id: string;
  itineraryId: string | null;
  activityId?: string | null;
  ticketRateVariantId?: string | null;
  activity?: {
    id: string;
    name: string;
    description: string | null;
    durationMinutes?: number | null;
    active?: boolean;
  } | null;
  serviceDate: string | null;
  startTime: string | null;
  pickupTime: string | null;
  pickupLocation: string | null;
  meetingPoint: string | null;
  participantCount: number | null;
  adultCount: number | null;
  childCount: number | null;
  reconfirmationRequired: boolean;
  reconfirmationDueAt: string | null;
  hotelId: string | null;
  contractId: string | null;
  seasonId: string | null;
  seasonName: string | null;
  roomCategoryId: string | null;
  occupancyType: 'SGL' | 'DBL' | 'TPL' | null;
  mealPlan: 'BB' | 'HB' | 'FB' | null;
  quantity: number;
  paxCount: number | null;
  roomCount: number | null;
  nightCount: number | null;
  dayCount: number | null;
  baseCost: number;
  costBaseAmount?: number;
  costCurrency?: string;
  quoteCurrency?: string;
  salesTaxPercent?: number;
  salesTaxIncluded?: boolean;
  serviceChargePercent?: number;
  serviceChargeIncluded?: boolean;
  tourismFeeAmount?: number | null;
  tourismFeeCurrency?: string | null;
  tourismFeeMode?: 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM' | null;
  fxRate?: number | null;
  fxFromCurrency?: string | null;
  fxToCurrency?: string | null;
  fxRateDate?: string | null;
  baseSell?: number | null;
  finalCost?: number | null;
  overrideCost: number | null;
  markupAmount?: number | null;
  sellPrice?: number | null;
  useOverride: boolean;
  currency: string;
  pricingDescription: string | null;
  jordanPassCovered?: boolean;
  jordanPassSavingsJod?: number;
  promotionExplanation?: PromotionExplanationItem[] | null;
  markupPercent: number;
  totalCost: number;
  totalSell: number;
  externalPackageCountry?: string | null;
  externalPackageName?: string | null;
  externalSupplierName?: string | null;
  externalStartDay?: number | null;
  externalEndDay?: number | null;
  externalStartDate?: string | null;
  externalEndDate?: string | null;
  externalPricingBasis?: 'PER_PERSON' | 'PER_GROUP' | string | null;
  externalNetCost?: number | null;
  externalPackagePricingMatrixJson?: unknown;
  externalPackageSingleSupplement?: number | null;
  externalIncludes?: string | null;
  externalExcludes?: string | null;
  externalInternalNotes?: string | null;
  externalHotelsOrSimilar?: string | null;
  externalClientDescription?: string | null;
  service: SupplierService;
  appliedVehicleRate: {
    id: string;
    routeId: string | null;
    routeName: string;
    vehicle: {
      name: string;
      vehicleType?: string | null;
      maxPax?: number | null;
    };
    serviceType: {
      id: string;
      name: string;
      code: string;
    };
    supplier?: {
      id?: string | null;
      name?: string | null;
    } | null;
  } | null;
  hotel: {
    name: string;
  } | null;
  contract: {
    name: string;
  } | null;
  roomCategory: {
    name: string;
  } | null;
};

type QuoteHotelOption = {
  id: string;
  quoteOptionId: string;
  city: string;
  hotelId: string | null;
  roomCategoryId?: string | null;
  hotelNameSnapshot: string;
  roomType: string;
  mealPlan: string;
  mealPlanCode?: 'RO' | 'BB' | 'HB' | 'FB' | 'AI' | null;
  nights: number;
  isPrimary: boolean;
  notes: string | null;
  roomCategory?: {
    id: string;
    name: string;
    code: string | null;
  } | null;
};

type QuoteOption = {
  id: string;
  quoteId: string;
  kind?: 'HOTEL_OPTION_SET' | 'COMMERCIAL_OPTION';
  name: string;
  notes: string | null;
  hotelCategoryId: string | null;
  hotelCategory: HotelCategoryOption | null;
  pricingMode: 'itemized' | 'package';
  packageMarginPercent: number | null;
  totalCost: number;
  totalPrice: number;
  totalSell: number;
  profit: number;
  pricePerPax: number;
  hotelOptions: QuoteHotelOption[];
  quoteItems: QuoteItem[];
};

type Quote = {
  id: string;
  quoteNumber: string | null;
  quoteType: 'FIT' | 'GROUP';
  jordanPassType: 'NONE' | 'WANDERER' | 'EXPLORER' | 'EXPERT';
  bookingType: 'FIT' | 'GROUP' | 'SERIES';
  title: string;
  description: string | null;
  quoteCurrency: 'USD' | 'JOD' | 'EUR';
  inclusionsText: string | null;
  exclusionsText: string | null;
  termsNotesText: string | null;
  pricingMode: 'SLAB' | 'FIXED';
  pricingType: 'simple' | 'group';
  fixedPricePerPerson: number;
  pricingSlabs: Array<{
    id: string;
    minPax: number;
    maxPax: number | null;
    price: number;
    actualPax?: number;
    focPax?: number;
    payingPax?: number;
    totalCost?: number;
    totalSell?: number;
    pricePerPayingPax?: number;
    pricePerActualPax?: number | null;
    notes?: string | null;
  }>;
  focType: 'none' | 'ratio' | 'fixed';
  focRatio: number | null;
  focCount: number | null;
  focRoomType: 'single' | 'double' | null;
  resolvedFocCount: number;
  resolvedFocRoomType: 'single' | 'double' | null;
  totalPrice: number;
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  totalCost: number;
  totalSell: number;
  pricePerPax: number;
  singleSupplement: number | null;
  travelStartDate: string | null;
  status: QuoteStatus;
  validUntil: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  acceptedVersionId: string | null;
  revisionNumber: number;
  revisedFromId: string | null;
  isLatestRevision?: boolean;
  invoice: {
    id: string;
    totalAmount: number;
    currency: string;
    status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
    dueDate: string;
  } | null;
  publicToken: string | null;
  publicEnabled: boolean;
  agent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
  company: Company;
  brandCompany?: Company;
  contact: Contact;
  quoteItems: QuoteItem[];
  quoteOptions: QuoteOption[];
  itineraries: Itinerary[];
  scenarios: {
    id: string;
    paxCount: number;
    totalCost: number;
    totalSell: number;
    pricePerPax: number;
  }[];
  booking: {
    id: string;
    status: 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  } | null;
};

type QuoteVersion = {
  id: string;
  quoteId: string;
  versionNumber: number;
  label: string | null;
  createdAt: string;
};

type SupportTextTemplate = {
  id: string;
  title: string;
  templateType: 'inclusions' | 'exclusions' | 'terms_notes';
  content: string;
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
  defaultServiceType?: {
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
  } | null;
};

type QuoteDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    tab?: 'overview' | 'itinerary' | 'hotels' | 'transport' | 'services' | 'pricing' | 'proposal' | 'versions' | 'review';
    step?: 'overview' | 'itinerary' | 'services' | 'pricing' | 'group-pricing' | 'review' | 'preview';
    day?: string;
    addCategory?: ServicePlannerCategory;
    catalogServiceId?: string;
    catalogHotelId?: string;
    catalogContractId?: string;
    catalogRoomCategoryId?: string;
    catalogMealPlan?: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
    catalogOccupancyType?: 'SGL' | 'DBL' | 'TPL';
    catalogRateCost?: string;
    catalogRateCurrency?: string;
    catalogRateNote?: string;
    catalogRouteId?: string;
    pricingFocus?: QuotePricingFocus;
  }>;
};

type QuoteDetailTab = 'overview' | 'itinerary' | 'hotels' | 'transport' | 'services' | 'pricing' | 'proposal' | 'versions' | 'review';
type QuoteWorkspaceStep = 'overview' | 'itinerary' | 'services' | 'pricing' | 'group-pricing' | 'review' | 'preview';

const QUOTE_DETAIL_TABS: Array<{ id: QuoteDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'itinerary', label: 'Itinerary' },
  { id: 'hotels', label: 'Hotels' },
  { id: 'transport', label: 'Transport' },
  { id: 'services', label: 'Services' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'versions', label: 'Versions' },
  { id: 'review', label: 'Notes' },
];

const QUOTE_DASHBOARD_TABS: Array<{ id: QuoteDetailTab; label: string; helper: string }> = [
  { id: 'overview', label: 'Setup', helper: 'Basic client, dates, pax, currency' },
  { id: 'itinerary', label: 'Itinerary', helper: 'Build day-by-day program' },
  { id: 'hotels', label: 'Hotels', helper: 'Choose hotel options' },
  { id: 'transport', label: 'Transport', helper: 'Select routes, vehicles, suppliers' },
  { id: 'services', label: 'Meals & Services', helper: 'Add lunches, guides, entrances, activities' },
  { id: 'pricing', label: 'Pricing', helper: 'Review cost, sell, margin' },
  { id: 'proposal', label: 'Proposal', helper: 'Preview and export client proposal' },
];

const QUOTE_DASHBOARD_WORKFLOW = ['Draft', 'Pricing', 'Review', 'Sent', 'Accepted', 'Booking'];

const QUOTE_WORKSPACE_STEPS: Array<{ id: QuoteWorkspaceStep; label: string; targetTab: QuoteDetailTab }> = [
  { id: 'overview', label: 'Overview', targetTab: 'overview' },
  { id: 'itinerary', label: 'Itinerary', targetTab: 'itinerary' },
  { id: 'services', label: 'Services', targetTab: 'services' },
  { id: 'pricing', label: 'Pricing', targetTab: 'pricing' },
  { id: 'group-pricing', label: 'Group Pricing', targetTab: 'pricing' },
  { id: 'review', label: 'Review', targetTab: 'review' },
  { id: 'preview', label: 'Preview', targetTab: 'review' },
];

type CostSummary = {
  totalCost: number;
  totalSell: number;
};

type InternalCostingMetrics = {
  marginAmount: number;
  marginPercent: number;
};

type QuoteFetchResult =
  | {
      status: 'ok';
      quote: Quote | null;
    }
  | {
      status: 'error';
      message: string;
    };

type QuoteItineraryFetchResult = {
  status: 'ok' | 'error';
  itinerary: QuoteItineraryResponse;
  message?: string;
};

type QuoteVersionsFetchResult = {
  status: 'ok' | 'error';
  versions: QuoteVersion[];
  message?: string;
};

type OptionalQuoteDetailFetchResult<T> = {
  status: 'ok' | 'error';
  label: string;
  data: T;
  message?: string;
};

type ServiceCostBreakdown = {
  key: string;
  label: string;
  itemCount: number;
  totalCost: number;
  totalSell: number;
  marginAmount: number;
  marginPercent: number;
  currency: string;
};

const QUOTE_DETAIL_OPTIONAL_FETCH_TIMEOUT_MS = 8000;
const QUOTE_DETAIL_TRANSPORT_FETCH_TIMEOUT_MS = 20000;

type SafeQuoteDetailFetchOptions = {
  timeoutMs?: number;
  retries?: number;
};

function withQuoteDetailTimeout<T>(label: string, promise: Promise<T>, timeoutMs = QUOTE_DETAIL_OPTIONAL_FETCH_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} did not respond within ${timeoutMs / 1000}s`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
}

async function safeQuoteDetailFetch<T>(
  label: string,
  fallback: T,
  load: () => Promise<T | null | undefined>,
  options: SafeQuoteDetailFetchOptions = {},
): Promise<OptionalQuoteDetailFetchResult<T>> {
  const timeoutMs = options.timeoutMs ?? QUOTE_DETAIL_OPTIONAL_FETCH_TIMEOUT_MS;
  const retries = options.retries ?? 0;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const data = await withQuoteDetailTimeout(label, load(), timeoutMs);

      if (attempt > 0) {
        console.warn(`[QuoteDetailsPage] Optional ${label} fetch succeeded on retry ${attempt}.`);
      }

      return {
        status: 'ok',
        label,
        data: data ?? fallback,
      };
    } catch (error) {
      if (isNextRedirectError(error)) {
        throw error;
      }

      lastError = error;

      if (attempt < retries) {
        const message = error instanceof Error ? error.message : `Unknown ${label} fetch failure`;
        console.warn(`[QuoteDetailsPage] Optional ${label} fetch attempt ${attempt + 1} failed: ${message}. Retrying...`);
      }
    }
  }

  const message = lastError instanceof Error ? lastError.message : `Unknown ${label} fetch failure`;
  console.warn(`[QuoteDetailsPage] Optional ${label} fetch failed: ${message}`);

  return {
    status: 'error',
    label,
    message,
    data: fallback,
  };
}

async function safeQuoteDetailTransportFetch<T>(
  label: string,
  fallback: T,
  load: () => Promise<T | null | undefined>,
): Promise<OptionalQuoteDetailFetchResult<T>> {
  return safeQuoteDetailFetch(label, fallback, load, {
    timeoutMs: QUOTE_DETAIL_TRANSPORT_FETCH_TIMEOUT_MS,
    retries: 1,
  });
}

function skippedQuoteDetailFetch<T>(label: string, data: T): Promise<OptionalQuoteDetailFetchResult<T>> {
  return Promise.resolve({
    status: 'ok',
    label,
    data,
  });
}

function unwrapSettledQuoteDetail<T>(result: PromiseSettledResult<T>, fallback: T, label: string): T {
  if (result.status === 'fulfilled') {
    return result.value;
  }

  const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
  console.error(`[QuoteDetailsPage] ${label} fetch failed before page render: ${message}`);
  return fallback;
}

async function getQuote(id: string): Promise<QuoteFetchResult> {
  try {
    const quote = await adminPageFetchJson<Quote | null>(`${DATA_API_BASE_URL}/quotes/${id}`, 'Quote detail', {
      cache: 'no-store',
      allow404: true,
    });

    return {
      status: 'ok',
      quote,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown quote fetch failure';
    console.error(`[QuoteDetailsPage] Quote fetch failed for ${id}: ${message}`);

    return {
      status: 'error',
      message,
    };
  }
}

async function getServices(): Promise<SupplierService[]> {
  return adminPageFetchJson<SupplierService[]>(`${DATA_API_BASE_URL}/services`, 'Quote detail services', {
    cache: 'no-store',
  });
}

async function getActivities(): Promise<ActivityCatalogItem[]> {
  return adminPageFetchJson<ActivityCatalogItem[]>(`${DATA_API_BASE_URL}/activities`, 'Quote detail activities', {
    cache: 'no-store',
  });
}

async function getTransportServiceTypes(): Promise<TransportServiceType[]> {
  return adminPageFetchJson<TransportServiceType[]>(`${DATA_API_BASE_URL}/transport-service-types`, 'Quote detail transport service types', {
    cache: 'no-store',
  });
}

async function getRoutes(): Promise<RouteOption[]> {
  return adminPageFetchJson<RouteOption[]>(`${API_BASE_URL}/routes?limit=200`, 'Quote detail routes', {
    cache: 'no-store',
  });
}

async function getVehicles(): Promise<TransportVehicle[]> {
  return adminPageFetchJson<TransportVehicle[]>(`${DATA_API_BASE_URL}/vehicles`, 'Quote detail vehicles', {
    cache: 'no-store',
  });
}

async function getSupplierRateCards(): Promise<TransportSupplierRateCard[]> {
  const payload = await adminPageFetchJson<unknown>(`${API_BASE_URL}/vehicle-rates`, 'Quote detail supplier rate cards', {
    cache: 'no-store',
  });
  return normalizeTransportSupplierRateRows(payload);
}

async function getHotels(): Promise<Hotel[]> {
  return adminPageFetchJson<Hotel[]>(`${DATA_API_BASE_URL}/hotels`, 'Quote detail hotels', {
    cache: 'no-store',
  });
}

async function getHotelCategories(): Promise<HotelCategoryOption[]> {
  return adminPageFetchJson<HotelCategoryOption[]>(`${DATA_API_BASE_URL}/hotel-categories?active=true`, 'Quote detail hotel categories', {
    cache: 'no-store',
  });
}

async function getHotelContracts(): Promise<HotelContract[]> {
  return adminPageFetchJson<HotelContract[]>(`${DATA_API_BASE_URL}/hotel-contracts`, 'Quote detail hotel contracts', {
    cache: 'no-store',
  });
}

async function getHotelRates(): Promise<HotelRate[]> {
  return adminPageFetchJson<HotelRate[]>(`${DATA_API_BASE_URL}/hotel-rates`, 'Quote detail hotel rates', {
    cache: 'no-store',
  });
}

async function getSeasons(): Promise<Season[]> {
  return adminPageFetchJson<Season[]>(`${DATA_API_BASE_URL}/seasons`, 'Quote detail seasons', {
    cache: 'no-store',
  });
}

async function getCompanies(): Promise<Company[]> {
  return adminPageFetchJson<Company[]>(`${DATA_API_BASE_URL}/companies`, 'Quote detail companies', {
    cache: 'no-store',
  });
}

async function getVersions(id: string): Promise<QuoteVersionsFetchResult> {
  try {
    const versions =
      (await adminPageFetchJson<QuoteVersion[] | null>(`${DATA_API_BASE_URL}/quotes/${id}/versions`, 'Quote detail versions', {
        cache: 'no-store',
        allow404: true,
      })) || [];

    return {
      status: 'ok',
      versions,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown versions fetch failure';
    console.warn(`[QuoteDetailsPage] Quote versions fetch failed for ${id}: ${message}`);

    return {
      status: 'error',
      message,
      versions: [],
    };
  }
}

async function getContacts(): Promise<Contact[]> {
  return adminPageFetchJson<Contact[]>(`${DATA_API_BASE_URL}/contacts`, 'Quote detail contacts', {
    cache: 'no-store',
  });
}

async function getUsers(): Promise<User[]> {
  return adminPageFetchJson<User[]>(`${DATA_API_BASE_URL}/users`, 'Quote detail users', {
    cache: 'no-store',
  });
}

async function getSupportTextTemplates(): Promise<SupportTextTemplate[]> {
  return adminPageFetchJson<SupportTextTemplate[]>(`${DATA_API_BASE_URL}/support-text-templates`, 'Quote detail support text templates', {
    cache: 'no-store',
  });
}

async function getQuoteBlocks(): Promise<QuoteBlock[]> {
  return adminPageFetchJson<QuoteBlock[]>(`${DATA_API_BASE_URL}/quote-blocks`, 'Quote detail quote blocks', {
    cache: 'no-store',
  });
}

async function getQuoteItinerary(id: string): Promise<QuoteItineraryFetchResult> {
  try {
    const itinerary =
      (await adminPageFetchJson<QuoteItineraryResponse | null>(`${DATA_API_BASE_URL}/quotes/${id}/itinerary`, 'Quote detail itinerary', {
        cache: 'no-store',
        allow404: true,
      })) || {
        quoteId: id,
        days: [],
      };

    return {
      status: 'ok',
      itinerary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown itinerary fetch failure';
    console.error(`[QuoteDetailsPage] Quote itinerary fetch failed for ${id}: ${message}`);

    return {
      status: 'error',
      message,
      itinerary: {
        quoteId: id,
        days: [],
      },
    };
  }
}

function normalizeQuoteItem(item: Partial<QuoteItem> | null | undefined): QuoteItem {
  const rawItem = item as (Partial<QuoteItem> & Record<string, unknown>) | null | undefined;
  const service = item?.service || ({
    id: 'missing-service',
    supplierId: 'import-itinerary-system',
    name: 'Service details unavailable',
    category: 'Unassigned',
    serviceTypeId: null,
    serviceType: null,
    unitType: 'per_group',
    baseCost: 0,
    currency: 'USD',
  } satisfies SupplierService);

  return {
    id: item?.id || `missing-item-${Math.random().toString(36).slice(2)}`,
    itineraryId: item?.itineraryId ?? null,
    activityId: item?.activityId ?? item?.activity?.id ?? null,
    activity: item?.activity
      ? {
          id: item.activity.id,
          name: item.activity.name,
          description: item.activity.description ?? null,
          durationMinutes: item.activity.durationMinutes ?? null,
          active: item.activity.active,
        }
      : null,
    serviceDate: item?.serviceDate ?? null,
    startTime: item?.startTime ?? null,
    pickupTime: item?.pickupTime ?? null,
    pickupLocation: item?.pickupLocation ?? null,
    meetingPoint: item?.meetingPoint ?? null,
    participantCount: item?.participantCount ?? null,
    adultCount: item?.adultCount ?? null,
    childCount: item?.childCount ?? null,
    reconfirmationRequired: Boolean(item?.reconfirmationRequired),
    reconfirmationDueAt: item?.reconfirmationDueAt ?? null,
    hotelId: item?.hotelId ?? null,
    contractId: item?.contractId ?? null,
    seasonId: item?.seasonId ?? null,
    seasonName: item?.seasonName ?? null,
    roomCategoryId: item?.roomCategoryId ?? null,
    occupancyType: item?.occupancyType ?? null,
    mealPlan: item?.mealPlan ?? null,
    quantity: item?.quantity ?? 0,
    paxCount: item?.paxCount ?? null,
    roomCount: item?.roomCount ?? null,
    nightCount: item?.nightCount ?? null,
    dayCount: item?.dayCount ?? null,
    baseCost: item?.baseCost ?? 0,
    costBaseAmount: item?.costBaseAmount,
    costCurrency: item?.costCurrency,
    quoteCurrency: item?.quoteCurrency,
    salesTaxPercent: item?.salesTaxPercent,
    salesTaxIncluded: item?.salesTaxIncluded,
    serviceChargePercent: item?.serviceChargePercent,
    serviceChargeIncluded: item?.serviceChargeIncluded,
    tourismFeeAmount: item?.tourismFeeAmount ?? null,
    tourismFeeCurrency: item?.tourismFeeCurrency ?? null,
    tourismFeeMode: item?.tourismFeeMode ?? null,
    fxRate: item?.fxRate ?? null,
    fxFromCurrency: item?.fxFromCurrency ?? null,
    fxToCurrency: item?.fxToCurrency ?? null,
    fxRateDate: item?.fxRateDate ?? null,
    baseSell: item?.baseSell ?? null,
    finalCost: item?.finalCost ?? null,
    overrideCost: item?.overrideCost ?? null,
    markupAmount: item?.markupAmount ?? null,
    sellPrice: item?.sellPrice ?? null,
    useOverride: Boolean(item?.useOverride),
    currency: item?.currency || item?.quoteCurrency || item?.costCurrency || 'USD',
    pricingDescription: item?.pricingDescription ?? null,
    jordanPassCovered: Boolean(item?.jordanPassCovered),
    jordanPassSavingsJod: item?.jordanPassSavingsJod ?? 0,
    promotionExplanation: item?.promotionExplanation ?? null,
    markupPercent: item?.markupPercent ?? 0,
    totalCost: item?.totalCost ?? 0,
    totalSell: item?.totalSell ?? 0,
    externalPackageCountry: item?.externalPackageCountry ?? (typeof rawItem?.country === 'string' ? rawItem.country : null),
    externalPackageName: item?.externalPackageName ?? (typeof rawItem?.packageName === 'string' ? rawItem.packageName : null),
    externalSupplierName: item?.externalSupplierName ?? (typeof rawItem?.supplierName === 'string' ? rawItem.supplierName : null),
    externalStartDay: item?.externalStartDay ?? (typeof rawItem?.startDay === 'number' ? rawItem.startDay : null),
    externalEndDay: item?.externalEndDay ?? (typeof rawItem?.endDay === 'number' ? rawItem.endDay : null),
    externalStartDate: item?.externalStartDate ?? (typeof rawItem?.startDate === 'string' ? rawItem.startDate : null),
    externalEndDate: item?.externalEndDate ?? (typeof rawItem?.endDate === 'string' ? rawItem.endDate : null),
    externalPricingBasis: item?.externalPricingBasis ?? (typeof rawItem?.pricingBasis === 'string' ? rawItem.pricingBasis : null),
    externalNetCost: item?.externalNetCost ?? (typeof rawItem?.netCost === 'number' ? rawItem.netCost : null),
    externalPackagePricingMatrixJson: item?.externalPackagePricingMatrixJson ?? rawItem?.pricingMatrixJson ?? null,
    externalPackageSingleSupplement: item?.externalPackageSingleSupplement ?? (typeof rawItem?.singleSupplement === 'number' ? rawItem.singleSupplement : null),
    externalIncludes: item?.externalIncludes ?? (typeof rawItem?.includes === 'string' ? rawItem.includes : null),
    externalExcludes: item?.externalExcludes ?? (typeof rawItem?.excludes === 'string' ? rawItem.excludes : null),
    externalInternalNotes: item?.externalInternalNotes ?? (typeof rawItem?.internalNotes === 'string' ? rawItem.internalNotes : null),
    externalHotelsOrSimilar: item?.externalHotelsOrSimilar ?? (typeof rawItem?.hotelsOrSimilar === 'string' ? rawItem.hotelsOrSimilar : null),
    externalClientDescription: item?.externalClientDescription ?? (typeof rawItem?.clientDescription === 'string' ? rawItem.clientDescription : null),
    service: {
      ...service,
      serviceType: service.serviceType
        ? {
            id: service.serviceType.id,
            name: service.serviceType.name,
            code: service.serviceType.code,
            isActive: service.serviceType.isActive,
          }
        : null,
    },
    appliedVehicleRate: item?.appliedVehicleRate
      ? {
          id: item.appliedVehicleRate.id,
          routeId: item.appliedVehicleRate.routeId ?? null,
          routeName: item.appliedVehicleRate.routeName,
          vehicle: {
            name: item.appliedVehicleRate.vehicle?.name || 'Vehicle to be confirmed',
            vehicleType: item.appliedVehicleRate.vehicle?.vehicleType || null,
            maxPax: item.appliedVehicleRate.vehicle?.maxPax ?? null,
          },
          serviceType: {
            id: item.appliedVehicleRate.serviceType?.id || 'missing-service-type',
            name: item.appliedVehicleRate.serviceType?.name || 'Transport',
            code: item.appliedVehicleRate.serviceType?.code || 'TRANSPORT',
          },
          supplier: item.appliedVehicleRate.supplier
            ? {
                id: item.appliedVehicleRate.supplier.id || null,
                name: item.appliedVehicleRate.supplier.name || null,
              }
            : null,
        }
      : null,
    hotel: item?.hotel ? { name: item.hotel.name } : null,
    contract: item?.contract ? { name: item.contract.name } : null,
    roomCategory: item?.roomCategory ? { name: item.roomCategory.name } : null,
  };
}

function normalizeQuoteDetail(quote: Quote): Quote {
  return {
    ...quote,
    quoteCurrency: quote.quoteCurrency || 'USD',
    inclusionsText: quote.inclusionsText ?? null,
    exclusionsText: quote.exclusionsText ?? null,
    termsNotesText: quote.termsNotesText ?? null,
    pricingSlabs: Array.isArray(quote.pricingSlabs) ? quote.pricingSlabs : [],
    scenarios: Array.isArray(quote.scenarios) ? quote.scenarios : [],
    company: quote.company || { id: 'missing-company', name: 'Company unavailable' },
    contact: quote.contact || { id: 'missing-contact', companyId: '', firstName: 'Contact', lastName: 'Unavailable' },
    quoteItems: Array.isArray(quote.quoteItems) ? quote.quoteItems.map((item) => normalizeQuoteItem(item)) : [],
    quoteOptions: Array.isArray(quote.quoteOptions)
      ? quote.quoteOptions.map((option) => ({
          ...option,
          hotelOptions: Array.isArray(option.hotelOptions) ? option.hotelOptions : [],
          quoteItems: Array.isArray(option.quoteItems) ? option.quoteItems.map((item) => normalizeQuoteItem(item)) : [],
        }))
      : [],
    itineraries: Array.isArray(quote.itineraries)
      ? quote.itineraries.map((day) => ({
          ...day,
          description: day.description ?? null,
          images: Array.isArray(day.images) ? day.images : [],
        }))
      : [],
  };
}

function formatMoney(amount: number | null | undefined, currency = 'USD') {
  const numericAmount = Number(amount);
  const safeAmount = Number.isFinite(numericAmount) ? numericAmount : 0;

  return `${currency || 'USD'} ${safeAmount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatQuoteStatus(status: QuoteStatus) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatInvoiceStatus(status?: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED' | null) {
  if (!status) {
    return 'Not created';
  }

  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatDate(value: string | null) {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function isQuoteExpired(quote: Pick<Quote, 'status' | 'validUntil'>) {
  if (quote.status === 'EXPIRED') {
    return true;
  }

  if (!quote.validUntil || quote.status === 'ACCEPTED' || quote.status === 'CONFIRMED' || quote.status === 'CANCELLED') {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return new Date(quote.validUntil).getTime() < today.getTime();
}

function sumTotals(items: QuoteItem[]): CostSummary {
  return items.reduce(
    (totals, item) => ({
      totalCost: totals.totalCost + item.totalCost,
      totalSell: totals.totalSell + item.totalSell,
    }),
    { totalCost: 0, totalSell: 0 },
  );
}

function getDayTotals(items: QuoteItem[], itineraryId: string): CostSummary {
  return sumTotals(items.filter((item) => item.itineraryId === itineraryId));
}

function getInternalCostingMetrics(totalCost: number, totalSell: number): InternalCostingMetrics {
  const marginAmount = calculateProfit(totalSell, totalCost);
  const marginPercent = calculateMarginPercent(totalSell, totalCost);

  return { marginAmount, marginPercent };
}

function buildServiceCostBreakdown(items: QuoteItem[]): ServiceCostBreakdown[] {
  const grouped = new Map<string, ServiceCostBreakdown>();

  for (const item of items) {
    const key = item.service.id;
    const existing = grouped.get(key);

    if (existing) {
      existing.itemCount += 1;
      existing.totalCost = Number((existing.totalCost + item.totalCost).toFixed(2));
      existing.totalSell = Number((existing.totalSell + item.totalSell).toFixed(2));
      existing.marginAmount = calculateProfit(existing.totalSell, existing.totalCost);
      existing.marginPercent = calculateMarginPercent(existing.totalSell, existing.totalCost);
      continue;
    }

    grouped.set(key, {
      key,
      label: item.service.name,
      itemCount: 1,
      totalCost: item.totalCost,
      totalSell: item.totalSell,
      marginAmount: calculateProfit(item.totalSell, item.totalCost),
      marginPercent: calculateMarginPercent(item.totalSell, item.totalCost),
      currency: item.currency,
    });
  }

  return [...grouped.values()].sort((left, right) => right.marginAmount - left.marginAmount || right.totalSell - left.totalSell);
}

function getFocImpactLabel(quote: Quote) {
  return quote.resolvedFocCount > 0
    ? `${quote.resolvedFocCount} FOC ${quote.resolvedFocCount === 1 ? 'place' : 'places'}${quote.resolvedFocRoomType ? ` (${quote.resolvedFocRoomType})` : ''}`
    : 'No FOC applied';
}

function getSupplementImpactLabel(quote: Quote) {
  return quote.singleSupplement && quote.singleSupplement > 0 ? formatMoney(quote.singleSupplement) : 'No supplement applied';
}

function isActivityQuoteItem(item: Pick<QuoteItem, 'service'>) {
  const normalized = (item.service.serviceType?.code || item.service.serviceType?.name || item.service.category).trim().toLowerCase();

  return (
    normalized.includes('activity') ||
    normalized.includes('tour') ||
    normalized.includes('excursion') ||
    normalized.includes('experience') ||
    normalized.includes('sightseeing') ||
    normalized.includes('entrance') ||
    normalized.includes('ticket')
  );
}

function getQuoteItemDisplayName(item: QuoteItem) {
  if (item.hotel?.name) {
    return item.hotel.name;
  }

  if (item.appliedVehicleRate?.serviceType?.name) {
    return buildTransportServiceDisplayName(item.service.name, item.appliedVehicleRate.serviceType.name, item.appliedVehicleRate.supplier?.name || null);
  }

  return item.activity?.name || item.service.name;
}

function getQuoteItemCategory(item: QuoteItem) {
  return item.appliedVehicleRate?.serviceType?.name || item.service.serviceType?.name || item.service.category || 'Service';
}

function buildTransportServiceDisplayName(serviceName: string | null | undefined, pricingMode: string, supplierName?: string | null) {
  const normalizedPricingMode = normalizeTransportPricingModeLabel(pricingMode);
  const supplierBase = cleanTransportSupplierBase(supplierName) || cleanTransportSupplierBase(serviceName) || 'Transport';
  const formattedBase = formatTransportSupplierBaseName(supplierBase);

  return normalizedPricingMode ? `${formattedBase} ${normalizedPricingMode}` : formattedBase;
}

function cleanTransportSupplierBase(value: string | null | undefined) {
  let next = (value || '').trim();

  if (!next || isUuidLike(next)) {
    return '';
  }

  const modeSuffixPattern =
    /\s*(?:[-|:])?\s*(?:point\s*[- ]?\s*to\s*[- ]?\s*point|airport\s*transfer|half\s*day|full\s*day|day\s*tour|extra\s*hour|extra\s*(?:km|kilometer|kilometre)s?|driver\s*overnight|stationary(?:\s*\/\s*waiting)?|waiting|add\s*[- ]?\s*on(?:\s*\/\s*supplement)?|supplement)\s*$/i;

  while (modeSuffixPattern.test(next)) {
    next = next.replace(modeSuffixPattern, '').trim();
  }

  return /^(daily|transport|transfer|service|full|half|day|tour|extra|stationary|waiting)$/i.test(next) ? '' : next;
}

function normalizeTransportPricingModeLabel(value: string | null | undefined) {
  const text = (value || '').trim();
  if (/\b(daily\s*full\s*day|daily\s*fd|daily_package|daily\s*package|minimum\s*3|full\s*day)\b/i.test(text)) return 'Full Day';
  if (/\bhalf\s*day\b/i.test(text)) return 'Half Day';
  if (/\bday\s*tour\b/i.test(text)) return 'Day Tour';
  if (/\bextra\s*(km|kilometer|kilometre)\b/i.test(text)) return 'Extra KM';
  if (/\bdriver\s*overnight\b/i.test(text)) return 'Driver Overnight';
  if (/\bstationary|waiting\b/i.test(text)) return 'Stationary / Waiting';
  return text;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function formatTransportSupplierBaseName(value: string) {
  return /^[A-Z0-9\s&.'-]+$/.test(value)
    ? value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    : value;
}

function buildTripHighlights(quote: Quote, itinerary: QuoteItineraryResponse) {
  const highlights = new Set<string>();

  for (const day of [...quote.itineraries].sort((left, right) => left.dayNumber - right.dayNumber).slice(0, 3)) {
    if (day.title?.trim()) {
      highlights.add(day.title.trim());
    }
  }

  for (const day of itinerary.days.filter((item) => item.isActive).sort((left, right) => left.dayNumber - right.dayNumber).slice(0, 3)) {
    if (day.title?.trim()) {
      highlights.add(day.title.trim());
    }
  }

  for (const item of quote.quoteItems) {
    if (item.activity?.name) {
      highlights.add(item.activity.name);
    } else if (item.hotel?.name) {
      highlights.add(`Stay at ${item.hotel.name}`);
    } else if (item.appliedVehicleRate?.routeName) {
      highlights.add(item.appliedVehicleRate.routeName);
    }
  }

  return [...highlights].slice(0, 5);
}

function getFeaturedQuoteServices(quote: Quote) {
  return [...quote.quoteItems]
    .sort((left, right) => right.totalSell - left.totalSell || getQuoteItemDisplayName(left).localeCompare(getQuoteItemDisplayName(right)))
    .slice(0, 5);
}

function resolveQuoteItemServiceDate(quote: Pick<Quote, 'travelStartDate' | 'itineraries'>, item: Pick<QuoteItem, 'serviceDate' | 'itineraryId'>) {
  if (item.serviceDate) {
    return item.serviceDate;
  }

  if (!quote.travelStartDate || !item.itineraryId) {
    return null;
  }

  const itinerary = quote.itineraries.find((day) => day.id === item.itineraryId);

  if (!itinerary) {
    return null;
  }

  const resolvedDate = new Date(quote.travelStartDate);
  resolvedDate.setUTCDate(resolvedDate.getUTCDate() + (itinerary.dayNumber - 1));

  return resolvedDate.toISOString();
}

function getReconfirmationWarning(reconfirmationDueAt: string | null) {
  if (!reconfirmationDueAt) {
    return false;
  }

  const dueAt = new Date(reconfirmationDueAt).getTime();

  if (Number.isNaN(dueAt)) {
    return false;
  }

  const now = Date.now();
  return dueAt > now && dueAt - now <= 48 * 60 * 60 * 1000;
}

function collectQuoteAuthoringSummary(quote: Quote) {
  const allItems = [...quote.quoteItems, ...quote.quoteOptions.flatMap((option) => option.quoteItems)];

  return allItems.reduce(
    (summary, item) => {
      const hasPricingIssue = item.totalCost <= 0 || item.totalSell <= 0 || (item.paxCount ?? 0) <= 0;
      const isActivity = isActivityQuoteItem(item);
      const hasResolvedDate = Boolean(resolveQuoteItemServiceDate(quote, item));
      const hasActivityIssue =
        isActivity &&
        (!hasResolvedDate ||
          (!item.startTime && !item.pickupTime) ||
          (!item.pickupLocation && !item.meetingPoint) ||
          !((item.participantCount ?? 0) > 0 || (item.adultCount ?? 0) + (item.childCount ?? 0) > 0) ||
          (item.reconfirmationRequired && !item.reconfirmationDueAt));

      return {
        incompleteItems: summary.incompleteItems + (hasPricingIssue || hasActivityIssue ? 1 : 0),
        pricingIssues: summary.pricingIssues + (hasPricingIssue ? 1 : 0),
        activityOperationalIssues: summary.activityOperationalIssues + (hasActivityIssue ? 1 : 0),
        reconfirmationsDueSoon:
          summary.reconfirmationsDueSoon + (item.reconfirmationRequired && getReconfirmationWarning(item.reconfirmationDueAt) ? 1 : 0),
      };
    },
    {
      incompleteItems: 0,
      pricingIssues: 0,
      activityOperationalIssues: 0,
      reconfirmationsDueSoon: 0,
    },
  );
}

function isQuoteServiceMissingSupplier(item: Quote['quoteItems'][number]) {
  return item.service.supplierId === 'import-itinerary-system';
}

function isQuoteServiceMissingPrice(item: Quote['quoteItems'][number]) {
  return item.totalCost <= 0 || item.totalSell <= 0 || !item.paxCount;
}

function countQuoteServicesWithIssues(items: Quote['quoteItems']) {
  return items.reduce((count, item) => {
    const hasActivityIssue =
      isActivityQuoteItem(item) &&
      (!item.serviceDate ||
        (!item.startTime && !item.pickupTime) ||
        (!item.pickupLocation && !item.meetingPoint) ||
        !((item.participantCount ?? 0) > 0 || (item.adultCount ?? 0) + (item.childCount ?? 0) > 0) ||
        (item.reconfirmationRequired && !item.reconfirmationDueAt));
    const hasIssue =
      isQuoteServiceMissingSupplier(item) ||
      isQuoteServiceMissingPrice(item) ||
      item.totalSell <= item.totalCost ||
      hasActivityIssue ||
      (item.reconfirmationRequired && getReconfirmationWarning(item.reconfirmationDueAt));

    return count + (hasIssue ? 1 : 0);
  }, 0);
}

type ReviewIssue = {
  id: string;
  title: string;
  description: string;
  href: string;
  source: string;
};

function resolveActiveQuoteTab(tab?: string): QuoteDetailTab {
  return QUOTE_DETAIL_TABS.some((entry) => entry.id === tab) ? (tab as QuoteDetailTab) : 'overview';
}

function resolveActiveQuoteStep(step: string | undefined, activeTab: QuoteDetailTab): QuoteWorkspaceStep {
  if (QUOTE_WORKSPACE_STEPS.some((entry) => entry.id === step)) {
    return step as QuoteWorkspaceStep;
  }

  if (activeTab === 'hotels' || activeTab === 'transport' || activeTab === 'services') {
    return 'services';
  }

  if (activeTab === 'proposal' || activeTab === 'versions' || activeTab === 'review') {
    return 'review';
  }

  if (activeTab === 'itinerary' || activeTab === 'pricing') {
    return activeTab;
  }

  return 'overview';
}

function renderInternalCostingPanel({
  title,
  totals,
  pricePerPax,
  items,
  focImpactLabel,
  supplementsImpactLabel,
}: {
  title: string;
  totals: CostSummary;
  pricePerPax: number;
  items: QuoteItem[];
  focImpactLabel?: string;
  supplementsImpactLabel?: string;
}) {
  const metrics = getInternalCostingMetrics(totals.totalCost, totals.totalSell);
  const breakdown = buildServiceCostBreakdown(items);
  const quoteMarginWarning = getQuoteMarginWarning(totals.totalSell, totals.totalCost);

  return (
    <article className="workspace-section internal-costing-panel">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Internal / Admin Profit</p>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="internal-costing-grid">
        <div className="workspace-summary-card">
          <span>Total cost</span>
          <strong>{formatMoney(totals.totalCost)}</strong>
        </div>
        <div className="workspace-summary-card">
          <span>Total sell</span>
          <strong>{formatMoney(totals.totalSell)}</strong>
        </div>
        <div className="workspace-summary-card">
          <span>Gross profit</span>
          <strong>{formatMoney(metrics.marginAmount)}</strong>
          {quoteMarginWarning ? <em className={`quote-ui-badge ${quoteMarginWarning === 'Loss' ? 'quote-ui-badge-error' : 'quote-ui-badge-warning'}`}>{quoteMarginWarning}</em> : null}
        </div>
        <div className="workspace-summary-card">
          <span>Margin %</span>
          <strong>{formatMarginPercent(metrics.marginPercent)}</strong>
        </div>
        <div className="workspace-summary-card">
          <span>Price per person</span>
          <strong>{formatMoney(pricePerPax)}</strong>
        </div>
        {focImpactLabel ? (
          <div className="workspace-summary-card">
            <span>FOC impact</span>
            <strong>{focImpactLabel}</strong>
          </div>
        ) : null}
        {supplementsImpactLabel ? (
          <div className="workspace-summary-card">
            <span>Supplements impact</span>
            <strong>{supplementsImpactLabel}</strong>
          </div>
        ) : null}
      </div>

      <div className="internal-costing-breakdown">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Service Breakdown</p>
            <h3>Cost by service</h3>
          </div>
        </div>

        {breakdown.length === 0 ? (
          <p className="empty-state">No services added yet.</p>
        ) : (
          <div className="internal-costing-table-wrap">
            <table className="internal-costing-table">
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Items</th>
                  <th>Cost</th>
                  <th>Sell</th>
                  <th>Margin</th>
                  <th>Margin %</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.map((row) => (
                  <tr key={row.key}>
                    <td>{row.label}</td>
                    <td>{row.itemCount}</td>
                    <td>{formatMoney(row.totalCost, row.currency)}</td>
                    <td>{formatMoney(row.totalSell, row.currency)}</td>
                    <td>{formatMoney(row.marginAmount, row.currency)}</td>
                    <td>{row.marginPercent.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </article>
  );
}

export default async function QuoteDetailsPage({ params, searchParams }: QuoteDetailsPageProps) {
  const { id } = await params;

  if (!id || id === '[id]') {
    redirect('/quotes');
    return null;
  }

  if (id === 'new') {
    notFound();
  }

  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const session = readSessionActor((await cookies()).get('dmc_session')?.value || '');
  const activeTab = resolveActiveQuoteTab(resolvedSearchParams?.tab);
  const activeStep = resolveActiveQuoteStep(resolvedSearchParams?.step, activeTab);
  const shouldLoadHotelPlanningData =
    activeTab === 'hotels' ||
    resolvedSearchParams?.addCategory === 'hotel' ||
    Boolean(
      resolvedSearchParams?.catalogHotelId ||
        resolvedSearchParams?.catalogContractId ||
        resolvedSearchParams?.catalogRoomCategoryId ||
        resolvedSearchParams?.catalogMealPlan ||
        resolvedSearchParams?.catalogOccupancyType ||
        resolvedSearchParams?.catalogRateCost ||
        resolvedSearchParams?.catalogRateCurrency ||
        resolvedSearchParams?.catalogRateNote,
    );
  const shouldLoadActivityCatalogData = activeTab === 'services' || resolvedSearchParams?.addCategory === 'activity';
  const shouldLoadHotelCategories = activeTab === 'pricing';
  const [
    quoteSettled,
    servicesSettled,
    activitiesSettled,
    transportServiceTypesSettled,
    routesSettled,
    vehiclesSettled,
    supplierRateCardsSettled,
    hotelsSettled,
    hotelContractsSettled,
    hotelRatesSettled,
    seasonsSettled,
    companiesSettled,
    contactsSettled,
    usersSettled,
    versionsSettled,
    hotelCategoriesSettled,
    supportTextTemplatesSettled,
    quoteBlocksSettled,
    quoteItinerarySettled,
  ] = await Promise.allSettled([
    getQuote(id),
    safeQuoteDetailFetch('services', [] as SupplierService[], getServices),
    shouldLoadActivityCatalogData
      ? safeQuoteDetailFetch('activities', [] as ActivityCatalogItem[], getActivities)
      : skippedQuoteDetailFetch('activities', [] as ActivityCatalogItem[]),
    safeQuoteDetailFetch('transport service types', [] as TransportServiceType[], getTransportServiceTypes),
    safeQuoteDetailTransportFetch('routes', [] as RouteOption[], getRoutes),
    safeQuoteDetailTransportFetch('vehicles', [] as TransportVehicle[], getVehicles),
    safeQuoteDetailTransportFetch('supplier rate cards', [] as TransportSupplierRateCard[], getSupplierRateCards),
    shouldLoadHotelPlanningData ? safeQuoteDetailFetch('hotels', [] as Hotel[], getHotels) : skippedQuoteDetailFetch('hotels', [] as Hotel[]),
    shouldLoadHotelPlanningData
      ? safeQuoteDetailFetch('hotel contracts', [] as HotelContract[], getHotelContracts)
      : skippedQuoteDetailFetch('hotel contracts', [] as HotelContract[]),
    shouldLoadHotelPlanningData ? safeQuoteDetailFetch('hotel rates', [] as HotelRate[], getHotelRates) : skippedQuoteDetailFetch('hotel rates', [] as HotelRate[]),
    safeQuoteDetailFetch('seasons', [] as Season[], getSeasons),
    safeQuoteDetailFetch('companies', [] as Company[], getCompanies),
    safeQuoteDetailFetch('contacts', [] as Contact[], getContacts),
    safeQuoteDetailFetch('users', [] as User[], getUsers),
    getVersions(id),
    shouldLoadHotelCategories
      ? safeQuoteDetailFetch('hotel categories', [] as HotelCategoryOption[], getHotelCategories)
      : skippedQuoteDetailFetch('hotel categories', [] as HotelCategoryOption[]),
    safeQuoteDetailFetch('support text templates', [] as SupportTextTemplate[], getSupportTextTemplates),
    safeQuoteDetailFetch('quote blocks', [] as QuoteBlock[], getQuoteBlocks),
    getQuoteItinerary(id),
  ]);
  const quoteResult = unwrapSettledQuoteDetail<QuoteFetchResult>(quoteSettled, { status: 'error', message: 'Quote could not be loaded' }, 'quote');
  const servicesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<SupplierService[]>>(servicesSettled, { status: 'error', label: 'services', data: [], message: 'Services unavailable' }, 'services');
  const activitiesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<ActivityCatalogItem[]>>(activitiesSettled, { status: 'error', label: 'activities', data: [], message: 'Activities unavailable' }, 'activities');
  const transportServiceTypesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<TransportServiceType[]>>(transportServiceTypesSettled, { status: 'error', label: 'transport service types', data: [], message: 'Transport service types unavailable' }, 'transport service types');
  const routesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<RouteOption[]>>(routesSettled, { status: 'error', label: 'routes', data: [], message: 'Routes unavailable' }, 'routes');
  const vehiclesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<TransportVehicle[]>>(vehiclesSettled, { status: 'error', label: 'vehicles', data: [], message: 'Vehicles unavailable' }, 'vehicles');
  const supplierRateCardsResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<TransportSupplierRateCard[]>>(supplierRateCardsSettled, { status: 'error', label: 'supplier rate cards', data: [], message: 'Supplier rate cards unavailable' }, 'supplier rate cards');
  const hotelsResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<Hotel[]>>(hotelsSettled, { status: 'error', label: 'hotels', data: [], message: 'Hotels unavailable' }, 'hotels');
  const hotelContractsResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<HotelContract[]>>(hotelContractsSettled, { status: 'error', label: 'hotel contracts', data: [], message: 'Hotel contracts unavailable' }, 'hotel contracts');
  const hotelRatesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<HotelRate[]>>(hotelRatesSettled, { status: 'error', label: 'hotel rates', data: [], message: 'Hotel rates unavailable' }, 'hotel rates');
  const seasonsResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<Season[]>>(seasonsSettled, { status: 'error', label: 'seasons', data: [], message: 'Seasons unavailable' }, 'seasons');
  const companiesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<Company[]>>(companiesSettled, { status: 'error', label: 'companies', data: [], message: 'Companies unavailable' }, 'companies');
  const contactsResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<Contact[]>>(contactsSettled, { status: 'error', label: 'contacts', data: [], message: 'Contacts unavailable' }, 'contacts');
  const usersResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<User[]>>(usersSettled, { status: 'error', label: 'users', data: [], message: 'Users unavailable' }, 'users');
  const versionsResult = unwrapSettledQuoteDetail<QuoteVersionsFetchResult>(versionsSettled, { status: 'error', versions: [], message: 'Versions unavailable' }, 'versions');
  const hotelCategoriesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<HotelCategoryOption[]>>(hotelCategoriesSettled, { status: 'error', label: 'hotel categories', data: [], message: 'Hotel categories unavailable' }, 'hotel categories');
  const supportTextTemplatesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<SupportTextTemplate[]>>(supportTextTemplatesSettled, { status: 'error', label: 'support text templates', data: [], message: 'Support text templates unavailable' }, 'support text templates');
  const quoteBlocksResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<QuoteBlock[]>>(quoteBlocksSettled, { status: 'error', label: 'quote blocks', data: [], message: 'Quote blocks unavailable' }, 'quote blocks');
  const quoteItineraryResult = unwrapSettledQuoteDetail<QuoteItineraryFetchResult>(quoteItinerarySettled, { status: 'error', itinerary: { quoteId: id, days: [] }, message: 'Itinerary unavailable' }, 'itinerary');
  const services = servicesResult.data;
  const activities = activitiesResult.data;
  const transportServiceTypes = transportServiceTypesResult.data;
  const routes = routesResult.data;
  const vehicles = vehiclesResult.data;
  const supplierRateCards = supplierRateCardsResult.data;
  const transportDataStatus = {
    routes: { status: routesResult.status, message: routesResult.message },
    vehicles: { status: vehiclesResult.status, message: vehiclesResult.message },
    supplierRateCards: { status: supplierRateCardsResult.status, message: supplierRateCardsResult.message },
  };
  const hotels = hotelsResult.data;
  const hotelContracts = hotelContractsResult.data;
  const hotelRates = hotelRatesResult.data;
  const seasons = seasonsResult.data;
  const companies = companiesResult.data;
  const contacts = contactsResult.data;
  const users = usersResult.data;
  const hotelCategories = hotelCategoriesResult.data;
  const supportTextTemplates = supportTextTemplatesResult.data;
  const quoteBlocks = quoteBlocksResult.data;

  if (quoteResult.status === 'error') {
    return (
      <main className="page">
        <section className="panel">
          <QuoteBuilderEmptyState
            eyebrow="Quote Detail"
            title="Quote could not be loaded"
            description="The quote record could not be loaded right now. Please refresh or try again shortly."
            action={
              <div className="table-action-row">
                <Link href={`/quotes/${id}`} className="primary-button">
                  Retry
                </Link>
                <Link href="/quotes" className="secondary-button">
                  Back to quotes
                </Link>
              </div>
            }
          />
        </section>
      </main>
    );
  }

  const rawQuote = quoteResult.quote;
  const versions = versionsResult.versions;

  if (!rawQuote) {
    return (
      <main className="page">
        <section className="panel">
          <QuoteBuilderEmptyState
            eyebrow="Quote Detail"
            title="Quote could not be loaded"
            description="This quote was not found or is no longer available."
            action={
              <div className="table-action-row">
                <Link href={`/quotes/${id}`} className="primary-button">
                  Retry
                </Link>
                <Link href="/quotes" className="secondary-button">
                  Back to quotes
                </Link>
              </div>
            }
          />
        </section>
      </main>
    );
  }

  const quote = normalizeQuoteDetail(rawQuote);
  const quoteCancelled = quote.status === 'CANCELLED';
  const quoteReadOnly = quoteCancelled || quote.isLatestRevision === false;
  const agents = users
    .filter((user): user is User & { role: 'agent' } => user.role === 'agent')
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    }));
  const quoteItinerary = quoteItineraryResult.itinerary;

  const totalPax = quote.adults + quote.children;
  const quoteExpired = isQuoteExpired(quote);
  const quoteProfit = calculateProfit(quote.totalSell, quote.totalCost);
  const quoteMarginPercent = calculateMarginPercent(quote.totalSell, quote.totalCost);
  const quoteMarkupPercent = quote.totalCost > 0 ? Number(((quoteProfit / quote.totalCost) * 100).toFixed(2)) : 0;
  const quoteMarginWarning = getQuoteMarginWarning(quote.totalSell, quote.totalCost);
  const authoringSummary = collectQuoteAuthoringSummary(quote);
  const expectedDayCount = getAutoItineraryDayCount(quote.nightCount);
  const sortedDays = [...quote.itineraries].filter((day) => day.dayNumber <= expectedDayCount).sort((a, b) => a.dayNumber - b.dayNumber);
  const visibleQuoteItineraryDays = quoteItinerary.days.filter((day) => day.isActive && day.dayNumber <= expectedDayCount);
  const sharedUnassignedItems = quote.quoteItems.filter((item) => !item.itineraryId);
  const tripSummary = getValidatedTripSummary({
    quoteTitle: quote.title,
    quoteDescription: quote.description,
    dayTitles: sortedDays.map((day) => day.title),
    totalPax,
    nightCount: quote.nightCount,
  });
  const destination = sortedDays[0]?.title || visibleQuoteItineraryDays[0]?.title || 'Destination pending';
  const travelDates = quote.travelStartDate
    ? `${formatDate(quote.travelStartDate)}${quote.nightCount > 0 ? ` - ${formatNightCountLabel(quote.nightCount)}` : ''}`
    : 'Dates pending';
  const baseQuoteNumberLabel = quote.quoteNumber || quote.id.slice(0, 8).toUpperCase();
  const quoteNumberLabel = quote.revisionNumber && quote.revisionNumber > 1
    ? `${baseQuoteNumberLabel} / R${quote.revisionNumber}`
    : baseQuoteNumberLabel;
  const overviewWarnings = [
    quoteItineraryResult.status === 'error' ? 'Itinerary details could not be loaded. Showing quote detail without itinerary data.' : null,
    servicesResult.status === 'error' ? 'Service catalog could not be loaded. Existing quote services are still visible.' : null,
    routesResult.status === 'error' || vehiclesResult.status === 'error' || supplierRateCardsResult.status === 'error' || transportServiceTypesResult.status === 'error'
      ? 'Transport setup data could not be loaded. Transport editing may be limited.'
      : null,
    hotelsResult.status === 'error' || hotelContractsResult.status === 'error' || hotelRatesResult.status === 'error' || hotelCategoriesResult.status === 'error'
      ? 'Hotel setup data could not be loaded. Hotel editing may be limited.'
      : null,
    companiesResult.status === 'error' || contactsResult.status === 'error' || usersResult.status === 'error'
      ? 'Some client, contact, or user lists could not be loaded. Quote editing may be limited.'
      : null,
    supportTextTemplatesResult.status === 'error' || quoteBlocksResult.status === 'error' ? 'Reusable content could not be loaded. Proposal editing may be limited.' : null,
    versionsResult.status === 'error' ? 'Saved quote versions could not be loaded.' : null,
    quoteExpired ? 'Quote validity has passed.' : null,
    authoringSummary.incompleteItems > 0 ? `${authoringSummary.incompleteItems} items still need pricing or workflow details.` : null,
    authoringSummary.pricingIssues > 0 ? `${authoringSummary.pricingIssues} items are missing sell, cost, or pax details.` : null,
    authoringSummary.activityOperationalIssues > 0
      ? `${authoringSummary.activityOperationalIssues} activity items are missing date, time, location, or counts.`
      : null,
    authoringSummary.reconfirmationsDueSoon > 0 ? `${authoringSummary.reconfirmationsDueSoon} reconfirmations are due soon.` : null,
    (quote.status === 'ACCEPTED' || quote.status === 'CONFIRMED') && !quote.acceptedVersionId
      ? 'Quote is accepted without a linked saved version. Save a version, then re-apply Accepted status to repair the booking snapshot link.'
      : null,
  ].filter(Boolean) as string[];
  const quoteUnassignedServicesCount =
    sharedUnassignedItems.length + quote.quoteOptions.reduce((total, option) => total + option.quoteItems.filter((item) => !item.itineraryId).length, 0);
  const buildTabHref = (tab: QuoteDetailTab) => `/quotes/${quote.id}?tab=${tab}`;
  const buildStepHref = (step: QuoteWorkspaceStep, params?: Record<string, string | null | undefined>) => {
    return buildQuoteWorkspaceHref(quote.id, step, params);
  };
  const readiness = buildQuoteReadinessModel(quote, buildStepHref);
  const allQuotePricingItems = [...quote.quoteItems, ...quote.quoteOptions.flatMap((option) => option.quoteItems)];
  const countIssuesForStep = (step: QuoteWorkspaceStep) =>
    readiness.blockers.filter((issue) => issue.action?.step === step).length +
    readiness.warnings.filter((issue) => issue.action?.step === step).length +
    readiness.cleanupItems.filter((issue) => issue.action?.step === step).length;
  const quoteServicesBadgeCount =
    countIssuesForStep('services');
  const quotePricingBadgeCount = countIssuesForStep('pricing');
  const quotePricingBlockerCount = readiness.blockers.filter((issue) => issue.action?.step === 'pricing').length;
  const pricedServicesCount = Math.max(allQuotePricingItems.length - readiness.unpricedServices, 0);
  const quoteReviewBadgeCount = readiness.blockers.length + readiness.warnings.length;
  const tripHighlights = buildTripHighlights(quote, quoteItinerary);
  const featuredServices = getFeaturedQuoteServices(quote);
  const quoteProgressLabel =
    readiness.blockers.length === 0
      ? 'Ready'
      : readiness.unpricedServices > 0
        ? 'Pricing needed'
        : quoteUnassignedServicesCount > 0
          ? 'Dates needed'
          : 'Review needed';
  const pricingWarningCount = quotePricingBadgeCount;
  const reviewBlockingIssues: ReviewIssue[] = readiness.blockers;
  const reviewWarnings: ReviewIssue[] = readiness.warnings;
  const reviewCleanupItems: ReviewIssue[] = readiness.cleanupItems;
  const reviewAdditionalChecks: ReviewIssue[] = [
    {
      id: 'check-status',
      title: `Quote status: ${formatQuoteStatus(quote.status)}`,
      description: quote.sentAt ? `Sent at ${formatDate(quote.sentAt) || 'Unknown'}.` : 'Quote has not been marked as sent yet.',
      href: buildTabHref('overview'),
      source: 'Overview',
    },
    {
      id: 'check-version-count',
      title: `${versions.length} saved version${versions.length === 1 ? '' : 's'}`,
      description: versions.length > 0 ? 'Saved snapshots are available for acceptance workflow.' : 'No saved snapshots exist yet.',
      href: buildTabHref('versions'),
      source: 'Versions',
    },
    {
      id: 'check-support-text',
      title: 'Client-facing support text',
      description:
        quote.inclusionsText || quote.exclusionsText || quote.termsNotesText
          ? 'Support text has content and can be refined before sending.'
          : 'Support text sections are still empty.',
      href: buildTabHref('review'),
      source: 'Review',
    },
  ];
  const reviewReadyState = readiness.statusLabel;
  const reviewWarningCount = reviewWarnings.length;
  const reviewCleanupCount = reviewCleanupItems.length;
  const convertBlocked = reviewBlockingIssues.length > 0;
  const itineraryExists = quote.itineraries.length > 0 || quoteItinerary.days.length > 0;
  const servicesReadyForNext = itineraryExists;
  const previewReadyForNext = readiness.blockers.length === 0;
  const stepAdvanceGuard = new Map<QuoteWorkspaceStep, string | null>([
    ['overview', null],
    ['itinerary', null],
    ['services', itineraryExists ? null : 'Add at least one itinerary day before moving into services.'],
    ['pricing', servicesReadyForNext ? null : 'Add at least one itinerary day before moving into pricing.'],
    ['group-pricing', null],
    ['review', null],
    ['preview', previewReadyForNext ? null : readiness.blockers[0]?.description || 'Resolve quote blockers before moving into preview.'],
  ]);
  const stepBadges = new Map<QuoteWorkspaceStep, number | null>([
    ['overview', overviewWarnings.length > 0 ? overviewWarnings.length : null],
    ['itinerary', itineraryExists ? null : 1],
    ['services', quoteServicesBadgeCount > 0 ? quoteServicesBadgeCount : null],
    ['pricing', quotePricingBadgeCount > 0 ? quotePricingBadgeCount : null],
    ['group-pricing', countIssuesForStep('group-pricing') > 0 ? countIssuesForStep('group-pricing') : null],
    [
      'review',
      reviewBlockingIssues.length > 0
        ? reviewBlockingIssues.length
        : reviewWarnings.length > 0
          ? reviewWarnings.length
          : reviewCleanupItems.length > 0
            ? reviewCleanupItems.length
            : null,
    ],
    ['preview', reviewBlockingIssues.length > 0 ? reviewBlockingIssues.length : null],
  ]);
  const activeStepIndex = QUOTE_WORKSPACE_STEPS.findIndex((entry) => entry.id === activeStep);
  const previousStep = activeStepIndex > 0 ? QUOTE_WORKSPACE_STEPS[activeStepIndex - 1] : null;
  const nextStep = activeStepIndex >= 0 && activeStepIndex < QUOTE_WORKSPACE_STEPS.length - 1 ? QUOTE_WORKSPACE_STEPS[activeStepIndex + 1] : null;
  const nextStepBlockedReason = nextStep ? stepAdvanceGuard.get(nextStep.id) || null : null;
  const guidedReviewMode = activeStep === 'review' || activeStep === 'preview';
  const showGuidedStepFooter =
    activeTab === 'overview' ||
    activeTab === 'itinerary' ||
    activeTab === 'hotels' ||
    activeTab === 'transport' ||
    activeTab === 'services' ||
    activeTab === 'pricing' ||
    guidedReviewMode;
  const nextStepHelperCopy = (() => {
    if (!nextStep) {
      return 'You are on the last guided step. Tabs below remain available for the full workspace, including Review and Versions.';
    }

    if (nextStep.id === 'services' && !itineraryExists) {
      return 'Add at least one itinerary day first.';
    }

    if (nextStep.id === 'preview') {
      if (readiness.blockers.length > 0) {
        return readiness.blockers[0]?.description || 'Resolve quote blockers before moving into preview.';
      }
    }

    if (nextStep.id === 'group-pricing') {
      return 'Next step: Group Pricing. Configure slab tiers or the package sell basis separately from service-level pricing.';
    }

    return `Next step: ${nextStep.label}. Guided steps cover the core workflow, while tabs below keep Review and Versions available anytime.`;
  })();
  const guidedStepFooter = showGuidedStepFooter ? (
    <div className="quote-step-footer">
      <div className="quote-step-footer-actions">
        {previousStep ? (
          <Link href={buildStepHref(previousStep.id)} className="secondary-button">
            Back
          </Link>
        ) : (
          <button type="button" className="secondary-button" disabled>
            Back
          </button>
        )}
        {!quoteReadOnly ? <SaveQuoteVersionButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} /> : null}
        {nextStep ? (
          nextStepBlockedReason ? (
            <button type="button" className="secondary-button" disabled title={nextStepBlockedReason}>
              Next
            </button>
          ) : (
            <Link href={buildStepHref(nextStep.id)} className="secondary-button">
              Next
            </Link>
          )
        ) : (
          <button type="button" className="secondary-button" disabled>
            Next
          </button>
        )}
      </div>
      <p className="form-helper">{nextStepHelperCopy}</p>
    </div>
  ) : null;
  const renderQuoteServicePlanner = (initialAddCategory?: ServicePlannerCategory) => (
    <QuoteServicePlanner
      apiBaseUrl={ACTION_API_BASE_URL}
      quote={quote}
      quoteItinerary={quoteItinerary}
      quoteBlocks={quoteBlocks}
      services={services}
      activities={activities}
      transportServiceTypes={transportServiceTypes}
      routes={routes}
      vehicles={vehicles}
      supplierRateCards={supplierRateCards}
      transportDataStatus={transportDataStatus}
      hotels={hotels}
      hotelContracts={hotelContracts}
      hotelRates={hotelRates}
      seasons={seasons}
      totalPax={totalPax}
      routeContext={{ quoteId: quote.id }}
      focusedDayId={resolvedSearchParams?.day}
      initialAddCategory={resolvedSearchParams?.addCategory || initialAddCategory}
      preferredCatalogServiceId={resolvedSearchParams?.catalogServiceId}
      preferredCatalogHotelId={resolvedSearchParams?.catalogHotelId}
      preferredCatalogContractId={resolvedSearchParams?.catalogContractId}
      preferredCatalogRoomCategoryId={resolvedSearchParams?.catalogRoomCategoryId}
      preferredCatalogMealPlan={resolvedSearchParams?.catalogMealPlan}
      preferredCatalogOccupancyType={resolvedSearchParams?.catalogOccupancyType}
      preferredCatalogRateCost={resolvedSearchParams?.catalogRateCost}
      preferredCatalogRateCurrency={resolvedSearchParams?.catalogRateCurrency}
      preferredCatalogRateNote={resolvedSearchParams?.catalogRateNote}
      preferredCatalogRouteId={resolvedSearchParams?.catalogRouteId}
      sessionRole={session?.role || null}
    />
  );

  return (
    <main className="page quote-builder-page">
      <section className="panel quote-workspace-page app-page-content">
        <div className="quote-builder-shell">
          <AdminBreadcrumbs
            items={[
              { label: 'Dashboard', href: '/admin/dashboard' },
              { label: 'Quotes', href: '/quotes' },
              { label: `Quote ${quoteNumberLabel}` },
            ]}
          />
          <section className="quote-dashboard-header">
            <div className="quote-dashboard-header-main">
              <AdminBackButton fallbackHref="/quotes" label="Back to Quotes" />
              <div className="quote-dashboard-title-row">
                <div>
                  <p className="eyebrow">Quote {quoteNumberLabel}</p>
                  <h1>{quote.title}</h1>
                </div>
                <QuoteBuilderStatusBadge status={quote.status} expired={quoteExpired} />
              </div>
              <div className="quote-dashboard-meta-grid">
                <div><span>Client</span><strong>{quote.company.name}</strong></div>
                <div><span>Title</span><strong>{quote.title}</strong></div>
                <div><span>Contact</span><strong>{quote.contact.firstName} {quote.contact.lastName}</strong></div>
                <div><span>Dates</span><strong>{travelDates}</strong></div>
                <div><span>Pax</span><strong>{totalPax} pax</strong></div>
                <div><span>Currency</span><strong>{quote.quoteCurrency}</strong></div>
                <div><span>Status</span><strong>{quote.status.replace(/_/g, ' ')}</strong></div>
                <div><span>Destination</span><strong>{destination}</strong></div>
                <div><span>Revision</span><strong>Rev {quote.revisionNumber ?? 1}</strong></div>
              </div>
            </div>
            <AdminHeaderActions className="quote-dashboard-actions">
              {!quoteReadOnly ? <SaveQuoteVersionButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} /> : null}
              <DownloadPdfButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} />
              {!quoteReadOnly ? (
                <RowDetailsPanel
                  summary="Accept"
                  description="Update status"
                  className="operations-row-details quote-dashboard-action-panel"
                  bodyClassName="operations-row-details-body"
                  groupId="quote-dashboard-accept"
                >
                  <QuoteStatusForm
                    apiBaseUrl={ACTION_API_BASE_URL}
                    quoteId={quote.id}
                    currentStatus={quote.status}
                    acceptedVersionId={quote.acceptedVersionId}
                    versions={versions}
                  />
                </RowDetailsPanel>
              ) : null}
              {quote.booking ? (
                <Link href={`/bookings/${quote.booking.id}`} className="secondary-button">Booking</Link>
              ) : quote.status === 'ACCEPTED' || quote.status === 'CONFIRMED' ? (
                convertBlocked || quoteReadOnly ? (
                  <button type="button" className="secondary-button" disabled>Convert</button>
                ) : (
                  <ConvertToBookingButton quoteId={quote.id} label="Convert" />
                )
              ) : (
                <button type="button" className="secondary-button" disabled>Convert</button>
              )}
              <ReviseQuoteButton quoteId={quote.id} disabled={quoteReadOnly} />
              {!quoteReadOnly ? <CancelQuoteButton quoteId={quote.id} /> : null}
            </AdminHeaderActions>
          </section>

          {quote.isLatestRevision === false ? (
            <div className="inline-alert warning" role="status">
              This is an older quote revision. Open the latest revision to edit, accept, or convert it to a booking.
            </div>
          ) : null}

          <section className="quote-dashboard-workflow" aria-label="Quote workflow">
            {QUOTE_DASHBOARD_WORKFLOW.map((label) => {
              const active =
                (label === 'Draft' && ['DRAFT', 'READY', 'REVISION_REQUESTED'].includes(quote.status)) ||
                (label === 'Pricing' && activeTab === 'pricing') ||
                (label === 'Review' && activeTab === 'review') ||
                (label === 'Sent' && quote.status === 'SENT') ||
                (label === 'Accepted' && (quote.status === 'ACCEPTED' || quote.status === 'CONFIRMED')) ||
                (label === 'Booking' && Boolean(quote.booking));

              return (
                <div key={label} className={`quote-dashboard-workflow-step${active ? ' quote-dashboard-workflow-step-active' : ''}`}>
                  <span>{label}</span>
                </div>
              );
            })}
          </section>

          <section className="workspace-section quote-step-shell quote-builder-step-shell">
            <div className="workspace-section-head">
              <div>
                <p className="eyebrow">Guided Flow</p>
                <h2>Move quote setup forward step by step</h2>
              </div>
              <span className={`quote-ui-badge ${reviewBlockingIssues.length > 0 ? 'quote-ui-badge-warning' : 'quote-ui-badge-success'}`}>
                {reviewBlockingIssues.length > 0 ? 'Blocked steps' : 'Flow ready'}
              </span>
            </div>

            <nav className="quote-step-nav" aria-label="Quote workspace steps">
              {QUOTE_WORKSPACE_STEPS.map((step, index) => {
                const isActive = step.id === activeStep;
                const badge = stepBadges.get(step.id);
                const isCompleted = activeStepIndex > index && !stepAdvanceGuard.get(step.id);

                return (
                  <Link
                    key={step.id}
                    href={buildStepHref(step.id)}
                    className={`quote-step-link${isActive ? ' quote-step-link-active' : ''}${isCompleted ? ' quote-step-link-complete' : ''}`}
                  >
                    <span className="quote-step-index">{index + 1}</span>
                    <span>{step.label}</span>
                    {badge && badge > 0 ? <span className="page-tab-badge page-tab-badge-warning">{badge}</span> : null}
                  </Link>
                );
              })}
            </nav>

            <p className="form-helper">{nextStepHelperCopy}</p>
          </section>

          <nav className="quote-dashboard-tabs" aria-label="Quote detail sections">
            {QUOTE_DASHBOARD_TABS.map((tab, index) => {
              const isActive = activeTab === tab.id;
              const badge =
                tab.id === 'itinerary' || tab.id === 'hotels' || tab.id === 'transport' || tab.id === 'services'
                  ? quoteServicesBadgeCount
                  : tab.id === 'pricing'
                    ? quotePricingBadgeCount
                    : tab.id === 'proposal'
                      ? quoteReviewBadgeCount
                      : null;

              return (
                <Link key={tab.id} href={buildTabHref(tab.id)} className={`quote-dashboard-tab${isActive ? ' quote-dashboard-tab-active' : ''}`}>
                  <span className="quote-dashboard-tab-index">{index + 1}</span>
                  <span className="quote-dashboard-tab-copy">
                    <strong>{tab.label}</strong>
                    <small>{tab.helper}</small>
                  </span>
                  {badge && badge > 0 ? <span className="page-tab-badge page-tab-badge-warning">{badge}</span> : null}
                </Link>
              );
            })}
          </nav>

          {/* TODO(ui): Split the remaining quote tab bodies into shared presentational sections after the server data assembly is isolated. */}
          <div className="quote-builder-layout app-detail-layout">
            <div className="section-stack quote-builder-main quote-builder-main-content">

          {activeTab === 'overview' ? (
            <div className="section-stack">
            <section className="quote-client-overview-grid">
              <article className="workspace-section tab-panel-card quote-trip-highlights-card">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Trip Highlights</p>
                    <h2>Key experiences</h2>
                  </div>
                </div>
                {tripHighlights.length === 0 ? (
                  <p className="detail-copy">Add itinerary days and services to surface client-facing trip highlights.</p>
                ) : (
                  <ul className="quote-trip-highlights-list">
                    {tripHighlights.map((highlight) => (
                      <li key={highlight}>{highlight}</li>
                    ))}
                  </ul>
                )}
              </article>

              <article className="workspace-section tab-panel-card quote-featured-services-card">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Services</p>
                    <h2>Featured services</h2>
                  </div>
                  <Link href={buildStepHref('services')} className="secondary-button">
                    Manage all
                  </Link>
                </div>
                {featuredServices.length === 0 ? (
                  <p className="detail-copy">No services have been added yet.</p>
                ) : (
                  <div className="quote-featured-service-list">
                    {featuredServices.map((item) => (
                      <div key={item.id} className="quote-featured-service-row">
                        <div>
                          <strong>{getQuoteItemDisplayName(item)}</strong>
                          <span>{getQuoteItemCategory(item)}</span>
                        </div>
                        <span>{item.serviceDate ? formatDate(item.serviceDate) : 'Date pending'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>

            <section className="split-layout">
              <article className="workspace-section tab-panel-card">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Overview</p>
                    <h2>Quote setup</h2>
                  </div>
                </div>
                <InlineEntityActions
                  apiBaseUrl={ACTION_API_BASE_URL}
                  deletePath={`/quotes/${quote.id}`}
                  deleteLabel="quote"
                  confirmMessage={`Delete ${quote.title}?`}
                  deleteSuccessHref="/quotes"
                >
                  <QuotesForm
                    apiBaseUrl={ACTION_API_BASE_URL}
                    companies={companies}
                    contacts={contacts}
                    agents={agents}
                    quoteId={quote.id}
                    submitLabel="Save quote"
                    initialValues={{
                      clientCompanyId: quote.company.id,
                      brandCompanyId: quote.brandCompany?.id || quote.company.id,
                      contactId: quote.contact.id,
                      agentId: quote.agent?.id || '',
                      quoteType: quote.quoteType,
                      jordanPassType: quote.jordanPassType,
                      bookingType: quote.bookingType,
                      title: quote.title,
                      description: quote.description || '',
                      quoteCurrency: quote.quoteCurrency,
                      pricingMode: quote.pricingMode,
                      pricingSlabs: (quote.pricingSlabs || []).map((slab) => ({
                        id: slab.id,
                        minPax: String(slab.minPax),
                        maxPax: String(slab.maxPax),
                        price: String(slab.price),
                      })),
                      fixedPricePerPerson: String(quote.fixedPricePerPerson ?? 0),
                      focType: quote.focType,
                      focRatio: quote.focRatio === null ? '' : String(quote.focRatio),
                      focCount: quote.focCount === null ? '' : String(quote.focCount),
                      focRoomType: quote.focRoomType || '',
                      adults: String(quote.adults),
                      children: String(quote.children),
                      roomCount: String(quote.roomCount),
                      nightCount: String(quote.nightCount),
                      singleSupplement: quote.singleSupplement === null ? '' : String(quote.singleSupplement),
                      travelStartDate: quote.travelStartDate ? quote.travelStartDate.slice(0, 10) : '',
                      validUntil: quote.validUntil ? quote.validUntil.slice(0, 10) : '',
                    }}
                  />
                </InlineEntityActions>
              </article>

              <div className="section-stack">
                <article className="detail-card quote-admin-profit-card">
                  <p className="eyebrow">Internal / Admin Profit</p>
                  <div className="quote-preview-total-list quote-admin-profit-grid">
                    <div>
                      <span>Total sell</span>
                      <strong>{formatMoney(quote.totalSell, quote.quoteCurrency)}</strong>
                    </div>
                    <div>
                      <span>Total cost</span>
                      <strong>{formatMoney(quote.totalCost, quote.quoteCurrency)}</strong>
                    </div>
                    <div>
                      <span>Gross profit</span>
                      <strong>{formatMoney(quoteProfit, quote.quoteCurrency)}</strong>
                      {quoteMarginWarning ? <em className={`quote-ui-badge ${quoteMarginWarning === 'Loss' ? 'quote-ui-badge-error' : 'quote-ui-badge-warning'}`}>{quoteMarginWarning}</em> : null}
                    </div>
                    <div>
                      <span>Margin %</span>
                      <strong>{formatMarginPercent(quoteMarginPercent)}</strong>
                    </div>
                    <div>
                      <span>Quote currency</span>
                      <strong>{quote.quoteCurrency}</strong>
                    </div>
                    <div>
                      <span>Price per pax</span>
                      <strong>{formatMoney(quote.pricePerPax, quote.quoteCurrency)}</strong>
                    </div>
                  </div>
                </article>
                <article className="detail-card">
                  <p className="eyebrow">Attention</p>
                  {overviewWarnings.length === 0 ? (
                    <p className="detail-copy">No immediate pricing, validity, or workflow warnings.</p>
                  ) : (
                    overviewWarnings.map((message) => (
                      <p key={message} className="form-error">
                        {message}
                      </p>
                    ))
                  )}
                </article>
                <article className="detail-card">
                  <p className="eyebrow">Trip Summary</p>
                  <div className="quote-preview-total-list">
                    <div>
                      <span>FOC impact</span>
                      <strong>{getFocImpactLabel(quote)}</strong>
                    </div>
                    <div>
                      <span>Single supplement</span>
                      <strong>{getSupplementImpactLabel(quote)}</strong>
                    </div>
                    <div>
                      <span>Current booking link</span>
                      <strong>{quote.booking ? `Booking ${quote.booking.id}` : 'Not converted yet'}</strong>
                    </div>
                    <div>
                      <span>Saved versions</span>
                      <strong>{versions.length}</strong>
                    </div>
                  </div>
                </article>
                <article className="detail-card">
                  <p className="eyebrow">Segments</p>
                  <h3>Multi-country planning</h3>
                  <p className="detail-copy">
                    This workspace is ready to host ordered country segments later. For now, keep the current Jordan operating plan here and track external package notes in the proposal/review text.
                  </p>
                </article>
              </div>
            </section>
            {guidedStepFooter}
            </div>
          ) : null}

          {activeTab === 'itinerary' ? (
            <div className="section-stack">
              {renderQuoteServicePlanner()}
              {guidedStepFooter}
            </div>
          ) : null}

          {activeTab === 'hotels' ? (
            <div className="section-stack quote-services-page-panel">
              <section className="workspace-section quote-services-hero app-card">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Hotels</p>
                    <h2>Plan stays by day and option</h2>
                    <p className="detail-copy">Accommodation Options are proposal choices. Confirmed Hotel Stays are day-by-day operational services.</p>
                  </div>
                  <Link href={buildTabHref('pricing')} className="primary-button">
                    Review pricing
                  </Link>
                </div>
              </section>
              <QuoteHotelOptionSets
                apiBaseUrl={ACTION_API_BASE_URL}
                quoteId={quote.id}
                quoteOptions={quote.quoteOptions}
                hotels={hotels}
              />
              {renderQuoteServicePlanner('hotel')}
              {guidedStepFooter}
            </div>
          ) : null}

          {activeTab === 'transport' ? (
            <div className="section-stack quote-services-page-panel">
              <section className="workspace-section quote-services-hero app-card">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Transport</p>
                    <h2>Assign route-based transport</h2>
                    <p className="detail-copy">Use the existing transport picker flow: Route, Vehicle Type, Pricing Mode, Supplier, Price.</p>
                  </div>
                  <Link href={buildTabHref('pricing')} className="primary-button">
                    Review pricing
                  </Link>
                </div>
              </section>
              <QuoteTransportBulkAssign
                apiBaseUrl={ACTION_API_BASE_URL}
                quoteId={quote.id}
                services={services}
                quoteItems={quote.quoteItems}
                quoteOptions={quote.quoteOptions}
              />
              {renderQuoteServicePlanner('transport')}
              {guidedStepFooter}
            </div>
          ) : null}

          {activeTab === 'services' ? (
            <div className="section-stack quote-services-page-panel">
              <section className="workspace-section quote-services-hero app-card">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Services / Meals</p>
                    <h2>Build non-hotel services</h2>
                    <p className="detail-copy">Add meals, activities, guide, entrance-style, other, and package rows while keeping pricing, margin, and day coverage visible.</p>
                  </div>
                  <Link href={buildStepHref('pricing')} className="primary-button">
                    Review pricing
                  </Link>
                </div>
              </section>
              <SummaryStrip
                items={[
                  { id: 'planner-completion', label: 'Completion', value: `${readiness.completionPercent}%`, helper: 'Quote details completed' },
                  { id: 'planner-unresolved', label: 'Needs details', value: String(readiness.unresolvedItems), helper: 'Services still need client-ready details' },
                  { id: 'planner-unpriced', label: 'Needs pricing', value: String(readiness.unpricedServices), helper: 'Services still missing pricing' },
                  { id: 'planner-unassigned', label: 'Needs dates', value: String(quoteUnassignedServicesCount), helper: 'Services still need itinerary placement' },
                ]}
              />
              {renderQuoteServicePlanner('meal')}
            {guidedStepFooter}
            </div>
          ) : null}

          {activeTab === 'pricing' ? (
            <div className="section-stack quote-pricing-workspace">
              <section className="workspace-section quote-pricing-hero app-card">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Pricing Workspace</p>
                    <h2>{activeStep === 'group-pricing' ? 'Configure group pricing' : 'Review service pricing'}</h2>
                    <p className="detail-copy">
                      {activeStep === 'group-pricing'
                        ? 'Keep package and slab pricing separate from service costs so the commercial basis is clear.'
                        : 'Compare service cost, sell, and margin in one place before moving to client review.'}
                    </p>
                  </div>
                  <div className="quote-pricing-hero-actions">
                    <Link href={buildStepHref('services')} className="secondary-button">
                      Services
                    </Link>
                    <Link href={buildStepHref('group-pricing')} className="secondary-button">
                      Group pricing
                    </Link>
                    <Link href={buildStepHref('preview')} className="primary-button">
                      Preview
                    </Link>
                  </div>
                </div>
              </section>
              {activeStep === 'group-pricing' ? (
                <>
                  <SummaryStrip
                    items={[
                      { id: 'group-mode', label: 'Mode', value: quote.pricingMode === 'SLAB' ? 'Group slabs' : 'Package price', helper: 'Separate from service-level pricing' },
                      { id: 'group-slabs', label: 'Slabs', value: String(quote.pricingSlabs.length), helper: quote.pricingMode === 'SLAB' ? 'Configured group tiers' : 'Not used in package mode' },
                      { id: 'group-basis', label: 'Basis', value: quote.pricingMode === 'SLAB' ? 'Per paying guest' : 'Per person', helper: quote.pricingMode === 'SLAB' ? 'FOC reduces paying guests' : 'Package sell basis' },
                      { id: 'group-fixed', label: 'Package sell', value: quote.fixedPricePerPerson > 0 ? formatMoney(quote.fixedPricePerPerson, quote.quoteCurrency) : 'Pending', helper: quote.pricingMode === 'FIXED' ? 'Current fixed price basis' : 'Used only in package mode' },
                    ]}
                  />

                  <QuoteGroupPricing
                    apiBaseUrl={ACTION_API_BASE_URL}
                    quoteId={quote.id}
                    initialMode={quote.pricingMode}
                    initialSlabs={quote.pricingSlabs}
                    initialFixedPricePerPerson={quote.fixedPricePerPerson}
                    initialGroupSize={totalPax}
                  />
                </>
              ) : (
                <div className="quote-pricing-review-layout">
                  <div className="quote-pricing-review-main">
                    <SummaryStrip
                      items={[
                        { id: 'pricing-priced', label: 'Priced', value: String(pricedServicesCount), helper: 'Service rows with cost, sell, and pax' },
                        { id: 'pricing-unpriced', label: 'Unpriced', value: String(readiness.unpricedServices), helper: readiness.unpricedServices > 0 ? 'Complete missing commercial inputs' : 'No unpriced service rows' },
                        { id: 'pricing-blockers', label: 'Blockers', value: String(quotePricingBlockerCount), helper: quotePricingBlockerCount > 0 ? 'Resolve service pricing blockers first' : 'No pricing blockers in scope' },
                      ]}
                    />

                    <QuoteSummaryPanel
                      items={allQuotePricingItems}
                      totalCost={quote.totalCost}
                      totalSell={quote.totalSell}
                      pax={totalPax}
                      currency={quote.quoteCurrency}
                    />

                    <QuotePricingTable
                      apiBaseUrl={ACTION_API_BASE_URL}
                      quoteId={quote.id}
                      hotelCategories={hotelCategories}
                      totalPax={totalPax}
                      initialFocus={resolvedSearchParams?.pricingFocus}
                      groupPricingHref={buildStepHref('group-pricing')}
                      servicesHref={buildStepHref('services')}
                      previewHref={buildStepHref('preview')}
                      quote={{
                        pricingMode: quote.pricingMode,
                        pricingType: quote.pricingType,
                        fixedPricePerPerson: quote.fixedPricePerPerson,
                        totalCost: quote.totalCost,
                        totalSell: quote.totalSell,
                        pricePerPax: quote.pricePerPax,
                        quoteItems: quote.quoteItems,
                        quoteOptions: quote.quoteOptions,
                        pricingSlabs: quote.pricingSlabs,
                        scenarios: quote.scenarios,
                      }}
                      focImpactLabel={getFocImpactLabel(quote)}
                      supplementsImpactLabel={getSupplementImpactLabel(quote)}
                    />
                  </div>

                  <aside className="quote-pricing-review-sidebar">
                    <QuotePricingSummaryCard
                      className="quote-pricing-context-panel app-financial-panel"
                      eyebrow="Pricing Check"
                      title="Commercial totals"
                      items={[
                        { label: 'Total sell', value: formatMoney(quote.totalSell, quote.quoteCurrency), helper: 'Client-facing total' },
                        { label: 'Service subtotal', value: formatMoney(quote.totalCost, quote.quoteCurrency), helper: 'Supplier and service cost' },
                        { label: 'Gross profit', value: formatMoney(quoteProfit, quote.quoteCurrency), helper: quoteMarginWarning ? <span className={`quote-ui-badge ${quoteMarginWarning === 'Loss' ? 'quote-ui-badge-error' : 'quote-ui-badge-warning'}`}>{quoteMarginWarning}</span> : 'Sell less subtotal' },
                        { label: 'Margin', value: formatMarginPercent(quoteMarginPercent), helper: 'Profit / sell' },
                        { label: 'Markup', value: formatMarginPercent(quoteMarkupPercent), helper: 'Profit / cost' },
                        { label: 'Price per pax', value: formatMoney(quote.pricePerPax, quote.quoteCurrency), helper: `${totalPax} traveler${totalPax === 1 ? '' : 's'}` },
                        { label: 'Pricing status', value: quoteProgressLabel, helper: readiness.unpricedServices > 0 ? `${readiness.unpricedServices} unpriced` : 'Pricing rows ready' },
                      ]}
                    />
                  </aside>
                </div>
              )}
              {guidedStepFooter}
            </div>
          ) : null}

          {activeTab === 'proposal' ? (
            <div className="section-stack">
              <SummaryStrip
                items={[
                  { id: 'proposal-blockers', label: 'Blocking issues', value: String(reviewBlockingIssues.length), helper: 'Must be resolved before sharing' },
                  { id: 'proposal-warnings', label: 'Warnings', value: String(reviewWarningCount), helper: 'Review before sending' },
                  { id: 'proposal-versions', label: 'Snapshots', value: String(versions.length), helper: 'Saved proposal versions' },
                  { id: 'proposal-ready', label: 'Status', value: reviewReadyState, helper: convertBlocked ? 'Conversion disabled' : 'Ready for decision flow' },
                ]}
              />

              <section className="split-layout">
                <article className="workspace-section">
                  <div className="workspace-section-head">
                    <div>
                      <p className="eyebrow">Proposal</p>
                      <h2>Prepare the client-facing quote</h2>
                    </div>
                    <span className={`quote-ui-badge ${reviewBlockingIssues.length > 0 ? 'quote-ui-badge-warning' : 'quote-ui-badge-success'}`}>
                      {reviewBlockingIssues.length > 0 ? 'Needs review' : 'Ready'}
                    </span>
                  </div>
                  <p className="detail-copy">
                    Save a snapshot, preview the proposal, download a PDF, or share the public link without changing the quote pricing logic.
                  </p>
                  <div className="workspace-document-actions">
                    <QuotePreviewLink quoteId={quote.id} />
                    <DownloadPdfButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} />
                    {!quoteReadOnly ? <SaveQuoteVersionButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} /> : null}
                    <ShareQuoteButton
                      apiBaseUrl={ACTION_API_BASE_URL}
                      quoteId={quote.id}
                      initialPublicToken={quote.publicToken}
                      initialPublicEnabled={quote.publicEnabled}
                    />
                    <Link href={buildTabHref('versions')} className="secondary-button">
                      Versions
                    </Link>
                    <Link href={buildTabHref('review')} className="secondary-button">
                      Internal notes
                    </Link>
                  </div>
                </article>

                <article className="detail-card">
                  <p className="eyebrow">Readiness</p>
                  <div className="quote-preview-total-list">
                    <div>
                      <span>Days</span>
                      <strong>{quote.itineraries.length}</strong>
                    </div>
                    <div>
                      <span>Services</span>
                      <strong>{quote.quoteItems.length}</strong>
                    </div>
                    <div>
                      <span>Pricing warnings</span>
                      <strong>{pricingWarningCount}</strong>
                    </div>
                    <div>
                      <span>Blocking issues</span>
                      <strong>{reviewBlockingIssues.length}</strong>
                    </div>
                  </div>
                </article>
              </section>
              {guidedStepFooter}
            </div>
          ) : null}

          {activeStep === 'preview' && guidedReviewMode ? (
            <section className="split-layout">
              <article className="workspace-section">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Preview</p>
                    <h2>Check the client-facing version before sharing</h2>
                  </div>
                </div>

                <div className="workspace-document-actions">
                  <QuotePreviewLink quoteId={quote.id} />
                  <DownloadPdfButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} />
                  {!quoteReadOnly ? <SaveQuoteVersionButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} /> : null}
                </div>

                {reviewBlockingIssues.length > 0 ? (
                  <div className="section-stack">
                    {reviewBlockingIssues.map((issue) => (
                      <p key={issue.id} className="form-error">
                        {issue.title}. <Link href={issue.href}>Open {issue.source.toLowerCase()}</Link>
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="detail-copy">Client preview, PDF export, and snapshot save are ready from this step.</p>
                )}
              </article>

              <article className="detail-card">
                <p className="eyebrow">Readiness</p>
                <div className="quote-preview-total-list">
                  <div>
                    <span>Days</span>
                    <strong>{quote.itineraries.length}</strong>
                  </div>
                  <div>
                    <span>Services</span>
                    <strong>{quote.quoteItems.length}</strong>
                  </div>
                  <div>
                    <span>Pricing warnings</span>
                    <strong>{pricingWarningCount}</strong>
                  </div>
                  <div>
                    <span>Review warnings</span>
                    <strong>{reviewWarningCount}</strong>
                  </div>
                  <div>
                    <span>Blocking issues</span>
                    <strong>{reviewBlockingIssues.length}</strong>
                  </div>
                </div>
              </article>
            </section>
          ) : null}

          {activeTab === 'versions' ? (
            <section className="split-layout">
              <article className="workspace-section">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Versions</p>
                    <h2>Saved snapshots</h2>
                  </div>
                </div>
                {versionsResult.status === 'error' ? (
                  <p className="detail-copy">Quote versions are unavailable.</p>
                ) : null}
                {versions.length === 0 ? (
                  <p className="empty-state">No saved versions yet.</p>
                ) : (
                  <div className="quote-version-list">
                    {versions.map((version) => (
                      <Link key={version.id} href={`/quotes/${quote.id}/versions/${version.id}`} className="quote-version-row">
                        <div>
                          <strong>Version {version.versionNumber}</strong>
                          <p>{version.label || 'Snapshot saved from live quote state.'}</p>
                          {quote.acceptedVersionId === version.id ? <p className="quote-version-badge">Accepted version</p> : null}
                        </div>
                        <span>{formatDateTime(version.createdAt)}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </article>
              <article className="detail-card">
                <p className="eyebrow">Accepted State</p>
                <div className="section-stack">
                  <div className="quote-preview-total-list">
                    <div>
                      <span>Accepted at</span>
                      <strong>{formatDate(quote.acceptedAt) || 'Not accepted yet'}</strong>
                    </div>
                    <div>
                      <span>Accepted version</span>
                      <strong>{quote.acceptedVersionId ? 'Linked to saved snapshot' : 'No accepted version yet'}</strong>
                    </div>
                  </div>
                  {!quoteReadOnly ? <SaveQuoteVersionButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} /> : null}
                  <p className="detail-copy">
                    Accepted version: {quote.acceptedVersionId ? 'Saved snapshot linked to current accepted state.' : 'No accepted version yet. Save a version, then set the quote back to Accepted to restore the booking link.'}
                  </p>
                </div>
              </article>
            </section>
          ) : null}

          {activeTab === 'review' ? (
            <div className="section-stack">
              <SummaryStrip
                items={[
                  { id: 'review-blockers', label: 'Blocking issues', value: String(reviewBlockingIssues.length), helper: 'Must be resolved before share' },
                  { id: 'review-warnings', label: 'Warnings', value: String(reviewWarningCount), helper: 'Needs attention but not blocking' },
                  { id: 'review-cleanup', label: 'Cleanup', value: String(reviewCleanupCount), helper: 'Visible cleanup that does not block share' },
                  { id: 'review-ready', label: 'Ready state', value: reviewReadyState, helper: convertBlocked ? 'Conversion disabled' : 'Conversion allowed' },
                ]}
              />

              <article className="workspace-section">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Validation</p>
                    <h2>Pre-share validation gate</h2>
                  </div>
                  <span className={`quote-ui-badge ${reviewBlockingIssues.length > 0 ? 'quote-ui-badge-warning' : 'quote-ui-badge-success'}`}>
                    {reviewBlockingIssues.length > 0 ? 'Share blocked' : 'Ready to share'}
                  </span>
                </div>
                <p className="detail-copy">
                  Blockers prevent the flow from advancing to Share. Warnings and cleanup items stay visible here but do not stop the workflow.
                </p>
              </article>

              <CompactFilterBar
                eyebrow="Decision"
                title="Review actions"
                description="Resolve blockers first, then use the compact actions below for save, send, and conversion."
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-start' }}>
                  <RowDetailsPanel
                    summary="Save changes"
                    description="Support text and review status"
                    className="operations-row-details"
                    bodyClassName="operations-row-details-body"
                    groupId="quote-review-actions"
                  >
                    <div className="section-stack">
                      <SupportTextForm
                        apiBaseUrl={ACTION_API_BASE_URL}
                        quoteId={quote.id}
                        templates={supportTextTemplates}
                        initialValues={{
                          inclusionsText: quote.inclusionsText || '',
                          exclusionsText: quote.exclusionsText || '',
                          termsNotesText: quote.termsNotesText || '',
                        }}
                      />
                      {quoteReadOnly ? (
                        <p className="detail-copy">
                          {quoteCancelled
                            ? 'This quote is cancelled. Status changes and booking conversion are disabled.'
                            : 'This is an older quote revision. Open the latest revision to make changes.'}
                        </p>
                      ) : (
                        <QuoteStatusForm
                          apiBaseUrl={ACTION_API_BASE_URL}
                          quoteId={quote.id}
                          currentStatus={quote.status}
                          acceptedVersionId={quote.acceptedVersionId}
                          versions={versions}
                        />
                      )}
                    </div>
                  </RowDetailsPanel>
                  {!quoteReadOnly ? <SendQuoteButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} currentStatus={quote.status} /> : null}
                  {quote.booking ? (
                    <Link href={`/bookings/${quote.booking.id}`} className="secondary-button">
                      View booking
                    </Link>
                  ) : quoteReadOnly ? (
                    <div className="section-stack">
                      <button type="button" className="secondary-button" disabled>
                        Convert to booking
                      </button>
                      <p className="detail-copy">
                        {quoteCancelled ? 'Cancelled quotes cannot be converted to bookings.' : 'Only the latest quote revision can be converted to booking.'}
                      </p>
                    </div>
                  ) : quote.status === 'ACCEPTED' || quote.status === 'CONFIRMED' ? (
                    convertBlocked ? (
                      <div className="section-stack">
                        <button type="button" className="secondary-button" disabled>
                          Convert to booking
                        </button>
                        <p className="form-error">Resolve blocking issues before conversion.</p>
                      </div>
                    ) : (
                      <ConvertToBookingButton quoteId={quote.id} />
                    )
                  ) : (
                    <div className="section-stack">
                      <button type="button" className="secondary-button" disabled>
                        Convert to booking
                      </button>
                      <p className="detail-copy">Mark the quote as accepted before conversion.</p>
                    </div>
                  )}
                  {quote.invoice ? (
                    <Link href={`/invoices/${quote.invoice.id}`} className="secondary-button">
                      Open invoice
                    </Link>
                  ) : null}
                  <QuotePreviewLink quoteId={quote.id} />
                  <ShareQuoteButton
                    apiBaseUrl={ACTION_API_BASE_URL}
                    quoteId={quote.id}
                    initialPublicToken={quote.publicToken}
                    initialPublicEnabled={quote.publicEnabled}
                  />
                  <ReviseQuoteButton quoteId={quote.id} disabled={quoteReadOnly} />
                  {!quoteReadOnly ? <CancelQuoteButton quoteId={quote.id} /> : null}
                  <DownloadPdfButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} />
                </div>
              </CompactFilterBar>

              <QuoteInvoiceSection apiBaseUrl={ACTION_API_BASE_URL} invoice={quote.invoice} />

              <TableSectionShell
                title="Blocking issues"
                description="Critical issues remain visible until they are cleared."
                context={<p>{reviewBlockingIssues.length} blocking issues in scope</p>}
              >
                <div className="table-wrap">
                  <table className="data-table quote-consistency-table">
                    <thead>
                      <tr>
                        <th>Issue</th>
                        <th>Source</th>
                        <th>Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reviewBlockingIssues.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="empty-state">
                            No blocking issues detected.
                          </td>
                        </tr>
                      ) : (
                        reviewBlockingIssues.map((issue) => (
                          <tr key={issue.id}>
                            <td>
                              <span className="quote-ui-badge quote-ui-badge-error">Blocking issue</span>
                              <div className="table-subcopy" style={{ marginTop: '0.35rem' }}>
                                <strong>{issue.title}</strong>
                              </div>
                              <div className="table-subcopy">{issue.description}</div>
                            </td>
                            <td>
                              <span className="quote-ui-badge quote-ui-badge-info">{issue.source}</span>
                            </td>
                            <td>
                              <Link href={issue.href} className="compact-button">
                                Open source
                              </Link>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </TableSectionShell>

              <AdvancedFiltersPanel
                title="Warnings"
                description="Grouped warnings that deserve review but do not block the workflow"
                defaultOpen={reviewWarnings.length > 0}
              >
                <TableSectionShell
                  title="Warning groups"
                  description="Keep lower-priority issues collapsed unless they need attention."
                  context={<p>{reviewWarnings.length} warnings in scope</p>}
                >
                  <div className="table-wrap">
                    <table className="data-table quote-consistency-table">
                      <thead>
                        <tr>
                          <th>Warning</th>
                          <th>Source</th>
                          <th>Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviewWarnings.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="empty-state">
                              No warnings detected.
                            </td>
                          </tr>
                        ) : (
                          reviewWarnings.map((warning) => (
                            <tr key={warning.id}>
                              <td>
                                <span className="quote-ui-badge quote-ui-badge-warning">Warning</span>
                                <div className="table-subcopy" style={{ marginTop: '0.35rem' }}>
                                  <strong>{warning.title}</strong>
                                </div>
                                <div className="table-subcopy">{warning.description}</div>
                              </td>
                              <td>
                                <span className="quote-ui-badge quote-ui-badge-info">{warning.source}</span>
                              </td>
                              <td>
                                <Link href={warning.href} className="compact-button">
                                  Open source
                                </Link>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </TableSectionShell>
              </AdvancedFiltersPanel>

              <AdvancedFiltersPanel
                title="Cleanup"
                description="Operational cleanup that should be handled, but is intentionally lighter than warnings and blockers"
                defaultOpen={reviewCleanupItems.length > 0}
              >
                <TableSectionShell
                  title="Cleanup queue"
                  description="Imported placeholders and unassigned rows stay visible here until they are tidied."
                  context={<p>{reviewCleanupItems.length} cleanup items in scope</p>}
                >
                  <div className="table-wrap">
                    <table className="data-table quote-consistency-table">
                      <thead>
                        <tr>
                          <th>Cleanup item</th>
                          <th>Source</th>
                          <th>Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviewCleanupItems.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="empty-state">
                              No cleanup items detected.
                            </td>
                          </tr>
                        ) : (
                          reviewCleanupItems.map((item) => (
                            <tr key={item.id}>
                              <td>
                                <span className="quote-ui-badge quote-ui-badge-info">Cleanup</span>
                                <div className="table-subcopy" style={{ marginTop: '0.35rem' }}>
                                  <strong>{item.title}</strong>
                                </div>
                                <div className="table-subcopy">{item.description}</div>
                              </td>
                              <td>
                                <span className="quote-ui-badge quote-ui-badge-info">{item.source}</span>
                              </td>
                              <td>
                                <Link href={item.href} className="compact-button">
                                  Open source
                                </Link>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </TableSectionShell>
              </AdvancedFiltersPanel>

              <AdvancedFiltersPanel title="Additional checks" description="Informational checks and review context" defaultOpen={false}>
                <TableSectionShell
                  title="Additional checks"
                  description="Hidden by default to keep the main review screen focused on decisions."
                  context={<p>{reviewAdditionalChecks.length} informational checks</p>}
                >
                  <div className="table-wrap">
                    <table className="data-table quote-consistency-table">
                      <thead>
                        <tr>
                          <th>Check</th>
                          <th>Source</th>
                          <th>Open</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reviewAdditionalChecks.map((check) => (
                          <tr key={check.id}>
                            <td>
                              <span className="quote-ui-badge quote-ui-badge-info">Info</span>
                              <div className="table-subcopy" style={{ marginTop: '0.35rem' }}>
                                <strong>{check.title}</strong>
                              </div>
                              <div className="table-subcopy">{check.description}</div>
                            </td>
                            <td>
                              <span className="quote-ui-badge quote-ui-badge-info">{check.source}</span>
                            </td>
                            <td>
                              <Link href={check.href} className="compact-button">
                                Open source
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TableSectionShell>
              </AdvancedFiltersPanel>
              {guidedReviewMode ? guidedStepFooter : null}
            </div>
          ) : null}
            </div>

            <aside className="quote-builder-sidebar app-sticky-panel">
              <QuotePricingSummaryCard
                className="quote-pricing-summary-card-dominant app-financial-panel"
                eyebrow="Internal"
                title="Financial summary"
                items={[
                  { label: 'Total Sell', value: formatMoney(quote.totalSell, quote.quoteCurrency), helper: 'Client price' },
                  { label: 'Total Cost', value: formatMoney(quote.totalCost, quote.quoteCurrency), helper: 'Supplier cost' },
                  { label: 'Profit', value: formatMoney(quoteProfit, quote.quoteCurrency), helper: quoteMarginWarning ? <span className={`quote-ui-badge ${quoteMarginWarning === 'Loss' ? 'quote-ui-badge-error' : 'quote-ui-badge-warning'}`}>{quoteMarginWarning}</span> : 'Sell less cost' },
                  { label: 'Margin %', value: formatMarginPercent(quoteMarginPercent), helper: 'Profit / sell' },
                ]}
              />

              <QuotePricingSummaryCard
                eyebrow="Status"
                title="Quote status"
                items={[
                  { label: 'Status', value: formatQuoteStatus(quote.status), helper: quoteExpired ? 'Validity has passed' : 'Current workflow state' },
                  { label: 'Progress', value: `${readiness.completionPercent}%`, helper: quoteProgressLabel },
                  { label: 'Pax', value: `${totalPax} pax`, helper: `${quote.adults} adults / ${quote.children} children` },
                  { label: 'Dates', value: quote.travelStartDate ? formatDate(quote.travelStartDate) : 'Pending', helper: formatNightCountLabel(quote.nightCount) },
                ]}
              />

              <QuotePricingSummaryCard
                className="quote-pricing-summary-card-actions quote-primary-action-card"
                eyebrow="Actions"
                title="Save, send, export"
                items={[
                  { label: 'Send', value: quoteReadOnly ? 'Locked' : 'Ready', helper: quoteReadOnly ? 'Open latest quote' : 'Email client proposal' },
                  { label: 'Export', value: 'PDF', helper: 'Client document' },
                ]}
                footer={
                  <div className="quote-builder-sidebar-actions">
                    {!quoteReadOnly ? <SaveQuoteVersionButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} /> : null}
                    {!quoteReadOnly ? <SendQuoteButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} currentStatus={quote.status} /> : null}
                    <DownloadPdfButton apiBaseUrl={ACTION_API_BASE_URL} quoteId={quote.id} />
                    {quote.booking ? (
                      <Link href={`/bookings/${quote.booking.id}`} className="primary-button">Open booking</Link>
                    ) : quote.status === 'ACCEPTED' || quote.status === 'CONFIRMED' ? (
                      convertBlocked || quoteReadOnly ? (
                        <button type="button" className="primary-button" disabled>Convert blocked</button>
                      ) : (
                        <ConvertToBookingButton quoteId={quote.id} />
                      )
                    ) : (
                      <button type="button" className="primary-button" disabled>
                        Convert to booking
                      </button>
                    )}
                  </div>
                }
              />

              <QuotePricingSummaryCard
                className="quote-pricing-summary-card-actions"
                eyebrow="Secondary Actions"
                title="Tools and documents"
                items={[
                  { label: 'Saved versions', value: versions.length, helper: versions.length > 0 ? 'Snapshots available for acceptance' : 'Save a version before acceptance' },
                  { label: 'Invoice', value: formatInvoiceStatus(quote.invoice?.status), helper: quote.invoice ? formatMoney(quote.invoice.totalAmount, quote.invoice.currency) : 'Invoice created after acceptance' },
                ]}
                footer={
                  <div className="quote-builder-sidebar-actions">
                    <QuotePreviewLink quoteId={quote.id} />
                    <ShareQuoteButton
                      apiBaseUrl={ACTION_API_BASE_URL}
                      quoteId={quote.id}
                      initialPublicToken={quote.publicToken}
                      initialPublicEnabled={quote.publicEnabled}
                    />
                    <ReviseQuoteButton quoteId={quote.id} disabled={quoteReadOnly} />
                    {!quoteReadOnly ? <CancelQuoteButton quoteId={quote.id} /> : null}
                  </div>
                }
              />
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
