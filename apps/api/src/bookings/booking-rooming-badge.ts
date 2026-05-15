export type RoomingBadgeBreakdown = {
  unassignedPassengers: number;
  unassignedRooms: number;
  occupancyIssues: number;
};

export type RoomingBadge = {
  count: number;
  tone: 'error' | 'warning' | 'none';
  breakdown: RoomingBadgeBreakdown;
};

type BookingRoomingPassenger = {
  id: string;
  roomingAssignments: Array<{
    bookingRoomingEntryId: string;
  }>;
};

type BookingRoomingEntry = {
  id: string;
  roomType?: string | null;
  occupancy: 'single' | 'double' | 'triple' | 'quad' | 'unknown';
  assignments: Array<{
    bookingPassenger: {
      id: string;
    };
  }>;
};

function normalizeRoomingCode(value?: string | null) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function getRoomOccupancyCapacity(value: BookingRoomingEntry['occupancy'], roomType?: string | null) {
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

export function buildRoomingBadge(values: {
  expectedRoomCount: number;
  passengers: BookingRoomingPassenger[];
  roomingEntries: BookingRoomingEntry[];
}): RoomingBadge {
  const roomingExpected = values.expectedRoomCount > 0 || values.roomingEntries.length > 0;
  const unassignedPassengers = roomingExpected
    ? values.passengers.filter((passenger) => passenger.roomingAssignments.length === 0).length
    : 0;

  const occupancyIssueRoomIds = new Set<string>();
  const passengerRoomMap = new Map<string, Set<string>>();

  for (const entry of values.roomingEntries) {
    const capacity = getRoomOccupancyCapacity(entry.occupancy, entry.roomType);
    const assignedPassengerIds = entry.assignments.map((assignment) => assignment.bookingPassenger.id);

    if (capacity !== null && assignedPassengerIds.length > capacity) {
      occupancyIssueRoomIds.add(entry.id);
    }

    for (const passengerId of assignedPassengerIds) {
      const roomIds = passengerRoomMap.get(passengerId) || new Set<string>();
      roomIds.add(entry.id);
      passengerRoomMap.set(passengerId, roomIds);
    }
  }

  for (const roomIds of passengerRoomMap.values()) {
    if (roomIds.size > 1) {
      for (const roomId of roomIds) {
        occupancyIssueRoomIds.add(roomId);
      }
    }
  }

  const missingRoomEntries = Math.max(values.expectedRoomCount - values.roomingEntries.length, 0);
  const incompleteRoomEntries = values.roomingEntries.filter((entry) => {
    const capacity = getRoomOccupancyCapacity(entry.occupancy, entry.roomType);
    const assignedCount = entry.assignments.length;

    if (capacity !== null) {
      return assignedCount < capacity;
    }

    return assignedCount === 0;
  }).length;

  const breakdown: RoomingBadgeBreakdown = {
    unassignedPassengers,
    unassignedRooms: missingRoomEntries + incompleteRoomEntries,
    occupancyIssues: occupancyIssueRoomIds.size,
  };

  const count = breakdown.unassignedPassengers + breakdown.unassignedRooms + breakdown.occupancyIssues;
  const tone: RoomingBadge['tone'] =
    breakdown.occupancyIssues > 0 ? 'error' : breakdown.unassignedPassengers + breakdown.unassignedRooms > 0 ? 'warning' : 'none';

  return {
    count,
    tone,
    breakdown,
  };
}
