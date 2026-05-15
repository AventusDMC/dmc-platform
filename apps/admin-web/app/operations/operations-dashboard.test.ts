import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const source = readFileSync(join(process.cwd(), 'app/operations/page.tsx'), 'utf8');

describe('operations dashboard department workspace', () => {
  it('renders the hotel reservation workflow states', () => {
    for (const state of ['Requested', 'Blocked', 'Waitlist', 'Tentative', 'Confirmed', 'Released', 'Cancelled']) {
      assert.match(source, new RegExp(`'${state}'`));
    }

    assert.match(source, /HOTEL_RESERVATION_STATES/);
    assert.match(source, /getHotelReservationState/);
  });

  it('keeps room block workflow indicators visible', () => {
    for (const label of ['Room block counts', 'Release deadlines', 'Alternative hotel tracking']) {
      assert.match(source, new RegExp(label));
    }

    assert.match(source, /roomBlockCount/);
    assert.match(source, /bookingRoomCount/);
    assert.match(source, /releaseDeadlineApproaching/);
    assert.match(source, /reconfirmationTracking/);
    assert.match(source, /alternativeHotelTracking/);
  });

  it('groups operational work by execution department', () => {
    for (const label of [
      'Hotel Reservations',
      'Transport Operations',
      'Excursions & Activities',
      'Documentation/Vouchers',
      'Supplier Confirmations',
      'Passenger/Rooming',
    ]) {
      assert.match(source, new RegExp(label.replace(/[&/]/g, '\\$&')));
    }

    assert.match(source, /buildDepartmentDashboards/);
    assert.match(source, /getDepartmentForRow/);
  });

  it('shows department queue filters and operational alerts', () => {
    for (const label of [
      'Pending items',
      'Overdue items',
      'Reconfirmation due',
      'Voucher pending',
      'Missing rooming',
      'Missing timings',
      'Hotel release deadline approaching',
      'Supplier reconfirmation overdue',
      'Rooming missing before arrival',
      'Transport timing incomplete',
    ]) {
      assert.match(source, new RegExp(label));
    }

    assert.match(source, /buildOperationalAlerts/);
    assert.match(source, /hasMissingTiming/);
  });
});
