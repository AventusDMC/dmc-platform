import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertMobileViewSafe,
  formatMobileStatus,
  getManifestLabel,
  getMobileServiceContact,
  getServiceVoucherHref,
  type MobileOperationsData,
} from './mobile-view';

describe('mobile operations view helpers', () => {
  const data: MobileOperationsData = {
    date: '2026-04-27',
    bookings: [
      {
        id: 'booking-1',
        bookingRef: 'BK-1',
        title: 'Jordan group',
        status: 'in_progress',
        startDate: '2026-04-27T00:00:00.000Z',
        endDate: '2026-04-28T00:00:00.000Z',
        pax: 2,
        roomCount: 1,
        passengerSummary: {
          expected: 2,
          received: 2,
          manifestStatus: 'complete',
          missingReasons: [],
          maskedPassportSamples: [{ id: 'passenger-1', name: 'Lina Haddad', passportNumberMasked: '****4567' }],
        },
        days: [
          {
            id: 'day-1',
            dayNumber: 1,
            date: '2026-04-27T00:00:00.000Z',
            title: 'Arrival',
            notes: 'Meet and assist',
            status: 'PENDING',
            services: [
              {
                id: 'service-1',
                bookingDayId: 'day-1',
                serviceType: 'TRANSPORT',
                operationType: 'TRANSPORT',
                operationStatus: 'REQUESTED',
                description: 'Airport transfer',
                pickupTime: '09:00',
                pickupLocation: 'QAIA',
                assignedTo: 'Omar Driver',
                guidePhone: '+962700000000',
                vouchers: [{ id: 'voucher-1', status: 'DRAFT', type: 'TRANSPORT' }],
              },
            ],
          },
        ],
      },
    ],
  };

  it('renders booking day service labels for the field view', () => {
    const booking = data.bookings[0];
    const service = booking.days[0].services[0];

    assert.equal(booking.title, 'Jordan group');
    assert.equal(booking.days[0].title, 'Arrival');
    assert.equal(service.description, 'Airport transfer');
    assert.equal(formatMobileStatus(service.operationStatus), 'Requested');
    assert.equal(getMobileServiceContact(service), 'Omar Driver / +962700000000');
  });

  it('shows manifest count and masked passport samples without full passport details', () => {
    const booking = data.bookings[0];

    assert.equal(getManifestLabel(booking), '2/2 passengers complete');
    assert.equal(booking.passengerSummary.maskedPassportSamples?.[0].passportNumberMasked, '****4567');
    assert.doesNotMatch(JSON.stringify(data), /P1234567/);
  });

  it('exposes voucher links and keeps pricing fields out of the mobile payload', () => {
    const service = data.bookings[0].days[0].services[0];

    assert.equal(getServiceVoucherHref(service), '/api/vouchers/voucher-1/pdf');
    assert.equal(assertMobileViewSafe(data), true);
    assert.doesNotMatch(JSON.stringify(data), /supplierCost|grossProfit|marginPercent|totalCost|totalSell/i);
  });
});
