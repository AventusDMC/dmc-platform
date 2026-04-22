export type BadgeTone = 'error' | 'warning' | 'none';

export type FinanceBadge = {
  count: number;
  tone: BadgeTone;
  breakdown: {
    unpaidClient: number;
    unpaidSupplier: number;
    negativeMargin: number;
    lowMargin: number;
  };
};

export type OperationsBadge = {
  count: number;
  tone: BadgeTone;
  breakdown: {
    pendingConfirmations: number;
    missingExecutionDetails: number;
    reconfirmationDue: number;
  };
};

export type RoomingBadge = {
  count: number;
  tone: BadgeTone;
  breakdown: {
    unassignedPassengers: number;
    unassignedRooms: number;
    occupancyIssues: number;
  };
};

export type AttentionSeverity = 'error' | 'warning';

export type BookingAttentionSignals = {
  id: string;
  finance: {
    badge: FinanceBadge;
  };
  operations: {
    badge: OperationsBadge;
  };
  rooming: {
    badge: RoomingBadge;
  };
};

export function getBookingAttentionSeverity(booking: BookingAttentionSignals): AttentionSeverity | null {
  if (
    booking.finance.badge.tone === 'error' ||
    booking.operations.badge.tone === 'error' ||
    booking.rooming.badge.tone === 'error'
  ) {
    return 'error';
  }

  if (
    booking.finance.badge.tone === 'warning' ||
    booking.operations.badge.tone === 'warning' ||
    booking.rooming.badge.tone === 'warning'
  ) {
    return 'warning';
  }

  return null;
}

export function getBookingFinanceHref(id: string) {
  return `/bookings/${id}?tab=finance`;
}

export function getBookingOperationsHref(id: string) {
  return `/bookings/${id}?tab=operations`;
}

export function getBookingRoomingHref(id: string) {
  return `/bookings/${id}?tab=rooming`;
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

export function buildFinanceTooltip(badge: FinanceBadge) {
  return buildBadgeTooltip([
    { count: badge.breakdown.unpaidClient, label: 'unpaid client' },
    { count: badge.breakdown.unpaidSupplier, label: 'unpaid supplier' },
    { count: badge.breakdown.negativeMargin, label: 'negative margin' },
    { count: badge.breakdown.lowMargin, label: 'low margin' },
  ]);
}

export function buildOperationsTooltip(badge: OperationsBadge) {
  return buildBadgeTooltip([
    { count: badge.breakdown.pendingConfirmations, label: 'pending confirmations' },
    { count: badge.breakdown.missingExecutionDetails, label: 'missing execution details' },
    { count: badge.breakdown.reconfirmationDue, label: 'reconfirmation due' },
  ]);
}

export function buildRoomingTooltip(badge: RoomingBadge) {
  return buildBadgeTooltip([
    { count: badge.breakdown.unassignedPassengers, label: 'unassigned passengers' },
    { count: badge.breakdown.unassignedRooms, label: 'incomplete rooms' },
    { count: badge.breakdown.occupancyIssues, label: 'occupancy issues' },
  ]);
}
