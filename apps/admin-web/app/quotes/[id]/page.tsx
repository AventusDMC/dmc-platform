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
import { QuoteJourneyFlow } from './QuoteJourneyFlow';
import type { RouteStandardSummary } from '../../lib/route-standards';
import { QuotePricingAudit } from './QuotePricingAudit';
import { QuoteWorkspaceGuide } from './QuoteWorkspaceGuide';
import { QuoteJourneyHighlights } from './QuoteJourneyHighlights';
import { QuoteOperationalInsights } from './QuoteOperationalInsights';
import { QuotePricingSummaryCard } from './QuotePricingSummaryCard';
import type { QuotePassenger } from './QuotePassengersPanel';
import type { QuoteRoomingGroup } from './QuoteRoomingPanel';
import { QuoteStatusForm } from './QuoteStatusForm';
import { SupportTextForm } from './SupportTextForm';
import { getAutoItineraryDayCount } from './QuoteAutoItineraryBuilder.logic';
import { QuoteGroupPricing } from './QuoteGroupPricing';
import { QuotesForm } from '../QuotesForm';
import { ConvertToBookingButton } from './ConvertToBookingButton';
import type { QuoteItineraryResponse } from './QuoteItineraryTab';
import { QuoteItineraryWorkspace } from './QuoteItineraryWorkspace';
import { GuidedJourneyComposer } from './GuidedJourneyComposer';
import { QuoteServicePlanner } from './QuoteServicePlanner';
import { QuoteTransportBulkAssign } from './QuoteTransportBulkAssign';
import { CancelQuoteButton } from './CancelQuoteButton';
import { ReviseQuoteButton } from './ReviseQuoteButton';
import type { ExcursionTemplate } from '../../excursion-templates/types';
import { HotelCategoryOption } from '../../lib/hotelCategories';
import { RouteOption } from '../../lib/routes';
import { formatNightCountLabel } from '../../lib/formatters';
import { calculateMarginPercent, calculateProfit, formatMarginPercent, getQuoteMarginWarning } from '../../lib/financials';
import { getValidatedTripSummary } from '../../lib/tripSummary';
import { buildQuoteReadinessModel, buildQuoteWorkspaceHref, isActiveImportedQuoteServiceUnresolved, type QuotePricingFocus, type ServicePlannerCategory } from './quote-readiness';

import { ADMIN_API_BASE_URL, adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';
import { readSessionActor } from '../../lib/auth-session';

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';
const DATA_API_BASE_URL = '/api';

// Global, role-invariant catalog data (routes, vehicles, hotels, rates,
// seasons, service types…) is identical for every admin user and changes
// rarely. Opting these fetches into the Next.js Data Cache (vs the default
// per-request `no-store`) means repeat quote opens don't re-pull the whole
// catalog over the wire each time — the single biggest source of quote-page
// lag. 5-minute window keeps catalog edits visibly fresh. Quote/user-scoped
// data (the quote itself, versions, itinerary, rooming, companies, contacts,
// agents) deliberately stays `no-store`.
const CATALOG_FETCH = { next: { revalidate: 300 } } satisfies RequestInit;

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
  role: 'admin' | 'super_admin' | 'agent_admin' | 'viewer' | 'operations' | 'finance' | 'agent';
  companyId?: string | null;
  companyName?: string | null;
  active?: boolean;
  status: 'active' | 'inactive';
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
    includedInJordanPass?: boolean | null;
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
  touringRouteId?: string | null;
  touringRoutePricingId?: string | null;
};

