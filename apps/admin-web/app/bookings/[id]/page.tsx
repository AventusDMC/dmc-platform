import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminBackButton } from '../../components/AdminBackButton';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { AdminHeaderActions } from '../../components/AdminHeaderActions';
import { AdvancedFiltersPanel } from '../../components/AdvancedFiltersPanel';
import { CollapsibleCreatePanel } from '../../components/CollapsibleCreatePanel';
import { InlineRowEditorShell } from '../../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../../components/RowDetailsPanel';
import { SummaryStrip } from '../../components/SummaryStrip';
import { TableSectionShell } from '../../components/TableSectionShell';
import { BookingAlertPanel } from './BookingAlertPanel';
import { getMarginColor, getMarginMetrics } from '../../lib/financials';
import { getItineraryDayDisplay } from '../../lib/itineraryDayDisplay';
import { formatNightCountLabel } from '../../lib/formatters';
import { BookingOperationsEmptyState } from './BookingOperationsEmptyState';
import { BookingOperationsStatusBadge } from './BookingOperationsStatusBadge';
import { BookingDocumentActions } from './BookingDocumentActions';
import { BookingFeedbackBannerCleanup } from './BookingFeedbackBannerCleanup';
import { DeleteOperationButton } from './DeleteOperationButton';
import { BookingServiceVoucherDownloadButton } from './BookingServiceVoucherDownloadButton';
import { BookingRoomingSummaryCard } from './BookingRoomingSummaryCard';
import { BookingServiceTimeline } from './BookingServiceTimeline';
import { BookingPortalLinkActions } from './BookingPortalLinkActions';
import { BookingFinancialsTab } from './BookingFinancialsTab';
import { type BookingPaymentRecord } from './BookingPaymentsSection';
import { CancelBookingButton } from './CancelBookingButton';
import { AmendBookingButton } from './AmendBookingButton';

import { isBackendUuid } from '../../lib/backend-uuid';
import { ADMIN_API_BASE_URL, adminPageFetchJson, getPublicAppBaseUrl } from '../../lib/admin-server';

function getDisplayableSupplierName(value: string | null | undefined) {
  // Defensive: historically a buggy resolver could write a supplier *id* into the
  // supplier *name* column when the id failed to lookup. Hide UUID-shaped values
  // so the operator sees "Not assigned" + the unresolved badge instead of a raw UUID.
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed && !isBackendUuid(trimmed) ? trimmed : null;
}

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';
const APP_BASE_URL = getPublicAppBaseUrl();

type BookingStatus = 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
type BookingType = 'FIT' | 'GROUP' | 'SERIES';
type ClientInvoiceStatus = 'unbilled' | 'invoiced' | 'paid';
type SupplierPaymentStatus = 'unpaid' | 'scheduled' | 'paid';
type AuditEntityType = 'booking' | 'booking_service';
type SupplierConfirmationStatus = 'NOT_SENT' | 'REQUESTED' | 'SENT' | 'ACKNOWLEDGED' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

type AuditLog = {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  actorUserId?: string | null;
  actor: string | null;
  createdAt: string;
};

type TimelineEntry = {
  id: string;
  title: string;
  detail: string | null;
  note: string | null;
  actor: string | null;
  createdAt: string;
};

type Company = {
  id: string;
  name: string;
};

type Contact = {
  id: string;
  title?: string | null;
  firstName: string;
  lastName: string;
  email?: string | null;
};

type Supplier = {
  id: string;
  name: string;
  type: 'hotel' | 'transport' | 'activity' | 'guide' | 'other';
};

type Guide = {
  id: string;
  fullName: string;
  languages: string[];
  regions: string[];
  phone: string | null;
  active: boolean;
  guideType: string;
};

type Restaurant = {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  cuisineType: string | null;
  capacity: number | null;
  mealTypes: string[];
  active: boolean;
  halalSupport: boolean;
  vegetarianSupport: boolean;
  veganSupport: boolean;
};

type Vehicle = {
  id: string;
  supplierId: string;
  name: string;
  maxPax: number;
};

type TransportRoute = {
  id: string;
  name: string;
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

type QuoteItem = {
  id: string;
  itineraryId: string | null;
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
  seasonName: string | null;
  roomCategoryId: string | null;
  occupancyType: 'SGL' | 'DBL' | 'TPL' | null;
  mealPlan: 'BB' | 'HB' | 'FB' | null;
  quantity: number;
  baseCost: number;
  overrideCost: number | null;
  useOverride: boolean;
  unitCost?: number;
  currency: string;
  pricingDescription: string | null;
  totalSell: number;
  service: {
    id: string;
    name: string;
    category: string;
  };
  appliedVehicleRate: {
    id: string;
    routeName: string;
    vehicle: {
      name: string;
    };
    serviceType: {
      name: string;
    };
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

type QuoteOption = {
  id: string;
  name: string;
  notes: string | null;
  totalSell: number;
  pricePerPax: number;
  quoteItems: QuoteItem[];
};

type QuoteScenario = {
  id: string;
  paxCount: number;
  totalSell: number;
  pricePerPax: number;
};

type QuoteSnapshot = {
  id: string;
  quoteNumber?: string | null;
  bookingType?: BookingType | null;
  title: string;
  description: string | null;
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  travelStartDate: string | null;
  totalCost?: number | null;
  totalSell: number;
  pricePerPax: number;
  company: Company;
  contact: Contact;
  itineraries: Itinerary[];
  quoteItems: QuoteItem[];
  quoteOptions: QuoteOption[];
  scenarios: QuoteScenario[];
};

type ServiceVoucher = {
  id: string;
  bookingServiceId: string;
  type: 'TRANSPORT' | 'EXCURSION' | 'HOTEL' | 'GUIDE' | 'ACTIVITY' | 'EXTERNAL_PACKAGE';
  supplierId: string | null;
  status: 'DRAFT' | 'READY' | 'SENT' | 'ISSUED' | 'CANCELLED';
  issuedAt: string | null;
  notes: string | null;
  supplier?: Supplier | null;
  bookingService?: {
    id: string;
    description: string;
    serviceType: string;
  } | null;
};

type Booking = {
  sourceQuoteId: string;
  id: string;
  bookingRef?: string | null;
  accessToken: string;
  bookingType: BookingType;
  amendmentNumber: number;
  amendedFromId: string | null;
  isLatestAmendment?: boolean;
  status: BookingStatus;
  statusNote: string | null;
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  createdAt: string;
  updatedAt: string;
  snapshotJson: QuoteSnapshot;
  clientSnapshotJson: Company;
  brandSnapshotJson: Company | null;
  contactSnapshotJson: Contact;
  itinerarySnapshotJson: Itinerary[];
  pricingSnapshotJson: {
    totalCost?: number | null;
    totalSell: number | null;
    pricePerPax: number | null;
  };
  invoiceDelivery?: {
    sentAt: string | null;
    sentTo: string | null;
  };
  paymentReminderDelivery?: {
    sentAt: string | null;
    sentTo: string | null;
  };
  paymentReminderAutomation?: {
    reminderCount: number;
    lastReminderAt: string | null;
    nextReminderDueAt: string | null;
    autoActive: boolean;
    stage: 'gentle' | 'firm' | 'urgent';
  };
  paymentProofSubmission?: {
    reference: string | null;
    amount: number | null;
    receiptUrl: string | null;
    submittedAt: string | null;
  } | null;
  finance: {
    quotedTotalSell: number;
    quotedTotalCost: number;
    quotedMargin: number;
    quotedMarginPercent: number;
    realizedTotalSell: number;
    realizedTotalCost: number;
    realizedMargin: number;
    realizedMarginPercent: number;
    totalSell?: number;
    depositsReceived?: number;
    remainingBalance?: number;
    clientPaymentStatus?: 'unpaid' | 'deposit_paid' | 'partially_paid' | 'paid';
    supplierPayableStatus?: 'unpaid' | 'partially_paid' | 'paid';
    clientInvoiceStatus: ClientInvoiceStatus;
    supplierPaymentStatus: SupplierPaymentStatus;
    hasLowMargin: boolean;
    hasUnpaidClientBalance: boolean;
    hasUnpaidSupplierObligation: boolean;
    overdueClientPaymentsCount: number;
    overdueSupplierPaymentsCount: number;
    hasOverdueClientPayments: boolean;
    hasOverdueSupplierPayments: boolean;
    badge: {
      count: number;
      tone: 'error' | 'warning' | 'none';
      breakdown: {
        unpaidClient: number;
        unpaidSupplier: number;
        negativeMargin: number;
        lowMargin: number;
        overdueClient: number;
        overdueSupplier: number;
      };
    };
  };
  payments: BookingPaymentRecord[];
  operations: {
    badge: {
      count: number;
      tone: 'error' | 'warning' | 'none';
      breakdown: {
        pendingConfirmations: number;
        missingExecutionDetails: number;
        reconfirmationDue: number;
      };
    };
  };
  rooming: {
    badge: {
      count: number;
      tone: 'error' | 'warning' | 'none';
      breakdown: {
        unassignedPassengers: number;
        unassignedRooms: number;
        occupancyIssues: number;
      };
    };
  };
  operationalReadiness?: {
    status: 'ready' | 'warning' | 'critical' | 'pending';
    label: string;
    summary: {
      rooming: {
        complete: boolean;
        status: 'ready' | 'warning' | 'critical' | 'pending';
        issues: {
          unassignedPassengers: number;
          unassignedRooms: number;
          occupancyIssues: number;
        };
      };
      pricing: {
        unresolved: number;
        status: 'ready' | 'warning' | 'critical' | 'pending';
      };
      transport: {
        missing: number;
        status: 'ready' | 'warning' | 'critical' | 'pending';
      };
      vouchers: {
        eligible: number;
        issued: number;
        draft: number;
        missing: number;
        status: 'ready' | 'warning' | 'critical' | 'pending';
      };
      passengers: {
        expected: number;
        received: number;
        missingRecords: number;
        unassigned: number;
        status: 'ready' | 'warning' | 'critical' | 'pending';
      };
      excursions: {
        incomplete: number;
        status: 'ready' | 'warning' | 'critical' | 'pending';
      };
    };
    counters: {
      passengers: number;
      expectedPassengers: number;
      roomGroups: number;
      vouchers: number;
      unresolvedItems: number;
      optionalItemsNotSelected: number;
    };
    dayReadiness: Array<{
      id: string;
      dayNumber: number;
      title: string;
      date: string | null;
      status: 'ready' | 'warning' | 'incomplete' | 'pending';
      serviceCount: number;
      issueCount: number;
      issues: string[];
    }>;
    sections: Array<{
      title: string;
      status: 'ready' | 'warning' | 'critical' | 'pending';
      count: number;
      issues: string[];
    }>;
  };
  days?: Array<{
    id: string;
    dayNumber: number;
    date: string | null;
    title: string;
    notes: string | null;
    status: 'PENDING' | 'CONFIRMED' | 'DONE';
  }>;
  services: Array<{
    id: string;
    bookingDayId?: string | null;
    description: string;
    qty: number;
    totalCost: number;
    totalSell: number;
    supplierPayableAmount?: number | null;
    supplierPayableStatus?: 'unpaid' | 'partially_paid' | 'paid' | string | null;
    supplierPaymentNotes?: string | null;
    supplierId: string | null;
    supplierName: string | null;
    supplierStatus?: 'unresolved' | null;
    activityId?: string | null;
    activity?: {
      id: string;
      name: string;
      description: string | null;
      durationMinutes?: number | null;
      active?: boolean;
    } | null;
    serviceType: string;
    operationType?: 'TRANSPORT' | 'GUIDE' | 'HOTEL' | 'ACTIVITY' | 'DINING' | 'SERVICE' | 'EXTERNAL_PACKAGE' | null;
    operationStatus?: 'PENDING' | 'REQUESTED' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED' | 'VOUCHER_SENT' | 'COMPLETED' | 'DONE';
    referenceId?: string | null;
    assignedTo?: string | null;
    guidePhone?: string | null;
    guideId?: string | null;
    guideConfirmationStatus?: string | null;
    guideRequiredLanguages?: string[];
    guideReportingTime?: string | null;
    guide?: Guide | null;
    guideWarnings?: string[];
    restaurantId?: string | null;
    restaurant?: Restaurant | null;
    mealConfirmationStatus?: string | null;
    mealTiming?: string | null;
    mealSeatingNotes?: string | null;
    mealDietaryRequirements?: string[];
    mealOperationalNotes?: string | null;
    mealWarnings?: string[];
    vehicleId?: string | null;
    vehicle?: {
      id: string;
      name: string;
      maxPax?: number | null;
    } | null;
    touringRouteId?: string | null;
    touringRoutePricingId?: string | null;
    touringRoute?: {
      id: string;
      code?: string | null;
      name: string;
      startCity?: string | null;
    } | null;
    touringRoutePricing?: {
      id: string;
      currency: string;
      baseCost: number;
      minPax: number;
      maxPax: number;
      supplier?: Supplier | null;
      vehicle?: Vehicle | null;
    } | null;
    serviceDate: string | null;
    startTime: string | null;
    pickupTime: string | null;
    pickupLocation: string | null;
    meetingPoint: string | null;
    participantCount: number | null;
    adultCount: number | null;
    childCount: number | null;
    supplierReference: string | null;
    reconfirmationRequired: boolean;
    reconfirmationDueAt: string | null;
    operationalNotes?: string | null;
    notes: string | null;
    status: 'pending' | 'ready' | 'in_progress' | 'confirmed' | 'cancelled';
    statusNote: string | null;
    confirmationStatus: 'pending' | 'requested' | 'confirmed';
    confirmationNumber: string | null;
    confirmationNotes: string | null;
    confirmationRequestedAt: string | null;
    confirmationConfirmedAt: string | null;
    supplierConfirmationStatus: SupplierConfirmationStatus;
    confirmationSentAt: string | null;
    supplierConfirmedAt: string | null;
    supplierRemarks: string | null;
    confirmationDeadline: string | null;
    lastSupplierContactAt: string | null;
    sourceMetadata?: {
      hotelReservation?: {
        status?: string | null;
        blockedRoomCount?: number | null;
        roomTypes?: string[];
        releaseDate?: string | null;
        reconfirmationDueDate?: string | null;
        notes?: string | null;
        primaryHotelName?: string | null;
        alternativeHotels?: Array<{
          name?: string | null;
          status?: string | null;
          notes?: string | null;
        }>;
        roomingSentAt?: string | null;
      };
    } | null;
    vouchers?: ServiceVoucher[];
    auditLogs: AuditLog[];
  }>;
  vouchers?: ServiceVoucher[];
  passengers: Array<{
    id: string;
    fullName: string | null;
    firstName: string;
    lastName: string;
    title: string | null;
    gender: string | null;
    dateOfBirth: string | null;
    nationality: string | null;
    passportNumberMasked: string | null;
    passportIssueDate: string | null;
    passportExpiryDate: string | null;
    arrivalFlight: string | null;
    departureFlight: string | null;
    entryPoint: string | null;
    visaStatus: string | null;
    emergencyContactName: string | null;
    emergencyContactPhone: string | null;
    roomingNotes: string | null;
    isLead: boolean;
    notes: string | null;
    roomingAssignments: Array<{
      bookingRoomingEntryId: string;
    }>;
  }>;
  roomingEntries: Array<{
    id: string;
    roomType: string | null;
    occupancy: 'single' | 'double' | 'triple' | 'quad' | 'unknown';
    notes: string | null;
    sortOrder: number;
    assignments: Array<{
      id: string;
      bookingPassenger: {
        id: string;
        firstName: string;
        lastName: string;
        title: string | null;
        isLead: boolean;
      };
    }>;
  }>;
  auditLogs: AuditLog[];
  quote: {
    id: string;
    quoteNumber?: string | null;
    title: string;
    status: string;
    company: Company;
    contact: Contact;
    agent?: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      email?: string | null;
      name?: string | null;
    } | null;
  };
  acceptedVersion: {
    id: string;
    quoteId: string;
    versionNumber: number;
    label: string | null;
    createdAt: string;
    snapshotJson: QuoteSnapshot;
  };
};

type BookingPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    created?: string;
    tab?:
      | 'overview'
      | 'itinerary'
      | 'operations'
      | 'services'
      | 'passengers-rooming'
      | 'passengers'
      | 'rooming'
      | 'finance'
      | 'financials'
      | 'documents'
      | 'timeline'
      | 'audit-log';
    service?: string;
    warning?: string;
    warningText?: string;
    success?: string;
    error?: string;
  }>;
};

