import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminPageTabs } from '../../components/AdminPageTabs';
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
import { BookingOperationsHeader } from './BookingOperationsHeader';
import { BookingOperationsStatCard } from './BookingOperationsStatCard';
import { BookingOperationsStatusBadge } from './BookingOperationsStatusBadge';
import { getValidatedTripSummary } from '../../lib/tripSummary';
import { BookingDocumentActions } from './BookingDocumentActions';
import { BookingRoomingSummaryCard } from './BookingRoomingSummaryCard';
import { BookingServiceTimeline } from './BookingServiceTimeline';
import { BookingPortalLinkActions } from './BookingPortalLinkActions';
import { BookingFinancialsTab } from './BookingFinancialsTab';
import { type BookingPaymentRecord } from './BookingPaymentsSection';

import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../../lib/admin-server';

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

type BookingStatus = 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
type BookingType = 'FIT' | 'GROUP' | 'SERIES';
type ClientInvoiceStatus = 'unbilled' | 'invoiced' | 'paid';
type SupplierPaymentStatus = 'unpaid' | 'scheduled' | 'paid';
type AuditEntityType = 'booking' | 'booking_service';

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
  type: 'TRANSPORT' | 'HOTEL' | 'GUIDE' | 'EXTERNAL_PACKAGE';
  supplierId: string;
  status: 'DRAFT' | 'ISSUED' | 'CANCELLED';
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
  accessToken: string;
  bookingType: BookingType;
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
    supplierId: string | null;
    supplierName: string | null;
    serviceType: string;
    operationType?: 'TRANSPORT' | 'GUIDE' | 'HOTEL' | 'ACTIVITY' | 'EXTERNAL_PACKAGE' | null;
    operationStatus?: 'PENDING' | 'REQUESTED' | 'CONFIRMED' | 'DONE';
    referenceId?: string | null;
    assignedTo?: string | null;
    guidePhone?: string | null;
    vehicleId?: string | null;
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
    notes: string | null;
    status: 'pending' | 'ready' | 'in_progress' | 'confirmed' | 'cancelled';
    statusNote: string | null;
    confirmationStatus: 'pending' | 'requested' | 'confirmed';
    confirmationNumber: string | null;
    confirmationNotes: string | null;
    confirmationRequestedAt: string | null;
    confirmationConfirmedAt: string | null;
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
  }>;
};

type BookingDetailTab = 'overview' | 'services' | 'passengers' | 'rooming' | 'financials' | 'documents' | 'audit-log';

const BOOKING_DETAIL_TABS: Array<{ id: BookingDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'services', label: 'Operations' },
  { id: 'passengers', label: 'Passengers' },
  { id: 'rooming', label: 'Rooming' },
  { id: 'financials', label: 'Financials' },
  { id: 'documents', label: 'Documents' },
  { id: 'audit-log', label: 'Audit Log' },
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

