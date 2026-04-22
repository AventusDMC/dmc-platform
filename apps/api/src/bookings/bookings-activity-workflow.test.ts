import test = require('node:test');
import assert = require('node:assert/strict');
const { BookingsService } = require('./bookings.service');

function createBookingsService() {
  return new BookingsService({} as any);
}

test('activity services cannot be marked ready without a service date', () => {
  const service = createBookingsService();

  assert.throws(
    () =>
      (service as any).assertCanMarkReady({
        serviceType: 'Activity',
        serviceDate: null,
        supplierId: 'supplier-1',
        supplierName: 'Desert Compass',
        totalCost: 100,
        totalSell: 150,
      }),
    /service date/i,
  );
});

test('activity services cannot request confirmation without operational details', () => {
  const service = createBookingsService();

  assert.throws(
    () =>
      (service as any).assertCanRequestConfirmation({
        serviceType: 'Activity',
        serviceDate: new Date('2026-05-10T09:00:00.000Z'),
        startTime: null,
        pickupTime: null,
        pickupLocation: null,
        meetingPoint: null,
        participantCount: 0,
        adultCount: 0,
        childCount: 0,
        status: 'ready',
        supplierId: 'supplier-1',
        supplierName: 'Desert Compass',
        totalCost: 100,
        totalSell: 150,
        confirmationStatus: 'pending',
      }),
    /activity services need/i,
  );
});

test('activity services cannot confirm without a supplier reference or note', () => {
  const service = createBookingsService();

  assert.throws(
    () =>
      (service as any).assertConfirmationWorkflowRequirements({
        serviceType: 'Activity',
        confirmationStatus: 'confirmed',
        supplierReference: null,
        note: null,
        serviceDate: new Date('2026-05-10T09:00:00.000Z'),
        startTime: '08:30',
        pickupTime: '08:00',
        pickupLocation: 'Hotel lobby',
        meetingPoint: null,
        participantCount: 2,
        adultCount: 2,
        childCount: 0,
        status: 'in_progress',
        supplierId: 'supplier-1',
        supplierName: 'Desert Compass',
        totalCost: 100,
        totalSell: 150,
        currentConfirmationStatus: 'requested',
      }),
    /supplier reference or confirmation note/i,
  );
});