type BookingDetailTab = 'overview' | 'itinerary' | 'services' | 'passengers' | 'rooming' | 'financials' | 'documents' | 'audit-log';

const BOOKING_ROUTE_TABS: BookingDetailTab[] = ['overview', 'itinerary', 'services', 'passengers', 'rooming', 'financials', 'documents', 'audit-log'];

const BOOKING_DASHBOARD_TABS: Array<{ id: BookingDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'itinerary', label: 'Itinerary' },
  { id: 'passengers', label: 'Passengers' },
  { id: 'rooming', label: 'Rooming' },
  { id: 'services', label: 'Operations' },
  { id: 'documents', label: 'Documents' },
  { id: 'audit-log', label: 'Internal Notes' },
];

const ROOMING_GROUP_OPTIONS: Array<{ code: string; label: string; occupancy: Booking['roomingEntries'][number]['occupancy'] }> = [
  { code: 'SGL', label: 'SGL', occupancy: 'single' },
  { code: 'DBL', label: 'DBL', occupancy: 'double' },
  { code: 'TWN', label: 'TWN', occupancy: 'double' },
  { code: 'TRPL', label: 'TRPL', occupancy: 'triple' },
  { code: 'CWB', label: 'Child with bed', occupancy: 'single' },
  { code: 'CNB', label: 'Child no bed', occupancy: 'single' },
];

