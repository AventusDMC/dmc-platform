type BookingConsumptionSource = {
  bookingId: string;
  status: string;
  snapshotJson: unknown;
  services: Array<{
    sourceQuoteItemId: string | null;
    status: string;
  }>;
};

type HotelAllotmentConsumptionRecord = {
  bookingId: string;
  contractId: string;
  hotelId: string | null;
  roomCategoryId: string;
  stayDateFrom: Date;
  stayDateTo: Date;
  roomCount: number;
};

type HotelAllotmentInput = {
  hotelContractId: string;
  roomCategoryId: string;
  dateFrom: Date;
  dateTo: Date;
  allotment: number;
};

export type HotelAllotmentConsumptionSummary = {
  configuredAllotment: number;
  consumed: number;
  remainingAvailability: number;
  inventoryMode: 'live' | 'configured';
};

type SnapshotQuoteItem = {
  id?: string | null;
  hotelId?: string | null;
  contractId?: string | null;
  roomCategoryId?: string | null;
  roomCount?: number | null;
  nightCount?: number | null;
  quantity?: number | null;
  serviceDate?: string | null;
  service?: {
    category?: string | null;
  } | null;
  hotel?: {
    id?: string | null;
  } | null;
};

type BookingSnapshot = {
  roomCount?: number | null;
  nightCount?: number | null;
  travelStartDate?: string | null;
  quoteItems?: SnapshotQuoteItem[];
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDate(value?: string | null) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isHotelSnapshotItem(item: SnapshotQuoteItem) {
  const normalizedCategory = (item.service?.category || '').trim().toLowerCase();

  return Boolean(item.contractId && item.roomCategoryId) && (Boolean(item.hotelId) || normalizedCategory.includes('hotel') || normalizedCategory.includes('accommodation'));
}

function overlaps(leftFrom: Date, leftTo: Date, rightFrom: Date, rightTo: Date) {
  return leftFrom <= rightTo && rightFrom <= leftTo;
}

function getRoomCount(item: SnapshotQuoteItem, snapshot: BookingSnapshot) {
  const explicitRoomCount = Number(item.roomCount ?? snapshot.roomCount ?? 0);
  if (Number.isFinite(explicitRoomCount) && explicitRoomCount > 0) {
    return Math.floor(explicitRoomCount);
  }

  const quantity = Number(item.quantity ?? 0);
  if (Number.isFinite(quantity) && quantity > 0) {
    return Math.floor(quantity);
  }

  return 0;
}

function getNightCount(item: SnapshotQuoteItem, snapshot: BookingSnapshot) {
  const explicitNightCount = Number(item.nightCount ?? snapshot.nightCount ?? 0);
  if (Number.isFinite(explicitNightCount) && explicitNightCount > 0) {
    return Math.floor(explicitNightCount);
  }

  return 1;
}

export function buildHotelAllotmentConsumptionRecords(bookings: BookingConsumptionSource[]) {
  const records: HotelAllotmentConsumptionRecord[] = [];

  for (const booking of bookings) {
    if (String(booking.status || '').toLowerCase() === 'cancelled') {
      continue;
    }

    const serviceStatusByQuoteItemId = new Map(
      booking.services
        .filter((service): service is { sourceQuoteItemId: string; status: string } => Boolean(service.sourceQuoteItemId))
        .map((service) => [service.sourceQuoteItemId, String(service.status || '').toLowerCase()]),
    );
    const snapshot = (booking.snapshotJson || {}) as BookingSnapshot;
    const quoteItems = Array.isArray(snapshot.quoteItems) ? snapshot.quoteItems : [];

    for (const item of quoteItems) {
      if (!isHotelSnapshotItem(item)) {
        continue;
      }

       if (item.id && serviceStatusByQuoteItemId.get(item.id) === 'cancelled') {
        continue;
      }

      const stayStart = parseDate(item.serviceDate) || parseDate(snapshot.travelStartDate);
      const roomCount = getRoomCount(item, snapshot);
      const nightCount = getNightCount(item, snapshot);

      if (!stayStart || roomCount <= 0 || nightCount <= 0 || !item.contractId || !item.roomCategoryId) {
        continue;
      }

      records.push({
        bookingId: booking.bookingId,
        contractId: item.contractId,
        hotelId: item.hotelId || item.hotel?.id || null,
        roomCategoryId: item.roomCategoryId,
        stayDateFrom: startOfDay(stayStart),
        stayDateTo: endOfDay(addDays(startOfDay(stayStart), nightCount - 1)),
        roomCount,
      });
    }
  }

  return records;
}

export function calculateHotelAllotmentConsumptionForDate(
  allotment: HotelAllotmentInput,
  records: HotelAllotmentConsumptionRecord[],
  stayDate: Date,
): HotelAllotmentConsumptionSummary {
  const normalizedStayDate = startOfDay(stayDate);
  const consumed = records
    .filter(
      (record) =>
        record.contractId === allotment.hotelContractId &&
        record.roomCategoryId === allotment.roomCategoryId &&
        normalizedStayDate >= startOfDay(record.stayDateFrom) &&
        normalizedStayDate <= endOfDay(record.stayDateTo),
    )
    .reduce((sum, record) => sum + record.roomCount, 0);

  return {
    configuredAllotment: Math.max(allotment.allotment, 0),
    consumed,
    remainingAvailability: Math.max(allotment.allotment - consumed, 0),
    inventoryMode: records.length > 0 ? 'live' : 'configured',
  };
}

export function calculateHotelAllotmentPeakConsumption(
  allotment: HotelAllotmentInput,
  records: HotelAllotmentConsumptionRecord[],
): HotelAllotmentConsumptionSummary {
  const relevantRecords = records.filter(
    (record) =>
      record.contractId === allotment.hotelContractId &&
      record.roomCategoryId === allotment.roomCategoryId &&
      overlaps(
        startOfDay(record.stayDateFrom),
        endOfDay(record.stayDateTo),
        startOfDay(allotment.dateFrom),
        endOfDay(allotment.dateTo),
      ),
  );

  if (relevantRecords.length === 0) {
    return {
      configuredAllotment: Math.max(allotment.allotment, 0),
      consumed: 0,
      remainingAvailability: Math.max(allotment.allotment, 0),
      inventoryMode: records.length > 0 ? 'live' : 'configured',
    };
  }

  let peakConsumed = 0;
  const rangeStart = startOfDay(allotment.dateFrom);
  const rangeEnd = startOfDay(allotment.dateTo);

  for (let cursor = new Date(rangeStart); cursor <= rangeEnd; cursor = addDays(cursor, 1)) {
    const consumedForDate = relevantRecords
      .filter((record) => cursor >= startOfDay(record.stayDateFrom) && cursor <= endOfDay(record.stayDateTo))
      .reduce((sum, record) => sum + record.roomCount, 0);

    if (consumedForDate > peakConsumed) {
      peakConsumed = consumedForDate;
    }
  }

  return {
    configuredAllotment: Math.max(allotment.allotment, 0),
    consumed: peakConsumed,
    remainingAvailability: Math.max(allotment.allotment - peakConsumed, 0),
    inventoryMode: 'live',
  };
}
