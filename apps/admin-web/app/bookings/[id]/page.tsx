import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminPageTabs } from '../../components/AdminPageTabs';
import { AdvancedFiltersPanel } from '../../components/AdvancedFiltersPanel';
import { CollapsibleCreatePanel } from '../../components/CollapsibleCreatePanel';
import { InlineRowEditorShell } from '../../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../../components/RowDetailsPanel';
import { SummaryStrip } from '../../components/SummaryStrip';
import { TableSectionShell } from '../../components/TableSectionShell';
import { getMarginColor, getMarginMetrics } from '../../lib/financials';
import { getItineraryDayDisplay } from '../../lib/itineraryDayDisplay';
import { formatNightCountLabel } from '../../lib/formatters';
import { getValidatedTripSummary } from '../../lib/tripSummary';
import { BookingDocumentActions } from './BookingDocumentActions';
import { BookingServicesList } from './BookingServicesList';
import { BookingPortalLinkActions } from './BookingPortalLinkActions';

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
};

type Supplier = {
  id: string;
  name: string;
  type: 'hotel' | 'transport' | 'activity' | 'guide' | 'other';
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
    badge: {
      count: number;
      tone: 'error' | 'warning' | 'none';
      breakdown: {
        unpaidClient: number;
        unpaidSupplier: number;
        negativeMargin: number;
        lowMargin: number;
      };
    };
  };
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
  services: Array<{
    id: string;
    description: string;
    qty: number;
    totalCost: number;
    totalSell: number;
    supplierId: string | null;
    supplierName: string | null;
    serviceType: string;
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
    status: 'pending' | 'ready' | 'in_progress' | 'confirmed' | 'cancelled';
    statusNote: string | null;
    confirmationStatus: 'pending' | 'requested' | 'confirmed';
    confirmationNumber: string | null;
    confirmationNotes: string | null;
    confirmationRequestedAt: string | null;
    confirmationConfirmedAt: string | null;
    auditLogs: AuditLog[];
  }>;
  passengers: Array<{
    id: string;
    firstName: string;
    lastName: string;
    title: string | null;
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
    tab?: 'overview' | 'operations' | 'passengers-rooming' | 'rooming' | 'finance' | 'documents' | 'timeline';
    service?: string;
    warning?: string;
    warningText?: string;
    success?: string;
  }>;
};

type BookingDetailTab = 'overview' | 'operations' | 'passengers-rooming' | 'finance' | 'documents' | 'timeline';

const BOOKING_DETAIL_TABS: Array<{ id: BookingDetailTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'operations', label: 'Operations' },
  { id: 'passengers-rooming', label: 'Passengers & Rooming' },
  { id: 'finance', label: 'Finance' },
  { id: 'documents', label: 'Documents' },
  { id: 'timeline', label: 'Timeline' },
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