async function getBooking(id: string): Promise<Booking | null> {
  try {
    return await adminPageFetchJson<Booking>(`/api/bookings/${id}`, 'Booking', {
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Booking API failed: 404')) {
      return null;
    }

    throw error;
  }
}

async function getSuppliers(): Promise<Supplier[]> {
  return adminPageFetchJson<Supplier[]>('/api/suppliers', 'Suppliers', {
    cache: 'no-store',
  });
}

async function getGuides(): Promise<Guide[]> {
  return adminPageFetchJson<Guide[]>('/api/guides', 'Guides', {
    cache: 'no-store',
  });
}

async function getRestaurants(): Promise<Restaurant[]> {
  return adminPageFetchJson<Restaurant[]>('/api/restaurants', 'Restaurants', {
    cache: 'no-store',
  });
}

async function getVehicles(): Promise<Vehicle[]> {
  return adminPageFetchJson<Vehicle[]>('/api/vehicles', 'Vehicles', {
    cache: 'no-store',
  });
}

async function getRoutes(): Promise<TransportRoute[]> {
  return adminPageFetchJson<TransportRoute[]>('/api/routes?active=true&type=transfer', 'Routes', {
    cache: 'no-store',
  });
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

function formatBookingStatus(status: BookingStatus) {
  return status
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatBookingServiceStatus(status?: 'pending' | 'ready' | 'in_progress' | 'confirmed' | 'cancelled') {
  if (!status) return 'Pending';
  return status
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatBookingType(value: BookingType) {
  return value;
}

function formatConfirmationStatus(status?: 'pending' | 'requested' | 'confirmed') {
  if (!status) return 'Pending';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatSupplierConfirmationStatus(status?: SupplierConfirmationStatus) {
  if (!status) return 'Not sent';
  return status
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatReadinessStatus(status: 'ready' | 'warning' | 'critical' | 'pending' | 'incomplete') {
  if (status === 'ready') return 'Ready';
  if (status === 'critical') return 'Critical';
  if (status === 'warning') return 'Warning';
  if (status === 'incomplete') return 'Incomplete';
  return 'Pending';
}

function formatClientInvoiceStatus(status: ClientInvoiceStatus) {
  if (status === 'unbilled') {
    return 'Unbilled';
  }

  if (status === 'invoiced') {
    return 'Invoiced';
  }

  return 'Paid';
}

function formatSupplierPaymentStatus(status: SupplierPaymentStatus) {
  if (status === 'unpaid') {
    return 'Unpaid';
  }

  if (status === 'scheduled') {
    return 'Scheduled';
  }

  return 'Paid';
}

function formatRoomOccupancy(value: 'single' | 'double' | 'triple' | 'quad' | 'unknown') {
  if (value === 'unknown') {
    return 'Unknown';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeRoomingCode(value?: string | null) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function getRoomGroupCode(entry: { roomType: string | null; occupancy: 'single' | 'double' | 'triple' | 'quad' | 'unknown' }) {
  const code = normalizeRoomingCode(entry.roomType);

  if (['sgl', 'single'].includes(code)) return 'SGL';
  if (['dbl', 'double'].includes(code)) return 'DBL';
  if (['twn', 'twin'].includes(code)) return 'TWN';
  if (['trpl', 'triple'].includes(code)) return 'TRPL';
  if (['child_with_bed', 'cwb'].includes(code)) return 'CWB';
  if (['child_no_bed', 'cnb'].includes(code)) return 'CNB';
  if (entry.occupancy === 'single') return 'SGL';
  if (entry.occupancy === 'double') return 'DBL';
  if (entry.occupancy === 'triple') return 'TRPL';

  return 'OTHER';
}

function getRoomOccupancyCapacity(value: 'single' | 'double' | 'triple' | 'quad' | 'unknown', roomType?: string | null) {
  const roomingCode = normalizeRoomingCode(roomType);

  if (['sgl', 'single', 'child_with_bed', 'cwb', 'child_no_bed', 'cnb'].includes(roomingCode)) {
    return 1;
  }

  if (['dbl', 'double', 'twn', 'twin'].includes(roomingCode)) {
    return 2;
  }

  if (['trpl', 'triple'].includes(roomingCode)) {
    return 3;
  }

  if (value === 'single') {
    return 1;
  }

  if (value === 'double') {
    return 2;
  }

  if (value === 'triple') {
    return 3;
  }

  if (value === 'quad') {
    return 4;
  }

  return null;
}

function getRoomLabel(entry: { roomType: string | null; sortOrder: number }) {
  return entry.roomType || `Room ${entry.sortOrder}`;
}

function formatPassengerName(passenger: { title?: string | null; firstName: string; lastName: string }) {
  return [passenger.title, passenger.firstName, passenger.lastName].filter(Boolean).join(' ').trim();
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return 'Not set';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}

function formatAuditAction(action: string) {
  return action
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function getAllowedBookingStatusTransitions(status: BookingStatus): BookingStatus[] {
  if (status === 'draft') {
    return ['confirmed', 'cancelled'];
  }

  if (status === 'confirmed') {
    return ['in_progress', 'cancelled'];
  }

  if (status === 'in_progress') {
    return ['completed', 'cancelled'];
  }

  return [];
}

function buildBookingTimeline(booking: Booking): TimelineEntry[] {
  const bookingEntries = booking.auditLogs.map((auditLog) => ({
    id: `booking-${auditLog.id}`,
    title: formatAuditAction(auditLog.action),
    detail:
      auditLog.oldValue || auditLog.newValue ? `${auditLog.oldValue || '-'} to ${auditLog.newValue || '-'}` : null,
    note: auditLog.note,
    actor: auditLog.actor,
    createdAt: auditLog.createdAt,
  }));

  const serviceEntries = booking.services.flatMap((service) =>
    (service.auditLogs || []).map((auditLog) => ({
      id: `service-${auditLog.id}`,
      title: `${service.description}: ${formatAuditAction(auditLog.action)}`,
      detail:
        auditLog.oldValue || auditLog.newValue ? `${auditLog.oldValue || '-'} to ${auditLog.newValue || '-'}` : null,
      note: auditLog.note,
      actor: auditLog.actor,
      createdAt: auditLog.createdAt,
    })),
  );

  return [...bookingEntries, ...serviceEntries]
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
    .slice(0, 18);
}

function renderFeedbackMessage(message: string, className: 'form-error' | 'form-helper') {
  return message
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => (
      <p key={`${className}-${index}-${line}`} className={className}>
        {line}
      </p>
    ));
}

function getItemSummary(item: QuoteItem) {
  let summary = '';

  if (item.hotel && item.contract && item.seasonName && item.roomCategory && item.occupancyType && item.mealPlan) {
    summary = `${item.hotel.name} | ${item.contract.name} | ${item.seasonName} | ${item.roomCategory.name} | ${item.occupancyType} / ${item.mealPlan}`;
  } else if (item.appliedVehicleRate) {
    summary = `${item.appliedVehicleRate.routeName} | ${item.appliedVehicleRate.vehicle.name} | ${item.appliedVehicleRate.serviceType.name}`;
  } else {
    const finalCost =
      item.useOverride && item.overrideCost !== null ? item.overrideCost : (item.baseCost ?? item.unitCost ?? 0);
    summary = item.pricingDescription || `Qty ${item.quantity} at ${formatMoney(finalCost, item.currency)}`;
  }

  if (item.useOverride && item.overrideCost !== null) {
    return `${summary} | Override active`;
  }

  return summary;
}

function resolveQuoteItemServiceDate(
  travelStartDate: string | null,
  itineraries: Itinerary[],
  item: Pick<QuoteItem, 'serviceDate' | 'itineraryId'>,
) {
  if (item.serviceDate) {
    return item.serviceDate;
  }

  if (!travelStartDate || !item.itineraryId) {
    return null;
  }

  const itinerary = itineraries.find((day) => day.id === item.itineraryId);

  if (!itinerary) {
    return null;
  }

  const resolvedDate = new Date(travelStartDate);
  resolvedDate.setUTCDate(resolvedDate.getUTCDate() + (itinerary.dayNumber - 1));

  return resolvedDate.toISOString();
}

function renderServices(items: QuoteItem[], emptyLabel: string, snapshot: Pick<QuoteSnapshot, 'travelStartDate' | 'itineraries'>) {
  if (items.length === 0) {
    return <p className="empty-state">{emptyLabel}</p>;
  }

  return (
    <div className="quote-preview-service-list">
      {items.map((item) => (
        <article key={item.id} className="quote-preview-service-row">
          <div>
            <strong>{item.service.name}</strong>
            <p>
              {item.service.category} | {getItemSummary(item)}
            </p>
            {resolveQuoteItemServiceDate(snapshot.travelStartDate, snapshot.itineraries, item) ||
            item.startTime ||
            item.pickupTime ||
            item.pickupLocation ||
            item.meetingPoint ||
            item.participantCount !== null ||
            item.reconfirmationRequired ? (
              <div>
                <p>
                  {[
                    resolveQuoteItemServiceDate(snapshot.travelStartDate, snapshot.itineraries, item)
                      ? `Date ${new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(resolveQuoteItemServiceDate(snapshot.travelStartDate, snapshot.itineraries, item)!))}`
                      : null,
                    item.startTime ? `Start ${item.startTime}` : null,
                    item.pickupTime ? `Pickup ${item.pickupTime}` : null,
                  ]
                    .filter(Boolean)
                    .join(' | ')}
                </p>
                {(item.pickupLocation || item.meetingPoint) ? (
                  <p>
                    {[item.pickupLocation ? `Pickup ${item.pickupLocation}` : null, item.meetingPoint ? `Meeting ${item.meetingPoint}` : null]
                      .filter(Boolean)
                      .join(' | ')}
                  </p>
                ) : null}
                {(item.participantCount !== null || item.adultCount !== null || item.childCount !== null) ? (
                  <p>
                    {[item.participantCount !== null ? `${item.participantCount} pax` : null, item.adultCount !== null ? `${item.adultCount} adults` : null, item.childCount !== null ? `${item.childCount} children` : null]
                      .filter(Boolean)
                      .join(' | ')}
                  </p>
                ) : null}
                {item.reconfirmationRequired ? (
                  <p>
                    Reconfirmation required
                    {item.reconfirmationDueAt ? ` | Due ${formatDateTime(item.reconfirmationDueAt)}` : ''}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
          <strong>{formatMoney(item.totalSell, item.currency)}</strong>
        </article>
      ))}
    </div>
  );
}

function buildBadgeTooltip(
  entries: Array<{
    count: number;
    label: string;
  }>,
) {
  return entries
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.label}`)
    .join('\n');
}

function formatOperationType(value?: string | null) {
  if (!value) return 'Activity';
  return value
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(' ');
}

function formatOperationStatus(value?: string | null) {
  if (!value) return 'Pending';
  return value
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function getServiceVehicleName(service: Booking['services'][number]) {
  return service.vehicle?.name || service.touringRoutePricing?.vehicle?.name || null;
}

function getServicePaxCount(service: Booking['services'][number], booking: Booking) {
  const explicitPax = service.participantCount ?? ((service.adultCount ?? 0) + (service.childCount ?? 0));
  return explicitPax || booking.adults + booking.children;
}

function getVoucherReadinessLabel(service: Booking['services'][number]) {
  const vouchers = service.vouchers || [];
  if (vouchers.some((voucher) => voucher.status === 'SENT' || voucher.status === 'ISSUED')) return 'Voucher sent';
  if (vouchers.some((voucher) => voucher.status === 'READY')) return 'Voucher ready';
  if (vouchers.some((voucher) => voucher.status === 'DRAFT')) return 'Draft voucher';
  if (service.operationStatus === 'VOUCHER_SENT') return 'Voucher sent';
  return service.supplierId || service.supplierName ? 'Ready to generate' : 'Supplier pending';
}

function getServiceCostSellLabel(service: Booking['services'][number]) {
  return {
    cost: formatMoney(service.totalCost),
    sell: formatMoney(service.totalSell),
  };
}

function renderOperationTypeOptions(defaultValue?: string | null) {
  return (
    <select name="type" defaultValue={defaultValue || 'TRANSPORT'} required>
      <option value="TRANSPORT">Transport</option>
      <option value="GUIDE">Guide</option>
      <option value="DINING">Dining / Meal</option>
      <option value="HOTEL">Hotel</option>
      <option value="ACTIVITY">Activity</option>
      <option value="SERVICE">Service supplier</option>
      <option value="EXTERNAL_PACKAGE">External package</option>
    </select>
  );
}

function renderOperationStatusOptions(defaultValue?: string | null) {
  return (
    <select name="status" defaultValue={defaultValue || 'PENDING'}>
      <option value="PENDING">Pending</option>
      <option value="REQUESTED">Requested</option>
      <option value="CONFIRMED">Confirmed</option>
      <option value="REJECTED">Rejected</option>
      <option value="CANCELLED">Cancelled</option>
      <option value="VOUCHER_SENT">Voucher Sent</option>
      <option value="COMPLETED">Completed</option>
    </select>
  );
}

function renderRouteOptions(routes: TransportRoute[], defaultValue?: string | null) {
  return (
    <select name="referenceId" defaultValue={defaultValue || ''}>
      <option value="">Select route</option>
      {routes.map((route) => (
        <option key={route.id} value={route.id}>
          {route.name}
        </option>
      ))}
    </select>
  );
}

function renderVehicleOptions(vehicles: Vehicle[], defaultValue?: string | null) {
  return (
    <select name="vehicleId" defaultValue={defaultValue || ''}>
      <option value="">Select vehicle</option>
      {vehicles.map((vehicle) => (
        <option key={vehicle.id} value={vehicle.id}>
          {vehicle.name} ({vehicle.maxPax} pax)
        </option>
      ))}
    </select>
  );
}

function renderSupplierOptions(suppliers: Supplier[], defaultValue?: string | null) {
  return (
    <select name="supplierId" defaultValue={defaultValue || ''}>
      <option value="">No supplier</option>
      {suppliers.map((supplier) => (
        <option key={supplier.id} value={supplier.id}>
          {supplier.name}
        </option>
      ))}
    </select>
  );
}

type BookingOperationRow = Booking['services'][number];

function getOperationEditorType(service: Pick<BookingOperationRow, 'operationType' | 'serviceType'>) {
  const type = String(service.operationType || service.serviceType || 'SERVICE').toUpperCase();
  if (type === 'TRANSPORT' || type === 'HOTEL' || type === 'ACTIVITY' || type === 'GUIDE' || type === 'TICKET') {
    return type;
  }
  return 'SERVICE';
}

function getOperationEditorHeading(editorType: string) {
  const headings: Record<string, string> = {
    TRANSPORT: 'Transport operation details',
    HOTEL: 'Hotel operation details',
    ACTIVITY: 'Activity operation details',
    GUIDE: 'Guide operation details',
    TICKET: 'Ticket operation details',
    SERVICE: 'Service details',
  };

  return headings[editorType] || 'Service details';
}

function renderOperationalDateInput(service: BookingOperationRow) {
  return (
    <label>
      Operational date
      <input type="date" name="serviceDate" defaultValue={service.serviceDate ? service.serviceDate.slice(0, 10) : ''} />
    </label>
  );
}

function renderCommonOperationFields(service: BookingOperationRow) {
  return (
    <>
      <label>
        Confirmation
        <input type="text" name="confirmationReference" defaultValue={service.confirmationNumber || service.supplierReference || ''} />
      </label>
      <label>
        Confirmation status
        <select name="supplierConfirmationStatus" defaultValue={service.supplierConfirmationStatus || 'NOT_SENT'}>
          {['NOT_SENT', 'REQUESTED', 'CONFIRMED', 'REJECTED'].map((status) => (
            <option key={status} value={status}>{formatSupplierConfirmationStatus(status as SupplierConfirmationStatus)}</option>
          ))}
        </select>
      </label>
      <label>
        Confirmation notes
        <input type="text" name="confirmationNotes" defaultValue={service.confirmationNotes || service.supplierRemarks || ''} />
      </label>
      <label>
        Status
        {renderOperationStatusOptions(service.operationStatus)}
      </label>
      <label>
        Notes
        <input type="text" name="operationalNotes" defaultValue={service.operationalNotes || service.notes || ''} />
      </label>
    </>
  );
}

function renderOperationTypeAwareEditor(
  booking: Booking,
  day: NonNullable<Booking['days']>[number],
  service: BookingOperationRow,
  suppliers: Supplier[],
  vehicles: Vehicle[],
  transportRoutes: TransportRoute[],
) {
  const editorType = getOperationEditorType(service);

  return (
    <details className={`operations-row-details booking-operation-editor booking-operation-editor-${editorType.toLowerCase()}`}>
      <summary>{getOperationEditorHeading(editorType)}</summary>
      <form action={`/api/bookings/${booking.id}/days/${day.id}/services/${service.id}`} method="POST" className="quote-status-form operation-type-editor-form">
        <input type="hidden" name="bookingId" value={booking.id} />
        <input type="hidden" name="operationId" value={service.id} />
        <input type="hidden" name="type" value={editorType} />
        <div className="operation-type-editor-header">
          <strong>{formatOperationType(editorType)}</strong>
          <span>{service.description}</span>
        </div>

        {editorType === 'TRANSPORT' ? (
          <>
            <label>
              Route
              {renderRouteOptions(transportRoutes, service.referenceId)}
            </label>
            <label>
              Vehicle
              {renderVehicleOptions(vehicles, service.vehicleId)}
            </label>
            <label>
              Driver
              <input type="text" name="assignedTo" defaultValue={service.assignedTo || ''} />
            </label>
            <label>
              Pickup time
              <input type="time" name="pickupTime" defaultValue={service.pickupTime || ''} />
            </label>
            <label>
              Supplier
              {renderSupplierOptions(suppliers, service.supplierId)}
            </label>
            <input type="hidden" name="assignmentStatus" value={service.supplierId ? 'ASSIGNED' : 'UNASSIGNED'} />
            {renderCommonOperationFields(service)}
          </>
        ) : null}

        {editorType === 'HOTEL' ? (
          <>
            <label>
              Hotel supplier
              {renderSupplierOptions(suppliers, service.supplierId)}
            </label>
            <input type="hidden" name="assignmentStatus" value={service.supplierId ? 'ASSIGNED' : 'UNASSIGNED'} />
            {renderOperationalDateInput(service)}
            <label>
              Check-in time
              <input type="time" name="startTime" defaultValue={service.startTime || service.pickupTime || ''} />
            </label>
            <div className="form-helper">
              Rooming summary: {booking.rooming.badge.breakdown.unassignedRooms > 0 ? `${booking.rooming.badge.breakdown.unassignedRooms} rooms need review` : 'Rooming shell available'}
            </div>
            <div className="form-helper">
              Occupancy: {booking.rooming.badge.breakdown.occupancyIssues > 0 ? `${booking.rooming.badge.breakdown.occupancyIssues} occupancy issues` : `${booking.roomCount} rooms expected`}
            </div>
            {renderCommonOperationFields(service)}
          </>
        ) : null}

        {editorType === 'ACTIVITY' ? (
          <>
            {renderOperationalDateInput(service)}
            <label>
              Start time
              <input type="time" name="startTime" defaultValue={service.startTime || ''} />
            </label>
            <label>
              Pickup time
              <input type="time" name="pickupTime" defaultValue={service.pickupTime || ''} />
            </label>
            <label>
              Meeting point
              <input type="text" name="meetingPoint" defaultValue={service.meetingPoint || service.pickupLocation || ''} />
            </label>
            <label>
              Participant count
              <input type="number" name="participantCount" min={0} defaultValue={service.participantCount ?? getServicePaxCount(service, booking)} />
            </label>
            <label>
              Supplier
              {renderSupplierOptions(suppliers, service.supplierId)}
            </label>
            <input type="hidden" name="assignmentStatus" value={service.supplierId ? 'ASSIGNED' : 'UNASSIGNED'} />
            {renderCommonOperationFields(service)}
          </>
        ) : null}

        {editorType === 'GUIDE' ? (
          <>
            {renderOperationalDateInput(service)}
            <label>
              Assigned guide
              <input type="text" name="assignedTo" defaultValue={service.assignedTo || service.guide?.fullName || ''} />
            </label>
            <label>
              Guide phone
              <input type="text" name="guidePhone" defaultValue={service.guidePhone || service.guide?.phone || ''} />
            </label>
            <label>
              Language
              <input type="text" name="guideRequiredLanguages" defaultValue={(service.guideRequiredLanguages || []).join(', ')} />
            </label>
            <label>
              Working hours
              <input type="time" name="guideReportingTime" defaultValue={service.guideReportingTime || service.startTime || ''} />
            </label>
            {renderCommonOperationFields(service)}
          </>
        ) : null}

        {editorType === 'TICKET' ? (
          <>
            <label>
              Supplier
              {renderSupplierOptions(suppliers, service.supplierId)}
            </label>
            {renderOperationalDateInput(service)}
            <label>
              Visit time
              <input type="time" name="startTime" defaultValue={service.startTime || ''} />
            </label>
            <label>
              Ticket handling
              <input type="text" name="operationalNotes" defaultValue={service.operationalNotes || service.notes || ''} />
            </label>
            <input type="hidden" name="assignmentStatus" value={service.supplierId ? 'ASSIGNED' : 'UNASSIGNED'} />
            <label>
              Confirmation
              <input type="text" name="confirmationReference" defaultValue={service.confirmationNumber || service.supplierReference || ''} />
            </label>
            <label>
              Confirmation notes
              <input type="text" name="confirmationNotes" defaultValue={service.confirmationNotes || service.supplierRemarks || ''} />
            </label>
            <label>
              Status
              {renderOperationStatusOptions(service.operationStatus)}
            </label>
          </>
        ) : null}

        {editorType === 'SERVICE' ? (
          <>
            <label>
              Supplier
              {renderSupplierOptions(suppliers, service.supplierId)}
            </label>
            <input type="hidden" name="assignmentStatus" value={service.supplierId ? 'ASSIGNED' : 'UNASSIGNED'} />
            {renderOperationalDateInput(service)}
            <label>
              Operational notes
              <input type="text" name="operationalNotes" defaultValue={service.operationalNotes || service.notes || ''} />
            </label>
            <label>
              Meeting point
              <input type="text" name="meetingPoint" defaultValue={service.meetingPoint || service.pickupLocation || ''} />
            </label>
            <label>
              Timing
              <input type="time" name="startTime" defaultValue={service.startTime || service.pickupTime || ''} />
            </label>
            <label>
              Confirmation
              <input type="text" name="confirmationReference" defaultValue={service.confirmationNumber || service.supplierReference || ''} />
            </label>
            <label>
              Confirmation notes
              <input type="text" name="confirmationNotes" defaultValue={service.confirmationNotes || service.supplierRemarks || ''} />
            </label>
            <label>
              Confirmation status
              <select name="supplierConfirmationStatus" defaultValue={service.supplierConfirmationStatus || 'NOT_SENT'}>
                {['NOT_SENT', 'REQUESTED', 'CONFIRMED', 'REJECTED'].map((status) => (
                  <option key={status} value={status}>{formatSupplierConfirmationStatus(status as SupplierConfirmationStatus)}</option>
                ))}
              </select>
            </label>
            <label>
              Status
              {renderOperationStatusOptions(service.operationStatus)}
            </label>
          </>
        ) : null}

        <div className="quote-status-actions">
          <button type="submit">Save</button>
          <DeleteOperationButton description={service.description || ''} />
        </div>
      </form>
    </details>
  );
}

function buildFinanceBadgeTooltip(booking: Booking) {
  return buildBadgeTooltip([
    { count: booking.finance.badge.breakdown.unpaidClient, label: 'unpaid client' },
    { count: booking.finance.badge.breakdown.unpaidSupplier, label: 'unpaid supplier' },
    { count: booking.finance.badge.breakdown.negativeMargin, label: 'negative margin' },
    { count: booking.finance.badge.breakdown.lowMargin, label: 'low margin' },
    { count: booking.finance.badge.breakdown.overdueClient, label: 'overdue client payment' },
    { count: booking.finance.badge.breakdown.overdueSupplier, label: 'overdue supplier payment' },
  ]);
}

function buildOperationsBadgeTooltip(booking: Booking) {
  return buildBadgeTooltip([
    { count: booking.operations.badge.breakdown.pendingConfirmations, label: 'pending confirmations' },
    { count: booking.operations.badge.breakdown.missingExecutionDetails, label: 'missing execution details' },
    { count: booking.operations.badge.breakdown.reconfirmationDue, label: 'reconfirmation due' },
  ]);
}

function buildRoomingBadgeTooltip(booking: Booking) {
  return buildBadgeTooltip([
    { count: booking.rooming.badge.breakdown.unassignedPassengers, label: 'unassigned passengers' },
    { count: booking.rooming.badge.breakdown.unassignedRooms, label: 'incomplete rooms' },
    { count: booking.rooming.badge.breakdown.occupancyIssues, label: 'occupancy issues' },
  ]);
}

function getBookingWorkflowStep(status: BookingStatus) {
  if (status === 'draft') return 'pending';
  if (status === 'confirmed') return 'confirmed';
  if (status === 'in_progress') return 'in-operation';
  if (status === 'completed') return 'completed';
  return 'cancelled';
}

function getBookingPrimaryAction(status: BookingStatus, allowedTransitions: BookingStatus[], bookingId: string) {
  if (allowedTransitions.includes('confirmed')) {
    return { label: 'Confirm booking', targetStatus: 'confirmed' as BookingStatus };
  }

  if (status === 'confirmed') {
    return { label: 'Assign operations', href: `/bookings/${bookingId}/operations` };
  }

  if (allowedTransitions.includes('completed')) {
    return { label: 'Complete booking', targetStatus: 'completed' as BookingStatus };
  }

  return null;
}

function getBookingServiceTimeLabel(service: Booking['services'][number]) {
  return [
    service.serviceDate ? formatDateOnly(service.serviceDate) : null,
    service.startTime ? `Start ${service.startTime}` : null,
    service.pickupTime ? `Pickup ${service.pickupTime}` : null,
  ]
    .filter(Boolean)
    .join(' | ');
}

function getPassengerRoomAssignmentLabel(
  passengerId: string,
  roomingEntries: Booking['roomingEntries'],
) {
  const entry = roomingEntries.find((room) =>
    room.assignments.some((assignment) => assignment.bookingPassenger.id === passengerId),
  );

  return entry ? getRoomLabel(entry) : 'Unassigned';
}

function getPassengerCurrentRoom(passengerId: string, roomingEntries: Booking['roomingEntries']) {
  return roomingEntries.find((room) =>
    room.assignments.some((assignment) => assignment.bookingPassenger.id === passengerId),
  ) || null;
}

function getPassengerRoomingOptionLabel(passenger: Booking['passengers'][number], roomingEntries: Booking['roomingEntries']) {
  const currentRoom = getPassengerCurrentRoom(passenger.id, roomingEntries);
  const name = formatPassengerName(passenger);

  return currentRoom ? `${name} - move from ${getRoomLabel(currentRoom)}` : `${name} - unassigned`;
}

function resolveActiveBookingTab(tab?: string): BookingDetailTab {
  if (tab === 'operations') return 'services';
  if (tab === 'passengers-rooming') return 'passengers';
  if (tab === 'finance') return 'financials';
  if (tab === 'timeline') return 'audit-log';

  return BOOKING_ROUTE_TABS.includes(tab as BookingDetailTab) ? (tab as BookingDetailTab) : 'overview';
}

export default async function BookingPage({ params, searchParams }: BookingPageProps) {
  const bookingId = (await params).id;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeTab = resolveActiveBookingTab(resolvedSearchParams?.tab);
  const highlightServiceId = resolvedSearchParams?.service?.trim() || undefined;
  const [booking, suppliers, guides, restaurants, vehicles, transportRoutes] = await Promise.all([
    getBooking(bookingId),
    getSuppliers(),
    getGuides(),
    getRestaurants(),
    getVehicles(),
    getRoutes(),
  ]);
  const warningMessage = resolvedSearchParams?.warningText || resolvedSearchParams?.warning || '';

  if (!booking) {
    notFound();
  }

  const snapshot = booking.snapshotJson;

  if (!snapshot) {
    notFound();
  }

  const totalPax = snapshot.adults + snapshot.children;
  const sortedDays = [...snapshot.itineraries].sort((a, b) => a.dayNumber - b.dayNumber);
  const unassignedItems = snapshot.quoteItems.filter((item) => !item.itineraryId);
  const hasItineraryDays = sortedDays.length > 0;
  const quotedTotals = getMarginMetrics(booking.finance.quotedTotalSell, booking.finance.quotedTotalCost);
  const realizedTotals = getMarginMetrics(booking.finance.realizedTotalSell, booking.finance.realizedTotalCost);
  const portalUrl = `${APP_BASE_URL}/invoice/${encodeURIComponent(booking.accessToken)}`;
  const bookingCancelled = booking.status === 'cancelled';
  const bookingReadOnly = bookingCancelled || booking.isLatestAmendment === false;
  const allowedTransitions = getAllowedBookingStatusTransitions(booking.status);
  const timeline = buildBookingTimeline(booking);
  const bookingPayments = booking.payments;
  const baseBookingRef = booking.bookingRef || snapshot.quoteNumber || booking.quote.quoteNumber || booking.id;
  const bookingRef = booking.amendmentNumber && booking.amendmentNumber > 1
    ? `${baseBookingRef} / A${booking.amendmentNumber}`
    : baseBookingRef;
  const assignedPassengerIds = new Set(
    booking.roomingEntries.flatMap((entry) => entry.assignments.map((assignment) => assignment.bookingPassenger.id)),
  );
  const roomingGroupBreakdown = ROOMING_GROUP_OPTIONS.map((option) => ({
    ...option,
    count: booking.roomingEntries.filter((entry) => getRoomGroupCode(entry) === option.code).length,
  }));
  const roomingCapacity = booking.roomingEntries.reduce((total, entry) => {
    const capacity = getRoomOccupancyCapacity(entry.occupancy, entry.roomType);
    return capacity === null ? total : total + capacity;
  }, 0);
  const unassignedPassengerCount = Math.max(booking.passengers.length - assignedPassengerIds.size, 0);
  const pendingConfirmationsCount = booking.services.filter((service) => service.confirmationStatus !== 'confirmed').length;
  const activityServicesMissingOpsCount = booking.services.filter((service) => {
    const normalized = String(service.serviceType || '').trim().toLowerCase();
    const activityService =
      normalized.includes('activity') ||
      normalized.includes('tour') ||
      normalized.includes('excursion') ||
      normalized.includes('experience') ||
      normalized.includes('sightseeing');

    if (!activityService) {
      return false;
    }

    return !service.serviceDate || (!service.startTime && !service.pickupTime) || (!service.pickupLocation && !service.meetingPoint);
  }).length;
  const overviewWarnings = [
    pendingConfirmationsCount > 0 ? `${pendingConfirmationsCount} service confirmations are still pending.` : null,
    activityServicesMissingOpsCount > 0 ? `${activityServicesMissingOpsCount} activity services are missing execution details.` : null,
    booking.finance.hasUnpaidClientBalance ? 'Client balance is still open.' : null,
    booking.finance.hasUnpaidSupplierObligation ? 'Supplier obligations are still open.' : null,
  ].filter(Boolean) as string[];
  const leadPassenger = booking.passengers.find((passenger) => passenger.isLead) || null;
  const roomingIssues = [
    booking.rooming.badge.breakdown.unassignedPassengers > 0
      ? `${booking.rooming.badge.breakdown.unassignedPassengers} passengers are still unassigned to rooms.`
      : null,
    booking.rooming.badge.breakdown.unassignedRooms > 0
      ? `${booking.rooming.badge.breakdown.unassignedRooms} rooms still need assignments or review.`
      : null,
    booking.rooming.badge.breakdown.occupancyIssues > 0
      ? `${booking.rooming.badge.breakdown.occupancyIssues} room occupancy issues need correction.`
      : null,
  ].filter(Boolean) as string[];
  const operationalReadiness = booking.operationalReadiness || {
    status: booking.operations.badge.tone === 'error' ? 'critical' : booking.operations.badge.tone === 'warning' || booking.rooming.badge.count > 0 ? 'warning' : 'ready',
    label: booking.operations.badge.tone === 'error' ? 'Critical' : booking.operations.badge.tone === 'warning' || booking.rooming.badge.count > 0 ? 'Warning' : 'Ready',
    summary: {
      rooming: {
        complete: booking.rooming.badge.count === 0,
        status: booking.rooming.badge.count > 0 ? 'warning' : 'ready',
        issues: booking.rooming.badge.breakdown,
      },
      pricing: { unresolved: 0, status: 'ready' },
      transport: { missing: 0, status: 'ready' },
      vouchers: {
        eligible: booking.services.length,
        issued: booking.vouchers?.filter((voucher) => voucher.status === 'SENT' || voucher.status === 'ISSUED').length || 0,
        draft: booking.vouchers?.filter((voucher) => voucher.status === 'DRAFT').length || 0,
        missing: 0,
        status: 'ready',
      },
      passengers: { expected: totalPax, received: booking.passengers.length, missingRecords: Math.max(totalPax - booking.passengers.length, 0), unassigned: booking.rooming.badge.breakdown.unassignedPassengers, status: booking.rooming.badge.breakdown.unassignedPassengers > 0 ? 'warning' : 'ready' },
      excursions: { incomplete: activityServicesMissingOpsCount, status: activityServicesMissingOpsCount > 0 ? 'warning' : 'ready' },
    },
    counters: {
      passengers: booking.passengers.length,
      expectedPassengers: totalPax,
      roomGroups: booking.roomingEntries.length,
      vouchers: booking.vouchers?.length || 0,
      unresolvedItems: booking.operations.badge.count + booking.rooming.badge.count,
      optionalItemsNotSelected: 0,
    },
    dayReadiness: (booking.days || []).map((day) => ({ id: day.id, dayNumber: day.dayNumber, title: day.title, date: day.date, status: 'pending', serviceCount: booking.services.filter((service) => service.bookingDayId === day.id).length, issueCount: 0, issues: [] })),
    sections: [],
  } satisfies NonNullable<Booking['operationalReadiness']>;
  const operationalAlerts = [
    pendingConfirmationsCount > 0 ? `${pendingConfirmationsCount} services are waiting on supplier confirmation.` : null,
    booking.operations.badge.breakdown.missingExecutionDetails > 0
      ? `${booking.operations.badge.breakdown.missingExecutionDetails} services are missing execution details.`
      : null,
    booking.operations.badge.breakdown.reconfirmationDue > 0
      ? `${booking.operations.badge.breakdown.reconfirmationDue} services need reconfirmation follow-up.`
      : null,
  ].filter(Boolean) as string[];
  const healthChecklist = [
    { label: 'Lead passenger assigned', complete: Boolean(leadPassenger) },
    { label: 'All services confirmed', complete: pendingConfirmationsCount === 0 && booking.services.length > 0 },
    { label: 'Rooming in good shape', complete: roomingIssues.length === 0 },
    { label: 'Client invoice cleared', complete: !booking.finance.hasUnpaidClientBalance },
    { label: 'Supplier payments tracked', complete: !booking.finance.hasUnpaidSupplierObligation },
  ];
  const buildTabHref = (tab: BookingDetailTab) => `/bookings/${booking.id}?tab=${tab}`;
  const destinationLabel = sortedDays[0]?.title || booking.days?.[0]?.title || 'Destination pending';
  const dateRangeLabel = snapshot.travelStartDate
    ? `${formatDateOnly(snapshot.travelStartDate)}${snapshot.nightCount > 0 ? ` - ${formatNightCountLabel(snapshot.nightCount)}` : ''}`
    : 'Dates pending';
  const contactName = `${booking.contactSnapshotJson.firstName} ${booking.contactSnapshotJson.lastName}`.trim();
  const amendmentLabel = `A${booking.amendmentNumber ?? 1}`;
  const durationLabel = formatNightCountLabel(snapshot.nightCount);
  const totalSell = booking.finance.realizedTotalSell || booking.finance.quotedTotalSell || booking.pricingSnapshotJson.totalSell || snapshot.totalSell || 0;
  const totalCost = booking.finance.realizedTotalCost || booking.finance.quotedTotalCost || booking.pricingSnapshotJson.totalCost || snapshot.totalCost || 0;
  const grossProfit = Number((totalSell - totalCost).toFixed(2));
  const marginPercent = totalSell > 0 ? Number(((grossProfit / totalSell) * 100).toFixed(2)) : 0;
  const workflowActiveStep = getBookingWorkflowStep(booking.status);
  const workflowSteps = [
    { id: 'pending', label: 'Pending' },
    { id: 'confirmed', label: 'Confirmed' },
    { id: 'in-operation', label: 'In Operation' },
    { id: 'completed', label: 'Completed' },
    { id: 'closed', label: 'Closed' },
    { id: 'cancelled', label: 'Cancelled' },
  ];
  const primaryAction = bookingReadOnly ? null : getBookingPrimaryAction(booking.status, allowedTransitions, booking.id);

  return (
    <main className="page booking-ops-page bookings-workspace-page">
      <section className="panel booking-ops-workspace-page app-page-content">
        <div className="booking-ops-shell">
          <AdminBreadcrumbs
            items={[
              { label: 'Dashboard', href: '/admin/dashboard' },
              { label: 'Bookings', href: '/bookings' },
              { label: `Booking ${bookingRef}` },
            ]}
          />
          <section className="booking-dashboard-header">
            <div className="booking-dashboard-header-main">
              <AdminBackButton fallbackHref="/bookings" label="Back to Bookings" />
              <div className="booking-dashboard-title-row">
                <div>
                  <p className="eyebrow">Booking {bookingRef}</p>
                  <h1>{snapshot.title}</h1>
                </div>
                <div className="booking-dashboard-status-stack">
                  <BookingOperationsStatusBadge kind="booking" status={booking.status} />
                  <BookingOperationsStatusBadge kind="invoice" status={booking.finance.clientInvoiceStatus} />
                </div>
              </div>
              <div className="booking-dashboard-meta-grid">
                <div>
                  <span>Client</span>
                  <strong>{booking.clientSnapshotJson.name}</strong>
                </div>
                <div>
                  <span>Contact</span>
                  <strong>{contactName || 'Contact pending'}</strong>
                </div>
                <div>
                  <span>Destination</span>
                  <strong>{destinationLabel}</strong>
                </div>
                <div>
                  <span>Dates</span>
                  <strong>{dateRangeLabel}</strong>
                </div>
                <div>
                  <span>Pax</span>
                  <strong>{totalPax} pax</strong>
                </div>
                <div>
                  <span>Amendment</span>
                  <strong>{amendmentLabel}</strong>
                </div>
              </div>
            </div>
            <AdminHeaderActions className="booking-dashboard-actions">
              {allowedTransitions.length > 0 && !bookingReadOnly ? (
                <RowDetailsPanel
                  summary="Save"
                  description="Update booking status"
                  className="booking-dashboard-action-panel"
                  bodyClassName="operations-row-details-body"
                >
                  <InlineRowEditorShell>
                    <form action={`/api/bookings/${booking.id}/status`} method="POST" className="quote-status-form">
                      <label>
                        Booking status
                        <select name="status" defaultValue={allowedTransitions[0]}>
                          {allowedTransitions.map((status) => (
                            <option key={status} value={status}>
                              {formatBookingStatus(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Note
                        <input type="text" name="note" placeholder="Optional workflow note" />
                      </label>
                      <div className="quote-status-actions">
                        <button type="submit">Save status</button>
                      </div>
                    </form>
                  </InlineRowEditorShell>
                </RowDetailsPanel>
              ) : (
                <button type="button" className="secondary-button" disabled>
                  Save
                </button>
              )}
              <Link href={buildTabHref('documents')} className="secondary-button">
                Generate documents
              </Link>
              {bookingReadOnly ? (
                <button type="button" className="secondary-button" disabled>
                  Assign operations
                </button>
              ) : (
                <Link href={`/bookings/${booking.id}/operations`} className="secondary-button">
                  Assign operations
                </Link>
              )}
              {bookingReadOnly ? (
                <button type="button" className="secondary-button" disabled>
                  Add passengers
                </button>
              ) : (
                <Link href={buildTabHref('passengers')} className="secondary-button">
                  Add passengers
                </Link>
              )}
              <AmendBookingButton bookingId={booking.id} disabled={bookingReadOnly} services={booking.services} days={booking.days || []} />
              {!bookingReadOnly ? <CancelBookingButton bookingId={booking.id} /> : null}
            </AdminHeaderActions>
          </section>

          {booking.isLatestAmendment === false ? (
            <div className="inline-alert warning" role="status">
              This is an older booking amendment. Open the latest amendment to edit passengers, operations, services, or status.
            </div>
          ) : null}

          {(warningMessage || resolvedSearchParams?.success || resolvedSearchParams?.error) ? (
            <section className="warning-banner">
              {warningMessage ? renderFeedbackMessage(warningMessage, 'form-error') : null}
              {resolvedSearchParams?.success ? renderFeedbackMessage(resolvedSearchParams.success, 'form-helper') : null}
              {resolvedSearchParams?.error ? renderFeedbackMessage(resolvedSearchParams.error, 'form-error') : null}
              <BookingFeedbackBannerCleanup />
            </section>
          ) : null}

          <nav className="booking-dashboard-workflow" aria-label="Booking lifecycle">
            {workflowSteps.map((step) => (
              <span
                key={step.id}
                className={`booking-dashboard-workflow-step${workflowActiveStep === step.id ? ' booking-dashboard-workflow-step-active' : ''}`}
              >
                {step.label}
              </span>
            ))}
          </nav>

          <nav className="booking-dashboard-tabs" aria-label="Booking detail sections">
            {BOOKING_DASHBOARD_TABS.map((tab) => {
              const badge =
                tab.id === 'services'
                  ? booking.operations.badge.count
                  : tab.id === 'passengers'
                    ? booking.rooming.badge.count
                    : null;

              return (
                <Link
                  key={tab.id}
                  href={buildTabHref(tab.id)}
                  className={`booking-dashboard-tab${activeTab === tab.id ? ' booking-dashboard-tab-active' : ''}`}
                >
                  {tab.label}
                  {badge ? <span>{badge}</span> : null}
                </Link>
              );
            })}
          </nav>

          {/* TODO(ui): Split booking tab bodies into shared detail panels once operations forms are separated from this server page. */}
          <div className="booking-ops-layout app-detail-layout">
            <div className="section-stack booking-ops-main">
              {activeTab === 'overview' ? (
                <div className="section-stack">
                  <section className="booking-ops-grid-two">
                    <article className="workspace-section booking-ops-panel-card">
                      <div className="workspace-section-head">
                        <div>
                          <p className="eyebrow">Overview</p>
                          <h2>Execution snapshot</h2>
                        </div>
                      </div>
                      <p className="detail-copy">
                        Booking operations stays focused on delivery readiness, supplier visibility, rooming control, and commercial follow-through.
                      </p>
                      <div className="quote-preview-total-list">
                        <div>
                          <span>Booking type</span>
                          <strong>{formatBookingType(booking.bookingType)}</strong>
                        </div>
                        <div>
                          <span>Status</span>
                          <strong>{formatBookingStatus(booking.status)}</strong>
                        </div>
                        <div>
                          <span>Source quote</span>
                          <strong>{booking.quote.quoteNumber || booking.quote.title}</strong>
                        </div>
                        <div>
                          <span>Accepted version</span>
                          <strong>v{booking.acceptedVersion.versionNumber}</strong>
                        </div>
                      </div>
                    </article>

                    <BookingAlertPanel
                      eyebrow="Operational Alerts"
                      title="Current issues"
                      tone={overviewWarnings.length > 0 ? 'warning' : 'neutral'}
                      items={overviewWarnings.map((item, index) => ({
                        id: `overview-warning-${index}`,
                        message: item,
                      }))}
                      emptyLabel="No immediate operational or finance warnings."
                    />
                  </section>

                  <section className="workspace-section booking-ops-panel-card booking-operational-readiness-panel">
                    <div className="workspace-section-head">
                      <div>
                        <p className="eyebrow">Operational Readiness</p>
                        <h2>Read-only readiness dashboard</h2>
                      </div>
                      <BookingOperationsStatusBadge kind="readiness" status={operationalReadiness.status} label={operationalReadiness.label} />
                    </div>
                    <div className="summary-strip booking-operational-counter-strip">
                      <article className="summary-strip-card">
                        <span>Passengers</span>
                        <strong>{operationalReadiness.counters.passengers}/{operationalReadiness.counters.expectedPassengers}</strong>
                      </article>
                      <article className="summary-strip-card">
                        <span>Room groups</span>
                        <strong>{operationalReadiness.counters.roomGroups}</strong>
                      </article>
                      <article className="summary-strip-card">
                        <span>Vouchers</span>
                        <strong>{operationalReadiness.counters.vouchers}</strong>
                      </article>
                      <article className="summary-strip-card">
                        <span>Unresolved items</span>
                        <strong>{operationalReadiness.counters.unresolvedItems}</strong>
                      </article>
                      <article className="summary-strip-card">
                        <span>Optional not selected</span>
                        <strong>{operationalReadiness.counters.optionalItemsNotSelected}</strong>
                      </article>
                    </div>
                    <div className="booking-operational-readiness-grid">
                      {operationalReadiness.sections.map((section) => (
                        <article key={section.title} className="detail-card booking-operational-readiness-card">
                          <div className="workspace-section-head">
                            <div>
                              <p className="eyebrow">{section.title}</p>
                              <h3>{section.count} issue{section.count === 1 ? '' : 's'}</h3>
                            </div>
                            <BookingOperationsStatusBadge kind="readiness" status={section.status} />
                          </div>
                          {section.issues.length > 0 ? (
                            <div className="booking-ops-checklist">
                              {section.issues.map((issue) => (
                                <div key={issue} className="booking-ops-checklist-item">
                                  <span>Review</span>
                                  <strong>{issue}</strong>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="detail-copy">No readiness issues flagged.</p>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="workspace-section booking-ops-panel-card">
                    <div className="workspace-section-head">
                      <div>
                        <p className="eyebrow">Booking Days</p>
                        <h2>Operations day plan</h2>
                      </div>
                    </div>
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Day</th>
                            <th>Date</th>
                            <th>Title</th>
                            <th>Status</th>
                            <th>Notes</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(booking.days || []).map((day) => (
                            <tr key={day.id}>
                              <td>Day {day.dayNumber}</td>
                              <td>{formatDateOnly(day.date)}</td>
                              <td>{day.title}</td>
                              <td>{day.status}</td>
                              <td>{day.notes || 'No notes'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="workspace-section booking-ops-panel-card">
                    <div className="workspace-section-head">
                      <div>
                        <p className="eyebrow">Program</p>
                        <h2>Booking itinerary snapshot</h2>
                      </div>
                    </div>
                    <div className="quote-preview-day-list">
                      {!hasItineraryDays ? (
                        <BookingOperationsEmptyState
                          eyebrow="Program"
                          title="No detailed itinerary days"
                          description="Detailed day-by-day itinerary will appear here once the accepted quote includes itinerary structure."
                        />
                      ) : (
                        sortedDays.map((day) => {
                          const dayItems = snapshot.quoteItems.filter((item) => item.itineraryId === day.id);
                          const primaryImage = day.images[0]?.galleryImage || null;
                          const displayDay = getItineraryDayDisplay(day);
                          return (
                            <article key={day.id} className="quote-preview-day-card">
                              <div className="quote-preview-day-head">
                                <div>
                                  <p className="eyebrow">{displayDay.dayLabel}</p>
                                  <p className="detail-copy">{displayDay.city}</p>
                                  <strong>{displayDay.title}</strong>
                                  <p>{displayDay.description}</p>
                                </div>
                              </div>
                              {primaryImage ? (
                                <figure className="quote-preview-day-image">
                                  <img src={primaryImage.imageUrl} alt={primaryImage.title} className="quote-preview-day-image-asset" />
                                </figure>
                              ) : null}
                              {renderServices(dayItems, 'No services assigned to this day.', snapshot)}
                            </article>
                          );
                        })
                      )}
                    </div>
                    {hasItineraryDays ? renderServices(unassignedItems, 'No extra services outside the itinerary.', snapshot) : null}
                  </section>

                  <section className="workspace-section booking-ops-panel-card">
                    <div className="workspace-section-head">
                      <div>
                        <p className="eyebrow">Documents</p>
                        <h2>Operational surfaces</h2>
                      </div>
                    </div>
                    <div className="booking-ops-doc-grid">
                      <article className="detail-card">
                        <p className="eyebrow">Portal</p>
                        <p className="detail-copy">{portalUrl}</p>
                        <BookingPortalLinkActions apiBaseUrl={ACTION_API_BASE_URL} bookingId={booking.id} portalUrl={portalUrl} />
                      </article>
                      <article className="detail-card">
                        <p className="eyebrow">Agent Portal Ownership</p>
                        <h3>{booking.quote.agent?.name || [booking.quote.agent?.firstName, booking.quote.agent?.lastName].filter(Boolean).join(' ') || 'Unassigned agent'}</h3>
                        <p className="detail-copy">
                          Company: <strong>{booking.quote.company?.name || 'Company unavailable'}</strong>
                        </p>
                        <p className="detail-copy">
                          Agent: <strong>{booking.quote.agent?.email || 'Fallback company visibility applies until an agent is assigned.'}</strong>
                        </p>
                        <div className="workspace-document-actions">
                          <Link href={`/quotes/${booking.quote.id}`} className="secondary-button">
                            Assign quote agent/company
                          </Link>
                        </div>
                      </article>
                      <article className="detail-card">
                        <p className="eyebrow">Voucher</p>
                        <div className="workspace-document-actions">
                          <Link href={`/bookings/${booking.id}/voucher`} className="secondary-button">
                            Open voucher
                          </Link>
                        </div>
                        <BookingDocumentActions
                          apiBaseUrl={ACTION_API_BASE_URL}
                          bookingId={booking.id}
                          bookingRef={bookingRef}
                          documentLabel="Booking Voucher"
                          documentType="voucher"
                        />
                      </article>
                      <article className="detail-card">
                        <p className="eyebrow">Supplier Confirmation</p>
                        <div className="workspace-document-actions">
                          <Link href={`/bookings/${booking.id}/supplier-confirmation`} className="secondary-button">
                            Supplier confirmation
                          </Link>
                        </div>
                        <BookingDocumentActions
                          apiBaseUrl={ACTION_API_BASE_URL}
                          bookingId={booking.id}
                          bookingRef={bookingRef}
                          documentLabel="Supplier Confirmation"
                          documentType="supplier-confirmation"
                        />
                      </article>
                      <article className="detail-card">
                        <p className="eyebrow">Guarantee Letter</p>
                        <p className="detail-copy">Government-ready letter with manifest and operations assignment details.</p>
                        <div className="workspace-document-actions">
                          <Link href={`/api/bookings/${booking.id}/guarantee-letter`} className="secondary-button">
                            Generate Guarantee Letter
                          </Link>
                        </div>
                      </article>
                    </div>
                  </section>
                </div>
              ) : null}

              {activeTab === 'itinerary' ? (
                <section className="section-stack">
                  <TableSectionShell
                    title="Day-by-day itinerary"
                    description="Operational view of hotel, transport, activity, and supplement services by travel day."
                    context={<p>{booking.services.length} service rows</p>}
                  >
                    <div className="booking-dashboard-day-list">
                      {(booking.days || []).length === 0 ? (
                        <BookingOperationsEmptyState
                          eyebrow="Itinerary"
                          title="No booking days yet"
                          description="Booking days will appear here once the accepted quote itinerary has been converted."
                        />
                      ) : (
                        (booking.days || []).map((day) => {
                          const dayServices = booking.services.filter((service) => service.bookingDayId === day.id);

                          return (
                            <article key={day.id} className="booking-dashboard-day-card">
                              <div className="booking-dashboard-day-head">
                                <div>
                                  <p className="eyebrow">Day {day.dayNumber}</p>
                                  <h3>{day.title}</h3>
                                  <p>{formatDateOnly(day.date)}</p>
                                </div>
                                <BookingOperationsStatusBadge
                                  kind="readiness"
                                  status={operationalReadiness.dayReadiness.find((entry) => entry.id === day.id)?.status || 'pending'}
                                />
                              </div>
                              {operationalReadiness.dayReadiness.find((entry) => entry.id === day.id)?.issues.length ? (
                                <div className="booking-dashboard-day-readiness">
                                  {operationalReadiness.dayReadiness.find((entry) => entry.id === day.id)?.issues.map((issue) => (
                                    <span key={issue} className="status-pill warning">
                                      {issue}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              {day.notes ? <p className="detail-copy">{day.notes}</p> : null}
                              <div className="booking-dashboard-service-grid">
                                {dayServices.length === 0 ? (
                                  <p className="empty-state">No services assigned to this day.</p>
                                ) : (
                                  dayServices.map((service) => (
                                    <article
                                      key={service.id}
                                      className="booking-dashboard-service-card"
                                      data-activity-id={service.activityId || service.activity?.id || undefined}
                                    >
                                      <div>
                                        <span>{formatOperationType(service.operationType || service.serviceType)}</span>
                                        <strong>{service.activity?.name || service.description}</strong>
                                      </div>
                                      {service.activity?.description ? <p>{service.activity.description}</p> : null}
                                      <p>{getBookingServiceTimeLabel(service) || 'Timing pending'}</p>
                                      <p>{service.supplierName || 'Supplier unassigned'}</p>
                                      {service.supplierStatus === 'unresolved' ? <span className="status-pill warning supplier-warning-badge">Unresolved supplier</span> : null}
                                      <div className="booking-dashboard-service-footer">
                                        <BookingOperationsStatusBadge kind="lifecycle" status={service.status} />
                                        <span>{formatConfirmationStatus(service.confirmationStatus)}</span>
                                      </div>
                                    </article>
                                  ))
                                )}
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </TableSectionShell>
                </section>
              ) : null}

              {activeTab === 'documents' ? (
                <section className="workspace-section booking-ops-panel-card">
                  <div className="workspace-section-head">
                    <div>
                      <p className="eyebrow">Documents</p>
                      <h2>Booking documents</h2>
                    </div>
                  </div>
                  <div className="booking-ops-doc-grid">
                    <article className="detail-card">
                      <p className="eyebrow">Passenger Manifest</p>
                      <p className="detail-copy">Excel manifest with masked passport display preserved in the admin list.</p>
                      <div className="workspace-document-actions">
                        <Link href={`/api/bookings/${booking.id}/passengers/export`} className="secondary-button">
                          Manifest Excel
                        </Link>
                      </div>
                    </article>
                    <article className="detail-card">
                      <p className="eyebrow">Guarantee Letter</p>
                      <p className="detail-copy">Includes passenger manifest, travel details, program, transport, and guide assignment details.</p>
                      <div className="workspace-document-actions">
                        <Link href={`/api/bookings/${booking.id}/guarantee-letter`} className="secondary-button">
                          Generate Guarantee Letter
                        </Link>
                      </div>
                    </article>
                    <article className="detail-card">
                      <p className="eyebrow">Hotel Vouchers</p>
                      <Link href={`/bookings/${booking.id}/voucher`} className="secondary-button">
                        Open hotel vouchers
                      </Link>
                    </article>
                    <article className="detail-card">
                      <p className="eyebrow">Transport Vouchers</p>
                      <Link href={`/bookings/${booking.id}/voucher`} className="secondary-button">
                        Open transport vouchers
                      </Link>
                    </article>
                    <article className="detail-card">
                      <p className="eyebrow">Activity Vouchers</p>
                      <Link href={`/bookings/${booking.id}/voucher`} className="secondary-button">
                        Open activity vouchers
                      </Link>
                    </article>
                    <article className="detail-card">
                      <p className="eyebrow">Supplier Confirmation</p>
                      <Link href={`/bookings/${booking.id}/supplier-confirmation`} className="secondary-button">
                        Supplier confirmation
                      </Link>
                    </article>
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Voucher</th>
                          <th>Service</th>
                          <th>Supplier</th>
                          <th>Status</th>
                          <th>Issued</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(booking.vouchers || []).map((voucher) => (
                          <tr key={voucher.id}>
                            <td>{formatOperationType(voucher.type)}</td>
                            <td>{voucher.bookingService?.description || voucher.bookingServiceId}</td>
                            <td>{voucher.supplier?.name || voucher.supplierId}</td>
                            <td>{voucher.status}</td>
                            <td>{formatDateOnly(voucher.issuedAt)}</td>
                            <td>
                              <div className="quote-status-actions">
                                <BookingServiceVoucherDownloadButton voucherId={voucher.id} bookingRef={bookingRef} label="PDF" />
                                {voucher.type === 'HOTEL' ? (
                                  <Link href={`/vouchers/${voucher.id}/preview`} className="secondary-button">
                                    Preview
                                  </Link>
                                ) : null}
                                {voucher.status === 'DRAFT' ? (
                                  <form action={`/api/vouchers/${voucher.id}/status`} method="POST">
                                    <input type="hidden" name="status" value="READY" />
                                    <button type="submit">Mark ready</button>
                                  </form>
                                ) : null}
                                {(voucher.status === 'DRAFT' || voucher.status === 'READY') ? (
                                  <form action={`/api/vouchers/${voucher.id}/status`} method="POST">
                                    <input type="hidden" name="status" value="SENT" />
                                    <button type="submit">Mark sent</button>
                                  </form>
                                ) : null}
                                {voucher.status !== 'CANCELLED' ? (
                                  <form action={`/api/vouchers/${voucher.id}/status`} method="POST">
                                    <input type="hidden" name="status" value="CANCELLED" />
                                    <button type="submit" className="secondary-button">
                                      Cancel
                                    </button>
                                  </form>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {(booking.vouchers || []).length === 0 ? (
                          <tr>
                            <td colSpan={6}>No supplier-facing service vouchers have been generated.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </section>
              ) : null}

              {activeTab === 'services' ? (
                <div className="section-stack">
                  <AdvancedFiltersPanel title="Booking controls" description="Status changes and workflow controls">
                    <InlineRowEditorShell>
                      <p className="detail-copy">
                        Allowed next statuses: {allowedTransitions.length > 0 ? allowedTransitions.map(formatBookingStatus).join(', ') : 'No further transitions'}
                      </p>
                      {!bookingCancelled ? <CancelBookingButton bookingId={booking.id} /> : null}
                      <form action={`/api/bookings/${booking.id}/status`} method="POST" className="quote-status-form">
                        <label>
                          Booking status
                          <select name="status" defaultValue="" disabled={allowedTransitions.length === 0}>
                            <option value="" disabled>
                              {allowedTransitions.length === 0 ? 'No further transitions' : 'Select next status'}
                            </option>
                            {allowedTransitions.map((status) => (
                              <option key={status} value={status}>
                                {formatBookingStatus(status)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Reason
                          <input type="text" name="note" placeholder="Reason for manual booking status override" required minLength={3} />
                        </label>
                        <div className="quote-status-actions">
                          <button type="submit">Update booking status</button>
                        </div>
                      </form>
                    </InlineRowEditorShell>
                  </AdvancedFiltersPanel>

                  <section className="workspace-section booking-ops-panel-card">
                    <div className="workspace-section-head">
                      <div>
                        <p className="eyebrow">Operations</p>
                        <h2>Day assignments</h2>
                      </div>
                      <Link href={`/bookings/${booking.id}/operations`} className="secondary-button">
                        Open operations grid
                      </Link>
                    </div>
                    <div className="section-stack">
                      {(booking.days || []).map((day) => {
                        const dayServices = booking.services.filter((service) => {
                          if (service.bookingDayId) {
                            return service.bookingDayId === day.id;
                          }

                          return Boolean(day.date && service.serviceDate && day.date.slice(0, 10) === service.serviceDate.slice(0, 10));
                        });

                        return (
                          <article key={day.id} className="detail-card">
                            <div className="workspace-section-head">
                              <div>
                                <p className="eyebrow">
                                  Day {day.dayNumber} / {formatDateOnly(day.date)}
                                </p>
                                <h3>{day.title}</h3>
                              </div>
                            </div>

                            <div className="table-wrap">
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>Service</th>
                                    <th>Date / Day</th>
                                    <th>Title</th>
                                    <th>Supplier</th>
                                    <th>Vehicle / Pax</th>
                                    <th>Cost / Sell</th>
                                    <th>Status</th>
                                    <th>Voucher</th>
                                    <th>Supplier confirmation</th>
                                    <th>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dayServices.map((service) => (
                                    <tr key={service.id}>
                                      {(() => {
                                        const servicePricing = getServiceCostSellLabel(service);

                                        return (
                                          <>
                                            <td>
                                              <strong>{formatOperationType(service.operationType || service.serviceType)}</strong>
                                              <div className="table-subcopy">{service.serviceType}</div>
                                            </td>
                                            <td>
                                              Day {day.dayNumber}
                                              <div className="table-subcopy">{formatDateOnly(service.serviceDate || day.date)}</div>
                                            </td>
                                            <td>
                                              <strong>{service.description}</strong>
                                              <div className="table-subcopy">
                                                {service.touringRoute?.name || service.activity?.name || service.notes || 'Operational service'}
                                              </div>
                                            </td>
                                            <td>
                                              {getDisplayableSupplierName(service.supplierName) || service.touringRoutePricing?.supplier?.name || 'Not assigned'}
                                              {service.supplierStatus === 'unresolved' ? <span className="status-pill warning supplier-warning-badge">Unresolved supplier</span> : null}
                                              {!service.supplierId && getDisplayableSupplierName(service.supplierName) ? <div className="table-subcopy">Review unresolved supplier text</div> : null}
                                              <div className="table-subcopy">{service.supplierReference ? `Ref: ${service.supplierReference}` : 'No supplier ref'}</div>
                                            </td>
                                            <td>
                                              {getServiceVehicleName(service) || 'Not applicable'}
                                              <div className="table-subcopy">{getServicePaxCount(service, booking)} pax</div>
                                            </td>
                                            <td>
                                              {servicePricing.cost} cost
                                              <div className="table-subcopy">{servicePricing.sell} sell</div>
                                            </td>
                                            <td>
                                              {formatOperationStatus(service.operationStatus || service.confirmationStatus)}
                                              <div className="table-subcopy">Lifecycle: {formatBookingServiceStatus(service.status)}</div>
                                            </td>
                                            <td>
                                              {getVoucherReadinessLabel(service)}
                                              <div className="table-subcopy">{service.vouchers?.[0]?.status || 'No voucher'}</div>
                                            </td>
                                            <td>
                                              {formatSupplierConfirmationStatus(service.supplierConfirmationStatus)}
                                              {service.supplierConfirmedAt ? <div className="table-subcopy">Confirmed: {formatDateTime(service.supplierConfirmedAt)}</div> : null}
                                            </td>
                                          </>
                                        );
                                      })()}
                                      <td>
                                        <div>
                                          {service.operationType === 'TRANSPORT'
                                            ? [service.assignedTo, service.pickupTime].filter(Boolean).join(' / ') || 'Transport pending'
                                            : service.operationType === 'GUIDE'
                                              ? [service.assignedTo, service.guidePhone].filter(Boolean).join(' / ') || 'Guide pending'
                                              : service.operationType === 'HOTEL'
                                                ? service.confirmationNumber || 'Confirmation pending'
                                                : service.activity?.name || service.description}
                                        </div>
                                        <div className="table-subcopy">{service.notes || service.confirmationNotes || service.supplierRemarks || 'No notes'}</div>
                                        {service.confirmationSentAt ? <div className="table-subcopy">Sent: {formatDateTime(service.confirmationSentAt)}</div> : null}
                                        <div className="quote-status-actions">
                                          <Link
                                            href={`/bookings/${booking.id}/operations#operation-${service.id}`}
                                            className="secondary-button"
                                          >
                                            Edit in operations grid
                                          </Link>
                                        </div>
                                        {service.vouchers && service.vouchers.length > 0 ? (
                                          <div className="quote-status-actions">
                                            <BookingServiceVoucherDownloadButton
                                              voucherId={service.vouchers[0].id}
                                              bookingRef={bookingRef}
                                              label="Download Voucher PDF"
                                            />
                                            {service.vouchers[0].type === 'HOTEL' ? (
                                              <Link href={`/vouchers/${service.vouchers[0].id}/preview`} className="secondary-button">
                                                Preview
                                              </Link>
                                            ) : null}
                                          </div>
                                        ) : null}
                                        {/* Voucher *generation* lives on the operations grid (one
                                            card per row, with status pill + Generate/Regenerate +
                                            View link). The booking-page table is a read-only summary;
                                            keeping a Generate button here would split the workflow
                                            and bypass the new snapshot-based eligibility checks. */}
                                      </td>
                                    </tr>
                                  ))}
                                  {dayServices.length === 0 ? (
                                    <tr>
                                      <td colSpan={10}>No services assigned to this booking day.</td>
                                    </tr>
                                  ) : null}
                                </tbody>
                              </table>
                            </div>

                            <details>
                              <summary>Add service</summary>
                              <form action={`/api/bookings/${booking.id}/days/${day.id}/services`} method="POST" className="quote-status-form">
                                <label>
                                  Type
                                  {renderOperationTypeOptions()}
                                </label>
                                <label>
                                  Route
                                  {renderRouteOptions(transportRoutes)}
                                </label>
                                <label>
                                  Vehicle
                                  {renderVehicleOptions(vehicles)}
                                </label>
                                <label>
                                  Supplier
                                  {renderSupplierOptions(suppliers)}
                                </label>
                                <label>
                                  Driver / guide
                                  <input type="text" name="assignedTo" placeholder="Driver or guide name" />
                                </label>
                                <label>
                                  Guide phone
                                  <input type="text" name="guidePhone" placeholder="Guide phone" />
                                </label>
                                <label>
                                  Pickup time
                                  <input type="time" name="pickupTime" />
                                </label>
                                <label>
                                  Confirmation
                                  <input type="text" name="confirmationNumber" placeholder="Hotel confirmation number" />
                                </label>
                                <label>
                                  Status
                                  {renderOperationStatusOptions()}
                                </label>
                                <label>
                                  Notes
                                  <input type="text" name="notes" placeholder="Internal operations notes" />
                                </label>
                                <div className="quote-status-actions">
                                  <button type="submit">Add service</button>
                                </div>
                              </form>
                            </details>
                          </article>
                        );
                      })}
                    </div>
                  </section>

                  <section className="workspace-section booking-ops-panel-card">
                    <div className="workspace-section-head">
                      <div>
                        <p className="eyebrow">Services</p>
                        <h2>Service execution timeline</h2>
                      </div>
                    </div>
                    <BookingServiceTimeline
                      services={booking.services}
                      suppliers={suppliers}
                      guides={guides}
                      restaurants={restaurants}
                      highlightServiceId={highlightServiceId}
                      finance={booking.finance}
                    />
                  </section>
                </div>
              ) : null}

              {activeTab === 'passengers' ? (
                <section className="section-stack">
                  <TableSectionShell
                    title="Passengers"
                    description="Traveler records, manifest fields, lead ownership, and special notes."
                    context={
                      <div className="quote-status-actions">
                        <p>{booking.passengers.length} passengers in scope</p>
                        <Link href={`/api/bookings/${booking.id}/passengers/export`} className="secondary-button">
                          Export manifest
                        </Link>
                      </div>
                    }
                    createPanel={
                      <CollapsibleCreatePanel title="Add passenger" description="Create a traveler record while keeping the manifest visible." triggerLabelOpen="Add passenger">
                        <InlineRowEditorShell>
                          <form action={`/api/bookings/${booking.id}/passengers`} method="POST" className="quote-status-form">
                            <label>
                              Full name
                              <input type="text" name="fullName" required />
                            </label>
                            <label>
                              Nationality
                              <input type="text" name="nationality" required />
                            </label>
                            <label>
                              Passport number
                              <input type="text" name="passportNumber" required />
                            </label>
                            <label>
                              Passport expiry
                              <input type="date" name="passportExpiryDate" required />
                            </label>
                            <label>
                              Gender
                              <input type="text" name="gender" />
                            </label>
                            <label>
                              Date of birth
                              <input type="date" name="dateOfBirth" />
                            </label>
                            <label>
                              Entry point
                              <input type="text" name="entryPoint" />
                            </label>
                            <label>
                              Arrival flight
                              <input type="text" name="arrivalFlight" />
                            </label>
                            <label>
                              Emergency contact
                              <input type="text" name="emergencyContactName" placeholder="Next-of-kin name" />
                            </label>
                            <label>
                              Emergency phone
                              <input type="text" name="emergencyContactPhone" placeholder="Next-of-kin phone" />
                            </label>
                            <label>
                              Notes
                              <input type="text" name="notes" placeholder="Special handling or document note" />
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                              <input type="checkbox" name="isLead" />
                              Set as lead passenger
                            </label>
                            <div className="quote-status-actions">
                              <button type="submit">Add passenger</button>
                            </div>
                          </form>
                        </InlineRowEditorShell>
                      </CollapsibleCreatePanel>
                    }
                    emptyState={
                      <BookingOperationsEmptyState
                        eyebrow="Passengers"
                        title="No passengers added"
                        description="Create traveler records to manage rooming, lead ownership, and manifest readiness."
                      />
                    }
                  >
                    {booking.passengers.length > 0 ? (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Passenger</th>
                              <th>Passport</th>
                              <th>Nationality</th>
                              <th>DOB</th>
                              <th>Room assignment</th>
                              <th>Role</th>
                              <th>Notes</th>
                              <th>Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {booking.passengers.map((passenger) => (
                              <tr key={passenger.id}>
                                <td>
                                  <strong>{passenger.fullName || formatPassengerName(passenger)}</strong>
                                </td>
                                <td>{passenger.passportNumberMasked || 'Missing'}</td>
                                <td>{passenger.nationality || 'Missing'}</td>
                                <td>{formatDateOnly(passenger.dateOfBirth)}</td>
                                <td>{getPassengerRoomAssignmentLabel(passenger.id, booking.roomingEntries)}</td>
                                <td>{passenger.isLead ? 'Lead' : 'Passenger'}</td>
                                <td>{passenger.notes || 'No passenger notes'}</td>
                                <td>
                                  <RowDetailsPanel summary="Open details" description="Edit passenger, update lead ownership, or remove" className="operations-row-details" bodyClassName="operations-row-details-body">
                                    <InlineRowEditorShell>
                                      <form action={`/api/bookings/${booking.id}/passengers/${passenger.id}`} method="POST" className="quote-status-form">
                                        <input type="hidden" name="intent" value="update" />
                                        <label>
                                          Full name
                                          <input type="text" name="fullName" defaultValue={passenger.fullName || formatPassengerName(passenger)} required />
                                        </label>
                                        <label>
                                          Nationality
                                          <input type="text" name="nationality" defaultValue={passenger.nationality || ''} required />
                                        </label>
                                        <label>
                                          Passport number
                                          <input type="text" name="passportNumber" placeholder={passenger.passportNumberMasked || 'Leave blank to keep current'} />
                                        </label>
                                        <label>
                                          Passport expiry
                                          <input type="date" name="passportExpiryDate" defaultValue={passenger.passportExpiryDate?.slice(0, 10) || ''} required />
                                        </label>
                                        <label>
                                          Gender
                                          <input type="text" name="gender" defaultValue={passenger.gender || ''} />
                                        </label>
                                        <label>
                                          Date of birth
                                          <input type="date" name="dateOfBirth" defaultValue={passenger.dateOfBirth?.slice(0, 10) || ''} />
                                        </label>
                                        <label>
                                          Entry point
                                          <input type="text" name="entryPoint" defaultValue={passenger.entryPoint || ''} />
                                        </label>
                                        <label>
                                          Arrival flight
                                          <input type="text" name="arrivalFlight" defaultValue={passenger.arrivalFlight || ''} />
                                        </label>
                                        <label>
                                          Visa status
                                          <input type="text" name="visaStatus" defaultValue={passenger.visaStatus || ''} />
                                        </label>
                                        <label>
                                          Emergency contact
                                          <input type="text" name="emergencyContactName" defaultValue={passenger.emergencyContactName || ''} placeholder="Next-of-kin name" />
                                        </label>
                                        <label>
                                          Emergency phone
                                          <input type="text" name="emergencyContactPhone" defaultValue={passenger.emergencyContactPhone || ''} placeholder="Next-of-kin phone" />
                                        </label>
                                        <label>
                                          Notes
                                          <input type="text" name="notes" defaultValue={passenger.notes || ''} />
                                        </label>
                                        <div className="quote-status-actions">
                                          <button type="submit">Save passenger</button>
                                        </div>
                                      </form>
                                    </InlineRowEditorShell>
                                    <div className="quote-status-actions">
                                      {!passenger.isLead ? (
                                        <form action={`/api/bookings/${booking.id}/passengers/${passenger.id}`} method="POST">
                                          <input type="hidden" name="intent" value="set-lead" />
                                          <button type="submit">Set lead passenger</button>
                                        </form>
                                      ) : null}
                                      <form action={`/api/bookings/${booking.id}/passengers/${passenger.id}`} method="POST">
                                        <input type="hidden" name="intent" value="delete" />
                                        <button type="submit">Delete passenger</button>
                                      </form>
                                    </div>
                                  </RowDetailsPanel>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </TableSectionShell>
                </section>
              ) : null}

              {activeTab === 'rooming' ? (
                <section className="section-stack">
                  <div className="booking-rooming-workspace-summary">
                    <BookingRoomingSummaryCard
                      roomCount={booking.roomingEntries.length}
                      assignedPassengers={assignedPassengerIds.size}
                      passengerCount={booking.passengers.length}
                      roomingIssues={roomingIssues}
                    />
                    <div className="booking-rooming-type-grid" aria-label="Room group type summary">
                      {roomingGroupBreakdown.map((group) => (
                        <div key={group.code} className="booking-rooming-type-card">
                          <span>{group.label}</span>
                          <strong>{group.count}</strong>
                        </div>
                      ))}
                    </div>
                    <div className="booking-rooming-live-summary" aria-label="Live rooming summary">
                      <div>
                        <span>Total rooms</span>
                        <strong>{booking.roomingEntries.length}</strong>
                      </div>
                      <div>
                        <span>Occupancy</span>
                        <strong>{assignedPassengerIds.size}{roomingCapacity > 0 ? ` / ${roomingCapacity}` : ''}</strong>
                      </div>
                      <div>
                        <span>Unassigned passengers</span>
                        <strong>{unassignedPassengerCount}</strong>
                      </div>
                    </div>
                  </div>
                  <TableSectionShell
                    title="Rooming"
                    description="Room entries, occupancy, and passenger assignments."
                    context={<p>{booking.roomingEntries.length} rooming entries in scope</p>}
                    createPanel={
                      <>
                      <CollapsibleCreatePanel title="Add room" description="Create a rooming entry without pushing the room list off screen." triggerLabelOpen="Add room">
                        <InlineRowEditorShell>
                          <form action={`/api/bookings/${booking.id}/rooming`} method="POST" className="quote-status-form">
                            <label>
                              Room group
                              <select name="roomType" defaultValue="DBL">
                                {ROOMING_GROUP_OPTIONS.map((option) => (
                                  <option key={option.code} value={option.code}>{option.label}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Occupancy
                              <select name="occupancy" defaultValue="double">
                                {ROOMING_GROUP_OPTIONS.map((option) => (
                                  <option key={option.code} value={option.occupancy}>{option.label} occupancy</option>
                                ))}
                                <option value="unknown">Unknown</option>
                                <option value="quad">Quad</option>
                              </select>
                            </label>
                            <label>
                              Sort order
                              <input type="number" name="sortOrder" min={0} defaultValue={booking.roomingEntries.length + 1} />
                            </label>
                            <label>
                              Notes
                              <input type="text" name="notes" placeholder="Rooming note or hotel instruction" />
                            </label>
                            <div className="quote-status-actions">
                              <button type="submit">Add room</button>
                            </div>
                          </form>
                        </InlineRowEditorShell>
                      </CollapsibleCreatePanel>
                      {unassignedPassengerCount > 0 ? (
                        <form action={`/api/bookings/${booking.id}/rooming/auto-assign`} method="POST" className="quote-status-form" style={{ marginTop: '0.75rem' }}>
                          <p className="form-helper">
                            Auto-allocate the {unassignedPassengerCount} unassigned passenger{unassignedPassengerCount === 1 ? '' : 's'} into twin/double rooms
                            (an odd one out gets a single). Existing rooms are left untouched — review and adjust after.
                          </p>
                          <div className="quote-status-actions">
                            <button type="submit">Auto-allocate unassigned passengers</button>
                          </div>
                        </form>
                      ) : null}
                      </>
                    }
                    emptyState={
                      <BookingOperationsEmptyState
                        eyebrow="Rooming"
                        title="No rooming entries created"
                        description="Create room records to assign passengers and validate occupancy."
                      />
                    }
                  >
                    {booking.roomingEntries.length > 0 ? (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Room</th>
                              <th>Occupancy</th>
                              <th>Assigned</th>
                              <th>Notes</th>
                              <th>Details</th>
                            </tr>
                          </thead>
                          <tbody>
                            {booking.roomingEntries.map((entry) => {
                              const capacity = getRoomOccupancyCapacity(entry.occupancy, entry.roomType);
                              const availablePassengers = booking.passengers.filter(
                                (passenger) =>
                                  !entry.assignments.some((assignment) => assignment.bookingPassenger.id === passenger.id),
                              );
                              const assignmentStatus =
                                capacity === null
                                  ? entry.assignments.length > 0 ? 'Assigned' : 'Needs occupancy'
                                  : entry.assignments.length === capacity ? 'Valid' : 'Mismatch';

                              return (
                                <tr key={entry.id}>
                                  <td>
                                    {(() => {
                                      const label = getRoomLabel(entry);
                                      const code = getRoomGroupCode(entry);
                                      // Hide the group-code subcopy when it just repeats
                                      // the room label (common: operator typed "DBL" as
                                      // roomType, so both render the same). Otherwise the
                                      // cell reads "DBLDBL" stacked.
                                      const showCode = String(label || '').trim().toUpperCase() !== String(code || '').trim().toUpperCase();
                                      return (
                                        <>
                                          <strong>{label}</strong>
                                          {showCode ? <span className="table-subcopy">{code}</span> : null}
                                        </>
                                      );
                                    })()}
                                  </td>
                                  <td>
                                    {formatRoomOccupancy(entry.occupancy)}
                                    <span className={`booking-rooming-validation booking-rooming-validation-${assignmentStatus.toLowerCase().replace(/\s+/g, '-')}`}>
                                      {assignmentStatus}
                                    </span>
                                  </td>
                                  <td>
                                    {entry.assignments.length}
                                    {capacity ? ` / ${capacity}` : ''}
                                  </td>
                                  <td>{entry.notes || 'No rooming notes'}</td>
                                  <td>
                                    <RowDetailsPanel summary="Open details" description="Edit room, manage assignments, and remove room entry" className="operations-row-details" bodyClassName="operations-row-details-body">
                                      <InlineRowEditorShell>
                                        <form action={`/api/bookings/${booking.id}/rooming/${entry.id}`} method="POST" className="quote-status-form">
                                          <input type="hidden" name="intent" value="update" />
                                          <label>
                                            Room group
                                            <select name="roomType" defaultValue={getRoomGroupCode(entry) === 'OTHER' ? entry.roomType || '' : getRoomGroupCode(entry)}>
                                              {ROOMING_GROUP_OPTIONS.map((option) => (
                                                <option key={option.code} value={option.code}>{option.label}</option>
                                              ))}
                                              {getRoomGroupCode(entry) === 'OTHER' ? <option value={entry.roomType || ''}>{entry.roomType || 'Custom room'}</option> : null}
                                            </select>
                                          </label>
                                          <label>
                                            Occupancy
                                            <select name="occupancy" defaultValue={entry.occupancy}>
                                              <option value="unknown">Unknown</option>
                                              <option value="single">Single</option>
                                              <option value="double">Double</option>
                                              <option value="triple">Triple</option>
                                              <option value="quad">Quad</option>
                                            </select>
                                          </label>
                                          <label>
                                            Sort order
                                            <input type="number" name="sortOrder" min={0} defaultValue={entry.sortOrder} />
                                          </label>
                                          <label>
                                            Notes
                                            <input type="text" name="notes" defaultValue={entry.notes || ''} />
                                          </label>
                                          <div className="quote-status-actions">
                                            <button type="submit">Save room</button>
                                          </div>
                                        </form>
                                      </InlineRowEditorShell>
                                      <div className="quote-status-actions">
                                        <form action={`/api/bookings/${booking.id}/rooming/${entry.id}`} method="POST">
                                          <input type="hidden" name="intent" value="delete" />
                                          <button type="submit">Delete room</button>
                                        </form>
                                      </div>
                                      <div className="audit-log-list">
                                        <div className="audit-log-item">
                                          <strong>
                                            {entry.assignments.length > 0
                                              ? entry.assignments.map((assignment) => formatPassengerName(assignment.bookingPassenger)).join(', ')
                                              : 'No passengers assigned'}
                                          </strong>
                                        </div>
                                      </div>
                                      {entry.assignments.length > 0 ? (
                                        <div className="quote-status-actions">
                                          {entry.assignments.map((assignment) => (
                                            <form
                                              key={assignment.id}
                                              action={`/api/bookings/${booking.id}/rooming/${entry.id}/assignments/${assignment.bookingPassenger.id}`}
                                              method="POST"
                                            >
                                              <button type="submit">Unassign {formatPassengerName(assignment.bookingPassenger)}</button>
                                            </form>
                                          ))}
                                        </div>
                                      ) : null}
                                      <InlineRowEditorShell>
                                        <form action={`/api/bookings/${booking.id}/rooming/${entry.id}/assignments`} method="POST" className="quote-status-form">
                                          <label>
                                            Assign or move passenger
                                            <select
                                              name="passengerId"
                                              defaultValue=""
                                              disabled={availablePassengers.length === 0 || (capacity !== null && entry.assignments.length >= capacity)}
                                            >
                                              <option value="" disabled>
                                                {availablePassengers.length === 0
                                                  ? 'No available passengers'
                                                  : capacity !== null && entry.assignments.length >= capacity
                                                    ? 'Room occupancy is full'
                                                    : 'Select passenger to assign or move'}
                                              </option>
                                              {availablePassengers.map((passenger) => (
                                                <option key={passenger.id} value={passenger.id}>
                                                  {getPassengerRoomingOptionLabel(passenger, booking.roomingEntries)}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                          <div className="quote-status-actions">
                                            <button
                                              type="submit"
                                              disabled={availablePassengers.length === 0 || (capacity !== null && entry.assignments.length >= capacity)}
                                            >
                                              Assign / move passenger
                                            </button>
                                          </div>
                                        </form>
                                      </InlineRowEditorShell>
                                    </RowDetailsPanel>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </TableSectionShell>
                </section>
              ) : null}

              {activeTab === 'financials' ? (
                <section className="section-stack">
                  <BookingFinancialsTab
                    bookingId={booking.id}
                    bookingRef={bookingRef}
                    portalUrl={portalUrl}
                    currency="USD"
                    totalSell={booking.finance.realizedTotalSell || booking.finance.quotedTotalSell}
                    totalCost={booking.finance.realizedTotalCost || booking.finance.quotedTotalCost}
                    initialPayments={bookingPayments}
                    initialInvoiceSentAt={booking.invoiceDelivery?.sentAt || null}
                    initialInvoiceSentTo={booking.invoiceDelivery?.sentTo || null}
                    initialReminderSentAt={booking.paymentReminderDelivery?.sentAt || null}
                    initialReminderSentTo={booking.paymentReminderDelivery?.sentTo || null}
                    initialReminderCount={booking.paymentReminderAutomation?.reminderCount ?? 0}
                    initialLastReminderAt={booking.paymentReminderAutomation?.lastReminderAt || null}
                    initialNextReminderDueAt={booking.paymentReminderAutomation?.nextReminderDueAt || null}
                    reminderAutomationActive={booking.paymentReminderAutomation?.autoActive ?? false}
                    reminderAutomationStage={booking.paymentReminderAutomation?.stage ?? 'gentle'}
                    paymentProofSubmission={booking.paymentProofSubmission || null}
                    invoiceRecipientEmail={booking.quote.contact.email || booking.contactSnapshotJson.email || null}
                  />

                  <AdvancedFiltersPanel title="Finance controls" description="Invoice and supplier payment tracking">
                    <InlineRowEditorShell>
                      <form action={`/api/bookings/${booking.id}/finance`} method="POST" className="quote-status-form">
                        <label>
                          Client invoice status
                          <select name="clientInvoiceStatus" defaultValue={booking.finance.clientInvoiceStatus}>
                            <option value="unbilled">Unbilled</option>
                            <option value="invoiced">Invoiced</option>
                            <option value="paid">Paid</option>
                          </select>
                        </label>
                        <label>
                          Supplier payment status
                          <select name="supplierPaymentStatus" defaultValue={booking.finance.supplierPaymentStatus}>
                            <option value="unpaid">Unpaid</option>
                            <option value="scheduled">Scheduled</option>
                            <option value="paid">Paid</option>
                          </select>
                        </label>
                        <div className="quote-status-actions">
                          <button type="submit">Update finance tracking</button>
                        </div>
                      </form>
                    </InlineRowEditorShell>
                  </AdvancedFiltersPanel>

                  <TableSectionShell
                    title="Scenario pricing"
                    description="Accepted quote scenarios remain visible for downstream finance review."
                    context={<p>{snapshot.scenarios.length} scenario rows</p>}
                  >
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Pax count</th>
                            <th>Total sell</th>
                            <th>Price per pax</th>
                          </tr>
                        </thead>
                        <tbody>
                          {snapshot.scenarios.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="empty-state">
                                No group pricing generated yet.
                              </td>
                            </tr>
                          ) : (
                            snapshot.scenarios.map((scenario) => (
                              <tr key={scenario.id}>
                                <td>{scenario.paxCount}</td>
                                <td>{formatMoney(scenario.totalSell)}</td>
                                <td>{formatMoney(scenario.pricePerPax)}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </TableSectionShell>
                </section>
              ) : null}

              {activeTab === 'audit-log' ? (
                <section className="section-stack">
                  <section className="booking-ops-grid-two">
                    <article className="workspace-section booking-ops-panel-card">
                      <div className="workspace-section-head">
                        <div>
                          <p className="eyebrow">Sales Notes</p>
                          <h2>Client context</h2>
                        </div>
                      </div>
                      <p className="detail-copy">{snapshot.description || booking.statusNote || 'No sales notes recorded.'}</p>
                    </article>

                    <article className="workspace-section booking-ops-panel-card">
                      <div className="workspace-section-head">
                        <div>
                          <p className="eyebrow">Operations Notes</p>
                          <h2>Execution notes</h2>
                        </div>
                      </div>
                      <div className="audit-log-list">
                        {booking.services.filter((service) => service.notes || service.statusNote).length === 0 ? (
                          <p className="empty-state">No operations notes recorded.</p>
                        ) : (
                          booking.services
                            .filter((service) => service.notes || service.statusNote)
                            .slice(0, 6)
                            .map((service) => (
                              <div key={service.id} className="audit-log-item">
                                <strong>{service.description}</strong>
                                <p>{service.notes || service.statusNote}</p>
                              </div>
                            ))
                        )}
                      </div>
                    </article>

                    <article className="workspace-section booking-ops-panel-card">
                      <div className="workspace-section-head">
                        <div>
                          <p className="eyebrow">Supplier Notes</p>
                          <h2>Supplier coordination</h2>
                        </div>
                      </div>
                      <div className="audit-log-list">
                        {booking.services.filter((service) => service.confirmationNotes || service.supplierReference).length === 0 ? (
                          <p className="empty-state">No supplier notes recorded.</p>
                        ) : (
                          booking.services
                            .filter((service) => service.confirmationNotes || service.supplierReference)
                            .slice(0, 6)
                            .map((service) => (
                              <div key={service.id} className="audit-log-item">
                                <strong>{service.supplierName || service.description}</strong>
                                <p>{service.confirmationNotes || service.supplierReference}</p>
                              </div>
                            ))
                        )}
                      </div>
                    </article>

                    <article className="workspace-section booking-ops-panel-card">
                      <div className="workspace-section-head">
                        <div>
                          <p className="eyebrow">Amendment History</p>
                          <h2>{amendmentLabel}</h2>
                        </div>
                      </div>
                      <div className="quote-preview-total-list">
                        <div>
                          <span>Current amendment</span>
                          <strong>{amendmentLabel}</strong>
                        </div>
                        <div>
                          <span>Source amendment</span>
                          <strong>{booking.amendedFromId ? booking.amendedFromId.slice(0, 8).toUpperCase() : 'Original booking'}</strong>
                        </div>
                      </div>
                    </article>
                  </section>

                  <section className="workspace-section booking-ops-panel-card">
                    <div className="workspace-section-head">
                      <div>
                        <p className="eyebrow">Internal Notes</p>
                        <h2>Workflow history</h2>
                      </div>
                    </div>
                    {timeline.length === 0 ? (
                      <BookingOperationsEmptyState
                        eyebrow="Audit Log"
                        title="No workflow activity yet"
                        description="Booking and service audit history will appear here as operations progress."
                      />
                    ) : (
                      <div className="audit-log-list">
                        {timeline.map((entry) => (
                          <div key={entry.id} className="audit-log-item">
                            <strong>{entry.title}</strong>
                            <p>
                              {formatDateTime(entry.createdAt)}
                              {entry.actor ? ` | ${entry.actor}` : ''}
                            </p>
                            {entry.detail ? <p>{entry.detail}</p> : null}
                            {entry.note ? <p>{entry.note}</p> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </section>
              ) : null}
            </div>

            <aside className="booking-ops-sidebar app-sticky-panel">
              <article className="workspace-section booking-ops-sidebar-card booking-dashboard-summary-card app-financial-panel">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Summary</p>
                    <h3>{bookingRef}</h3>
                  </div>
                  <BookingOperationsStatusBadge kind="booking" status={booking.status} />
                </div>
                <div className="booking-ops-sidebar-list">
                  <div>
                    <span>Pax</span>
                    <strong>{totalPax}</strong>
                  </div>
                  <div>
                    <span>Duration</span>
                    <strong>{durationLabel}</strong>
                  </div>
                  <div>
                    <span>Total sell price</span>
                    <strong>{formatMoney(totalSell)}</strong>
                  </div>
                  <div>
                    <span>Total cost</span>
                    <strong>{formatMoney(totalCost)}</strong>
                  </div>
                  <div>
                    <span>Gross profit</span>
                    <strong>{formatMoney(grossProfit)}</strong>
                  </div>
                  <div>
                    <span>Margin %</span>
                    <strong>{marginPercent.toFixed(2)}%</strong>
                  </div>
                  <div>
                    <span>Client</span>
                    <strong>{booking.clientSnapshotJson.name}</strong>
                  </div>
                  <div>
                    <span>Contact</span>
                    <strong>{contactName || 'Contact pending'}</strong>
                  </div>
                  <div>
                    <span>Last update</span>
                    <strong>{formatDateTime(booking.updatedAt)}</strong>
                  </div>
                </div>
                <p className="workspace-sidebar-note">Internal / Admin profit summary. Supplier costs are not included in client documents.</p>
                {primaryAction ? (
                  primaryAction.href ? (
                    <Link href={primaryAction.href} className="primary-button booking-dashboard-primary-action">
                      {primaryAction.label}
                    </Link>
                  ) : (
                    <form action={`/api/bookings/${booking.id}/status`} method="POST" className="booking-dashboard-primary-action-form">
                      <input type="hidden" name="status" value={primaryAction.targetStatus} />
                      <input type="hidden" name="note" value={`${primaryAction.label} from booking dashboard`} />
                      <button type="submit" className="primary-button booking-dashboard-primary-action">
                        {primaryAction.label}
                      </button>
                    </form>
                  )
                ) : (
                  <button type="button" className="primary-button booking-dashboard-primary-action" disabled>
                    No primary action
                  </button>
                )}
              </article>

              <article className="workspace-section booking-ops-sidebar-card">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Readiness</p>
                    <h3>{operationalReadiness.label}</h3>
                  </div>
                  <BookingOperationsStatusBadge kind="readiness" status={operationalReadiness.status} />
                </div>
                <div className="booking-ops-sidebar-list">
                  <div>
                    <span>Rooming</span>
                    <strong>{operationalReadiness.summary.rooming.complete ? 'Complete' : 'Incomplete'}</strong>
                  </div>
                  <div>
                    <span>Pricing unresolved</span>
                    <strong>{operationalReadiness.summary.pricing.unresolved}</strong>
                  </div>
                  <div>
                    <span>Missing transport</span>
                    <strong>{operationalReadiness.summary.transport.missing}</strong>
                  </div>
                  <div>
                    <span>Voucher readiness</span>
                    <strong>{operationalReadiness.summary.vouchers.issued}/{operationalReadiness.summary.vouchers.eligible}</strong>
                  </div>
                  <div>
                    <span>Passenger assignment</span>
                    <strong>{operationalReadiness.summary.passengers.unassigned} unassigned</strong>
                  </div>
                  <div>
                    <span>Excursion readiness</span>
                    <strong>{operationalReadiness.summary.excursions.incomplete}</strong>
                  </div>
                </div>
              </article>

              <article className="workspace-section booking-ops-sidebar-card">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Booking Status</p>
                    <h3>Current state</h3>
                  </div>
                </div>
                <div className="booking-ops-sidebar-list">
                  <div>
                    <span>Lifecycle</span>
                    <strong>{formatBookingStatus(booking.status)}</strong>
                  </div>
                  <div>
                    <span>Client invoice</span>
                    <strong>{formatClientInvoiceStatus(booking.finance.clientInvoiceStatus)}</strong>
                  </div>
                  <div>
                    <span>Supplier payment</span>
                    <strong>{formatSupplierPaymentStatus(booking.finance.supplierPaymentStatus)}</strong>
                  </div>
                  <div>
                    <span>Last updated</span>
                    <strong>{formatDateTime(booking.updatedAt)}</strong>
                  </div>
                </div>
              </article>

              <article className="workspace-section booking-ops-sidebar-card">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Lead Passenger</p>
                    <h3>Primary traveler</h3>
                  </div>
                </div>
                {leadPassenger ? (
                  <div className="booking-ops-sidebar-list">
                    <div>
                      <span>Name</span>
                      <strong>{formatPassengerName(leadPassenger)}</strong>
                    </div>
                    <div>
                      <span>Assignments</span>
                      <strong>{leadPassenger.roomingAssignments.length}</strong>
                    </div>
                    <div>
                      <span>Notes</span>
                      <strong>{leadPassenger.notes || 'No lead notes'}</strong>
                    </div>
                  </div>
                ) : (
                  <BookingOperationsEmptyState
                    eyebrow="Lead Passenger"
                    title="No lead passenger assigned"
                    description="Assign a lead passenger so suppliers and operations have a clear primary traveler."
                  />
                )}
              </article>

              <BookingRoomingSummaryCard
                roomCount={booking.roomingEntries.length}
                assignedPassengers={assignedPassengerIds.size}
                passengerCount={booking.passengers.length}
                roomingIssues={roomingIssues}
              />

              <BookingAlertPanel
                eyebrow="Operational Alerts"
                title="Execution watchlist"
                tone={operationalAlerts.length > 0 ? 'warning' : 'neutral'}
                items={operationalAlerts.map((item, index) => ({
                  id: `operational-alert-${index}`,
                  message: item,
                }))}
                emptyLabel="No operational alerts are currently flagged."
              />

              <article className="workspace-section booking-ops-sidebar-card">
                <div className="workspace-section-head">
                  <div>
                    <p className="eyebrow">Health Checklist</p>
                    <h3>Operational readiness</h3>
                  </div>
                </div>
                <div className="booking-ops-checklist">
                  {healthChecklist.map((item) => (
                    <div key={item.label} className={`booking-ops-checklist-item${item.complete ? ' booking-ops-checklist-item-complete' : ''}`}>
                      <span>{item.complete ? 'Complete' : 'Pending'}</span>
                      <strong>{item.label}</strong>
                    </div>
                  ))}
                </div>
              </article>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
