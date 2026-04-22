type HotelAllotmentRecord = {
  id: string;
  hotelContractId: string;
  roomCategoryId: string;
  dateFrom: Date;
  dateTo: Date;
  allotment: number;
  releaseDays: number;
  stopSale: boolean;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type HotelAllotmentEvaluation = {
  matchingAllotment: HotelAllotmentRecord | null;
  stopSaleActive: boolean;
  insideReleaseWindow: boolean;
  configuredAllotment: number;
  consumed: number;
  remainingAvailability: number;
  inventoryMode: 'live' | 'configured';
  status: 'not_configured' | 'inactive' | 'stop_sale' | 'release_window' | 'sold_out' | 'available';
};

type EvaluateHotelAllotmentInput = {
  allotments: HotelAllotmentRecord[];
  roomCategoryId: string;
  stayDate: Date;
  bookingDate?: Date;
  consumption?: {
    configuredAllotment: number;
    consumed: number;
    remainingAvailability: number;
    inventoryMode: 'live' | 'configured';
  } | null;
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function subtractDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() - days);
  return next;
}

export function evaluateHotelAllotment({
  allotments,
  roomCategoryId,
  stayDate,
  bookingDate = new Date(),
  consumption,
}: EvaluateHotelAllotmentInput): HotelAllotmentEvaluation {
  const normalizedStayDate = startOfDay(stayDate);
  const normalizedBookingDate = startOfDay(bookingDate);
  const matchingAllotment =
    allotments
      .filter(
        (allotment) =>
          allotment.roomCategoryId === roomCategoryId &&
          normalizedStayDate >= startOfDay(allotment.dateFrom) &&
          normalizedStayDate <= endOfDay(allotment.dateTo),
      )
      .sort((left, right) => {
        if (right.dateFrom.getTime() !== left.dateFrom.getTime()) {
          return right.dateFrom.getTime() - left.dateFrom.getTime();
        }

        return right.createdAt.getTime() - left.createdAt.getTime();
      })[0] || null;

  if (!matchingAllotment) {
    return {
      matchingAllotment: null,
      stopSaleActive: false,
      insideReleaseWindow: false,
      configuredAllotment: 0,
      consumed: 0,
      remainingAvailability: 0,
      inventoryMode: 'configured',
      status: 'not_configured',
    };
  }

  if (!matchingAllotment.isActive) {
    return {
      matchingAllotment,
      stopSaleActive: false,
      insideReleaseWindow: false,
      configuredAllotment: 0,
      consumed: 0,
      remainingAvailability: 0,
      inventoryMode: 'configured',
      status: 'inactive',
    };
  }

  const releaseDeadline = startOfDay(subtractDays(normalizedStayDate, matchingAllotment.releaseDays));
  const insideReleaseWindow = matchingAllotment.releaseDays > 0 && normalizedBookingDate >= releaseDeadline;
  const configuredAllotment = consumption?.configuredAllotment ?? Math.max(matchingAllotment.allotment, 0);
  const consumed = consumption?.consumed ?? 0;
  const remainingAvailability = consumption?.remainingAvailability ?? Math.max(matchingAllotment.allotment, 0);
  const inventoryMode = consumption?.inventoryMode ?? 'configured';

  if (matchingAllotment.stopSale) {
    return {
      matchingAllotment,
      stopSaleActive: true,
      insideReleaseWindow,
      configuredAllotment,
      consumed,
      remainingAvailability,
      inventoryMode,
      status: 'stop_sale',
    };
  }

  if (remainingAvailability <= 0) {
    return {
      matchingAllotment,
      stopSaleActive: false,
      insideReleaseWindow,
      configuredAllotment,
      consumed,
      remainingAvailability,
      inventoryMode,
      status: 'sold_out',
    };
  }

  if (insideReleaseWindow) {
    return {
      matchingAllotment,
      stopSaleActive: false,
      insideReleaseWindow: true,
      configuredAllotment,
      consumed,
      remainingAvailability,
      inventoryMode,
      status: 'release_window',
    };
  }

  return {
    matchingAllotment,
    stopSaleActive: false,
    insideReleaseWindow: false,
    configuredAllotment,
    consumed,
    remainingAvailability,
    inventoryMode,
    status: 'available',
  };
}
