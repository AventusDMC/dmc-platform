export type MobileOperationStatus = 'PENDING' | 'REQUESTED' | 'CONFIRMED' | 'DONE';

export type MobileService = {
  id: string;
  bookingDayId?: string | null;
  type?: string | null;
  serviceType?: string | null;
  operationType?: string | null;
  supplierId?: string | null;
  referenceId?: string | null;
  vehicleId?: string | null;
  operationStatus?: MobileOperationStatus | string | null;
  description?: string | null;
  pickupTime?: string | null;
  pickupLocation?: string | null;
  meetingPoint?: string | null;
  assignedTo?: string | null;
  guidePhone?: string | null;
  supplierName?: string | null;
  confirmationNumber?: string | null;
  notes?: string | null;
  vouchers?: Array<{ id: string; status: string; type: string }>;
  totalCost?: number;
  totalSell?: number;
};

export type MobileBookingDay = {
  id: string;
  dayNumber: number;
  date: string | null;
  title: string;
  notes: string | null;
  status: string;
  services: MobileService[];
};

export type MobileBooking = {
  id: string;
  bookingRef: string;
  title: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  pax: number;
  roomCount: number;
  passengerSummary: {
    expected: number;
    received: number;
    manifestStatus: string;
    missingReasons: string[];
    maskedPassportSamples?: Array<{ id: string; name: string; passportNumberMasked: string | null }>;
  };
  days: MobileBookingDay[];
  totalCost?: number;
  totalSell?: number;
};

export type MobileOperationsData = {
  date: string;
  bookings: MobileBooking[];
};

export function formatMobileStatus(status?: string | null) {
  const normalized = String(status || 'PENDING').trim().replace(/_/g, ' ').toLowerCase();
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

export function getMobileServiceContact(service: MobileService) {
  const type = String(service.operationType || service.type || service.serviceType || '').toUpperCase();
  if (type.includes('GUIDE')) {
    return [service.assignedTo || 'Guide pending', service.guidePhone].filter(Boolean).join(' / ');
  }

  if (type.includes('TRANSPORT')) {
    return [service.assignedTo || 'Driver pending', service.guidePhone].filter(Boolean).join(' / ');
  }

  if (type.includes('HOTEL')) {
    return [service.supplierName || 'Hotel pending', service.confirmationNumber ? `Confirmation ${service.confirmationNumber}` : null]
      .filter(Boolean)
      .join(' / ');
  }

  return service.supplierName || service.assignedTo || 'Assignment pending';
}

export function getManifestLabel(booking: MobileBooking) {
  const summary = booking.passengerSummary;
  const base = `${summary.received}/${summary.expected || booking.pax || 0} passengers`;
  return summary.manifestStatus === 'complete' ? `${base} complete` : `${base} incomplete`;
}

export function getServiceVoucherHref(service: MobileService) {
  const voucher = service.vouchers?.[0];
  return voucher ? `/api/vouchers/${voucher.id}/pdf` : null;
}

export function assertMobileViewSafe(data: MobileOperationsData) {
  const serialized = JSON.stringify(data).toLowerCase();
  return !serialized.includes('totalcost') && !serialized.includes('totalsell') && !serialized.includes('margin');
}