function buildFinanceBadgeTooltip(booking: Booking) {
  return buildBadgeTooltip([
    { count: booking.finance.badge.breakdown.unpaidClient, label: 'unpaid client' },
    { count: booking.finance.badge.breakdown.unpaidSupplier, label: 'unpaid supplier' },
    { count: booking.finance.badge.breakdown.negativeMargin, label: 'negative margin' },
    { count: booking.finance.badge.breakdown.lowMargin, label: 'low margin' },
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
  if (tab === 'rooming') {
    return 'passengers-rooming';
  }

  return BOOKING_DETAIL_TABS.some((entry) => entry.id === tab) ? (tab as BookingDetailTab) : 'overview';
}

export default async function BookingPage({ params, searchParams }: BookingPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeTab = resolveActiveBookingTab(resolvedSearchParams?.tab);
  const highlightServiceId = resolvedSearchParams?.service?.trim() || undefined;
  const [booking, suppliers] = await Promise.all([getBooking(id), getSuppliers()]);
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
  const portalUrl = `${APP_BASE_URL}/portal/booking/${booking.id}?token=${encodeURIComponent(booking.accessToken)}`;
  const allowedTransitions = getAllowedBookingStatusTransitions(booking.status);
  const timeline = buildBookingTimeline(booking);
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
  const bookingDocumentsBadgeCount = pendingConfirmationsCount + (booking.accessToken ? 0 : 1);
  const buildTabHref = (tab: BookingDetailTab) => `/bookings/${booking.id}?tab=${tab}`;

  return (
    <main className="page">
      <section className="panel quote-preview-page">
        <Link href={`/quotes/${booking.quote.id}`} className="back-link">
          Back to quote
        </Link>

        <header className="quote-preview-hero">
          <div>
            <p className="eyebrow">Booking Summary</p>
            <h1 className="section-title quote-title">{snapshot.title}</h1>
            <p className="detail-copy">{snapshot.quoteNumber || booking.quote.quoteNumber || 'Quote number pending'}</p>
            <p className="detail-copy">{tripSummary}</p>
            {resolvedSearchParams?.created === '1' ? <p className="detail-copy">Booking created from the accepted quote version.</p> : null}
          </div>
          <div className="quote-preview-meta">
            <strong>Booking {booking.id}</strong>
            <p>Status: {formatBookingStatus(booking.status)}</p>
            <p>
              {totalPax} pax | {snapshot.roomCount} rooms | {formatNightCountLabel(snapshot.nightCount)}
            </p>
            <p>Created {formatDateTime(booking.createdAt)}</p>
          </div>
        </header>

        {(warningMessage || resolvedSearchParams?.success) ? (
          <section className="warning-banner">
            {warningMessage ? renderFeedbackMessage(warningMessage, 'form-error') : null}
            {resolvedSearchParams?.success ? renderFeedbackMessage(resolvedSearchParams.success, 'form-helper') : null}
          </section>
        ) : null}

        <AdminPageTabs
          ariaLabel="Booking detail sections"
          activeTab={activeTab}
          tabs={BOOKING_DETAIL_TABS.map((tab) => ({
            ...tab,
            href: buildTabHref(tab.id),
            badge:
              tab.id === 'operations'
                ? booking.operations.badge.count
                : tab.id === 'passengers-rooming'
                  ? booking.rooming.badge.count
                : tab.id === 'finance'
                  ? booking.finance.badge.count
                  : tab.id === 'documents'
                    ? bookingDocumentsBadgeCount
                    : null,
            badgeTitle:
              tab.id === 'operations'
                ? buildOperationsBadgeTooltip(booking)
                : tab.id === 'passengers-rooming'
                  ? buildRoomingBadgeTooltip(booking)
                  : tab.id === 'finance'
                    ? buildFinanceBadgeTooltip(booking)
                    : undefined,
            badgeTone:
              tab.id === 'operations'
                ? booking.operations.badge.tone === 'none'
                  ? 'default'
                  : booking.operations.badge.tone
                : tab.id === 'passengers-rooming'
                  ? booking.rooming.badge.tone === 'none'
                    ? 'default'
                    : booking.rooming.badge.tone
                : tab.id === 'finance'
                  ? booking.finance.badge.tone === 'none'
                    ? 'default'
                    : booking.finance.badge.tone
                  : tab.id === 'documents'
                    ? 'warning'
                    : 'default',
          }))}
        />

        {activeTab === 'overview' ? (
          <>
            <section className="quote-preview-grid">
              <article className="detail-card">
                <p className="eyebrow">Overview</p>
                <p className="detail-copy">Keep the booking summary, warning signals, and commercial snapshot in one place before drilling into execution.</p>
              </article>

              <article className="detail-card">
                <p className="eyebrow">Key Metrics</p>
                <div className="quote-preview-total-list">
                  <div>
                    <span>Services confirmed</span>
                    <strong>{confirmedServicesCount} / {booking.services.length}</strong>
                  </div>
                  <div>
                    <span>Ops-ready services</span>
                    <strong>{readyServicesCount} / {booking.services.length}</strong>
                  </div>
                  <div>
                    <span>Quoted margin</span>
                    <strong style={{ color: getMarginColor(quotedTotals.tone) }}>{booking.finance.quotedMarginPercent.toFixed(2)}%</strong>
                  </div>
                  <div>
                    <span>Realized margin</span>
                    <strong style={{ color: getMarginColor(realizedTotals.tone) }}>{booking.finance.realizedMarginPercent.toFixed(2)}%</strong>
                  </div>
                </div>
              </article>

              <article className="detail-card">
                <p className="eyebrow">Attention</p>
                {overviewWarnings.length === 0 ? (
                  <p className="detail-copy">No immediate operational or finance warnings.</p>
                ) : (
                  overviewWarnings.map((message) => (
                    <p key={message} className="form-error">
                      {message}
                    </p>
                  ))
                )}
              </article>

              <article className="detail-card">
                <p className="eyebrow">Booking Info</p>
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
                    <span>Created at</span>
                    <strong>{formatDateTime(booking.createdAt)}</strong>
                  </div>
                  <div>
                    <span>Updated at</span>
                    <strong>{formatDateTime(booking.updatedAt)}</strong>
                  </div>
                </div>
                {booking.statusNote ? <p className="detail-copy">Latest override note: {booking.statusNote}</p> : null}
              </article>

              <article className="detail-card">
                <p className="eyebrow">Source Quote</p>
                <div className="quote-preview-total-list">
                  <div>
                    <span>Source quote</span>
                    <strong>{booking.quote.quoteNumber || snapshot.quoteNumber || booking.quote.title}</strong>
                  </div>
                  <div>
                    <span>Quote booking type</span>
                    <strong>{formatBookingType((snapshot.bookingType || booking.bookingType) as BookingType)}</strong>
                  </div>
                  <div>
                    <span>Client</span>
                    <strong>{booking.clientSnapshotJson.name}</strong>
                  </div>
                  <div>
                    <span>Contact</span>
                    <strong>
                      {booking.contactSnapshotJson.firstName} {booking.contactSnapshotJson.lastName}
                    </strong>
                  </div>
                </div>
              </article>

              <article className="detail-card">
                <p className="eyebrow">Accepted Version</p>
                <div className="quote-preview-total-list">
                  <div>
                    <span>Reference</span>
                    <strong>v{booking.acceptedVersion.versionNumber}</strong>
                  </div>
                  <div>
                    <span>Saved at</span>
                    <strong>{formatDateTime(booking.acceptedVersion.createdAt)}</strong>
                  </div>
                </div>
                <p className="detail-copy">{booking.acceptedVersion.label || 'Snapshot saved from the accepted quote state.'}</p>
              </article>

              <article className="detail-card">
                <p className="eyebrow">Option Summary</p>
                <div className="quote-preview-option-list">
                  {snapshot.quoteOptions.length === 0 ? (
                    <p className="empty-state">No hotel options added yet.</p>
                  ) : (
                    snapshot.quoteOptions.map((option) => (
                      <div key={option.id} className="quote-preview-option-row">
                        <div>
                          <strong>{option.name}</strong>
                          <p>{option.notes || 'No notes provided.'}</p>
                        </div>
                        <div>
                          <strong>{formatMoney(option.totalSell)}</strong>
                          <p>{formatMoney(option.pricePerPax)} per pax</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
            </section>

            <section className="detail-card">
              <p className="eyebrow">Trip Program</p>
              <div className="quote-preview-day-list">
                {!hasItineraryDays ? (
                  <p className="empty-state">Detailed day-by-day itinerary will be provided upon confirmation.</p>
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
            </section>

            {hasItineraryDays ? (
              <section className="detail-card">
                <p className="eyebrow">Services Outside Itinerary</p>
                {renderServices(unassignedItems, 'No extra services outside the itinerary.', snapshot)}
              </section>
            ) : null}
          </>
        ) : null}

        {activeTab === 'operations' ? (
          <>
            <section className="section-stack">
              <article className="detail-card">
                <p className="eyebrow">Operations</p>
                <p className="detail-copy">Use this workspace for workflow changes, service execution details, and supplier confirmations without showing every control at once.</p>
              </article>

              <SummaryStrip
                items={[
                  { id: 'services', label: 'Services', value: String(booking.services.length), helper: 'Booked service rows' },
                  { id: 'confirmed', label: 'Confirmed', value: String(confirmedServicesCount), helper: 'Supplier confirmed' },
                  { id: 'ready', label: 'Ops-ready', value: String(readyServicesCount), helper: 'Execution ready' },
                  { id: 'pending', label: 'Pending', value: String(pendingConfirmationsCount), helper: 'Confirmation outstanding' },
                  { id: 'missing-ops', label: 'Missing ops', value: String(activityServicesMissingOpsCount), helper: 'Execution details missing' },
                  { id: 'status', label: 'Booking status', value: formatBookingStatus(booking.status), helper: 'Current workflow state' },
                ]}
              />

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

              <TableSectionShell
                title="Booking services"
                description="Scan services first, then expand individual rows for assignment, confirmation, operational detail, and audit."
                context={<p>{booking.services.length} services in this booking</p>}
              >
                <BookingServicesList
                  services={booking.services}
                  suppliers={suppliers}
                  formatMoney={formatMoney}
                  formatBookingServiceStatus={formatBookingServiceStatus}
                  formatConfirmationStatus={formatConfirmationStatus}
                  formatDateTime={formatDateTime}
                  highlightServiceId={highlightServiceId}
                />
              </TableSectionShell>
            </section>
          </>
        ) : null}

        {activeTab === 'passengers-rooming' ? (
          <>
            <section className="section-stack">
              <article className="detail-card">
                <p className="eyebrow">Passengers & Rooming</p>
                <p className="detail-copy">Traveler records and room allocation now stay compact by default so assignment work is easier to scan.</p>
              </article>

              <SummaryStrip
                items={[
                  { id: 'passengers', label: 'Passengers', value: String(booking.passengers.length), helper: 'Traveler records' },
                  {
                    id: 'lead',
                    label: 'Lead passenger',
                    value: booking.passengers.find((passenger) => passenger.isLead) ? 'Assigned' : 'Missing',
                    helper: 'Primary traveler owner',
                  },
                  { id: 'rooms', label: 'Rooms', value: String(booking.roomingEntries.length), helper: 'Rooming entries' },
                  { id: 'assigned', label: 'Assigned', value: String(assignedPassengerIds.size), helper: 'Passengers placed in rooms' },
                ]}
              />

              <TableSectionShell
                title="Passengers"
                description="Scan passenger records first, then expand rows for edits and lead-passenger controls."
                context={<p>{booking.passengers.length} passengers in scope</p>}
                createPanel={
                  <CollapsibleCreatePanel title="Add passenger" description="Create a traveler record while keeping the existing manifest visible." triggerLabelOpen="Add passenger">
                    <InlineRowEditorShell>
                      <form action={`/api/bookings/${booking.id}/passengers`} method="POST" className="quote-status-form">
                        <label>
                          Title
                          <input type="text" name="title" placeholder="Mr / Ms / Dr" />
                        </label>
                        <label>
                          First name
                          <input type="text" name="firstName" required />
                        </label>
                        <label>
                          Last name
                          <input type="text" name="lastName" required />
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
                emptyState={<p className="empty-state">No passenger records have been added yet.</p>}
              >
                {booking.passengers.length > 0 ? (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Passenger</th>
                          <th>Lead</th>
                          <th>Assignments</th>
                          <th>Notes</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {booking.passengers.map((passenger) => (
                          <tr key={passenger.id}>
                            <td>
                              <strong>{formatPassengerName(passenger)}</strong>
                            </td>
                            <td>{passenger.isLead ? 'Lead' : 'Passenger'}</td>
                            <td>{passenger.roomingAssignments.length}</td>
                            <td>{passenger.notes || 'No passenger notes'}</td>
                            <td>
                              <RowDetailsPanel summary="Open details" description="Edit passenger, update lead ownership, or remove" className="operations-row-details" bodyClassName="operations-row-details-body">
                                <InlineRowEditorShell>
                                  <form action={`/api/bookings/${booking.id}/passengers/${passenger.id}`} method="POST" className="quote-status-form">
                                    <input type="hidden" name="intent" value="update" />
                                    <label>
                                      Title
                                      <input type="text" name="title" defaultValue={passenger.title || ''} />
                                    </label>
                                    <label>
                                      First name
                                      <input type="text" name="firstName" defaultValue={passenger.firstName} required />
                                    </label>
                                    <label>
                                      Last name
                                      <input type="text" name="lastName" defaultValue={passenger.lastName} required />
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

              <TableSectionShell
                title="Rooming"
                description="Room entries stay collapsed by default so you can scan occupancy and assignment gaps before opening room-level controls."
                context={<p>{booking.roomingEntries.length} rooming entries in scope</p>}
                createPanel={
                  <CollapsibleCreatePanel title="Add room" description="Create a rooming entry without pushing the full room list off screen." triggerLabelOpen="Add room">
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
                emptyState={<p className="empty-state">No rooming entries have been created yet.</p>}
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
          </>
        ) : null}

        {activeTab === 'finance' ? (
          <>
            <section className="section-stack">
              <article className="detail-card">
                <p className="eyebrow">Finance</p>
                <p className="detail-copy">Commercial tracking stays summary-first, while finance controls and scenario tables open only when needed.</p>
              </article>

              <SummaryStrip
                items={[
                  { id: 'quoted-margin', label: 'Quoted margin %', value: `${booking.finance.quotedMarginPercent.toFixed(2)}%`, helper: formatMoney(booking.finance.quotedMargin) },
                  { id: 'realized-margin', label: 'Realized margin %', value: `${booking.finance.realizedMarginPercent.toFixed(2)}%`, helper: formatMoney(booking.finance.realizedMargin) },
                  { id: 'client-invoice', label: 'Client invoice', value: formatClientInvoiceStatus(booking.finance.clientInvoiceStatus), helper: booking.finance.hasUnpaidClientBalance ? 'Balance still open' : 'No client balance issue' },
                  { id: 'supplier-payment', label: 'Supplier payment', value: formatSupplierPaymentStatus(booking.finance.supplierPaymentStatus), helper: booking.finance.hasUnpaidSupplierObligation ? 'Supplier obligations open' : 'No supplier issue' },
                ]}
              />

              <section className="quote-preview-grid">
                <article className="detail-card">
                  <p className="eyebrow">Quoted Profitability</p>
                  <div className="quote-preview-total-list">
                    <div>
                      <span>Quoted total cost</span>
                      <strong>{formatMoney(booking.finance.quotedTotalCost)}</strong>
                    </div>
                    <div>
                      <span>Quoted total sell</span>
                      <strong>{formatMoney(booking.finance.quotedTotalSell)}</strong>
                    </div>
                    <div>
                      <span>Quoted margin</span>
                      <strong style={{ color: getMarginColor(quotedTotals.tone) }}>{formatMoney(booking.finance.quotedMargin)}</strong>
                    </div>
                    <div>
                      <span>Quoted margin %</span>
                      <strong style={{ color: getMarginColor(quotedTotals.tone) }}>{booking.finance.quotedMarginPercent.toFixed(2)}%</strong>
                    </div>
                  </div>
                </article>

                <article className="detail-card">
                  <p className="eyebrow">Realized Profitability</p>
                  <div className="quote-preview-total-list">
                    <div>
                      <span>Realized total cost</span>
                      <strong>{formatMoney(booking.finance.realizedTotalCost)}</strong>
                    </div>
                    <div>
                      <span>Realized total sell</span>
                      <strong>{formatMoney(booking.finance.realizedTotalSell)}</strong>
                    </div>
                    <div>
                      <span>Realized margin</span>
                      <strong style={{ color: getMarginColor(realizedTotals.tone) }}>{formatMoney(booking.finance.realizedMargin)}</strong>
                    </div>
                    <div>
                      <span>Realized margin %</span>
                      <strong style={{ color: getMarginColor(realizedTotals.tone) }}>{booking.finance.realizedMarginPercent.toFixed(2)}%</strong>
                    </div>
                  </div>
                  {realizedTotals.isNegative ? <p className="form-error">Warning: this booking is currently below cost.</p> : null}
                  {booking.finance.hasLowMargin && !realizedTotals.isNegative ? <p className="detail-copy">Margin is below the operational threshold.</p> : null}
                </article>
              </section>

              <AdvancedFiltersPanel title="Finance controls" description="Invoice and supplier payment tracking">
                <InlineRowEditorShell>
                  <div className="quote-preview-total-list">
                    <div>
                      <span>Client invoice</span>
                      <strong>{formatClientInvoiceStatus(booking.finance.clientInvoiceStatus)}</strong>
                    </div>
                    <div>
                      <span>Supplier payment</span>
                      <strong>{formatSupplierPaymentStatus(booking.finance.supplierPaymentStatus)}</strong>
                    </div>
                  </div>
                  {booking.finance.hasUnpaidClientBalance ? <p className="form-error">Client balance is not fully paid.</p> : null}
                  {booking.finance.hasUnpaidSupplierObligation ? <p className="form-error">Supplier obligations are still open.</p> : null}
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
                description="Group pricing remains available, but stays out of the main scan path until needed."
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
          </>
        ) : null}

        {activeTab === 'documents' ? (
          <>
            <section className="section-stack">
              <article className="detail-card">
                <p className="eyebrow">Documents</p>
                <p className="detail-copy">Document actions stay grouped in one compact workspace so sharing and send actions do not dominate the whole tab.</p>
              </article>

              <SummaryStrip
                items={[
                  { id: 'portal', label: 'Portal', value: 'Live', helper: 'Client access link available' },
                  { id: 'voucher', label: 'Voucher', value: 'Ready', helper: 'Open or send from details' },
                  { id: 'supplier-confirmation', label: 'Supplier confirmation', value: 'Ready', helper: 'Open or send from details' },
                ]}
              />

              <TableSectionShell
                title="Document surfaces"
                description="Keep document actions collapsed by default and open each surface only when you need to share or send."
                context={<p>3 document surfaces in scope</p>}
              >
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Surface</th>
                        <th>Status</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>
                          <strong>Client portal</strong>
                          <div className="table-subcopy">{portalUrl}</div>
                        </td>
                        <td>Live</td>
                        <td>
                          <RowDetailsPanel summary="Open details" description="Portal link and sharing actions" className="operations-row-details" bodyClassName="operations-row-details-body">
                            <InlineRowEditorShell>
                              <div className="quote-preview-total-list">
                                <div>
                                  <span>Portal link</span>
                                  <strong>{portalUrl}</strong>
                                </div>
                              </div>
                              <BookingPortalLinkActions apiBaseUrl={ACTION_API_BASE_URL} bookingId={booking.id} portalUrl={portalUrl} />
                            </InlineRowEditorShell>
                          </RowDetailsPanel>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <strong>Voucher</strong>
                          <div className="table-subcopy">Client-facing booking voucher</div>
                        </td>
                        <td>Ready</td>
                        <td>
                          <RowDetailsPanel summary="Open details" description="Open voucher and trigger send actions" className="operations-row-details" bodyClassName="operations-row-details-body">
                            <InlineRowEditorShell>
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
                            </InlineRowEditorShell>
                          </RowDetailsPanel>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <strong>Supplier confirmation</strong>
                          <div className="table-subcopy">Supplier-facing booking confirmation</div>
                        </td>
                        <td>Ready</td>
                        <td>
                          <RowDetailsPanel summary="Open details" description="Open supplier confirmation and trigger send actions" className="operations-row-details" bodyClassName="operations-row-details-body">
                            <InlineRowEditorShell>
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
                            </InlineRowEditorShell>
                          </RowDetailsPanel>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </TableSectionShell>
            </section>
          </>
        ) : null}

        {activeTab === 'timeline' ? (
          <>
            <section className="quote-preview-grid">
              <article className="detail-card">
                <p className="eyebrow">Timeline</p>
                <p className="detail-copy">Audit history for booking-level and service-level workflow changes.</p>
              </article>
            </section>

            <section className="detail-card">
              <p className="eyebrow">Workflow Timeline</p>
              {timeline.length === 0 ? (
                <p className="empty-state">No workflow activity yet.</p>
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
          </>
        ) : null}
      </section>
    </main>
  );
}
