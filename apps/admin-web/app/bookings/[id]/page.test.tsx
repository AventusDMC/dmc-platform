import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const financialsTabSource = readFileSync(new URL('./BookingFinancialsTab.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../globals.css', import.meta.url), 'utf8');

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

function getTabSection(tab: string) {
  const start = pageSource.indexOf(`activeTab === '${tab}'`);
  assert.notEqual(start, -1, `Expected ${tab} tab section to exist`);

  const next = pageSource.indexOf('activeTab ===', start + 1);
  return next === -1 ? pageSource.slice(start) : pageSource.slice(start, next);
}

describe('booking detail page regression', () => {
  it('renders the redesigned booking header with key metadata', () => {
    expectSourceContains(pageSource, [
      '<section className="booking-dashboard-header">',
      '<p className="eyebrow">Booking {bookingRef}</p>',
      '<h1>{snapshot.title}</h1>',
      '<BookingOperationsStatusBadge kind="booking" status={booking.status} />',
      '<span>Client</span>',
      '<strong>{booking.clientSnapshotJson.name}</strong>',
      '<span>Contact</span>',
      "<strong>{contactName || 'Contact pending'}</strong>",
      '<span>Destination</span>',
      '<strong>{destinationLabel}</strong>',
      '<span>Dates</span>',
      '<strong>{dateRangeLabel}</strong>',
      '<span>Pax</span>',
      '<strong>{totalPax} pax</strong>',
      '<span>Amendment</span>',
      '<strong>{amendmentLabel}</strong>',
    ]);
  });

  it('shows internal admin profit summary on booking detail', () => {
    expectSourceContains(pageSource, [
      'const totalCost = booking.finance.realizedTotalCost || booking.finance.quotedTotalCost || booking.pricingSnapshotJson.totalCost || snapshot.totalCost || 0;',
      'const grossProfit = Number((totalSell - totalCost).toFixed(2));',
      '<span>Total sell price</span>',
      '<span>Total cost</span>',
      '<span>Gross profit</span>',
      '<span>Margin %</span>',
      'Internal / Admin profit summary. Supplier costs are not included in client documents.',
    ]);
  });

  it('keeps existing booking actions visible and wired to current handlers', () => {
    expectSourceContains(pageSource, [
      'summary="Save"',
      'action={`/api/bookings/${booking.id}/status`}',
      '<Link href={buildTabHref(\'documents\')} className="secondary-button">',
      'Generate documents',
      '<Link href={buildTabHref(\'services\')} className="secondary-button">',
      'Assign operations',
      '<Link href={buildTabHref(\'passengers\')} className="secondary-button">',
      'Add passengers',
      '<AmendBookingButton bookingId={booking.id} disabled={bookingReadOnly} />',
      '{!bookingReadOnly ? <CancelBookingButton bookingId={booking.id} /> : null}',
    ]);
  });

  it('disables or hides invalid actions for cancelled and read-only amendment bookings', () => {
    expectSourceContains(pageSource, [
      "const bookingCancelled = booking.status === 'cancelled';",
      'const bookingReadOnly = bookingCancelled || booking.isLatestAmendment === false;',
      'allowedTransitions.length > 0 && !bookingReadOnly',
      '<AmendBookingButton bookingId={booking.id} disabled={bookingReadOnly} />',
      '{!bookingReadOnly ? <CancelBookingButton bookingId={booking.id} /> : null}',
      'const primaryAction = bookingReadOnly ? null : getBookingPrimaryAction(booking.status, allowedTransitions);',
    ]);
  });

  it('keeps old amendment context visible while supporting read-only latest-amendment state', () => {
    expectSourceContains(pageSource, [
      'isLatestAmendment?: boolean;',
      '<p className="eyebrow">Amendment History</p>',
      '<span>Current amendment</span>',
      '<strong>{amendmentLabel}</strong>',
      '<span>Source amendment</span>',
      "<strong>{booking.amendedFromId ? booking.amendedFromId.slice(0, 8).toUpperCase() : 'Original booking'}</strong>",
    ]);
  });

  it('renders the redesigned tabs and their backing sections', () => {
    expectSourceContains(pageSource, [
      'const BOOKING_DASHBOARD_TABS',
      "{ id: 'overview', label: 'Overview' }",
      "{ id: 'itinerary', label: 'Itinerary' }",
      "{ id: 'passengers', label: 'Passengers' }",
      "{ id: 'services', label: 'Operations' }",
      "{ id: 'documents', label: 'Documents' }",
      "{ id: 'audit-log', label: 'Internal Notes' }",
      'aria-label="Booking detail sections"',
      "activeTab === 'overview'",
      "activeTab === 'itinerary'",
      "activeTab === 'passengers'",
      "activeTab === 'services'",
      "activeTab === 'documents'",
      "activeTab === 'audit-log'",
    ]);
  });

  it('keeps passenger passport data masked in the passenger table', () => {
    const passengersSection = getTabSection('passengers');

    expectSourceContains(passengersSection, [
      '<th>Passport</th>',
      '<th>DOB</th>',
      '<th>Room assignment</th>',
      '<td>{passenger.passportNumberMasked || \'Missing\'}</td>',
      '<td>{formatDateOnly(passenger.dateOfBirth)}</td>',
      '<td>{getPassengerRoomAssignmentLabel(passenger.id, booking.roomingEntries)}</td>',
    ]);

    assert.doesNotMatch(passengersSection, /passenger\.passportNumber(?!Masked)/);
  });

  it('keeps the documents section complete without pricing leakage', () => {
    const documentsSection = getTabSection('documents');

    expectSourceContains(documentsSection, [
      '<p className="eyebrow">Passenger Manifest</p>',
      'Manifest Excel',
      '<p className="eyebrow">Guarantee Letter</p>',
      'Generate Guarantee Letter',
      '<p className="eyebrow">Hotel Vouchers</p>',
      '<p className="eyebrow">Transport Vouchers</p>',
      '<p className="eyebrow">Activity Vouchers</p>',
      '<p className="eyebrow">Supplier Confirmation</p>',
    ]);

    assert.doesNotMatch(documentsSection, /totalCost|quotedTotalCost|realizedTotalCost|margin|Margin|formatMoney/);
  });

  it('preserves operations assignment actions and supplier coordination fields', () => {
    const operationsSection = getTabSection('services');

    expectSourceContains(operationsSection, [
      'AdvancedFiltersPanel title="Booking controls"',
      'renderSupplierOptions(suppliers',
      'renderVehicleOptions(vehicles',
      'renderRouteOptions(transportRoutes',
      'name="assignedTo"',
      'name="pickupTime"',
      'name="confirmationNumber"',
      'BookingServiceTimeline',
      'Generate Voucher',
    ]);
  });

  it('keeps responsive dashboard layout and mobile action access', () => {
    expectSourceContains(pageSource, [
      '<AdminHeaderActions className="booking-dashboard-actions">',
      '<nav className="booking-dashboard-tabs" aria-label="Booking detail sections">',
      '<aside className="booking-ops-sidebar">',
      'booking-dashboard-primary-action',
    ]);

    expectSourceContains(cssSource, [
      '.booking-dashboard-header',
      '.booking-ops-layout',
      'grid-template-columns: minmax(0, 7fr) minmax(300px, 3fr);',
      '@media (max-width: 1180px)',
      '@media (max-width: 720px)',
      '.booking-dashboard-actions > *',
      'width: 100%;',
    ]);
  });

  it('exposes finance invoice MVP controls without removing existing payment sections', () => {
    expectSourceContains(financialsTabSource, [
      'Finance / Invoices',
      'Invoice status',
      'Balance due',
      'Generate invoice',
      "fetch(`/api/bookings/${bookingId}/invoice`",
      'Client Payments',
      'Supplier Payments',
      'onAddPayment={handleAddPayment}',
      'onMarkPaid={handleMarkPaid}',
    ]);

    expectSourceContains(cssSource, [
      '.booking-payment-proof-card-grid',
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
    ]);
  });
});
