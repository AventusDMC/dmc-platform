import { AdvancedFiltersPanel } from '../components/AdvancedFiltersPanel';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { AdminForbiddenState } from '../components/AdminForbiddenState';
import { CompactFilterBar } from '../components/CompactFilterBar';
import { PageActionBar } from '../components/PageActionBar';
import { RowDetailsPanel } from '../components/RowDetailsPanel';
import { SummaryStrip } from '../components/SummaryStrip';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { getMarginColor, getMarginMetrics } from '../lib/financials';
import {
  buildFinanceTooltip,
  buildOperationsTooltip,
  buildRoomingTooltip,
  getBookingAttentionSeverity,
  getBookingFinanceHref,
  getBookingOperationsHref,
  getBookingRoomingHref,
  type FinanceBadge,
  type OperationsBadge,
  type RoomingBadge,
} from '../lib/bookingAttention';
import { BookingQuickActions } from './BookingQuickActions';
import { OperationsBulkActionsProvider, OperationsBulkGroupVisibility, OperationsBulkSelectionCheckbox } from './OperationsBulkActions';

import { ADMIN_API_BASE_URL, adminPageFetchJson, isAdminForbiddenError } from '../lib/admin-server';
import { canAccessOperations, readSessionActor } from '../lib/auth-session';

const API_BASE_URL = ADMIN_API_BASE_URL;
const LOW_MARGIN_THRESHOLD_LABEL = '<10%';

type BookingStatus = 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
type ClientInvoiceStatus = 'unbilled' | 'invoiced' | 'paid';
type SupplierPaymentStatus = 'unpaid' | 'scheduled' | 'paid';
type BookingServiceLifecycleStatus = 'pending' | 'ready' | 'in_progress' | 'confirmed' | 'cancelled';
type BookingServiceConfirmationStatus = 'pending' | 'requested' | 'confirmed';
type BookingOperationServiceStatus = 'PENDING' | 'REQUESTED' | 'CONFIRMED' | 'DONE';
type OperationsWarningFilter =
  | 'missing_supplier'
  | 'pending_confirmation'
  | 'missing_pricing'
  | 'missing_service_date'
  | 'missing_activity_operational_data'
  | 'reconfirmation_due';
type OperationsReportFilter =
  | 'all'
  | 'blocked_bookings'
  | 'bulk_skips'
  | 'unresolved_issues'
  | 'pending_confirmations'
  | 'cancelled_services'
  | 'low_margin'
  | 'unpaid_clients'
  | 'unpaid_suppliers';
type GroupBy = 'booking' | 'supplier';
type AuditLog = {
  id: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  actorUserId?: string | null;
  actor: string | null;
  createdAt: string;
};

type AllowedBookingStatus = BookingStatus;

type BookingService = {
  id: string;
  description: string;
  serviceType: string;
  supplierId: string | null;
  supplierName: string | null;
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
  totalCost: number;
  totalSell: number;
  status: BookingServiceLifecycleStatus;
  statusNote: string | null;
  confirmationStatus: BookingServiceConfirmationStatus;
  confirmationNumber: string | null;
  confirmationNotes: string | null;
  confirmationRequestedAt: string | null;
  confirmationConfirmedAt: string | null;
  auditLogs: AuditLog[];
};

type Booking = {
  id: string;
  bookingRef: string;
  status: BookingStatus;
  statusNote: string | null;
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
    badge: FinanceBadge;
  };
  operations: {
    badge: OperationsBadge;
  };
  rooming: {
    badge: RoomingBadge;
  };
  auditLogs: AuditLog[];
  services: BookingService[];
};

type Supplier = {
  id: string;
  name: string;
  type: 'hotel' | 'transport' | 'activity' | 'guide' | 'other';
};

type OperationsDashboardItem = {
  id: string;
  bookingId?: string;
  bookingRef?: string | null;
  title?: string | null;
  bookingTitle?: string | null;
  description?: string | null;
  status?: string | null;
  operationStatus?: BookingOperationServiceStatus | string | null;
  startDate?: string | null;
  endDate?: string | null;
  serviceDate?: string | null;
  pax?: number | null;
  reasons?: string[];
};

type OperationsDashboardBucket = {
  count: number;
  items: OperationsDashboardItem[];
};

type OperationsDashboard = {
  filters: {
    date: string;
    bookingStatus: string;
    serviceStatus: string;
  };
  todayArrivals: OperationsDashboardBucket;
  todayDepartures: OperationsDashboardBucket;
  activeBookings: OperationsDashboardBucket;
  pendingServices: OperationsDashboardBucket;
  unconfirmedServices: OperationsDashboardBucket;
  missingPassengers: OperationsDashboardBucket;
  upcomingBorderCrossings: OperationsDashboardBucket;
  alerts: {
    bookingsWithNoPassengers: OperationsDashboardBucket;
    servicesWithoutSupplierOrAssignment: OperationsDashboardBucket;
    missingTransportAssignmentForToday: OperationsDashboardBucket;
  };
};

type OperationsPageProps = {
  searchParams?: Promise<{
    serviceStatus?: BookingServiceLifecycleStatus | 'all';
    confirmationStatus?: BookingServiceConfirmationStatus | 'all';
    bookingStatus?: BookingStatus | 'all';
    serviceTypeScope?: 'all' | 'activity';
    warning?: OperationsWarningFilter | 'all';
    report?: OperationsReportFilter;
    groupBy?: GroupBy;
    date?: string;
    filter?: string;
    warningMessage?: string;
    warningText?: string;
    success?: string;
  }>;
};

type OperationRow = {
  id: string;
  description: string;
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
  bookingId: string;
  bookingRef: string;
  bookingStatus: BookingStatus;
  bookingStatusNote: string | null;
  supplierId: string | null;
  supplierName: string | null;
  totalCost: number;
  totalSell: number;
  status: BookingServiceLifecycleStatus;
  statusNote: string | null;
  confirmationStatus: BookingServiceConfirmationStatus;
  confirmationNumber: string | null;
  confirmationNotes: string | null;
  confirmationRequestedAt: string | null;
  confirmationConfirmedAt: string | null;
  warnings: OperationsWarningFilter[];
  auditLogs: AuditLog[];
};

type BookingSummary = {
  bookingId: string;
  bookingRef: string;
  status: BookingStatus;
  clientInvoiceStatus: ClientInvoiceStatus;
  supplierPaymentStatus: SupplierPaymentStatus;
  quotedTotalCost: number;
  quotedTotalSell: number;
  quotedMargin: number;
  quotedMarginPercent: number;
  totalCost: number;
  totalSell: number;
  margin: number;
  marginPercent: number;
  tone: 'positive' | 'low' | 'negative';
  activeServiceCount: number;
  unresolvedIssueCount: number;
};

type BlockedBooking = {
  bookingId: string;
  bookingRef: string;
  nextStep: 'Move To In Progress' | 'Complete Booking';
  reasons: string[];
  blockerCount: number;
};

async function getBookings(): Promise<Booking[]> {
  return adminPageFetchJson<Booking[]>(`${API_BASE_URL}/bookings`, 'Operations bookings', {
    cache: 'no-store',
  });
}

async function getSuppliers(): Promise<Supplier[]> {
  return adminPageFetchJson<Supplier[]>(`${API_BASE_URL}/suppliers`, 'Operations suppliers', {
    cache: 'no-store',
  });
}

async function getOperationsDashboard(params: {
  date?: string;
  bookingStatus?: BookingStatus | 'all';
  serviceStatus?: BookingServiceLifecycleStatus | 'all';
}): Promise<OperationsDashboard> {
  const query = new URLSearchParams();
  if (params.date) query.set('date', params.date);
  if (params.bookingStatus && params.bookingStatus !== 'all') query.set('bookingStatus', params.bookingStatus);
  if (params.serviceStatus && params.serviceStatus !== 'all') query.set('serviceStatus', params.serviceStatus);

  return adminPageFetchJson<OperationsDashboard>(
    `${API_BASE_URL}/operations/dashboard${query.size > 0 ? `?${query.toString()}` : ''}`,
    'Operations dashboard',
    { cache: 'no-store' },
  );
}

