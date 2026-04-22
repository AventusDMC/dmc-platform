export type OperationsBadgeBreakdown = {
  pendingConfirmations: number;
  missingExecutionDetails: number;
  reconfirmationDue: number;
};

export type OperationsBadge = {
  count: number;
  tone: 'error' | 'warning' | 'none';
  breakdown: OperationsBadgeBreakdown;
};

type BookingOperationService = {
  serviceType: string | null;
  serviceDate: string | Date | null;
  startTime: string | null;
  pickupTime: string | null;
  pickupLocation: string | null;
  meetingPoint: string | null;
  confirmationStatus: 'pending' | 'requested' | 'confirmed';
  reconfirmationRequired: boolean;
  reconfirmationDueAt: string | Date | null;
  status: 'pending' | 'ready' | 'in_progress' | 'confirmed' | 'cancelled';
};

function isActivityService(serviceType: string | null) {
  const normalized = String(serviceType || '').trim().toLowerCase();

  return (
    normalized.includes('activity') ||
    normalized.includes('tour') ||
    normalized.includes('excursion') ||
    normalized.includes('experience') ||
    normalized.includes('sightseeing')
  );
}

function hasMissingExecutionDetails(service: BookingOperationService) {
  if (service.status === 'cancelled' || !isActivityService(service.serviceType)) {
    return false;
  }

  return !service.serviceDate || (!service.startTime && !service.pickupTime) || (!service.pickupLocation && !service.meetingPoint);
}

function hasReconfirmationDue(service: BookingOperationService) {
  if (!service.reconfirmationRequired || !service.reconfirmationDueAt || service.status === 'cancelled') {
    return false;
  }

  const dueAt = new Date(service.reconfirmationDueAt).getTime();
  return !Number.isNaN(dueAt) && dueAt <= Date.now();
}

export function buildOperationsBadge(services: BookingOperationService[]): OperationsBadge {
  const breakdown = services.reduce<OperationsBadgeBreakdown>(
    (summary, service) => {
      if (service.status !== 'cancelled' && service.confirmationStatus !== 'confirmed') {
        summary.pendingConfirmations += 1;
      }

      if (hasMissingExecutionDetails(service)) {
        summary.missingExecutionDetails += 1;
      }

      if (hasReconfirmationDue(service)) {
        summary.reconfirmationDue += 1;
      }

      return summary;
    },
    {
      pendingConfirmations: 0,
      missingExecutionDetails: 0,
      reconfirmationDue: 0,
    },
  );

  const count = breakdown.pendingConfirmations + breakdown.missingExecutionDetails + breakdown.reconfirmationDue;
  const tone: OperationsBadge['tone'] =
    breakdown.reconfirmationDue > 0 ? 'error' : breakdown.pendingConfirmations + breakdown.missingExecutionDetails > 0 ? 'warning' : 'none';

  return {
    count,
    tone,
    breakdown,
  };
}