function formatMoney(amount: number, currency = 'USD') {
  return `${currency} ${amount.toFixed(2)}`;
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

function getRoomOccupancyCapacity(value: 'single' | 'double' | 'triple' | 'quad' | 'unknown') {
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

function renderOperationTypeOptions(defaultValue?: string | null) {
  return (
    <select name="type" defaultValue={defaultValue || 'TRANSPORT'} required>
      <option value="TRANSPORT">Transport</option>
      <option value="GUIDE">Guide</option>
      <option value="HOTEL">Hotel</option>
      <option value="ACTIVITY">Activity</option>
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
      <option value="DONE">Done</option>
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

function resolveActiveBookingTab(tab?: string): BookingDetailTab {
  if (tab === 'operations') return 'services';
  if (tab === 'passengers-rooming') return 'passengers';
  if (tab === 'finance') return 'financials';
  if (tab === 'timeline') return 'audit-log';

  return BOOKING_DETAIL_TABS.some((entry) => entry.id === tab) ? (tab as BookingDetailTab) : 'overview';
}

export default async function BookingPage({ params, searchParams }: BookingPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeTab = resolveActiveBookingTab(resolvedSearchParams?.tab);
  const highlightServiceId = resolvedSearchParams?.service?.trim() || undefined;
  const [booking, suppliers, vehicles, transportRoutes] = await Promise.all([getBooking(id), getSuppliers(), getVehicles(), getRoutes()]);
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
  const tripSummary = getValidatedTripSummary({
    quoteTitle: snapshot.title,
    quoteDescription: snapshot.description,
    dayTitles: sortedDays.map((day) => day.title),
    totalPax,
    nightCount: snapshot.nightCount,
  });
  const portalUrl = `${APP_BASE_URL}/invoice/${encodeURIComponent(booking.accessToken)}`;
  const allowedTransitions = getAllowedBookingStatusTransitions(booking.status);
  const timeline = buildBookingTimeline(booking);
  const bookingPayments = booking.payments;
  const bookingRef = snapshot.quoteNumber || booking.quote.quoteNumber || booking.id;
  const assignedPassengerIds = new Set(
    booking.roomingEntries.flatMap((entry) => entry.assignments.map((assignment) => assignment.bookingPassenger.id)),
  );
  const confirmedServicesCount = booking.services.filter((service) => service.confirmationStatus === 'confirmed').length;
  const pendingConfirmationsCount = booking.services.filter((service) => service.confirmationStatus !== 'confirmed').length;
  const readyServicesCount = booking.services.filter((service) => service.status === 'ready' || service.status === 'confirmed').length;
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

  return (
    <main className="page booking-ops-page">
      <section className="panel booking-ops-workspace-page">
        <div className="booking-ops-shell">
          <BookingOperationsHeader
            bookingId={booking.id}
            bookingRef={bookingRef}
            title={snapshot.title}
            companyName={booking.clientSnapshotJson.name}
            contactName={`${booking.contactSnapshotJson.firstName} ${booking.contactSnapshotJson.lastName}`}
            travelSummary={tripSummary}
            badges={
              <>
                <BookingOperationsStatusBadge kind="booking" status={booking.status} />
                <BookingOperationsStatusBadge kind="invoice" status={booking.finance.clientInvoiceStatus} />
                <BookingOperationsStatusBadge kind="supplier-payment" status={booking.finance.supplierPaymentStatus} />
              </>
            }
            actions={
              <>
                <Link href={`/quotes/${booking.quote.id}`} className="secondary-button">
                  Source quote
                </Link>
                <Link href={`/bookings/${booking.id}/voucher`} className="secondary-button">
                  Voucher
                </Link>
              </>
            }
          />

          <section className="booking-ops-stat-grid">
            <BookingOperationsStatCard label="Total services" value={booking.services.length} helper="Booked execution rows" />
            <BookingOperationsStatCard label="Confirmed services" value={confirmedServicesCount} helper="Supplier confirmed" />
            <BookingOperationsStatCard
              label="Pending confirmations"
              value={pendingConfirmationsCount}
              helper="Outstanding supplier follow-up"
              tone={pendingConfirmationsCount > 0 ? 'accent' : 'default'}
            />
            <BookingOperationsStatCard
              label="Supplier payment"
              value={formatSupplierPaymentStatus(booking.finance.supplierPaymentStatus)}
              helper={booking.finance.hasUnpaidSupplierObligation ? 'Obligations still open' : 'Supplier side in shape'}
              tone={booking.finance.hasUnpaidSupplierObligation ? 'accent' : 'default'}
            />
            <BookingOperationsStatCard
              label="Party"
              value={`${totalPax} pax`}
              helper={`${snapshot.roomCount} rooms / ${formatNightCountLabel(snapshot.nightCount)}`}
            />
            <BookingOperationsStatCard
              label="Created"
              value={formatDateTime(booking.createdAt)}
              helper={resolvedSearchParams?.created === '1' ? 'Created from accepted quote version' : 'Execution record live'}
            />
          </section>

          {(warningMessage || resolvedSearchParams?.success) ? (
            <section className="warning-banner">
              {warningMessage ? renderFeedbackMessage(warningMessage, 'form-error') : null}
              {resolvedSearchParams?.success ? renderFeedbackMessage(resolvedSearchParams.success, 'form-helper') : null}
            </section>
          ) : null}

          <div className="booking-ops-tab-shell">
            <AdminPageTabs
              ariaLabel="Booking detail sections"
              activeTab={activeTab}
              tabs={BOOKING_DETAIL_TABS.map((tab) => ({
                ...tab,
                href: buildTabHref(tab.id),
                badge:
                  tab.id === 'services'
                    ? booking.operations.badge.count
                    : tab.id === 'rooming'
                      ? booking.rooming.badge.count
                      : tab.id === 'financials'
                        ? booking.finance.badge.count
                        : null,
                badgeTitle:
                  tab.id === 'services'
                    ? buildOperationsBadgeTooltip(booking)
                    : tab.id === 'rooming'
                      ? buildRoomingBadgeTooltip(booking)
                      : tab.id === 'financials'
                        ? buildFinanceBadgeTooltip(booking)
                        : undefined,
                badgeTone:
                  tab.id === 'services'
                    ? booking.operations.badge.tone === 'none'
                      ? 'default'
                      : booking.operations.badge.tone
                    : tab.id === 'rooming'
                      ? booking.rooming.badge.tone === 'none'
                        ? 'default'
                        : booking.rooming.badge.tone
                      : tab.id === 'financials'
                        ? booking.finance.badge.tone === 'none'
                          ? 'default'
                          : booking.finance.badge.tone
                        : 'default',
              }))}
            />
          </div>

          <div className="booking-ops-layout">
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
                      <p className="eyebrow">Guarantee Letter</p>
                      <p className="detail-copy">Includes passenger manifest, travel details, program, transport, and guide assignment details.</p>
                      <div className="workspace-document-actions">
                        <Link href={`/api/bookings/${booking.id}/guarantee-letter`} className="secondary-button">
                          Generate Guarantee Letter
                        </Link>
                      </div>
                    </article>
                    <article className="detail-card">
                      <p className="eyebrow">Voucher</p>
                      <Link href={`/bookings/${booking.id}/voucher`} className="secondary-button">
                        Open voucher
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
                                <Link href={`/api/vouchers/${voucher.id}/pdf`} className="secondary-button">
                                  PDF
                                </Link>
                                {voucher.status === 'DRAFT' ? (
                                  <form action={`/api/vouchers/${voucher.id}/status`} method="POST">
                                    <input type="hidden" name="status" value="ISSUED" />
                                    <button type="submit">Issue</button>
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
                                    <th>Type</th>
                                    <th>Assignment</th>
                                    <th>Supplier</th>
                                    <th>Status</th>
                                    <th>Notes</th>
                                    <th>Action</th>
                                    <th>Voucher</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {dayServices.map((service) => (
                                    <tr key={service.id}>
                                      <td>{formatOperationType(service.operationType || service.serviceType)}</td>
                                      <td>
                                        {service.operationType === 'TRANSPORT'
                                          ? [service.assignedTo, service.pickupTime].filter(Boolean).join(' / ') || 'Transport pending'
                                          : service.operationType === 'GUIDE'
                                            ? [service.assignedTo, service.guidePhone].filter(Boolean).join(' / ') || 'Guide pending'
                                            : service.operationType === 'HOTEL'
                                              ? service.confirmationNumber || 'Confirmation pending'
                                              : service.description}
                                      </td>
                                      <td>{service.supplierName || 'Not assigned'}</td>
                                      <td>{service.operationStatus || service.confirmationStatus.toUpperCase()}</td>
                                      <td>{service.notes || service.confirmationNotes || 'No notes'}</td>
                                      <td>
                                        {service.operationType === 'EXTERNAL_PACKAGE' ? (
                                          <form action={`/api/bookings/${booking.id}/days/${day.id}/services/${service.id}`} method="POST" className="quote-status-form">
                                            <input type="hidden" name="type" value="EXTERNAL_PACKAGE" />
                                            <label>
                                              Status
                                              {renderOperationStatusOptions(service.operationStatus)}
                                            </label>
                                            <label>
                                              Notes
                                              <input type="text" name="notes" defaultValue={service.notes || ''} />
                                            </label>
                                            <button type="submit">Update</button>
                                          </form>
                                        ) : (
                                          <details>
                                            <summary>Edit</summary>
                                            <form action={`/api/bookings/${booking.id}/days/${day.id}/services/${service.id}`} method="POST" className="quote-status-form">
                                              <label>
                                                Type
                                                {renderOperationTypeOptions(service.operationType || service.serviceType)}
                                              </label>
                                              <label>
                                                Route
                                                {renderRouteOptions(transportRoutes, service.referenceId)}
                                              </label>
                                              <label>
                                                Vehicle
                                                {renderVehicleOptions(vehicles, service.vehicleId)}
                                              </label>
                                              <label>
                                                Supplier
                                                {renderSupplierOptions(suppliers, service.supplierId)}
                                              </label>
                                              <label>
                                                Driver / guide
                                                <input type="text" name="assignedTo" defaultValue={service.assignedTo || ''} />
                                              </label>
                                              <label>
                                                Guide phone
                                                <input type="text" name="guidePhone" defaultValue={service.guidePhone || ''} />
                                              </label>
                                              <label>
                                                Pickup time
                                                <input type="time" name="pickupTime" defaultValue={service.pickupTime || ''} />
                                              </label>
                                              <label>
                                                Confirmation
                                                <input type="text" name="confirmationNumber" defaultValue={service.confirmationNumber || ''} />
                                              </label>
                                              <label>
                                                Status
                                                {renderOperationStatusOptions(service.operationStatus)}
                                              </label>
                                              <label>
                                                Notes
                                                <input type="text" name="notes" defaultValue={service.notes || ''} />
                                              </label>
                                              <div className="quote-status-actions">
                                                <button type="submit">Save</button>
                                                <button type="submit" name="_method" value="DELETE" className="secondary-button">
                                                  Delete
                                                </button>
                                              </div>
                                            </form>
                                          </details>
                                        )}
                                      </td>
                                      <td>
                                        {service.vouchers && service.vouchers.length > 0 ? (
                                          <Link href={`/api/vouchers/${service.vouchers[0].id}/pdf`} className="secondary-button">
                                            Voucher PDF
                                          </Link>
                                        ) : (
                                          <form action={`/api/bookings/${booking.id}/services/${service.id}/voucher`} method="POST" className="quote-status-form">
                                            <input type="hidden" name="notes" value={service.notes || ''} />
                                            <button type="submit">Generate Voucher</button>
                                          </form>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                  {dayServices.length === 0 ? (
                                    <tr>
                                      <td colSpan={7}>No services assigned to this booking day.</td>
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
                      highlightServiceId={highlightServiceId}
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
                              <th>Nationality</th>
                              <th>Passport</th>
                              <th>Expiry</th>
                              <th>Role</th>
                              <th>Assignments</th>
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
                                <td>{passenger.nationality || 'Missing'}</td>
                                <td>{passenger.passportNumberMasked || 'Missing'}</td>
                                <td>{formatDateOnly(passenger.passportExpiryDate)}</td>
                                <td>{passenger.isLead ? 'Lead' : 'Passenger'}</td>
                                <td>{passenger.roomingAssignments.length}</td>
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
                  <TableSectionShell
                    title="Rooming"
                    description="Room entries, occupancy, and passenger assignments."
                    context={<p>{booking.roomingEntries.length} rooming entries in scope</p>}
                    createPanel={
                      <CollapsibleCreatePanel title="Add room" description="Create a rooming entry without pushing the room list off screen." triggerLabelOpen="Add room">
                        <InlineRowEditorShell>
                          <form action={`/api/bookings/${booking.id}/rooming`} method="POST" className="quote-status-form">
                            <label>
                              Room type
                              <input type="text" name="roomType" placeholder="DBL Sea View / Family Room" />
                            </label>
                            <label>
                              Occupancy
                              <select name="occupancy" defaultValue="unknown">
                                <option value="unknown">Unknown</option>
                                <option value="single">Single</option>
                                <option value="double">Double</option>
                                <option value="triple">Triple</option>
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
                              const capacity = getRoomOccupancyCapacity(entry.occupancy);
                              const availablePassengers = booking.passengers.filter(
                                (passenger) =>
                                  !assignedPassengerIds.has(passenger.id) ||
                                  entry.assignments.some((assignment) => assignment.bookingPassenger.id === passenger.id),
                              );

                              return (
                                <tr key={entry.id}>
                                  <td>
                                    <strong>{getRoomLabel(entry)}</strong>
                                  </td>
                                  <td>{formatRoomOccupancy(entry.occupancy)}</td>
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
                                            Room type
                                            <input type="text" name="roomType" defaultValue={entry.roomType || ''} />
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
                                            Assign passenger
                                            <select
                                              name="passengerId"
                                              defaultValue=""
                                              disabled={availablePassengers.length === 0 || (capacity !== null && entry.assignments.length >= capacity)}
                                            >
                                              <option value="" disabled>
                                                {availablePassengers.length === 0
                                                  ? 'No unassigned passengers'
                                                  : capacity !== null && entry.assignments.length >= capacity
                                                    ? 'Room occupancy is full'
                                                    : 'Select passenger'}
                                              </option>
                                              {availablePassengers.map((passenger) => (
                                                <option key={passenger.id} value={passenger.id}>
                                                  {formatPassengerName(passenger)}
                                                </option>
                                              ))}
                                            </select>
                                          </label>
                                          <div className="quote-status-actions">
                                            <button
                                              type="submit"
                                              disabled={availablePassengers.length === 0 || (capacity !== null && entry.assignments.length >= capacity)}
                                            >
                                              Assign passenger
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
                  <section className="workspace-section booking-ops-panel-card">
                    <div className="workspace-section-head">
                      <div>
                        <p className="eyebrow">Audit Log</p>
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

            <aside className="booking-ops-sidebar">
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