function formatLifecycleStatus(status: BookingServiceLifecycleStatus) {
  return status
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatBookingStatus(status: BookingStatus) {
  return status
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatReportLabel(report: OperationsReportFilter) {
  if (report === 'blocked_bookings') {
    return 'Blocked bookings';
  }

  if (report === 'bulk_skips') {
    return 'Bulk action skips';
  }

  if (report === 'unresolved_issues') {
    return 'Supplier and pricing issues';
  }

  if (report === 'pending_confirmations') {
    return 'Pending confirmations';
  }

  if (report === 'cancelled_services') {
    return 'Cancelled services';
  }

  if (report === 'low_margin') {
    return 'Low-margin bookings';
  }

  if (report === 'unpaid_clients') {
    return 'Unpaid client bookings';
  }

  if (report === 'unpaid_suppliers') {
    return 'Unpaid supplier obligations';
  }

  return 'All services';
}

function getAllowedBookingStatusTransitions(status: BookingStatus): AllowedBookingStatus[] {
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

function formatConfirmationStatus(status: BookingServiceConfirmationStatus) {
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

function formatMoney(amount: number, currency = 'USD') {
  return `${currency} ${amount.toFixed(2)}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatAuditAction(action: string) {
  return action
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function mapBookingServiceTypeToSupplierType(serviceType: string): Supplier['type'] | null {
  const normalized = serviceType.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes('hotel') || normalized.includes('accommodation')) {
    return 'hotel';
  }

  if (normalized.includes('transport') || normalized.includes('transfer') || normalized.includes('vehicle')) {
    return 'transport';
  }

  if (
    normalized.includes('activity') ||
    normalized.includes('tour') ||
    normalized.includes('excursion') ||
    normalized.includes('experience') ||
    normalized.includes('sightseeing')
  ) {
    return 'activity';
  }

  if (normalized.includes('guide') || normalized.includes('escort')) {
    return 'guide';
  }

  return normalized.includes('other') ? 'other' : null;
}

function isActivityService(serviceType: string) {
  return mapBookingServiceTypeToSupplierType(serviceType) === 'activity';
}

function hasSupplier(service: Pick<BookingService, 'supplierId' | 'supplierName'> | Pick<OperationRow, 'supplierId' | 'supplierName'>) {
  return Boolean(service.supplierId || service.supplierName?.trim());
}

function hasPricing(service: Pick<BookingService, 'totalCost' | 'totalSell'> | Pick<OperationRow, 'totalCost' | 'totalSell'>) {
  return Number(service.totalCost || 0) > 0 && Number(service.totalSell || 0) > 0;
}

function hasPendingConfirmation(
  service:
    | Pick<BookingService, 'status' | 'confirmationStatus' | 'supplierId' | 'supplierName' | 'totalCost' | 'totalSell'>
    | Pick<OperationRow, 'status' | 'confirmationStatus' | 'supplierId' | 'supplierName' | 'totalCost' | 'totalSell'>,
) {
  return (
    service.status !== 'cancelled' &&
    service.confirmationStatus !== 'confirmed' &&
    hasSupplier(service) &&
    hasPricing(service)
  );
}

function getWarnings(service: BookingService) {
  const warnings: OperationsWarningFilter[] = [];

  if (service.status !== 'cancelled' && !hasSupplier(service)) {
    warnings.push('missing_supplier');
  }

  if (service.status !== 'cancelled' && !hasPricing(service)) {
    warnings.push('missing_pricing');
  }

  if (hasPendingConfirmation(service)) {
    warnings.push('pending_confirmation');
  }

  if (isActivityService(service.serviceType) && service.status !== 'cancelled' && !service.serviceDate) {
    warnings.push('missing_service_date');
  }

  if (
    isActivityService(service.serviceType) &&
    service.status !== 'cancelled' &&
    (
      (!service.startTime && !service.pickupTime) ||
      (!service.pickupLocation && !service.meetingPoint) ||
      !(service.participantCount || ((service.adultCount || 0) + (service.childCount || 0)))
    )
  ) {
    warnings.push('missing_activity_operational_data');
  }

  if (
    isActivityService(service.serviceType) &&
    service.reconfirmationRequired &&
    service.reconfirmationDueAt &&
    new Date(service.reconfirmationDueAt).getTime() <= Date.now() &&
    service.confirmationStatus !== 'confirmed'
  ) {
    warnings.push('reconfirmation_due');
  }

  return warnings;
}

function isServiceOperationallyReady(
  service:
    | Pick<BookingService, 'status' | 'serviceType' | 'serviceDate' | 'supplierId' | 'supplierName' | 'totalCost' | 'totalSell'>
    | Pick<OperationRow, 'status' | 'serviceType' | 'serviceDate' | 'supplierId' | 'supplierName' | 'totalCost' | 'totalSell'>,
) {
  if (service.status === 'cancelled') {
    return true;
  }

  const statusReady = service.status === 'ready' || service.status === 'in_progress' || service.status === 'confirmed';
  const hasDate = !isActivityService(service.serviceType) || Boolean(service.serviceDate);
  return statusReady && hasSupplier(service) && hasPricing(service) && hasDate;
}

function isServiceComplete(
  service:
    | Pick<BookingService, 'status' | 'confirmationStatus'>
    | Pick<OperationRow, 'status' | 'confirmationStatus'>,
) {
  if (service.status === 'cancelled') {
    return true;
  }

  return service.status === 'confirmed' && service.confirmationStatus === 'confirmed';
}

function getWarningLabel(warning: OperationsWarningFilter) {
  if (warning === 'missing_supplier') {
    return 'Missing supplier';
  }

  if (warning === 'pending_confirmation') {
    return 'Pending confirmation';
  }

  if (warning === 'missing_service_date') {
    return 'Missing service date';
  }

  if (warning === 'missing_activity_operational_data') {
    return 'Missing activity operational data';
  }

  if (warning === 'reconfirmation_due') {
    return 'Reconfirmation overdue';
  }

  return 'Missing pricing';
}

function buildOperationsHref(
  current: {
    serviceStatus: BookingServiceLifecycleStatus | 'all';
    confirmationStatus: BookingServiceConfirmationStatus | 'all';
    bookingStatus: BookingStatus | 'all';
    serviceTypeScope: 'all' | 'activity';
    warning: OperationsWarningFilter | 'all';
    report: OperationsReportFilter;
    groupBy: GroupBy;
    date?: string;
  },
  overrides: Partial<{
    serviceStatus: BookingServiceLifecycleStatus | 'all';
    confirmationStatus: BookingServiceConfirmationStatus | 'all';
    bookingStatus: BookingStatus | 'all';
    serviceTypeScope: 'all' | 'activity';
    warning: OperationsWarningFilter | 'all';
    report: OperationsReportFilter;
    groupBy: GroupBy;
    date: string;
  }>,
) {
  const params = new URLSearchParams();
  const next = { ...current, ...overrides };

  if (next.serviceStatus !== 'all') {
    params.set('serviceStatus', next.serviceStatus);
  }

  if (next.confirmationStatus !== 'all') {
    params.set('confirmationStatus', next.confirmationStatus);
  }

  if (next.bookingStatus !== 'all') {
    params.set('bookingStatus', next.bookingStatus);
  }

  if (next.serviceTypeScope !== 'all') {
    params.set('serviceTypeScope', next.serviceTypeScope);
  }

  if (next.warning !== 'all') {
    params.set('warning', next.warning);
  }

  if (next.report !== 'all') {
    params.set('report', next.report);
  }

  if (next.groupBy !== 'booking') {
    params.set('groupBy', next.groupBy);
  }

  if (next.date) {
    params.set('date', next.date);
  }

  const query = params.toString();
  return query ? `/operations?${query}` : '/operations';
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

function summarizeReadinessIssues(service: BookingService) {
  const reasons: string[] = [];

  if (!hasSupplier(service)) {
    reasons.push('supplier missing');
  }

  if (!hasPricing(service)) {
    reasons.push('pricing missing');
  }

  if (isActivityService(service.serviceType) && !service.serviceDate) {
    reasons.push('service date missing');
  }

  if (!isServiceOperationallyReady(service) && service.status !== 'cancelled') {
    reasons.push(`status ${formatLifecycleStatus(service.status).toLowerCase()}`);
  }

  return Array.from(new Set(reasons));
}

function summarizeCompletionIssues(service: BookingService) {
  const reasons: string[] = [];

  if (service.status !== 'confirmed' && service.status !== 'cancelled') {
    reasons.push(`status ${formatLifecycleStatus(service.status).toLowerCase()}`);
  }

  if (service.status !== 'cancelled' && service.confirmationStatus !== 'confirmed') {
    reasons.push(`confirmation ${formatConfirmationStatus(service.confirmationStatus).toLowerCase()}`);
  }

  return Array.from(new Set(reasons));
}

export default async function OperationsPage({ searchParams }: OperationsPageProps) {
  const cookieStore = await cookies();
  const session = readSessionActor(cookieStore.get('dmc_session')?.value || '');

  if (!canAccessOperations(session?.role)) {
    return (
      <AdminForbiddenState
        title="Operations access restricted"
        description="Your account does not have permission to view the operations workspace for this company."
      />
    );
  }

  try {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const serviceStatusFilter = resolvedSearchParams?.serviceStatus || 'all';
  const confirmationStatusFilter = resolvedSearchParams?.confirmationStatus || 'all';
  const bookingStatusFilter = resolvedSearchParams?.bookingStatus || 'all';
  const serviceTypeScope = resolvedSearchParams?.serviceTypeScope || 'all';
  const warningFilter = resolvedSearchParams?.warning || 'all';
  const reportFilter = resolvedSearchParams?.report || 'all';
  const groupBy = resolvedSearchParams?.groupBy || 'booking';
  const dashboardDate = resolvedSearchParams?.date || '';
  const warningMessage = resolvedSearchParams?.warningMessage || resolvedSearchParams?.warningText || '';
  const success = resolvedSearchParams?.success || '';
  const [bookings, suppliers, operationsDashboard] = await Promise.all([
    getBookings(),
    getSuppliers(),
    getOperationsDashboard({
      date: dashboardDate,
      bookingStatus: bookingStatusFilter,
      serviceStatus: serviceStatusFilter,
    }),
  ]);

  const rows: OperationRow[] = bookings.flatMap((booking) =>
    booking.services.map((service) => ({
      id: service.id,
      description: service.description,
      serviceType: service.serviceType,
      serviceDate: service.serviceDate,
      startTime: service.startTime,
      pickupTime: service.pickupTime,
      pickupLocation: service.pickupLocation,
      meetingPoint: service.meetingPoint,
      participantCount: service.participantCount,
      adultCount: service.adultCount,
      childCount: service.childCount,
      supplierReference: service.supplierReference,
      reconfirmationRequired: service.reconfirmationRequired,
      reconfirmationDueAt: service.reconfirmationDueAt,
      bookingId: booking.id,
      bookingRef: booking.bookingRef,
      bookingStatus: booking.status,
      bookingStatusNote: booking.statusNote,
      supplierId: service.supplierId,
      supplierName: service.supplierName,
      totalCost: service.totalCost,
      totalSell: service.totalSell,
      status: service.status,
      statusNote: service.statusNote,
      confirmationStatus: service.confirmationStatus,
      confirmationNumber: service.confirmationNumber,
      confirmationNotes: service.confirmationNotes,
      confirmationRequestedAt: service.confirmationRequestedAt,
      confirmationConfirmedAt: service.confirmationConfirmedAt,
      warnings: getWarnings(service),
      auditLogs: service.auditLogs || [],
    })),
  );

  const activeBookings = bookings.filter((booking) => booking.status !== 'cancelled');
  const bookingSummaries: BookingSummary[] = activeBookings.map((booking) => {
    const activeServices = booking.services.filter((service) => service.status !== 'cancelled');
    const marginMetrics = getMarginMetrics(booking.finance.realizedTotalSell, booking.finance.realizedTotalCost);
    const unresolvedIssueCount = activeServices.filter((service) => !hasSupplier(service) || !hasPricing(service)).length;

    return {
      bookingId: booking.id,
      bookingRef: booking.bookingRef,
      status: booking.status,
      clientInvoiceStatus: booking.finance.clientInvoiceStatus,
      supplierPaymentStatus: booking.finance.supplierPaymentStatus,
      quotedTotalCost: booking.finance.quotedTotalCost,
      quotedTotalSell: booking.finance.quotedTotalSell,
      quotedMargin: booking.finance.quotedMargin,
      quotedMarginPercent: booking.finance.quotedMarginPercent,
      totalCost: booking.finance.realizedTotalCost,
      totalSell: booking.finance.realizedTotalSell,
      margin: marginMetrics.margin,
      marginPercent: marginMetrics.marginPercent,
      tone: marginMetrics.tone,
      activeServiceCount: activeServices.length,
      unresolvedIssueCount,
    };
  });

  const commercialSummary = bookingSummaries.reduce(
    (summary, booking) => {
      summary.totalCost += booking.totalCost;
      summary.totalSell += booking.totalSell;
      summary.totalMargin += booking.margin;
      if (booking.totalSell > 0 && booking.tone !== 'positive') {
        summary.lowMarginBookings += 1;
      }
      if (booking.totalSell > 0 && booking.clientInvoiceStatus !== 'paid') {
        summary.unpaidClientBookings += 1;
      }
      if (booking.totalCost > 0 && booking.supplierPaymentStatus !== 'paid') {
        summary.unpaidSupplierBookings += 1;
      }
      return summary;
    },
    {
      totalCost: 0,
      totalSell: 0,
      totalMargin: 0,
      lowMarginBookings: 0,
      unpaidClientBookings: 0,
      unpaidSupplierBookings: 0,
    },
  );

  const blockedBookings = bookings
    .reduce<BlockedBooking[]>((list, booking) => {
      if (booking.status === 'confirmed') {
        const blockers = booking.services
          .filter((service) => !isServiceOperationallyReady(service))
          .flatMap((service) => summarizeReadinessIssues(service).map((reason) => `${service.description}: ${reason}`));

        if (blockers.length > 0) {
          list.push({
            bookingId: booking.id,
            bookingRef: booking.bookingRef,
            nextStep: 'Move To In Progress',
            reasons: blockers,
            blockerCount: blockers.length,
          });
          return list;
        }
      }

      if (booking.status === 'in_progress') {
        const blockers = booking.services
          .filter((service) => !isServiceComplete(service))
          .flatMap((service) => summarizeCompletionIssues(service).map((reason) => `${service.description}: ${reason}`));

        if (blockers.length > 0) {
          list.push({
            bookingId: booking.id,
            bookingRef: booking.bookingRef,
            nextStep: 'Complete Booking',
            reasons: blockers,
            blockerCount: blockers.length,
          });
        }
      }

      return list;
    }, [])
    .sort((left, right) => right.blockerCount - left.blockerCount);

  const blockedBookingIds = new Set(blockedBookings.map((booking) => booking.bookingId));
  const lowMarginBookingIds = new Set(
    bookingSummaries.filter((booking) => booking.totalSell > 0 && booking.tone !== 'positive').map((booking) => booking.bookingId),
  );
  const unpaidClientBookingIds = new Set(
    bookingSummaries.filter((booking) => booking.totalSell > 0 && booking.clientInvoiceStatus !== 'paid').map((booking) => booking.bookingId),
  );
  const unpaidSupplierBookingIds = new Set(
    bookingSummaries.filter((booking) => booking.totalCost > 0 && booking.supplierPaymentStatus !== 'paid').map((booking) => booking.bookingId),
  );
  const skippedServices = rows
    .flatMap((row) => {
      const latestSkip = row.auditLogs.find((auditLog) => auditLog.action === 'service_bulk_action_skipped');

      if (!latestSkip) {
        return [];
      }

      return [
        {
          row,
          latestSkip,
        },
      ];
    })
    .sort((left, right) => new Date(right.latestSkip.createdAt).getTime() - new Date(left.latestSkip.createdAt).getTime());

  const unresolvedIssueRows = rows.filter(
    (row) => row.status !== 'cancelled' && (row.warnings.includes('missing_supplier') || row.warnings.includes('missing_pricing')),
  );

  const summary = {
    totalBookings: bookings.length,
    totalServices: rows.length,
    activityServices: rows.filter((row) => isActivityService(row.serviceType)).length,
    pendingConfirmations: rows.filter((row) => hasPendingConfirmation(row)).length,
    missingSuppliers: rows.filter((row) => row.warnings.includes('missing_supplier')).length,
    missingPricing: rows.filter((row) => row.warnings.includes('missing_pricing')).length,
    missingServiceDates: rows.filter((row) => row.warnings.includes('missing_service_date')).length,
    missingActivityOperationalData: rows.filter((row) => row.warnings.includes('missing_activity_operational_data')).length,
    reconfirmationDue: rows.filter((row) => row.warnings.includes('reconfirmation_due')).length,
    cancelledServices: rows.filter((row) => row.status === 'cancelled').length,
    blockedBookings: blockedBookings.length,
    bulkSkippedServices: skippedServices.length,
    unpaidClientBookings: bookingSummaries.filter((booking) => booking.totalSell > 0 && booking.clientInvoiceStatus !== 'paid').length,
    unpaidSupplierBookings: bookingSummaries.filter((booking) => booking.totalCost > 0 && booking.supplierPaymentStatus !== 'paid').length,
  };

  const reportRows = rows.filter((row) => {
    if (reportFilter === 'blocked_bookings') {
      return blockedBookingIds.has(row.bookingId);
    }

    if (reportFilter === 'bulk_skips') {
      return row.auditLogs.some((auditLog) => auditLog.action === 'service_bulk_action_skipped');
    }

    if (reportFilter === 'unresolved_issues') {
      return row.status !== 'cancelled' && (row.warnings.includes('missing_supplier') || row.warnings.includes('missing_pricing'));
    }

    if (reportFilter === 'pending_confirmations') {
      return hasPendingConfirmation(row);
    }

    if (reportFilter === 'cancelled_services') {
      return row.status === 'cancelled';
    }

    if (reportFilter === 'low_margin') {
      return lowMarginBookingIds.has(row.bookingId);
    }

    if (reportFilter === 'unpaid_clients') {
      return unpaidClientBookingIds.has(row.bookingId);
    }

    if (reportFilter === 'unpaid_suppliers') {
      return unpaidSupplierBookingIds.has(row.bookingId);
    }

    return true;
  });

  const filteredRows = reportRows.filter((row) => {
    if (serviceStatusFilter !== 'all' && row.status !== serviceStatusFilter) {
      return false;
    }

    if (confirmationStatusFilter !== 'all' && row.confirmationStatus !== confirmationStatusFilter) {
      return false;
    }

    if (bookingStatusFilter !== 'all' && row.bookingStatus !== bookingStatusFilter) {
      return false;
    }

    if (serviceTypeScope === 'activity' && !isActivityService(row.serviceType)) {
      return false;
    }

    if (warningFilter !== 'all' && !row.warnings.includes(warningFilter)) {
      return false;
    }

    return true;
  });

  const groupedRows = filteredRows.reduce<
    Array<{
      key: string;
      label: string;
      subtitle: string;
      bookingId?: string;
      bookingStatus?: BookingStatus;
      bookingStatusNote?: string | null;
      bookingAuditLogs?: AuditLog[];
      bookingFinance?: Booking['finance'];
      bookingOperations?: Booking['operations'];
      bookingRooming?: Booking['rooming'];
      rows: OperationRow[];
    }>
  >((groups, row) => {
    const key = groupBy === 'supplier' ? row.supplierId || row.supplierName || 'unassigned' : row.bookingId;
    const label = groupBy === 'supplier' ? row.supplierName || 'Unassigned supplier' : row.bookingRef;
    const subtitle =
      groupBy === 'supplier'
        ? row.supplierName || 'Unassigned supplier'
        : `Booking status: ${formatBookingStatus(row.bookingStatus)}`;
    const existingGroup = groups.find((group) => group.key === key);

    if (existingGroup) {
      existingGroup.rows.push(row);
      return groups;
    }

    groups.push({
      key,
      label,
      subtitle,
      bookingId: groupBy === 'booking' ? row.bookingId : undefined,
      bookingStatus: groupBy === 'booking' ? row.bookingStatus : undefined,
      bookingStatusNote: groupBy === 'booking' ? row.bookingStatusNote : undefined,
      bookingAuditLogs: groupBy === 'booking' ? bookings.find((booking) => booking.id === row.bookingId)?.auditLogs || [] : undefined,
      bookingFinance: groupBy === 'booking' ? bookings.find((booking) => booking.id === row.bookingId)?.finance : undefined,
      bookingOperations: groupBy === 'booking' ? bookings.find((booking) => booking.id === row.bookingId)?.operations : undefined,
      bookingRooming: groupBy === 'booking' ? bookings.find((booking) => booking.id === row.bookingId)?.rooming : undefined,
      rows: [row],
    });

    return groups;
  }, []);

  const currentFilters = {
    serviceStatus: serviceStatusFilter,
    confirmationStatus: confirmationStatusFilter,
    bookingStatus: bookingStatusFilter,
    serviceTypeScope,
    warning: warningFilter,
    report: reportFilter,
    groupBy,
    date: dashboardDate,
  };

  const bookingBulkActionPayloads =
    groupBy === 'booking'
      ? groupedRows.flatMap((group) =>
          group.bookingId && group.bookingFinance && group.bookingOperations && group.bookingRooming
            ? [
                {
                  originalIndex: groupedRows.findIndex((entry) => entry.key === group.key),
                  bookingId: group.bookingId,
                  bookingLabel: group.label,
                  finance: group.bookingFinance,
                  operations: group.bookingOperations,
                  rooming: group.bookingRooming,
                  services: group.rows.map((row) => ({
                    id: row.id,
                    label: row.description,
                    status: row.status,
                    confirmationStatus: row.confirmationStatus,
                    supplierReference: row.supplierReference,
                    reconfirmationRequired: row.reconfirmationRequired,
                    reconfirmationDueAt: row.reconfirmationDueAt,
                    serviceDate: row.serviceDate,
                    startTime: row.startTime,
                    pickupTime: row.pickupTime,
                    pickupLocation: row.pickupLocation,
                    meetingPoint: row.meetingPoint,
                    participantCount: row.participantCount,
                    adultCount: row.adultCount,
                    childCount: row.childCount,
                  })),
                },
              ]
            : [],
        )
      : [];

  return (
    <main className="page">
      <section className="panel quote-preview-page operations-page">
        <WorkspaceSubheader
          eyebrow="Operations"
          title="Service queue and exception dashboard"
          description="Start with queue health, then move into exceptions and service-level actions. Finance indicators stay visible, but separate from operational triage."
          actions={
            <>
              <Link href={buildOperationsHref(currentFilters, { groupBy: 'booking' })} className="dashboard-toolbar-link">
                Booking queue
              </Link>
              <Link href={buildOperationsHref(currentFilters, { groupBy: 'supplier' })} className="dashboard-toolbar-link">
                Supplier queue
              </Link>
              <Link href="/operations/mobile" className="dashboard-toolbar-link">
                Mobile view
              </Link>
            </>
          }
        />

        <PageActionBar
          title={formatReportLabel(reportFilter)}
          description={`Grouped by ${groupBy === 'booking' ? 'booking' : 'supplier'} with ${filteredRows.length} visible services in the current report slice.`}
        >
          <Link href={buildOperationsHref(currentFilters, { report: 'pending_confirmations' })} className="dashboard-toolbar-link">
            Pending confirmations
          </Link>
          <Link href={buildOperationsHref(currentFilters, { report: 'unresolved_issues' })} className="dashboard-toolbar-link">
            Supplier / pricing issues
          </Link>
          <Link href={buildOperationsHref(currentFilters, { report: 'low_margin', groupBy: 'booking' })} className="dashboard-toolbar-link">
            Low-margin bookings
          </Link>
        </PageActionBar>

        <form method="GET" className="operations-filter-card">
          <div className="operations-filter-grid">
            <label>
              Dashboard date
              <input type="date" name="date" defaultValue={operationsDashboard.filters.date} />
            </label>
            <label>
              Booking status
              <select name="bookingStatus" defaultValue={bookingStatusFilter}>
                <option value="all">All bookings</option>
                <option value="draft">New</option>
                <option value="in_progress">In progress</option>
                <option value="confirmed">Confirmed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>
            <label>
              Service status
              <select name="serviceStatus" defaultValue={serviceStatusFilter}>
                <option value="all">All services</option>
                <option value="pending">Pending</option>
                <option value="in_progress">Requested</option>
                <option value="confirmed">Confirmed</option>
                <option value="ready">Ready</option>
              </select>
            </label>
            <input type="hidden" name="report" value={reportFilter} />
            <input type="hidden" name="groupBy" value={groupBy} />
            <button type="submit" className="primary-button">Apply dashboard filters</button>
          </div>
        </form>

        <section className="operations-dashboard-grid" aria-label="Operations control center">
          {[
            {
              id: 'arrivals',
              label: "Today's Arrivals",
              bucket: operationsDashboard.todayArrivals,
              href: buildOperationsHref(currentFilters, { date: operationsDashboard.filters.date, groupBy: 'booking' }),
              helper: 'Bookings starting on the selected date',
            },
            {
              id: 'departures',
              label: "Today's Departures",
              bucket: operationsDashboard.todayDepartures,
              href: buildOperationsHref(currentFilters, { date: operationsDashboard.filters.date, groupBy: 'booking' }),
              helper: 'Bookings ending on the selected date',
            },
            {
              id: 'active-bookings',
              label: 'Active Bookings',
              bucket: operationsDashboard.activeBookings,
              href: buildOperationsHref(currentFilters, { bookingStatus: 'in_progress', groupBy: 'booking' }),
              helper: 'New and in-progress bookings',
            },
            {
              id: 'pending-services',
              label: 'Pending Services',
              bucket: operationsDashboard.pendingServices,
              href: buildOperationsHref(currentFilters, { serviceStatus: 'pending' }),
              helper: 'Operations services still pending',
            },
            {
              id: 'missing-passports',
              label: 'Missing Passport Info',
              bucket: operationsDashboard.missingPassengers,
              href: '/bookings',
              helper: 'Passenger lists or required passport fields need review',
            },
            {
              id: 'border-crossings',
              label: 'Upcoming Border Crossings',
              bucket: operationsDashboard.upcomingBorderCrossings,
              href: buildOperationsHref(currentFilters, { date: operationsDashboard.filters.date, groupBy: 'booking' }),
              helper: 'Arrivals or departures in the next 48 hours',
            },
          ].map((widget) => (
            <Link key={widget.id} href={widget.href} className="detail-card operations-exception-card">
              <div className="operations-card-head">
                <div>
                  <span className="detail-label">{widget.label}</span>
                  <h2>{widget.bucket.count}</h2>
                </div>
                {widget.bucket.count > 0 ? <span className="dashboard-pill dashboard-pill-alert">Open</span> : <span className="dashboard-pill">Clear</span>}
              </div>
              <p className="detail-copy">{widget.helper}</p>
              {widget.bucket.items.slice(0, 3).map((item) => (
                <p key={item.id} className="detail-copy">
                  {item.bookingRef || item.title || item.description || item.id}
                  {item.reasons?.length ? ` - ${item.reasons.join(', ')}` : ''}
                </p>
              ))}
            </Link>
          ))}
        </section>

        <section className="operations-summary-list" aria-label="Operations alerts">
          <div>
            <span>Bookings with no passengers</span>
            <strong>{operationsDashboard.alerts.bookingsWithNoPassengers.count}</strong>
          </div>
          <div>
            <span>Services without supplier/assignment</span>
            <strong>{operationsDashboard.alerts.servicesWithoutSupplierOrAssignment.count}</strong>
          </div>
          <div>
            <span>Missing transport assignment for today</span>
            <strong>{operationsDashboard.alerts.missingTransportAssignmentForToday.count}</strong>
          </div>
        </section>

        <SummaryStrip
          items={[
            {
              id: 'errors',
              label: 'Errors',
              value: String(
                bookingBulkActionPayloads.filter((booking) =>
                  getBookingAttentionSeverity({
                    id: booking.bookingId,
                    finance: booking.finance,
                    operations: booking.operations,
                    rooming: booking.rooming,
                  }) === 'error',
                ).length,
              ),
              helper: 'Highest urgency bookings',
            },
            {
              id: 'warnings',
              label: 'Warnings',
              value: String(
                bookingBulkActionPayloads.filter((booking) =>
                  getBookingAttentionSeverity({
                    id: booking.bookingId,
                    finance: booking.finance,
                    operations: booking.operations,
                    rooming: booking.rooming,
                  }) === 'warning',
                ).length,
              ),
              helper: 'Needs follow-up',
            },
            {
              id: 'clean',
              label: 'Clean',
              value: String(
                bookingBulkActionPayloads.filter(
                  (booking) =>
                    !getBookingAttentionSeverity({
                      id: booking.bookingId,
                      finance: booking.finance,
                      operations: booking.operations,
                      rooming: booking.rooming,
                    }),
                ).length,
              ),
              helper: 'No active booking badges',
            },
            {
              id: 'reconfirmations',
              label: 'Reconfirmations',
              value: String(summary.reconfirmationDue),
              helper: 'Overdue supplier reconfirmations',
            },
            {
              id: 'pending',
              label: 'Pending',
              value: String(summary.pendingConfirmations),
              helper: 'Waiting on confirmation',
            },
            {
              id: 'financial-risk',
              label: 'Financial risk',
              value: String(commercialSummary.lowMarginBookings + commercialSummary.unpaidClientBookings + commercialSummary.unpaidSupplierBookings),
              helper: `Low margin uses ${LOW_MARGIN_THRESHOLD_LABEL}`,
            },
          ]}
        />

        <AdvancedFiltersPanel title="Expanded reports and exception panels" description="Blocked, skipped, unresolved, and commercial risk lists">
          <section className="operations-content-grid">
          <article className="detail-card operations-exception-card">
            <div className="operations-card-head">
              <div>
                <p className="eyebrow">Blocked Bookings</p>
                <h2>{summary.blockedBookings} need workflow intervention</h2>
              </div>
              <Link href={buildOperationsHref(currentFilters, { report: 'blocked_bookings', groupBy: 'booking' })} className="secondary-button">
                View report
              </Link>
            </div>
            {blockedBookings.length === 0 ? (
              <p className="detail-copy">No bookings are currently blocked from the next workflow step.</p>
            ) : (
              <div className="operations-issue-list">
                {blockedBookings.slice(0, 5).map((booking) => (
                  <div key={booking.bookingId} className="operations-issue-item">
                    <div>
                      <Link href={`/bookings/${booking.bookingId}`}>{booking.bookingRef}</Link>
                      <p>
                        {booking.nextStep} blocked by {booking.blockerCount} issue{booking.blockerCount === 1 ? '' : 's'}.
                      </p>
                    </div>
                    <p>{booking.reasons.slice(0, 2).join(' | ')}</p>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="detail-card operations-exception-card">
            <div className="operations-card-head">
              <div>
                <p className="eyebrow">Bulk Action Skips</p>
                <h2>{summary.bulkSkippedServices} recent skip events logged</h2>
              </div>
              <Link href={buildOperationsHref(currentFilters, { report: 'bulk_skips' })} className="secondary-button">
                View report
              </Link>
            </div>
            {skippedServices.length === 0 ? (
              <p className="detail-copy">No skipped bulk actions are present in the recent audit trail.</p>
            ) : (
              <div className="operations-issue-list">
                {skippedServices.slice(0, 5).map(({ row, latestSkip }) => (
                  <div key={latestSkip.id} className="operations-issue-item">
                    <div>
                      <Link href={`/bookings/${row.bookingId}`}>{row.bookingRef}</Link>
                      <p>{row.description}</p>
                    </div>
                    <p>
                      {latestSkip.note || 'Skipped during bulk action'} | {formatDateTime(latestSkip.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="detail-card operations-exception-card">
            <div className="operations-card-head">
              <div>
                <p className="eyebrow">Unresolved Supplier / Pricing</p>
                <h2>{unresolvedIssueRows.length} active services still incomplete</h2>
              </div>
              <Link href={buildOperationsHref(currentFilters, { report: 'unresolved_issues' })} className="secondary-button">
                View report
              </Link>
            </div>
            {unresolvedIssueRows.length === 0 ? (
              <p className="detail-copy">All active services have supplier and pricing coverage.</p>
            ) : (
              <div className="operations-issue-list">
                {unresolvedIssueRows.slice(0, 5).map((row) => (
                  <div key={row.id} className="operations-issue-item">
                    <div>
                      <Link href={`/bookings/${row.bookingId}`}>{row.bookingRef}</Link>
                      <p>{row.description}</p>
                    </div>
                    <p>{row.warnings.filter((warning) => warning !== 'pending_confirmation').map(getWarningLabel).join(' | ')}</p>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="detail-card operations-exception-card">
            <div className="operations-card-head">
              <div>
                <p className="eyebrow">Low-Margin Bookings</p>
                <h2>{commercialSummary.lowMarginBookings} bookings below target</h2>
              </div>
              <Link href={buildOperationsHref(currentFilters, { report: 'low_margin', groupBy: 'booking' })} className="secondary-button">
                View report
              </Link>
            </div>
            {commercialSummary.lowMarginBookings === 0 ? (
              <p className="detail-copy">No active bookings are currently below the low-margin threshold.</p>
            ) : (
              <div className="operations-issue-list">
                {bookingSummaries
                  .filter((booking) => booking.totalSell > 0 && booking.tone !== 'positive')
                  .sort((left, right) => left.marginPercent - right.marginPercent)
                  .slice(0, 5)
                  .map((booking) => (
                    <div key={booking.bookingId} className="operations-issue-item">
                      <div>
                        <Link href={`/bookings/${booking.bookingId}`}>{booking.bookingRef}</Link>
                        <p>{formatBookingStatus(booking.status)}</p>
                      </div>
                      <p style={{ color: getMarginColor(booking.tone) }}>
                        {booking.marginPercent.toFixed(2)}% margin | {formatMoney(booking.margin)}
                      </p>
                    </div>
                  ))}
              </div>
            )}
          </article>

          <article className="detail-card operations-exception-card">
            <div className="operations-card-head">
              <div>
                <p className="eyebrow">Unpaid Client Bookings</p>
                <h2>{commercialSummary.unpaidClientBookings} bookings still open on receivables</h2>
              </div>
              <Link href={buildOperationsHref(currentFilters, { report: 'unpaid_clients', groupBy: 'booking' })} className="secondary-button">
                View report
              </Link>
            </div>
            {commercialSummary.unpaidClientBookings === 0 ? (
              <p className="detail-copy">No active bookings currently have an outstanding client invoice balance.</p>
            ) : (
              <div className="operations-issue-list">
                {bookingSummaries
                  .filter((booking) => booking.totalSell > 0 && booking.clientInvoiceStatus !== 'paid')
                  .slice(0, 5)
                  .map((booking) => (
                    <div key={booking.bookingId} className="operations-issue-item">
                      <div>
                        <Link href={`/bookings/${booking.bookingId}`}>{booking.bookingRef}</Link>
                        <p>{formatClientInvoiceStatus(booking.clientInvoiceStatus)}</p>
                      </div>
                      <p>{formatMoney(booking.totalSell)} realized sell</p>
                    </div>
                  ))}
              </div>
            )}
          </article>

          <article className="detail-card operations-exception-card">
            <div className="operations-card-head">
              <div>
                <p className="eyebrow">Unpaid Supplier Obligations</p>
                <h2>{commercialSummary.unpaidSupplierBookings} bookings still open on payables</h2>
              </div>
              <Link href={buildOperationsHref(currentFilters, { report: 'unpaid_suppliers', groupBy: 'booking' })} className="secondary-button">
                View report
              </Link>
            </div>
            {commercialSummary.unpaidSupplierBookings === 0 ? (
              <p className="detail-copy">No active bookings currently have unpaid supplier obligations.</p>
            ) : (
              <div className="operations-issue-list">
                {bookingSummaries
                  .filter((booking) => booking.totalCost > 0 && booking.supplierPaymentStatus !== 'paid')
                  .slice(0, 5)
                  .map((booking) => (
                    <div key={booking.bookingId} className="operations-issue-item">
                      <div>
                        <Link href={`/bookings/${booking.bookingId}`}>{booking.bookingRef}</Link>
                        <p>{formatSupplierPaymentStatus(booking.supplierPaymentStatus)}</p>
                      </div>
                      <p>{formatMoney(booking.totalCost)} realized cost</p>
                    </div>
                  ))}
              </div>
            )}
          </article>
          </section>
        </AdvancedFiltersPanel>

        <CompactFilterBar
          eyebrow="Queue Reports"
          title={formatReportLabel(reportFilter)}
          description="Combine report presets with workflow filters to isolate what needs attention without leaving the operations queue."
        >
          <div className="operations-filter-row">
            <Link href={buildOperationsHref(currentFilters, { report: 'all' })} className="secondary-button">
              All services
            </Link>
            <Link href={buildOperationsHref(currentFilters, { report: 'blocked_bookings', groupBy: 'booking' })} className="secondary-button">
              Blocked bookings
            </Link>
            <Link href={buildOperationsHref(currentFilters, { report: 'bulk_skips' })} className="secondary-button">
              Bulk skips
            </Link>
            <Link href={buildOperationsHref(currentFilters, { report: 'unresolved_issues' })} className="secondary-button">
              Supplier / pricing issues
            </Link>
            <Link href={buildOperationsHref(currentFilters, { report: 'pending_confirmations' })} className="secondary-button">
              Pending confirmations
            </Link>
            <Link href={buildOperationsHref(currentFilters, { report: 'cancelled_services' })} className="secondary-button">
              Cancelled services
            </Link>
            <Link href={buildOperationsHref(currentFilters, { report: 'low_margin', groupBy: 'booking' })} className="secondary-button">
              Low-margin bookings
            </Link>
            <Link href={buildOperationsHref(currentFilters, { report: 'unpaid_clients', groupBy: 'booking' })} className="secondary-button">
              Unpaid clients
            </Link>
            <Link href={buildOperationsHref(currentFilters, { report: 'unpaid_suppliers', groupBy: 'booking' })} className="secondary-button">
              Unpaid suppliers
            </Link>
          </div>
          <AdvancedFiltersPanel title="More filters" description="Lifecycle, warning, confirmation, booking status, and grouping" className="operations-filter-panel">
            <div className="operations-filter-row">
                <Link href={buildOperationsHref(currentFilters, { serviceTypeScope: 'all' })} className="secondary-button">
                  All service types
                </Link>
                <Link href={buildOperationsHref(currentFilters, { serviceTypeScope: 'activity' })} className="secondary-button">
                  Activity services
                </Link>
                <Link href={buildOperationsHref(currentFilters, { serviceStatus: 'all' })} className="secondary-button">
                  All lifecycle statuses
                </Link>
                <Link href={buildOperationsHref(currentFilters, { serviceStatus: 'pending' })} className="secondary-button">
                  Pending
                </Link>
                <Link href={buildOperationsHref(currentFilters, { serviceStatus: 'ready' })} className="secondary-button">
                  Ready
                </Link>
                <Link href={buildOperationsHref(currentFilters, { serviceStatus: 'in_progress' })} className="secondary-button">
                  In progress
                </Link>
                <Link href={buildOperationsHref(currentFilters, { serviceStatus: 'confirmed' })} className="secondary-button">
                  Confirmed
                </Link>
                <Link href={buildOperationsHref(currentFilters, { serviceStatus: 'cancelled' })} className="secondary-button">
                  Cancelled
                </Link>
              </div>

              <div className="operations-filter-row">
                <Link href={buildOperationsHref(currentFilters, { warning: 'all' })} className="secondary-button">
                  All warnings
                </Link>
                <Link href={buildOperationsHref(currentFilters, { warning: 'missing_supplier' })} className="secondary-button">
                  Missing supplier
                </Link>
                <Link href={buildOperationsHref(currentFilters, { warning: 'pending_confirmation' })} className="secondary-button">
                  Pending confirmation
                </Link>
                <Link href={buildOperationsHref(currentFilters, { warning: 'missing_pricing' })} className="secondary-button">
                  Missing pricing
                </Link>
                <Link href={buildOperationsHref(currentFilters, { warning: 'missing_service_date', serviceTypeScope: 'activity' })} className="secondary-button">
                  Missing activity date
                </Link>
                <Link href={buildOperationsHref(currentFilters, { warning: 'missing_activity_operational_data', serviceTypeScope: 'activity' })} className="secondary-button">
                  Missing activity ops
                </Link>
                <Link href={buildOperationsHref(currentFilters, { warning: 'reconfirmation_due', serviceTypeScope: 'activity' })} className="secondary-button">
                  Reconfirmation due
                </Link>
                <Link href={buildOperationsHref(currentFilters, { confirmationStatus: 'all' })} className="secondary-button">
                  All confirmations
                </Link>
                <Link href={buildOperationsHref(currentFilters, { confirmationStatus: 'requested' })} className="secondary-button">
                  Requested
                </Link>
                <Link href={buildOperationsHref(currentFilters, { confirmationStatus: 'pending' })} className="secondary-button">
                  Pending only
                </Link>
              </div>
          </AdvancedFiltersPanel>

          <div className="operations-filter-row">
            <Link href={buildOperationsHref(currentFilters, { groupBy: 'booking' })} className="secondary-button">
              Group by booking
            </Link>
            <Link href={buildOperationsHref(currentFilters, { groupBy: 'supplier' })} className="secondary-button">
              Group by supplier
            </Link>
            <Link href={buildOperationsHref(currentFilters, { bookingStatus: 'all' })} className="secondary-button">
              All booking statuses
            </Link>
            <Link href={buildOperationsHref(currentFilters, { bookingStatus: 'confirmed' })} className="secondary-button">
              Confirmed bookings
            </Link>
            <Link href={buildOperationsHref(currentFilters, { bookingStatus: 'in_progress' })} className="secondary-button">
              In-progress bookings
            </Link>
            <Link href={buildOperationsHref(currentFilters, { bookingStatus: 'completed' })} className="secondary-button">
              Completed bookings
            </Link>
          </div>
        </CompactFilterBar>

        {warningMessage ? renderFeedbackMessage(warningMessage, 'form-error') : null}
        {success ? renderFeedbackMessage(success, 'form-helper') : null}

        <section className="detail-card operations-table-summary">
          <div>
            <p className="eyebrow">Queue Scope</p>
            <h2>
              {filteredRows.length} of {summary.totalServices} services shown
            </h2>
            <p className="detail-copy">
              {summary.totalBookings} bookings loaded. Current report: {formatReportLabel(reportFilter)}.
            </p>
          </div>
        </section>

        {groupedRows.length === 0 ? (
          <section className="detail-card">
            <p className="empty-state">No booking services match the current report and filter combination.</p>
          </section>
        ) : (
          <OperationsBulkActionsProvider bookings={bookingBulkActionPayloads} initialFilter={resolvedSearchParams?.filter}>
            {groupedRows.map((group) => (
              <OperationsBulkGroupVisibility key={group.key} bookingId={group.bookingId}>
                <section className="detail-card operations-group">
              {(() => {
                const bulkFormId = `bulk-action-${group.key}`;
                const bookingAttention =
                  groupBy === 'booking' && group.bookingId && group.bookingFinance && group.bookingOperations && group.bookingRooming
                    ? {
                        id: group.bookingId,
                        finance: { badge: group.bookingFinance.badge },
                        operations: { badge: group.bookingOperations.badge },
                        rooming: { badge: group.bookingRooming.badge },
                      }
                    : null;
                const severity = bookingAttention ? getBookingAttentionSeverity(bookingAttention) : null;

                return (
                  <>
                    <div className="supplier-confirmation-group-head">
                      <div>
                        <p className="eyebrow">{groupBy === 'supplier' ? 'Supplier group' : 'Booking group'}</p>
                        <h2>{group.label}</h2>
                        {groupBy === 'booking' ? <p className="detail-copy">{group.subtitle}</p> : null}
                        {groupBy === 'booking' && group.bookingStatusNote ? <p className="detail-copy">Latest override note: {group.bookingStatusNote}</p> : null}
                        {groupBy === 'booking' && group.bookingFinance ? (
                          <p className="detail-copy">
                            Realized margin {formatMoney(group.bookingFinance.realizedMargin)} ({group.bookingFinance.realizedMarginPercent.toFixed(2)}%)
                            {` | Client ${formatClientInvoiceStatus(group.bookingFinance.clientInvoiceStatus)}`}
                            {` | Supplier ${formatSupplierPaymentStatus(group.bookingFinance.supplierPaymentStatus)}`}
                          </p>
                        ) : null}
                        {bookingAttention ? (
                          <div className="dashboard-issue-links">
                            {bookingAttention.finance.badge.count > 0 ? (
                              <Link
                                href={getBookingFinanceHref(bookingAttention.id)}
                                className="dashboard-issue-link"
                                title={buildFinanceTooltip(bookingAttention.finance.badge)}
                              >
                                Finance ({bookingAttention.finance.badge.count})
                              </Link>
                            ) : null}
                            {bookingAttention.operations.badge.count > 0 ? (
                              <Link
                                href={getBookingOperationsHref(bookingAttention.id)}
                                className="dashboard-issue-link"
                                title={buildOperationsTooltip(bookingAttention.operations.badge)}
                              >
                                Operations ({bookingAttention.operations.badge.count})
                              </Link>
                            ) : null}
                            {bookingAttention.rooming.badge.count > 0 ? (
                              <Link
                                href={getBookingRoomingHref(bookingAttention.id)}
                                className="dashboard-issue-link"
                                title={buildRoomingTooltip(bookingAttention.rooming.badge)}
                              >
                                Rooming ({bookingAttention.rooming.badge.count})
                              </Link>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                      <div className="supplier-confirmation-summary">
                        {groupBy === 'booking' && group.bookingId ? (
                          <OperationsBulkSelectionCheckbox bookingId={group.bookingId} label="Select booking" />
                        ) : null}
                        {severity ? (
                          <div>
                            <span className={`dashboard-pill${severity === 'error' ? ' dashboard-pill-alert' : ' dashboard-pill-warning'}`}>
                              {severity === 'error' ? 'Error' : 'Warning'}
                            </span>
                          </div>
                        ) : null}
                        <strong>{group.rows.length} services</strong>
                      </div>
                    </div>

                    <RowDetailsPanel
                      summary="More actions"
                      description="Booking status, quick actions, audit, and service bulk actions"
                      className="operations-group-actions"
                      bodyClassName="operations-group-actions-body"
                    >
                        {groupBy === 'booking' && group.bookingId && group.bookingFinance && group.bookingOperations ? (
                          <BookingQuickActions
                            bookingId={group.bookingId}
                            finance={group.bookingFinance}
                            operations={group.bookingOperations}
                            services={group.rows.map((row) => ({
                              id: row.id,
                              label: row.description,
                              status: row.status,
                              confirmationStatus: row.confirmationStatus,
                              supplierReference: row.supplierReference,
                              reconfirmationRequired: row.reconfirmationRequired,
                              reconfirmationDueAt: row.reconfirmationDueAt,
                              serviceDate: row.serviceDate,
                              startTime: row.startTime,
                              pickupTime: row.pickupTime,
                              pickupLocation: row.pickupLocation,
                              meetingPoint: row.meetingPoint,
                              participantCount: row.participantCount,
                              adultCount: row.adultCount,
                              childCount: row.childCount,
                            }))}
                          />
                        ) : null}
                        {groupBy === 'booking' && group.bookingId && group.bookingStatus ? (
                          <>
                            <form action={`/api/bookings/${group.bookingId}/status`} method="POST" className="operations-inline-form">
                              <select
                                name="status"
                                defaultValue=""
                                disabled={getAllowedBookingStatusTransitions(group.bookingStatus).length === 0}
                              >
                                <option value="" disabled>
                                  {getAllowedBookingStatusTransitions(group.bookingStatus).length === 0
                                    ? 'No further transitions'
                                    : 'Select next status'}
                                </option>
                                {getAllowedBookingStatusTransitions(group.bookingStatus).map((status) => (
                                  <option key={status} value={status}>
                                    {formatBookingStatus(status)}
                                  </option>
                                ))}
                              </select>
                              <input type="text" name="note" placeholder="Reason for manual booking override" required minLength={3} />
                              <button type="submit" className="secondary-button">
                                Update booking status
                              </button>
                            </form>
                            <p className="detail-copy">
                              Allowed next statuses:{' '}
                              {getAllowedBookingStatusTransitions(group.bookingStatus).length > 0
                                ? getAllowedBookingStatusTransitions(group.bookingStatus).map(formatBookingStatus).join(', ')
                                : 'No further transitions'}
                            </p>
                          </>
                        ) : null}
                        <form id={bulkFormId} action="/api/bookings/services/bulk-actions" method="POST" className="operations-inline-form operations-bulk-form">
                          <select name="action" defaultValue="">
                            <option value="" disabled>
                              Bulk action
                            </option>
                            <option value="mark_ready">Mark ready</option>
                            <option value="cancel">Cancel</option>
                            <option value="reopen">Reopen</option>
                            <option value="request_confirmation">Request confirmation</option>
                          </select>
                          <input
                            type="text"
                            name="note"
                            placeholder="Reason for bulk action or confirmation request"
                            required
                            minLength={3}
                          />
                          <button type="submit" className="secondary-button">
                            Apply to selected
                          </button>
                        </form>
                        {groupBy === 'booking' && group.bookingAuditLogs && group.bookingAuditLogs.length > 0 ? (
                          <div className="audit-log-list">
                            {group.bookingAuditLogs.slice(0, 3).map((auditLog) => (
                              <div key={auditLog.id} className="audit-log-item">
                                <strong>{formatAuditAction(auditLog.action)}</strong>
                                <p>
                                  {formatDateTime(auditLog.createdAt)}
                                  {auditLog.actor ? ` | ${auditLog.actor}` : ''}
                                </p>
                                {auditLog.note ? <p>{auditLog.note}</p> : null}
                              </div>
                            ))}
                          </div>
                        ) : null}
                    </RowDetailsPanel>

                    <div className="table-wrap">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Select</th>
                            <th>Service</th>
                            <th>Status</th>
                            <th>Supplier</th>
                            <th>Warnings</th>
                            <th>Financials</th>
                            <th>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.rows.map((row) => {
                            const mappedSupplierType = mapBookingServiceTypeToSupplierType(row.serviceType);
                            const matchingSuppliers = mappedSupplierType ? suppliers.filter((supplier) => supplier.type === mappedSupplierType) : [];
                            const supplierOptions = matchingSuppliers.length > 0 ? matchingSuppliers : suppliers;
                            const marginMetrics = getMarginMetrics(row.totalSell, row.totalCost);
                            const latestBulkSkip = row.auditLogs.find((auditLog) => auditLog.action === 'service_bulk_action_skipped');
                            const activityService = isActivityService(row.serviceType);
                            const supplierReference = row.supplierReference || row.confirmationNumber;

                            return (
                              <tr key={row.id}>
                                <td>
                                  <input type="checkbox" name="serviceId" value={row.id} form={bulkFormId} />
                                </td>
                                <td>
                                  <strong>{row.description}</strong>
                                  <div className="table-subcopy">
                                    {groupBy === 'booking' ? row.serviceType : `${row.bookingRef} | ${formatBookingStatus(row.bookingStatus)}`}
                                  </div>
                                  {activityService ? (
                                    <div className="table-subcopy">
                                      {row.serviceDate ? `Date: ${formatDateTime(row.serviceDate)}` : 'Date missing'}
                                    </div>
                                  ) : null}
                                </td>
                                <td>
                                  <strong>{formatLifecycleStatus(row.status)}</strong>
                                  <div className="table-subcopy">{formatConfirmationStatus(row.confirmationStatus)}</div>
                                </td>
                                <td>
                                  <strong>{row.supplierName || 'Unassigned'}</strong>
                                  <div className="table-subcopy">{supplierReference ? `Ref: ${supplierReference}` : 'No supplier ref'}</div>
                                </td>
                                <td>
                                  {row.warnings.length === 0 ? (
                                    <span className="supplier-confirmation-status">Clear</span>
                                  ) : (
                                    row.warnings.slice(0, 2).map((warning) => (
                                      <p key={warning} className="form-error operations-inline-warning">
                                        {getWarningLabel(warning)}
                                      </p>
                                    ))
                                  )}
                                </td>
                                <td>
                                  <strong>{formatMoney(row.totalSell)}</strong>
                                  <div className="table-subcopy">Cost {formatMoney(row.totalCost)}</div>
                                  <div className="table-subcopy" style={{ color: getMarginColor(marginMetrics.tone) }}>
                                    Margin {marginMetrics.marginPercent.toFixed(2)}%
                                  </div>
                                </td>
                                <td>
                                  <RowDetailsPanel
                                    summary="Open details"
                                    className="operations-row-details"
                                    bodyClassName="operations-row-details-body"
                                  >
                                      <p className="detail-copy">
                                        <Link href={`/bookings/${row.bookingId}`}>{row.bookingRef}</Link>
                                        {` | ${formatBookingStatus(row.bookingStatus)}`}
                                      </p>
                                      {activityService ? (
                                        <p className="detail-copy">
                                          {`Start/Pickup: ${row.startTime || '-'} / ${row.pickupTime || '-'}`}
                                          {' | '}
                                          {`Pickup/Meeting: ${row.pickupLocation || '-'} / ${row.meetingPoint || '-'}`}
                                          {' | '}
                                          {`Pax ${row.participantCount ?? 0} | Adults ${row.adultCount ?? 0} | Children ${row.childCount ?? 0}`}
                                        </p>
                                      ) : null}
                                      <form action={`/api/bookings/services/${row.id}/assign-supplier`} method="POST" className="operations-inline-form">
                                        <input type="hidden" name="serviceId" value={row.id} />
                                        <select name="supplierId" defaultValue={row.supplierId || ''}>
                                          <option value="">Select supplier</option>
                                          {supplierOptions.map((supplier) => (
                                            <option key={supplier.id} value={supplier.id}>
                                              {supplier.name}
                                            </option>
                                          ))}
                                        </select>
                                        <button type="submit" className="secondary-button">
                                          Assign
                                        </button>
                                      </form>
                                      <form action={`/api/bookings/services/${row.id}/confirmation`} method="POST" className="operations-inline-form">
                                        <input type="hidden" name="serviceId" value={row.id} />
                                        <select name="confirmationStatus" defaultValue={row.confirmationStatus}>
                                          <option value="pending">Pending</option>
                                          <option value="requested">Requested</option>
                                          <option value="confirmed">Confirmed</option>
                                        </select>
                                        <input
                                          type="text"
                                          name="supplierReference"
                                          defaultValue={supplierReference || ''}
                                          placeholder="Supplier ref"
                                        />
                                        <input type="text" name="notes" defaultValue={row.confirmationNotes || ''} placeholder="Confirmation note" />
                                        <button type="submit" className="secondary-button">
                                          Save
                                        </button>
                                      </form>
                                      <form action={`/api/bookings/services/${row.id}/status`} method="POST" className="operations-inline-form">
                                        <select name="action" defaultValue="">
                                          <option value="" disabled>
                                            Manual action
                                          </option>
                                          <option value="cancel">Cancel service</option>
                                          <option value="reopen">Reopen service</option>
                                          <option value="mark_ready">Mark ready manually</option>
                                        </select>
                                        <input type="text" name="note" placeholder="Reason for manual override" required minLength={3} />
                                        <button type="submit" className="secondary-button">
                                          Apply
                                        </button>
                                      </form>
                                      {row.statusNote ? <p className="detail-copy">Last note: {row.statusNote}</p> : null}
                                      {row.confirmationNotes ? <p className="detail-copy">Confirmation note: {row.confirmationNotes}</p> : null}
                                      {row.confirmationRequestedAt ? <p className="detail-copy">Requested: {formatDateTime(row.confirmationRequestedAt)}</p> : null}
                                      {row.confirmationConfirmedAt ? <p className="detail-copy">Confirmed: {formatDateTime(row.confirmationConfirmedAt)}</p> : null}
                                      {latestBulkSkip ? (
                                        <p className="form-error">
                                          Bulk skip: {latestBulkSkip.note || latestBulkSkip.newValue || 'Action blocked'}
                                        </p>
                                      ) : null}
                                      {activityService && row.reconfirmationRequired ? (
                                        <p className={row.warnings.includes('reconfirmation_due') ? 'form-error' : 'detail-copy'}>
                                          Reconfirmation due: {row.reconfirmationDueAt ? formatDateTime(row.reconfirmationDueAt) : 'Not set'}
                                        </p>
                                      ) : null}
                                      {row.auditLogs.length > 0 ? (
                                        <div className="audit-log-list">
                                          {row.auditLogs.slice(0, 3).map((auditLog) => (
                                            <div key={auditLog.id} className="audit-log-item">
                                              <strong>{formatAuditAction(auditLog.action)}</strong>
                                              <p>
                                                {formatDateTime(auditLog.createdAt)}
                                                {auditLog.actor ? ` | ${auditLog.actor}` : ''}
                                              </p>
                                              {(auditLog.oldValue || auditLog.newValue) ? (
                                                <p>
                                                  {auditLog.oldValue || '-'} to {auditLog.newValue || '-'}
                                                </p>
                                              ) : null}
                                              {auditLog.note ? <p>{auditLog.note}</p> : null}
                                            </div>
                                          ))}
                                        </div>
                                      ) : null}
                                  </RowDetailsPanel>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                );
              })()}
                </section>
              </OperationsBulkGroupVisibility>
            ))}
          </OperationsBulkActionsProvider>
        )}
      </section>
    </main>
  );
  } catch (error) {
    if (isAdminForbiddenError(error)) {
      return (
        <AdminForbiddenState
          title="Operations access restricted"
          description="Your account does not have permission to load operations data for this company."
        />
      );
    }

    throw error;
  }
}
