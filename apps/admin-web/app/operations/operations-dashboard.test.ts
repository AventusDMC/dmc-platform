import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const source = readFileSync(join(process.cwd(), 'app/operations/page.tsx'), 'utf8');
const cssSource = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

describe('operations dashboard department workspace', () => {
  it('renders the hotel reservation workflow states', () => {
    for (const state of ['Requested', 'Blocked', 'Waitlist', 'Tentative', 'Confirmed', 'Released', 'Cancelled']) {
      assert.match(source, new RegExp(`'${state}'`));
    }

    assert.match(source, /HOTEL_RESERVATION_STATES/);
    assert.match(source, /getHotelReservationState/);
  });

  it('keeps room block workflow indicators visible', () => {
    for (const label of ['Room block counts', 'Release deadlines', 'Alternative hotel tracking', 'Missing room blocks']) {
      assert.match(source, new RegExp(label));
    }

    assert.match(source, /roomBlockCount/);
    assert.match(source, /bookingRoomCount/);
    assert.match(source, /hotelReservation/);
    assert.match(source, /releaseDeadlineApproaching/);
    assert.match(source, /reconfirmationTracking/);
    assert.match(source, /alternativeHotelTracking/);
  });

  it('groups operational work by execution department', () => {
    for (const label of [
      'Hotel Reservations',
      'Series Operations',
      'Guide Operations',
      'Dining Operations',
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
    assert.match(source, /isGuideService/);
    assert.match(source, /isMealService/);
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
      'Hotel still waitlisted',
      'Rooming not sent',
      'Supplier reconfirmation overdue',
      'Rooming missing before arrival',
      'Transport timing incomplete',
      'Guide readiness alert',
      'guideReadinessAlerts',
      'Dining readiness alert',
      'diningReadinessAlerts',
      'seriesOperations',
      'Seats remaining',
      'Low occupancy departures',
      'Sold out departures',
      'Guaranteed departures',
      'departure below minimum guarantee',
      'departure over capacity',
      'low remaining seats',
      'transport capacity mismatch',
      'low occupancy',
      'rooming pending',
      'unreconfirmed departure',
      'voucher pending',
    ]) {
      assert.match(source, new RegExp(label));
    }

    assert.match(source, /buildOperationalAlerts/);
    assert.match(source, /hasMissingTiming/);
  });

  it('keeps UX polish affordances for scanability and actionability', () => {
    for (const token of [
      'operations-critical-kpis',
      'operations-department-card',
      'operations-queue-metrics',
      'operations-queue-disclosure',
      'operations-priority-action',
      'operations-readiness-heatmap',
      'operations-heatmap-cell',
    ]) {
      assert.match(source, new RegExp(token));
      assert.match(cssSource, new RegExp(`\\.${token}`));
    }

    for (const colorClass of [
      'operations-status-pill-blocker',
      'operations-status-pill-warning',
      'operations-status-pill-ready',
      'operations-status-pill-info',
    ]) {
      assert.match(cssSource, new RegExp(`\\.${colorClass}`));
    }
  });
});