type TouringRouteForQuoteTransport = {
  id: string;
  code?: string | null;
  name: string;
  startCity: string;
  durationDays?: number | null;
  routeDescription?: string | null;
  mainDestinations?: string[] | null;
  includedKm?: number | null;
  includedHours?: number | null;
  active?: boolean | null;
  pricings?: NonNullable<RouteOption['touringRoutePricings']>;
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
  seasonFrom?: string | null;
  seasonTo?: string | null;
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
  activityRateVariantId?: string | null;
  ticketRateVariantId?: string | null;
  excursionTemplateId?: string | null;
  excursionTemplateComponentId?: string | null;
  excursionTemplateComponentOptional?: boolean | null;
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
  overrideReason?: string | null;
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
  routeId?: string | null;
  transportServiceTypeId?: string | null;
  vehicleId?: string | null;
  touringRouteId?: string | null;
  touringRoutePricingId?: string | null;
  service: SupplierService;
  appliedVehicleRate: {
    id: string;
    routeId: string | null;
    routeName?: string | null;
    route?: {
      id?: string | null;
      name?: string | null;
      fromPlace?: { name?: string | null; city?: string | null } | null;
      toPlace?: { name?: string | null; city?: string | null } | null;
    } | null;
    fromPlace?: { name?: string | null; city?: string | null } | null;
    toPlace?: { name?: string | null; city?: string | null } | null;
    vehicle: {
      id?: string | null;
      name?: string | null;
      vehicleType?: string | null;
      maxPax?: number | null;
    } | null;
    serviceType: {
      id?: string | null;
      name?: string | null;
      code?: string | null;
    } | null;
    supplier?: {
      id?: string | null;
      name?: string | null;
    } | null;
  } | null;
  touringRoute?: {
    id: string;
    name: string;
    startCity: string;
    durationDays?: number | null;
    mainDestinations?: string[] | null;
    stops?: Array<{ city?: string | null; location?: string | null }>;
  } | null;
  touringRoutePricing?: {
    id: string;
    touringRouteId?: string | null;
    currency?: string | null;
    baseCost?: number | null;
    pricingBasis?: string | null;
    vehicle?: {
      name?: string | null;
      maxPax?: number | null;
    } | null;
    supplier?: {
      name?: string | null;
    } | null;
    transportServiceType?: {
      name?: string | null;
      code?: string | null;
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
  passengers: QuotePassenger[];
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
  workflowDiagnostics?: Array<{
    itemId: string | null;
    itemName: string;
    missingWorkflowFields: string[];
    persistedOperationalFields?: Record<string, unknown>;
  }>;
  convertBlockers?: Array<{
    blockerType: string;
    source: string;
    active: boolean;
    itemId: string | null;
    itemName: string | null;
    reason: string;
  }>;
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
type QuoteWorkspaceStep =
  | 'overview'
  | 'journey-composer'
  | 'itinerary'
  | 'services'
  | 'pricing'
  | 'group-pricing'
  | 'review'
  | 'preview';

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
  // Guided Quote Builder Maturity Phase v2 — calm, structured journey
  // composition for junior staff. Routes to the Itinerary tab; renders
  // GuidedJourneyComposer in place of the advanced service planner.
  { id: 'journey-composer', label: 'Journey', targetTab: 'itinerary' },
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

type QuoteRoomingFetchResult = {
  status: 'ok' | 'error';
  roomingGroups: QuoteRoomingGroup[];
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
  return adminPageFetchJson<SupplierService[]>(`${DATA_API_BASE_URL}/services`, 'Quote detail services', CATALOG_FETCH);
}

async function getActivities(): Promise<ActivityCatalogItem[]> {
  return adminPageFetchJson<ActivityCatalogItem[]>(`${DATA_API_BASE_URL}/activities`, 'Quote detail activities', CATALOG_FETCH);
}

async function getExcursionTemplates(): Promise<ExcursionTemplate[]> {
  return adminPageFetchJson<ExcursionTemplate[]>(`${DATA_API_BASE_URL}/excursion-templates`, 'Quote detail excursion templates', CATALOG_FETCH);
}

async function getTransportServiceTypes(): Promise<TransportServiceType[]> {
  return adminPageFetchJson<TransportServiceType[]>(`${DATA_API_BASE_URL}/transport-service-types`, 'Quote detail transport service types', CATALOG_FETCH);
}

// Route Standards (Phase 2A) — canonical distance/duration/timing for each
// operational route. Load alongside the rest of the quote-detail reference
// data so the auto-builder + intelligence layer can look up by routeCode.
// Soft failure: empty array means "no standards seeded yet" and downstream
// rendering falls back to existing Route distance/duration.
async function getRouteStandards(): Promise<RouteStandardSummary[]> {
  return adminPageFetchJson<RouteStandardSummary[]>(`${API_BASE_URL}/route-standards`, 'Quote detail route standards', CATALOG_FETCH);
}

async function getRoutes(): Promise<RouteOption[]> {
  const [transferRoutes, touringRoutes] = await Promise.all([
    adminPageFetchJson<RouteOption[]>(`${API_BASE_URL}/routes?type=TRANSFER_ROUTE&limit=200`, 'Quote detail transfer routes', CATALOG_FETCH),
    adminPageFetchJson<TouringRouteForQuoteTransport[]>(`${API_BASE_URL}/touring-routes?active=true&transportType=TOURING_ROUTE&limit=500`, 'Quote detail touring routes', CATALOG_FETCH),
  ]);

  return [
    ...transferRoutes,
    ...touringRoutes
      .filter((route) => route.active !== false && String(route.code || '').startsWith('JOR-TR-'))
      .map(mapTouringRouteToQuoteTransportRouteOption),
  ];
}

function buildTouringRoutePickerPlace(route: TouringRouteForQuoteTransport, suffix: string) {
  return {
    id: `${route.id}-${suffix}`,
    name: route.startCity || route.name,
    type: 'Touring Route',
    placeTypeId: null,
    cityId: null,
    city: route.startCity || null,
    country: 'Jordan',
    isActive: true,
  };
}

function mapTouringRouteToQuoteTransportRouteOption(route: TouringRouteForQuoteTransport): RouteOption {
  const destinations = Array.isArray(route.mainDestinations) ? route.mainDestinations.filter(Boolean) : [];
  const routeName = destinations.length > 0 ? `${route.startCity} - ${destinations.join(' - ')} - ${route.startCity}` : route.name;
  return {
    id: route.id,
    fromPlaceId: `${route.id}-start`,
    toPlaceId: `${route.id}-return`,
    name: routeName,
    normalizedKey: route.code || route.id,
    routeType: 'TOURING_ROUTE',
    durationMinutes: route.durationDays ? route.durationDays * 24 * 60 : null,
    distanceKm: route.includedKm ?? null,
    notes: route.routeDescription || null,
    isActive: route.active !== false,
    fromPlace: buildTouringRoutePickerPlace(route, 'start'),
    toPlace: buildTouringRoutePickerPlace(route, 'return'),
    canonicalRouteType: 'TOURING_ROUTE',
    transportPickerMode: 'TOURING_ROUTE',
    code: route.code || null,
    startCity: route.startCity || null,
    durationDays: route.durationDays ?? null,
    mainDestinations: destinations,
    touringRoutePricings: route.pricings || [],
  };
}

async function getVehicles(): Promise<TransportVehicle[]> {
  return adminPageFetchJson<TransportVehicle[]>(`${DATA_API_BASE_URL}/vehicles`, 'Quote detail vehicles', CATALOG_FETCH);
}

async function getSupplierRateCards(): Promise<TransportSupplierRateCard[]> {
  // Kept fresh (no-store), not cached: transport vehicle rates drive pricing
  // and are edited often, so a stale picker could surface a wrong rate.
  const payload = await adminPageFetchJson<unknown>(`${API_BASE_URL}/vehicle-rates`, 'Quote detail supplier rate cards', { cache: 'no-store' });
  return normalizeTransportSupplierRateRows(payload);
}

async function getHotels(): Promise<Hotel[]> {
  return adminPageFetchJson<Hotel[]>(`${DATA_API_BASE_URL}/hotels`, 'Quote detail hotels', CATALOG_FETCH);
}

async function getHotelCategories(): Promise<HotelCategoryOption[]> {
  return adminPageFetchJson<HotelCategoryOption[]>(`${DATA_API_BASE_URL}/hotel-categories?active=true`, 'Quote detail hotel categories', CATALOG_FETCH);
}

async function getHotelContracts(): Promise<HotelContract[]> {
  return adminPageFetchJson<HotelContract[]>(`${DATA_API_BASE_URL}/hotel-contracts`, 'Quote detail hotel contracts', CATALOG_FETCH);
}

async function getHotelRates(): Promise<HotelRate[]> {
  // The /hotel-rates endpoint defaults to 50 rows and caps each page at 250,
  // but a quote can use any hotel in the catalog (900+ rates total). This is
  // the heaviest single loader on the page (~640 KB). We keep it FRESH
  // (no-store) rather than cached — rates drive pricing and are edited often,
  // so a stale picker could surface a wrong price — but we page in PARALLEL
  // instead of serially: the old `await` loop did N sequential round-trips
  // (4–5 today); fanning out collapses that to ~one round-trip.
  const PAGE_SIZE = 250;
  const MAX_PAGES = 8; // ~2000 rates of headroom before silent truncation
  const fetchPage = (offset: number) =>
    adminPageFetchJson<HotelRate[]>(
      `${DATA_API_BASE_URL}/hotel-rates?limit=${PAGE_SIZE}&offset=${offset}`,
      'Quote detail hotel rates',
      { cache: 'no-store' },
    ).catch(() => [] as HotelRate[]);

  // Probe page 0 first so the common small-catalog case stays a single request;
  // only fan out the remainder when there's clearly more.
  const first = await fetchPage(0);
  if (!Array.isArray(first) || first.length < PAGE_SIZE) {
    return Array.isArray(first) ? first : [];
  }
  const rest = await Promise.all(
    Array.from({ length: MAX_PAGES - 1 }, (_, index) => fetchPage((index + 1) * PAGE_SIZE)),
  );
  const all = [...first];
  for (const page of rest) {
    if (!Array.isArray(page) || page.length === 0) {
      break; // offsets are contiguous — the first empty page marks the end
    }
    all.push(...page);
  }
  return all;
}

async function getSeasons(): Promise<Season[]> {
  return adminPageFetchJson<Season[]>(`${DATA_API_BASE_URL}/seasons`, 'Quote detail seasons', CATALOG_FETCH);
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

async function getAgents(): Promise<User[]> {
  return adminPageFetchJson<User[]>(`${DATA_API_BASE_URL}/users/agents`, 'Quote detail agents', {
    cache: 'no-store',
  });
}

async function getSupportTextTemplates(): Promise<SupportTextTemplate[]> {
  return adminPageFetchJson<SupportTextTemplate[]>(`${DATA_API_BASE_URL}/support-text-templates`, 'Quote detail support text templates', CATALOG_FETCH);
}

async function getQuoteBlocks(): Promise<QuoteBlock[]> {
  return adminPageFetchJson<QuoteBlock[]>(`${DATA_API_BASE_URL}/quote-blocks`, 'Quote detail quote blocks', CATALOG_FETCH);
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
  const sourceMetadata = (rawItem?.sourceMetadata && typeof rawItem.sourceMetadata === 'object' ? rawItem.sourceMetadata : {}) as {
    routeId?: string | null;
    transportServiceTypeId?: string | null;
    vehicleId?: string | null;
    touringRouteId?: string | null;
    touringRoutePricingId?: string | null;
  };
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
    activityRateVariantId: item?.activityRateVariantId ?? null,
    excursionTemplateId: item?.excursionTemplateId ?? null,
    excursionTemplateComponentId: item?.excursionTemplateComponentId ?? null,
    excursionTemplateComponentOptional: item?.excursionTemplateComponentOptional ?? null,
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
    overrideReason: item?.overrideReason ?? null,
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
    routeId: item?.routeId ?? item?.appliedVehicleRate?.routeId ?? sourceMetadata.routeId ?? null,
    transportServiceTypeId: item?.transportServiceTypeId ?? item?.appliedVehicleRate?.serviceType?.id ?? sourceMetadata.transportServiceTypeId ?? null,
    vehicleId: item?.vehicleId ?? item?.appliedVehicleRate?.vehicle?.id ?? sourceMetadata.vehicleId ?? null,
    touringRouteId: item?.touringRouteId ?? item?.touringRoute?.id ?? item?.touringRoutePricing?.touringRouteId ?? sourceMetadata.touringRouteId ?? null,
    touringRoutePricingId: item?.touringRoutePricingId ?? item?.touringRoutePricing?.id ?? sourceMetadata.touringRoutePricingId ?? null,
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
          routeName:
            item.appliedVehicleRate.routeName ||
            item.appliedVehicleRate.route?.name ||
            [
              item.appliedVehicleRate.route?.fromPlace?.name || item.appliedVehicleRate.fromPlace?.name,
              item.appliedVehicleRate.route?.toPlace?.name || item.appliedVehicleRate.toPlace?.name,
            ].filter(Boolean).join(' -> ') ||
            'Route to be confirmed',
          route: item.appliedVehicleRate.route
            ? {
                id: item.appliedVehicleRate.route.id || null,
                name: item.appliedVehicleRate.route.name || null,
                fromPlace: item.appliedVehicleRate.route.fromPlace
                  ? {
                      name: item.appliedVehicleRate.route.fromPlace.name || null,
                      city: item.appliedVehicleRate.route.fromPlace.city || null,
                    }
                  : null,
                toPlace: item.appliedVehicleRate.route.toPlace
                  ? {
                      name: item.appliedVehicleRate.route.toPlace.name || null,
                      city: item.appliedVehicleRate.route.toPlace.city || null,
                    }
                  : null,
              }
            : null,
          fromPlace: item.appliedVehicleRate.fromPlace
            ? {
                name: item.appliedVehicleRate.fromPlace.name || null,
                city: item.appliedVehicleRate.fromPlace.city || null,
              }
            : null,
          toPlace: item.appliedVehicleRate.toPlace
            ? {
                name: item.appliedVehicleRate.toPlace.name || null,
                city: item.appliedVehicleRate.toPlace.city || null,
              }
            : null,
          vehicle: item.appliedVehicleRate.vehicle
            ? {
                id: item.appliedVehicleRate.vehicle.id || null,
                name: item.appliedVehicleRate.vehicle.name || 'Vehicle to be confirmed',
                vehicleType: item.appliedVehicleRate.vehicle.vehicleType || null,
                maxPax: item.appliedVehicleRate.vehicle.maxPax ?? null,
              }
            : null,
          serviceType: item.appliedVehicleRate.serviceType
            ? {
                id: item.appliedVehicleRate.serviceType.id || 'missing-service-type',
                name: item.appliedVehicleRate.serviceType.name || 'Transport',
                code: item.appliedVehicleRate.serviceType.code || 'TRANSPORT',
              }
            : null,
          supplier: item.appliedVehicleRate.supplier
            ? {
                id: item.appliedVehicleRate.supplier.id || null,
                name: item.appliedVehicleRate.supplier.name || null,
              }
            : null,
        }
      : null,
    touringRoute: item?.touringRoute
      ? {
          id: item.touringRoute.id,
          name: item.touringRoute.name,
          startCity: item.touringRoute.startCity,
          durationDays: item.touringRoute.durationDays ?? null,
          mainDestinations: Array.isArray(item.touringRoute.mainDestinations) ? item.touringRoute.mainDestinations : [],
          stops: Array.isArray(item.touringRoute.stops) ? item.touringRoute.stops : [],
        }
      : null,
    touringRoutePricing: item?.touringRoutePricing
      ? {
          id: item.touringRoutePricing.id,
          touringRouteId: item.touringRoutePricing.touringRouteId ?? null,
          currency: item.touringRoutePricing.currency ?? null,
          baseCost: item.touringRoutePricing.baseCost ?? null,
          pricingBasis: item.touringRoutePricing.pricingBasis ?? null,
          vehicle: item.touringRoutePricing.vehicle
            ? {
                name: item.touringRoutePricing.vehicle.name ?? null,
                maxPax: item.touringRoutePricing.vehicle.maxPax ?? null,
              }
            : null,
          supplier: item.touringRoutePricing.supplier
            ? {
                name: item.touringRoutePricing.supplier.name ?? null,
              }
            : null,
          transportServiceType: item.touringRoutePricing.transportServiceType
            ? {
                name: item.touringRoutePricing.transportServiceType.name ?? null,
                code: item.touringRoutePricing.transportServiceType.code ?? null,
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
    passengers: Array.isArray(quote.passengers) ? quote.passengers : [],
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

async function getQuoteRooming(id: string): Promise<QuoteRoomingFetchResult> {
  try {
    const roomingGroups = await adminPageFetchJson<QuoteRoomingGroup[]>(`${DATA_API_BASE_URL}/quotes/${id}/rooming`, 'Quote detail rooming', {
      cache: 'no-store',
      allow404: true,
    });

    return {
      status: 'ok',
      roomingGroups: Array.isArray(roomingGroups) ? roomingGroups : [],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown rooming fetch failure';
    console.error(`[QuoteDetailsPage] Quote rooming fetch failed for ${id}: ${message}`);

    return {
      status: 'error',
      message,
      roomingGroups: [],
    };
  }
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

function titleCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatWorkflowFieldName(field: string) {
  const normalized = field.trim().toLowerCase();
  const fieldLabels: Record<string, string> = {
    'activity date': 'serviceDate',
    'start time or pickup time': 'startTime or pickupTime',
    'location or meeting point': 'pickupLocation or meetingPoint',
    'participant count': 'participantCount',
    'reconfirmation due date': 'reconfirmationDueAt',
    'cost/sell pricing': 'totalCost / totalSell',
    'pax count': 'paxCount',
    quantity: 'quantity',
  };

  return fieldLabels[normalized] || field;
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

  if (item.appliedVehicleRate) {
    return buildTransportServiceDisplayName(
      item.service?.name,
      item.appliedVehicleRate.serviceType?.name || item.service?.serviceType?.name || item.service?.category || 'Transport',
      item.appliedVehicleRate.supplier?.name || null,
    );
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
  if (/\b(daily\s*full\s*day|daily\s*fd|daily_package|daily\s*package|minimum\s*3|full\s*day)\b/i.test(text)) return 'Daily Full Day';
  if (/\bhalf\s*day\b/i.test(text)) return 'Half Day';
  if (/\bday\s*tour\b/i.test(text)) return 'Daily Full Day';
  if (/\bextra\s*(km|kilometer|kilometre)\b/i.test(text)) return 'Extra KM';
  if (/\bwadi\s*rum.*overnight|overnight.*wadi\s*rum\b/i.test(text)) return 'Wadi Rum Overnight';
  if (/\baqaba.*overnight|overnight.*aqaba\b/i.test(text)) return 'Aqaba Overnight';
  if (/\bdriver\s*overnight\b|petra.*overnight|overnight.*petra\b/i.test(text)) return 'Petra Overnight';
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

function collectIncompleteActivityItemLabels(quote: Quote) {
  if (Array.isArray(quote.workflowDiagnostics) && quote.workflowDiagnostics.length > 0) {
    return quote.workflowDiagnostics
      .filter((item) => item.missingWorkflowFields.length > 0)
      .map((item) => ({
        itemId: item.itemId,
        itemName: item.itemName,
        missingWorkflowFields: item.missingWorkflowFields,
      }));
  }

  const allItems = [...quote.quoteItems, ...quote.quoteOptions.flatMap((option) => option.quoteItems)];

  return allItems
    .filter((item) => {
      if (!isActivityQuoteItem(item)) {
        return false;
      }

      const hasResolvedDate = Boolean(resolveQuoteItemServiceDate(quote, item));

      return (
        !hasResolvedDate ||
        (!item.startTime && !item.pickupTime) ||
        (!item.pickupLocation && !item.meetingPoint) ||
        !((item.participantCount ?? 0) > 0 || (item.adultCount ?? 0) + (item.childCount ?? 0) > 0) ||
        (item.reconfirmationRequired && !item.reconfirmationDueAt) ||
        item.totalCost <= 0 ||
        item.totalSell <= 0 ||
        (item.paxCount ?? 0) <= 0
      );
    })
    .map((item) => {
      const missingWorkflowFields = [
        !resolveQuoteItemServiceDate(quote, item) ? 'activity date' : null,
        !item.startTime && !item.pickupTime ? 'start time or pickup time' : null,
        !item.pickupLocation && !item.meetingPoint ? 'location or meeting point' : null,
        !((item.participantCount ?? 0) > 0 || (item.adultCount ?? 0) + (item.childCount ?? 0) > 0) ? 'participant count' : null,
        item.reconfirmationRequired && !item.reconfirmationDueAt ? 'reconfirmation due date' : null,
        item.totalCost <= 0 || item.totalSell <= 0 ? 'cost/sell pricing' : null,
        (item.paxCount ?? 0) <= 0 ? 'pax count' : null,
      ].filter(Boolean) as string[];

      return {
        itemId: item.id,
        itemName: getQuoteItemDisplayName(item),
        missingWorkflowFields,
      };
    });
}

function isQuoteServiceMissingSupplier(item: Quote['quoteItems'][number]) {
  return item.service.supplierId === 'import-itinerary-system' && isActiveImportedQuoteServiceUnresolved(item);
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
    activeTab === 'itinerary' ||
    activeTab === 'hotels' ||
    // The unified service planner can add a Hotel stay on the transport/services
    // tabs too (same editor, Hotel category chip), so hotel/contract/rate data
    // must load there as well — otherwise the "Add Confirmed Hotel Stay" picker
    // shows an empty "Create a hotel first" state even though hotels exist.
    // Mirrors shouldLoadActivityCatalogData below.
    activeTab === 'transport' ||
    activeTab === 'services' ||
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
  const shouldLoadActivityCatalogData =
    activeTab === 'itinerary' ||
    activeTab === 'hotels' ||
    activeTab === 'transport' ||
    activeTab === 'services' ||
    resolvedSearchParams?.addCategory === 'activity';
  // Transport catalog (routes/vehicles/supplier rate cards/standards/service
  // types) is consumed ONLY by QuoteServicePlanner, which renders only on the
  // itinerary/hotels/transport/services tabs. The pricing, proposal, review and
  // versions tabs never read it — yet these are the heaviest/slowest fetches
  // (routes ~700 rows; routes + rate cards carry 20s timeouts + retries). Gate
  // them like hotel data so opening the Pricing tab doesn't pay that cost.
  // Mirrors shouldLoadActivityCatalogData (+ the transport deep-link params that
  // can pre-open the planner's route picker).
  const shouldLoadTransportPlanningData =
    activeTab === 'itinerary' ||
    activeTab === 'hotels' ||
    activeTab === 'transport' ||
    activeTab === 'services' ||
    resolvedSearchParams?.addCategory === 'transport' ||
    Boolean(resolvedSearchParams?.catalogRouteId);
  const shouldLoadHotelCategories = activeTab === 'pricing';
  const [
    quoteSettled,
    servicesSettled,
    activitiesSettled,
    excursionTemplatesSettled,
    transportServiceTypesSettled,
    routesSettled,
    routeStandardsSettled,
    vehiclesSettled,
    supplierRateCardsSettled,
    hotelsSettled,
    hotelContractsSettled,
    hotelRatesSettled,
    seasonsSettled,
    companiesSettled,
    contactsSettled,
    agentsSettled,
    versionsSettled,
    hotelCategoriesSettled,
    supportTextTemplatesSettled,
    quoteBlocksSettled,
    quoteItinerarySettled,
    quoteRoomingSettled,
  ] = await Promise.allSettled([
    getQuote(id),
    safeQuoteDetailFetch('services', [] as SupplierService[], getServices),
    shouldLoadActivityCatalogData
      ? safeQuoteDetailFetch('activities', [] as ActivityCatalogItem[], getActivities)
      : skippedQuoteDetailFetch('activities', [] as ActivityCatalogItem[]),
    shouldLoadActivityCatalogData
      ? safeQuoteDetailFetch('excursion templates', [] as ExcursionTemplate[], getExcursionTemplates)
      : skippedQuoteDetailFetch('excursion templates', [] as ExcursionTemplate[]),
    shouldLoadTransportPlanningData
      ? safeQuoteDetailFetch('transport service types', [] as TransportServiceType[], getTransportServiceTypes)
      : skippedQuoteDetailFetch('transport service types', [] as TransportServiceType[]),
    shouldLoadTransportPlanningData
      ? safeQuoteDetailTransportFetch('routes', [] as RouteOption[], getRoutes)
      : skippedQuoteDetailFetch('routes', [] as RouteOption[]),
    shouldLoadTransportPlanningData
      ? safeQuoteDetailFetch('route standards', [] as RouteStandardSummary[], getRouteStandards)
      : skippedQuoteDetailFetch('route standards', [] as RouteStandardSummary[]),
    shouldLoadTransportPlanningData
      ? safeQuoteDetailTransportFetch('vehicles', [] as TransportVehicle[], getVehicles)
      : skippedQuoteDetailFetch('vehicles', [] as TransportVehicle[]),
    shouldLoadTransportPlanningData
      ? safeQuoteDetailTransportFetch('supplier rate cards', [] as TransportSupplierRateCard[], getSupplierRateCards)
      : skippedQuoteDetailFetch('supplier rate cards', [] as TransportSupplierRateCard[]),
    shouldLoadHotelPlanningData ? safeQuoteDetailFetch('hotels', [] as Hotel[], getHotels) : skippedQuoteDetailFetch('hotels', [] as Hotel[]),
    shouldLoadHotelPlanningData
      ? safeQuoteDetailFetch('hotel contracts', [] as HotelContract[], getHotelContracts)
      : skippedQuoteDetailFetch('hotel contracts', [] as HotelContract[]),
    shouldLoadHotelPlanningData ? safeQuoteDetailFetch('hotel rates', [] as HotelRate[], getHotelRates) : skippedQuoteDetailFetch('hotel rates', [] as HotelRate[]),
    safeQuoteDetailFetch('seasons', [] as Season[], getSeasons),
    safeQuoteDetailFetch('companies', [] as Company[], getCompanies),
    safeQuoteDetailFetch('contacts', [] as Contact[], getContacts),
    safeQuoteDetailFetch('agents', [] as User[], getAgents),
    getVersions(id),
    shouldLoadHotelCategories
      ? safeQuoteDetailFetch('hotel categories', [] as HotelCategoryOption[], getHotelCategories)
      : skippedQuoteDetailFetch('hotel categories', [] as HotelCategoryOption[]),
    safeQuoteDetailFetch('support text templates', [] as SupportTextTemplate[], getSupportTextTemplates),
    safeQuoteDetailFetch('quote blocks', [] as QuoteBlock[], getQuoteBlocks),
    getQuoteItinerary(id),
    getQuoteRooming(id),
  ]);
  const quoteResult = unwrapSettledQuoteDetail<QuoteFetchResult>(quoteSettled, { status: 'error', message: 'Quote could not be loaded' }, 'quote');
  const servicesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<SupplierService[]>>(servicesSettled, { status: 'error', label: 'services', data: [], message: 'Services unavailable' }, 'services');
  const activitiesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<ActivityCatalogItem[]>>(activitiesSettled, { status: 'error', label: 'activities', data: [], message: 'Activities unavailable' }, 'activities');
  const excursionTemplatesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<ExcursionTemplate[]>>(excursionTemplatesSettled, { status: 'error', label: 'excursion templates', data: [], message: 'Excursion templates unavailable' }, 'excursion templates');
  const transportServiceTypesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<TransportServiceType[]>>(transportServiceTypesSettled, { status: 'error', label: 'transport service types', data: [], message: 'Transport service types unavailable' }, 'transport service types');
  const routesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<RouteOption[]>>(routesSettled, { status: 'error', label: 'routes', data: [], message: 'Routes unavailable' }, 'routes');
  const routeStandardsResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<RouteStandardSummary[]>>(
    routeStandardsSettled,
    { status: 'error', label: 'route standards', data: [], message: 'Route standards unavailable' },
    'route standards',
  );
  const vehiclesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<TransportVehicle[]>>(vehiclesSettled, { status: 'error', label: 'vehicles', data: [], message: 'Vehicles unavailable' }, 'vehicles');
  const supplierRateCardsResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<TransportSupplierRateCard[]>>(supplierRateCardsSettled, { status: 'error', label: 'supplier rate cards', data: [], message: 'Supplier rate cards unavailable' }, 'supplier rate cards');
  const hotelsResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<Hotel[]>>(hotelsSettled, { status: 'error', label: 'hotels', data: [], message: 'Hotels unavailable' }, 'hotels');
  const hotelContractsResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<HotelContract[]>>(hotelContractsSettled, { status: 'error', label: 'hotel contracts', data: [], message: 'Hotel contracts unavailable' }, 'hotel contracts');
  const hotelRatesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<HotelRate[]>>(hotelRatesSettled, { status: 'error', label: 'hotel rates', data: [], message: 'Hotel rates unavailable' }, 'hotel rates');
  const seasonsResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<Season[]>>(seasonsSettled, { status: 'error', label: 'seasons', data: [], message: 'Seasons unavailable' }, 'seasons');
  const companiesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<Company[]>>(companiesSettled, { status: 'error', label: 'companies', data: [], message: 'Companies unavailable' }, 'companies');
  const contactsResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<Contact[]>>(contactsSettled, { status: 'error', label: 'contacts', data: [], message: 'Contacts unavailable' }, 'contacts');
  const agentsResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<User[]>>(agentsSettled, { status: 'error', label: 'agents', data: [], message: 'Agents unavailable' }, 'agents');
  const versionsResult = unwrapSettledQuoteDetail<QuoteVersionsFetchResult>(versionsSettled, { status: 'error', versions: [], message: 'Versions unavailable' }, 'versions');
  const hotelCategoriesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<HotelCategoryOption[]>>(hotelCategoriesSettled, { status: 'error', label: 'hotel categories', data: [], message: 'Hotel categories unavailable' }, 'hotel categories');
  const supportTextTemplatesResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<SupportTextTemplate[]>>(supportTextTemplatesSettled, { status: 'error', label: 'support text templates', data: [], message: 'Support text templates unavailable' }, 'support text templates');
  const quoteBlocksResult = unwrapSettledQuoteDetail<OptionalQuoteDetailFetchResult<QuoteBlock[]>>(quoteBlocksSettled, { status: 'error', label: 'quote blocks', data: [], message: 'Quote blocks unavailable' }, 'quote blocks');
  const quoteItineraryResult = unwrapSettledQuoteDetail<QuoteItineraryFetchResult>(quoteItinerarySettled, { status: 'error', itinerary: { quoteId: id, days: [] }, message: 'Itinerary unavailable' }, 'itinerary');
  const quoteRoomingResult = unwrapSettledQuoteDetail<QuoteRoomingFetchResult>(quoteRoomingSettled, { status: 'error', roomingGroups: [], message: 'Rooming unavailable' }, 'rooming');
  const services = servicesResult.data;
  const activities = activitiesResult.data;
  const excursionTemplates = excursionTemplatesResult.data;
  const transportServiceTypes = transportServiceTypesResult.data;
  const routes = routesResult.data;
  const routeStandards = routeStandardsResult.data;
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
  const agentUsers = agentsResult.data;
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
  const agents = agentUsers
    .filter((user): user is User & { role: 'agent' } => user.role === 'agent' && user.status !== 'inactive')
    .map((user) => ({
      id: user.id,
      name: user.companyName ? `${user.name} - ${user.companyName}` : user.name,
      email: user.email,
      role: user.role,
    }));
  const quoteItinerary = quoteItineraryResult.itinerary;
  const quoteRoomingGroups = quoteRoomingResult.roomingGroups;

  const totalPax = quote.adults + quote.children;
  const quoteExpired = isQuoteExpired(quote);
  const quoteProfit = calculateProfit(quote.totalSell, quote.totalCost);
  const quoteMarginPercent = calculateMarginPercent(quote.totalSell, quote.totalCost);
  const quoteMarkupPercent = quote.totalCost > 0 ? Number(((quoteProfit / quote.totalCost) * 100).toFixed(2)) : 0;
  const quoteMarginWarning = getQuoteMarginWarning(quote.totalSell, quote.totalCost);
  const authoringSummary = collectQuoteAuthoringSummary(quote);
  const incompleteActivityItemLabels = collectIncompleteActivityItemLabels(quote);
  const expectedDayCount = getAutoItineraryDayCount(quote.nightCount);
  const sortedDays = [...quote.itineraries].filter((day) => day.dayNumber <= expectedDayCount).sort((a, b) => a.dayNumber - b.dayNumber);
  const visibleQuoteItineraryDays = quoteItinerary.days.filter((day) => day.isActive && day.dayNumber <= expectedDayCount);
  // Nights source-of-truth guard. The day cards rendered below are clamped to
  // expectedDayCount (= nightCount + 1). If the scalar nightCount is set LOWER
  // than the real itinerary length, the trailing day cards (e.g. Departure) are
  // silently hidden — the data survives in the DB but vanishes from view. Flag
  // that so the operator can reconcile rather than lose sight of the full trip.
  const itineraryDayNumbers = [
    ...quote.itineraries.map((day) => day.dayNumber),
    ...quoteItinerary.days.filter((day) => day.isActive).map((day) => day.dayNumber),
  ];
  const maxItineraryDayNumber = itineraryDayNumbers.length > 0 ? Math.max(...itineraryDayNumbers) : 0;
  const hiddenItineraryDayCount = Math.max(0, maxItineraryDayNumber - expectedDayCount);
  const nightsToCoverItinerary = Math.max(0, maxItineraryDayNumber - 1);
  const nightsDivergenceWarning =
    hiddenItineraryDayCount > 0
      ? `Nights mismatch: this quote is set to ${quote.nightCount} night${quote.nightCount === 1 ? '' : 's'}, but the itinerary runs to day ${maxItineraryDayNumber} — ${hiddenItineraryDayCount} day card${hiddenItineraryDayCount === 1 ? ' is' : 's are'} hidden below it. Raise Nights to ${nightsToCoverItinerary} or remove the extra day${hiddenItineraryDayCount === 1 ? '' : 's'} so the full trip stays visible.`
      : null;
  const plannerDayIdByQuoteItemId = new Map<string, string>();
  for (const day of visibleQuoteItineraryDays) {
    for (const dayItem of day.dayItems || []) {
      if (dayItem.quoteServiceId) {
        plannerDayIdByQuoteItemId.set(dayItem.quoteServiceId, day.id);
      }
    }
  }
  const isAssignedToPlannerDay = (item: Pick<QuoteItem, 'id' | 'itineraryId'>) => Boolean(item.itineraryId || plannerDayIdByQuoteItemId.has(item.id));
  const sharedUnassignedItems = quote.quoteItems.filter((item) => !isAssignedToPlannerDay(item));
  const readinessQuote = {
    ...quote,
    itineraries:
      visibleQuoteItineraryDays.length > 0
        ? visibleQuoteItineraryDays.map((day) => ({
            id: day.id,
            dayNumber: day.dayNumber,
            title: day.title,
            description: day.notes || null,
          }))
        : quote.itineraries,
    quoteItems: quote.quoteItems.map((item) => ({
      ...item,
      itineraryId: item.itineraryId || plannerDayIdByQuoteItemId.get(item.id) || null,
    })),
    quoteOptions: quote.quoteOptions.map((option) => ({
      ...option,
      quoteItems: option.quoteItems.map((item) => ({
        ...item,
        itineraryId: item.itineraryId || plannerDayIdByQuoteItemId.get(item.id) || null,
      })),
    })),
  };
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
    companiesResult.status === 'error' || contactsResult.status === 'error' || agentsResult.status === 'error'
      ? 'Some client, contact, or agent lists could not be loaded. Quote editing may be limited.'
      : null,
    supportTextTemplatesResult.status === 'error' || quoteBlocksResult.status === 'error' ? 'Reusable content could not be loaded. Proposal editing may be limited.' : null,
    versionsResult.status === 'error' ? 'Saved quote versions could not be loaded.' : null,
    quoteExpired ? 'Quote validity has passed.' : null,
    authoringSummary.incompleteItems > 0 ? `${authoringSummary.incompleteItems} items still need pricing or workflow details.` : null,
    authoringSummary.pricingIssues > 0 ? `${authoringSummary.pricingIssues} items are missing sell, cost, or pax details.` : null,
    authoringSummary.activityOperationalIssues > 0
      ? `${authoringSummary.activityOperationalIssues} activity items are missing date, time, location, or counts.`
      : null,
    incompleteActivityItemLabels.length > 0
      ? `Incomplete Imported Activity / activity items: ${incompleteActivityItemLabels
          .slice(0, 5)
          .map((item) => `${item.itemName}${item.itemId ? ` (${item.itemId})` : ''} missing ${item.missingWorkflowFields.join(', ')}`)
          .join('; ')}.`
      : null,
    authoringSummary.reconfirmationsDueSoon > 0 ? `${authoringSummary.reconfirmationsDueSoon} reconfirmations are due soon.` : null,
    (quote.status === 'ACCEPTED' || quote.status === 'CONFIRMED') && !quote.acceptedVersionId
      ? 'Quote is accepted without a linked saved version. Save a version, then re-apply Accepted status to repair the booking snapshot link.'
      : null,
  ].filter(Boolean) as string[];
  const quoteUnassignedServicesCount =
    sharedUnassignedItems.length + quote.quoteOptions.reduce((total, option) => total + option.quoteItems.filter((item) => !isAssignedToPlannerDay(item)).length, 0);
  const buildTabHref = (tab: QuoteDetailTab) => `/quotes/${quote.id}?tab=${tab}`;
  const buildStepHref = (step: QuoteWorkspaceStep, params?: Record<string, string | null | undefined>) => {
    return buildQuoteWorkspaceHref(quote.id, step, params);
  };
  const readiness = buildQuoteReadinessModel(readinessQuote, buildStepHref);
  const allQuotePricingItems = [...quote.quoteItems, ...quote.quoteOptions.flatMap((option) => option.quoteItems)];
  const assignedPassengerIds = new Set(quoteRoomingGroups.flatMap((group) => group.assignments.map((assignment) => assignment.quotePassengerId)));
  const assignedPassengerCount = quote.passengers.filter((passenger) => assignedPassengerIds.has(passenger.id)).length;
  const unassignedPassengerCount = Math.max(quote.passengers.length - assignedPassengerCount, 0);
  const roomingHasWarnings =
    quoteRoomingGroups.length === 0 ||
    unassignedPassengerCount > 0 ||
    quoteRoomingGroups.some((group) => {
      const assigned = group.assignments.length;
      const capacity =
        group.occupancyType === 'single'
          ? 1
          : group.occupancyType === 'double'
            ? 2
            : group.occupancyType === 'triple'
              ? 3
              : group.occupancyType === 'quad'
                ? 4
                : null;

      return assigned === 0 || (capacity !== null && assigned > capacity);
    });
  const operationalSidebarTone =
    readiness.blockers.length > 0 || roomingHasWarnings
      ? 'critical'
      : readiness.warnings.length > 0 || readiness.cleanupItems.length > 0 || readiness.unpricedServices > 0
        ? 'warning'
        : 'ready';
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
  const quoteAcceptedForConversion = quote.status === 'ACCEPTED';
  const conversionRequirementMessage = quoteCancelled
    ? 'Cancelled quotes cannot be converted to bookings.'
    : quote.isLatestRevision === false
      ? 'Only the latest quote revision can be converted to booking.'
      : !quoteAcceptedForConversion
        ? 'Accept the quote before converting to booking.'
        : !quote.acceptedVersionId
          ? 'Save/accept a version before converting.'
          : null;
  const convertBlockers = Array.isArray(quote.convertBlockers) ? quote.convertBlockers : [];
  if (process.env.NODE_ENV === 'development') {
    console.log('convertBlockers', convertBlockers);
  }
  const backendConvertBlockers = convertBlockers.filter((blocker) => blocker.active);
  const statusMismatchBlockers = conversionRequirementMessage
    ? [
        {
          id: 'conversion-status',
          blockerType: 'status-mismatch',
          source: 'Quote Status',
          active: true,
          itemId: null,
          itemName: null,
          title: quote.status === 'ACCEPTED' ? 'Accepted quote state' : `Quote status: ${formatQuoteStatus(quote.status)}`,
          description: conversionRequirementMessage,
          href: buildStepHref('review'),
          reason: conversionRequirementMessage,
        },
      ]
    : [];
  const activeConvertBlockers = [
    ...statusMismatchBlockers.map((item) => ({
      blockerType: item.blockerType,
      source: item.source,
      active: item.active,
      itemId: item.itemId,
      itemName: item.itemName,
      reason: item.reason,
      href: item.href,
    })),
    ...backendConvertBlockers.map((blocker) => ({
      blockerType: blocker.blockerType,
      source: blocker.source,
      active: blocker.active,
      itemId: blocker.itemId,
      itemName: blocker.itemName,
      reason: blocker.reason,
      href: blocker.itemId ? `${buildStepHref('services')}#quote-item-${blocker.itemId}` : buildStepHref('review'),
    })),
  ].filter((blocker, index, entries) => {
    const key = `${blocker.blockerType}:${blocker.itemId || 'quote'}:${blocker.reason}`;
    return entries.findIndex((entry) => `${entry.blockerType}:${entry.itemId || 'quote'}:${entry.reason}` === key) === index;
  });
  const convertBlocked = activeConvertBlockers.length > 0;
  if (process.env.NODE_ENV === 'development') {
    console.log({
      convertBlocked,
      activeConvertBlockers,
      unresolvedItems: readiness.unresolvedItems,
      conversionBlockedMessage: activeConvertBlockers[0]?.reason || null,
    });
  }
  const conversionBlockerSummary = {
    unresolvedItems: activeConvertBlockers.length,
    pricingMismatches: activeConvertBlockers.filter((blocker) =>
      ['pricing-configuration', 'service-missing-price', 'service-zero-sell', 'pricing-mismatch'].includes(blocker.blockerType),
    ).length,
    missingOperationalFields: activeConvertBlockers.filter((blocker) => blocker.blockerType === 'workflow-fields').length,
  };
  // Calm wording translation — replace ERP-style "Missing workflow fields"
  // language with operator-friendly phrases per spec task #6. Each entry
  // matches the start of a blocker.reason and returns a calmer label.
  const calmWording = (reason: string): string => {
    const lower = String(reason || '').toLowerCase();
    if (lower.includes('cost/sell pricing') && (lower.includes('start time') || lower.includes('pickup'))) {
      return 'Pricing and timing review needed';
    }
    if (lower.includes('cost/sell pricing')) return 'Pricing review needed';
    if (lower.includes('start time') || lower.includes('pickup time') || lower.includes('pickup')) {
      return 'Transfer or activity timing pending';
    }
    if (lower.includes('meeting point')) return 'Meeting point pending';
    if (lower.includes('location')) return 'Location detail pending';
    if (lower.includes('supplier')) return 'Supplier assignment pending';
    if (lower.includes('voucher')) return 'Voucher generation pending';
    // Fall back to a trimmed original — drop the "[Source] " prefix etc.
    return String(reason || '').replace(/^\[.*?\]\s*/, '').replace(/^Missing\s+/i, '').replace(/^Quote Item\s+/i, '');
  };
  // Calm severity colour map — sand-amber for review, soft red ONLY for
  // genuinely blocking items. Per spec #5: only truly blocking issues
  // should become visually strong.
  const blockerCalmTone = (source: string) => {
    const s = String(source || '').toLowerCase();
    if (s.includes('blocker') || s.includes('error')) {
      return { bg: '#faf2f2', text: '#7a4242', dot: '#a85454' };
    }
    return { bg: '#fbf9f4', text: '#6b5933', dot: '#c7956b' };
  };
  // Compact headline tone for the collapsed chip.
  const headlineTone =
    conversionBlockerSummary.unresolvedItems > 10
      ? { bg: '#fbf9f4', border: '#e8dcc4', text: '#6b5933' }
      : conversionBlockerSummary.unresolvedItems > 0
      ? { bg: '#fbf9f4', border: '#e8dcc4', text: '#6b5933' }
      : { bg: '#f5f8f5', border: '#cdd7cd', text: '#3a5a3a' };
  const conversionBlockerDetails = convertBlocked ? (
    <details
      style={{
        background: headlineTone.bg,
        border: `1px solid ${headlineTone.border}`,
        borderRadius: 10,
        padding: '0.65rem 0.85rem',
        marginBottom: '0.75rem',
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.75rem',
          listStyle: 'none',
        }}
      >
        <span
          style={{
            color: headlineTone.text,
            fontSize: '0.72rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
          }}
        >
          Operational Review
        </span>
        <strong style={{ color: headlineTone.text, fontSize: '0.92rem' }}>
          {conversionBlockerSummary.unresolvedItems} item
          {conversionBlockerSummary.unresolvedItems === 1 ? '' : 's'} need review
        </strong>
        {conversionBlockerSummary.pricingMismatches > 0 ? (
          <span style={{ color: headlineTone.text, fontSize: '0.78rem', opacity: 0.8 }}>
            · {conversionBlockerSummary.pricingMismatches} pricing
          </span>
        ) : null}
        {conversionBlockerSummary.missingOperationalFields > 0 ? (
          <span style={{ color: headlineTone.text, fontSize: '0.78rem', opacity: 0.8 }}>
            · {conversionBlockerSummary.missingOperationalFields} operational fields
          </span>
        ) : null}
        <span style={{ marginLeft: 'auto', color: headlineTone.text, fontSize: '0.78rem', fontWeight: 600 }}>
          Show ▾
        </span>
      </summary>
      {/* Consolidated category groups — instead of N identical rows
          ("Imported Activity — Pricing review" x5), bucket by the
          calmed reason so the operator sees "5 activities need pricing
          review" with a sub-expansion for individual items.
          Spec task #1 + #2: consolidate + group by category. */}
      <div style={{ marginTop: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {(() => {
          type Group = {
            categoryKey: string;
            categoryLabel: string;
            severity: 'informational' | 'review' | 'caution' | 'blocking';
            items: Array<{ blocker: typeof activeConvertBlockers[number]; calmedReason: string; itemTypeLabel: string }>;
          };
          // Pick the category bucket for each blocker based on the calmed
          // reason — the same translation map used in the row rendering.
          const groupKeyFor = (calmed: string, source: string): { key: string; label: string; severity: Group['severity'] } => {
            const lower = calmed.toLowerCase();
            if (lower.includes('status mismatch') || lower.includes('accept the quote')) {
              return { key: 'status', label: 'Status Review', severity: 'blocking' };
            }
            if (lower.includes('pricing') && lower.includes('timing')) {
              return { key: 'pricing-timing', label: 'Pricing & Timing Review', severity: 'review' };
            }
            if (lower.includes('pricing')) return { key: 'pricing', label: 'Pricing Review', severity: 'review' };
            if (lower.includes('timing')) return { key: 'timing', label: 'Timing Review', severity: 'review' };
            if (lower.includes('meeting point') || lower.includes('location')) {
              return { key: 'operational-fields', label: 'Operational Fields', severity: 'review' };
            }
            if (lower.includes('supplier')) return { key: 'supplier', label: 'Supplier Review', severity: 'caution' };
            if (lower.includes('voucher')) return { key: 'voucher', label: 'Voucher Review', severity: 'review' };
            if (String(source).toLowerCase().includes('blocker') || String(source).toLowerCase().includes('error')) {
              return { key: 'other-blocking', label: 'Coordination Required', severity: 'blocking' };
            }
            return { key: 'other', label: 'Other', severity: 'informational' };
          };
          const itemTypeLabelFor = (blocker: typeof activeConvertBlockers[number]): string => {
            const name = blocker.itemName || '';
            if (name.toLowerCase().includes('activity')) return 'activity';
            if (name.toLowerCase().includes('transport')) return 'transport';
            if (name.toLowerCase().includes('hotel')) return 'hotel';
            if (name.toLowerCase().includes('service')) return 'service';
            if (name.toLowerCase().includes('entrance')) return 'entrance';
            return 'item';
          };
          const groupsMap = new Map<string, Group>();
          for (const blocker of activeConvertBlockers) {
            const calmed = calmWording(blocker.reason);
            const meta = groupKeyFor(calmed, blocker.source);
            const itemTypeLabel = itemTypeLabelFor(blocker);
            const cur = groupsMap.get(meta.key) || {
              categoryKey: meta.key,
              categoryLabel: meta.label,
              severity: meta.severity,
              items: [],
            };
            cur.items.push({ blocker, calmedReason: calmed, itemTypeLabel });
            groupsMap.set(meta.key, cur);
          }
          // Severity sort: blocking → caution → review → informational
          const SEVERITY_ORDER: Record<Group['severity'], number> = {
            blocking: 0,
            caution: 1,
            review: 2,
            informational: 3,
          };
          const groups = [...groupsMap.values()].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
          const SEVERITY_TONE: Record<Group['severity'], { bg: string; border: string; text: string; dot: string; label: string }> = {
            blocking: { bg: '#faf2f2', border: '#e8c8c8', text: '#7a4242', dot: '#a85454', label: 'Blocking' },
            caution: { bg: '#fbf6ea', border: '#e8d5a8', text: '#8b5e34', dot: '#c7956b', label: 'Caution' },
            review: { bg: '#fbf9f4', border: '#e8dcc4', text: '#6b5933', dot: '#c7956b', label: 'Review' },
            informational: { bg: '#f5f5f5', border: '#dcdcdc', text: '#555555', dot: '#999999', label: 'Info' },
          };
          // Pluralise item-type label for the consolidated heading.
          const pluralise = (label: string, n: number) => {
            if (n === 1) return label;
            if (label === 'item') return 'items';
            if (label === 'activity') return 'activities';
            if (label === 'entrance') return 'entrances';
            return `${label}s`;
          };
          // Natural action phrases per category — avoids awkward
          // "Item needs other" or "5 items need operational fields" by
          // substituting an operator-friendly verb phrase. Keyed by the same
          // category key as groupKeyFor.
          const ACTION_PHRASE: Record<string, string> = {
            status: 'status review',
            'pricing-timing': 'pricing and timing review',
            pricing: 'pricing review',
            timing: 'timing review',
            'operational-fields': 'operational details',
            supplier: 'supplier assignment',
            voucher: 'voucher generation',
            'other-blocking': 'coordination',
            other: 'a quick review',
          };
          // Build the consolidated headline for a group.
          const buildHeadline = (group: Group): string => {
            const action = ACTION_PHRASE[group.categoryKey] || group.categoryLabel.toLowerCase();
            // If all items share the same item type, emit "N <type>s need
            // <action>". Otherwise generic count.
            const types = [...new Set(group.items.map((i) => i.itemTypeLabel))];
            if (group.items.length === 1) {
              const it = group.items[0];
              return `${it.itemTypeLabel === 'item' ? 'Item' : titleCase(it.itemTypeLabel)} needs ${action}`;
            }
            if (types.length === 1) {
              return `${group.items.length} ${pluralise(types[0], group.items.length)} need ${action}`;
            }
            return `${group.items.length} items need ${action}`;
          };
          return groups.map((group) => {
            const tone = SEVERITY_TONE[group.severity];
            return (
              <details
                key={group.categoryKey}
                style={{
                  background: tone.bg,
                  border: `1px solid ${tone.border}`,
                  borderRadius: 8,
                  padding: '0.45rem 0.65rem',
                }}
              >
                <summary
                  style={{
                    cursor: 'pointer',
                    listStyle: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      display: 'inline-block',
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: tone.dot,
                      flexShrink: 0,
                    }}
                  />
                  <strong style={{ color: tone.text, fontSize: '0.86rem', fontWeight: 600 }}>
                    {buildHeadline(group)}
                  </strong>
                  <span
                    style={{
                      marginLeft: 'auto',
                      color: tone.text,
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase',
                      opacity: 0.8,
                    }}
                  >
                    {tone.label}
                  </span>
                </summary>
                <ul style={{ listStyle: 'none', margin: '0.55rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  {group.items.map((entry, idx) => (
                    <li key={`${entry.blocker.blockerType}-${entry.blocker.itemId || idx}`}>
                      <Link
                        href={entry.blocker.href}
                        style={{
                          color: tone.text,
                          fontSize: '0.82rem',
                          textDecoration: 'none',
                          opacity: 0.92,
                        }}
                      >
                        · {entry.blocker.itemName || titleCase(entry.blocker.blockerType)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </details>
            );
          });
        })()}
      </div>
    </details>
  ) : null;
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
  // The guided step-nav is a junior-staff wizard layered over the same tabs; the
  // 7-card tab row below is the primary navigation. Keep the wizard available but
  // collapsed by default so the two navs don't compete — expand it only when the
  // operator has explicitly entered the flow via a ?step= link.
  const guidedFlowDefaultOpen = QUOTE_WORKSPACE_STEPS.some((entry) => entry.id === resolvedSearchParams?.step);
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
      excursionTemplates={excursionTemplates}
      transportServiceTypes={transportServiceTypes}
      routes={routes}
      routeStandards={routeStandards}
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
                {/* Command-bar money: at-a-glance headline only — Sell (+ Margin% for
                    admin/finance). The full internal breakdown (Cost / Profit / Markup)
                    lives in the sidebar Financial-summary card, so the two displays have
                    distinct roles instead of duplicating Cost/Margin (quote Pass 4). */}
                <div className="quote-command-money" style={{ marginLeft: 'auto', display: 'flex', gap: '1.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                    <span className="eyebrow" style={{ fontSize: '0.6rem' }}>Sell</span>
                    <strong style={{ fontSize: '1.05rem', fontWeight: 700 }}>{quote.quoteCurrency} {Math.round(quote.totalSell).toLocaleString()}</strong>
                  </div>
                  {(session?.role === 'admin' || session?.role === 'super_admin' || session?.role === 'finance' || session?.role === 'agent_admin') ? (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                        <span className="eyebrow" style={{ fontSize: '0.6rem' }}>Margin</span>
                        <strong className="quote-money-margin" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ds-color-success, #067647)' }}>
                          {quote.totalSell > 0 ? Math.round(((quote.totalSell - quote.totalCost) / quote.totalSell) * 100) : 0}%
                        </strong>
                      </div>
                    </>
                  ) : null}
                </div>
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
              {nightsDivergenceWarning ? (
                <p
                  role="alert"
                  style={{
                    margin: '0.6rem 0 0',
                    padding: '0.5rem 0.7rem',
                    background: 'var(--ds-color-danger-surface)',
                    border: '1px solid var(--ds-color-danger-border)',
                    borderRadius: 'var(--ds-radius-sm)',
                    color: 'var(--ds-color-danger)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                  }}
                >
                  ⚠ {nightsDivergenceWarning}
                </p>
              ) : null}
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
              ) : quoteReadOnly ? (
                <button type="button" className="secondary-button" disabled>Convert</button>
              ) : convertBlocked ? (
                // The disabled button signals "blocked"; the full blocker
                // breakdown (conversionBlockerDetails) renders in the sidebar
                // Actions card + review section, so it's NOT repeated inline in
                // the header toolbar — inline it ballooned the action row to
                // ~380px and scattered the buttons (quote-page polish pass 2).
                <button type="button" className="secondary-button" disabled>Convert</button>
              ) : (
                <ConvertToBookingButton quoteId={quote.id} label="Convert" />
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

          {/* Workspace guide — first thing the operator sees on every
              quote. Collapsed by default; one click opens the 5-step
              path through the workspace + same-thing-different-names
              vocabulary disambiguation. Designed for new operators and
              for anyone returning to a quote after a break. */}
          {/* Option C: the four context panels (how-to / journey / readiness /
              pricing) are merged into one collapsed "Quote insights" line so the
              top chrome is a single row by default. Expand to see the panels. */}
          <details
            className="quote-insights-shell"
            style={{
              background: 'var(--rd-surface, #fff)',
              border: '1px solid var(--rd-hairline, #E1E4EA)',
              borderRadius: 10,
              padding: '0.6rem 0.85rem',
              marginBottom: '0.7rem',
            }}
          >
            <summary
              style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}
            >
              <span className="eyebrow">Quote insights</span>
              <span style={{ fontSize: '0.84rem', color: 'var(--rd-ink-muted, #5C6370)' }}>
                {quote.quoteItems.length} service{quote.quoteItems.length === 1 ? '' : 's'} · {quote.quoteCurrency}{' '}
                {Math.round(quote.totalSell).toLocaleString()} sell ·{' '}
                {quote.totalSell > 0 ? Math.round(((quote.totalSell - quote.totalCost) / quote.totalSell) * 100) : 0}% margin
                {reviewBlockingIssues.length > 0 ? ` · ${reviewBlockingIssues.length} check${reviewBlockingIssues.length === 1 ? '' : 's'}` : ''}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: '0.76rem', fontWeight: 600, color: 'var(--rd-ink-faint, #8A909B)' }}>
                How-to · journey · readiness · pricing ▾
              </span>
            </summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', marginTop: '0.7rem' }}>
          <QuoteWorkspaceGuide />

          {/* Journey flow visualization — horizontal city timeline rendered
              from the itinerary days. Heuristic destination extraction;
              compresses consecutive same-city days into one marker with
              night count. Arrival/departure markers frame the trip.
              Reads from the merged readinessQuote.itineraries, which falls
              back to the new quoteItineraryDay records when the legacy
              Itinerary array is empty — older code path only saw the legacy
              model so the journey flow rendered an empty-state on every
              new-model quote even when the day planner had 8 days. */}
          <QuoteJourneyFlow itineraries={readinessQuote.itineraries} />

          {/* Journey highlights — core experiences (activities/excursions)
              pulled out of the quote items into a calm summary card.
              Visually separates "what the guest will do" from operational
              detail in the day cards below. */}
          <QuoteJourneyHighlights items={quote.quoteItems} />

          {/* Operational intelligence overlay — collapsed by default, calm
              commercial-toned. Loads lazily on first expand. */}
          <QuoteOperationalInsights quoteId={quote.id} />

          {/* Pricing audit — calm sage panel that surfaces zero-priced rows,
              math mismatches, currency mix, and margin-floor breaches in
              plain language. Server-rendered; runs on already-loaded quote
              data so it adds no extra fetch. */}
          <QuotePricingAudit
            quoteId={quote.id}
            quoteCurrency={quote.quoteCurrency}
            items={quote.quoteItems}
            pricingMode={quote.pricingMode}
            pricingSlabs={(quote.pricingSlabs || []).map((slab) => ({
              minPax: slab.minPax,
              maxPax: slab.maxPax,
              price: slab.price,
              focPax: (slab as { focPax?: number | null }).focPax ?? null,
              label: (slab as { label?: string | null }).label ?? null,
            }))}
            totalPax={totalPax}
            quoteTotalSell={quote.totalSell}
            quoteTotalCost={quote.totalCost}
          />
            </div>
          </details>

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

          <details className="workspace-section quote-step-shell quote-builder-step-shell" open={guidedFlowDefaultOpen}>
            <summary
              className="quote-step-shell-summary"
              style={{ cursor: 'pointer', listStyle: 'none', display: 'flex', alignItems: 'baseline', gap: '0.75rem', flexWrap: 'wrap' }}
            >
              <span className="eyebrow">Guided Flow</span>
              <strong style={{ fontSize: '1rem' }}>Move quote setup forward step by step</strong>
              <span className={`quote-ui-badge ${reviewBlockingIssues.length > 0 ? 'quote-ui-badge-warning' : 'quote-ui-badge-success'}`}>
                {reviewBlockingIssues.length > 0 ? 'Blocked steps' : 'Flow ready'}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>
                Guided steps ▾
              </span>
            </summary>

            <nav className="quote-step-nav" aria-label="Quote workspace steps" style={{ marginTop: '0.85rem' }}>
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
          </details>

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
          <div className={`quote-builder-layout app-detail-layout quote-builder-layout-${activeTab}`}>
            <div className="section-stack quote-builder-main quote-builder-main-content">

          {activeTab === 'overview' ? (
            <div className="section-stack">
            {/* Consolidation pass 2026-05: removed the
                quote-client-overview-grid which held two cards:
                  - "Trip Highlights" — Journey Highlights (sage panel
                    pinned at the top of the page) already shows the
                    client-facing experiences.
                  - "Featured services" — the Services tab has the full
                    sortable list with edit affordances; this card was
                    just a 5-row preview with no actions, so it became
                    pure noise on a quote with any real service count.
                Operator who wants experiences -> Journey Highlights.
                Operator who wants the full list -> Services tab. */}

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
                        // Hydrate focPax + notes so the Overview-form
                        // POST preserves per-slab FOC counts and notes
                        // configured in Step 5. Without these the slab
                        // payload would arrive with focPax:null + notes:
                        // null on every save and wipe out Step-5 work.
                        focPax: (slab as { focPax?: number | null }).focPax === null || (slab as { focPax?: number | null }).focPax === undefined
                          ? ''
                          : String((slab as { focPax?: number | null }).focPax),
                        notes: (slab as { notes?: string | null }).notes || '',
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
                {/* Consolidation pass 2026-05: removed three cards
                    from this right column:
                      - "Internal / Admin Profit" — the right-sidebar
                        Financial Summary card shows the exact same
                        total sell / cost / profit / margin (and is
                        pinned across every tab, not just Overview).
                      - "Attention" — Pricing Audit + Quote Readiness +
                        Operational Review chips (all sage panels above
                        the day cards) surface the same warnings with
                        better grouping and click-through.
                      - "Segments" — placeholder static text for a
                        future multi-country feature, no actual data. */}
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
              </div>
            </section>
            {guidedStepFooter}
            </div>
          ) : null}

          {activeTab === 'itinerary' && activeStep === 'journey-composer' ? (
            // Guided Quote Builder Maturity Phase v2 — calm,
            // structured journey orchestration view. Renders in
            // place of the advanced service planner when the
            // ?step=journey-composer query param is set. The panel
            // is read-only; operators switch back to advanced via
            // the in-panel button (which uses the URL below).
            <GuidedJourneyComposer
              quote={quote as any}
              advancedWorkspaceUrl={`/quotes/${quote.id}?tab=itinerary&step=itinerary`}
            />
          ) : null}

          {activeTab === 'itinerary' && activeStep !== 'journey-composer' ? (
            <QuoteItineraryWorkspace
              apiBaseUrl={ACTION_API_BASE_URL}
              quote={quote}
              quoteItinerary={quoteItinerary}
              quoteRoomingGroups={quoteRoomingGroups}
              totalPax={totalPax}
              readiness={readiness}
              operationalSidebarTone={operationalSidebarTone}
              assignedPassengerCount={assignedPassengerCount}
              unassignedPassengerCount={unassignedPassengerCount}
              roomingHasWarnings={roomingHasWarnings}
              servicePlanner={renderQuoteServicePlanner()}
              guidedStepFooter={guidedStepFooter}
            />
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
                    <Link
                      href={buildStepHref('pricing')}
                      className={activeStep === 'group-pricing' ? 'secondary-button' : 'primary-button'}
                    >
                      Service prices
                    </Link>
                    <Link
                      href={buildStepHref('group-pricing')}
                      className={activeStep === 'group-pricing' ? 'primary-button' : 'secondary-button'}
                    >
                      Group pricing
                    </Link>
                    <Link href={buildStepHref('preview')} className="secondary-button">
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
                    packageTotalCost={quote.totalCost}
                    costCurrency={quote.quoteCurrency}
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
                      itineraryDays={quote.itineraries.map((day) => ({
                        id: day.id,
                        dayNumber: day.dayNumber,
                        title: day.title,
                      }))}
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

                  {/* Consolidation pass 2/N: removed the "Pricing Check"
                      sidebar that lived here. It repeated Total Sell /
                      Cost / Profit / Margin from the right-rail Financial
                      Summary card. Markup % was promoted into the
                      Financial Summary so operators keep both metrics
                      visible across every tab. Price-per-pax is on the
                      Quote Status card in the same sidebar. Pricing
                      status (X unpriced) is covered by the SummaryStrip
                      directly above the pricing table and by the
                      Pricing Audit panel above the day cards. */}
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
                    <button type="button" className="secondary-button" disabled>
                      Convert to booking
                    </button>
                  ) : convertBlocked ? (
                    <div className="section-stack">
                      <button type="button" className="secondary-button" disabled>
                        Convert to booking
                      </button>
                      {conversionBlockerDetails}
                    </div>
                  ) : (
                    <ConvertToBookingButton quoteId={quote.id} />
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
                  // Markup % promoted from the removed Pricing Check sidebar
                  // (consolidation pass 2/N) so the operator keeps both
                  // margin AND markup visible on every tab, not just Pricing.
                  { label: 'Markup %', value: formatMarginPercent(quoteMarkupPercent), helper: 'Profit / cost' },
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
                    ) : quoteReadOnly ? (
                      <button type="button" className="primary-button" disabled>Convert</button>
                    ) : convertBlocked ? (
                      <div className="section-stack">
                        <button type="button" className="primary-button" disabled>Convert blocked</button>
                        {conversionBlockerDetails}
                      </div>
                    ) : (
                      <ConvertToBookingButton quoteId={quote.id} />
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
