import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const financialsTabSource = readFileSync(new URL('./BookingFinancialsTab.tsx', import.meta.url), 'utf8');
const documentActionsSource = readFileSync(new URL('./BookingDocumentActions.tsx', import.meta.url), 'utf8');
const bookingServicesListSource = readFileSync(new URL('./BookingServicesList.tsx', import.meta.url), 'utf8');
const bookingServiceTimelineSource = readFileSync(new URL('./BookingServiceTimeline.tsx', import.meta.url), 'utf8');
const voucherPageSource = readFileSync(new URL('./voucher/page.tsx', import.meta.url), 'utf8');
const supplierConfirmationPageSource = readFileSync(new URL('./supplier-confirmation/page.tsx', import.meta.url), 'utf8');
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
      "{ id: 'rooming', label: 'Rooming' }",
      "{ id: 'services', label: 'Operations' }",
      "{ id: 'documents', label: 'Documents' }",
      "{ id: 'audit-log', label: 'Internal Notes' }",
      'aria-label="Booking detail sections"',
      "activeTab === 'overview'",
      "activeTab === 'itinerary'",
      "activeTab === 'passengers'",
      "activeTab === 'rooming'",
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

  it('exposes booking rooming workspace controls and live validation', () => {
    const roomingSection = getTabSection('rooming');

    expectSourceContains(pageSource, [
      'const ROOMING_GROUP_OPTIONS',
      "{ code: 'SGL', label: 'SGL', occupancy: 'single' }",
      "{ code: 'DBL', label: 'DBL', occupancy: 'double' }",
      "{ code: 'TWN', label: 'TWN', occupancy: 'double' }",
      "{ code: 'TRPL', label: 'TRPL', occupancy: 'triple' }",
      "{ code: 'CWB', label: 'Child with bed', occupancy: 'single' }",
      "{ code: 'CNB', label: 'Child no bed', occupancy: 'single' }",
    ]);

    expectSourceContains(roomingSection, [
      'booking-rooming-workspace-summary',
      'Room group type summary',
      'Live rooming summary',
      '<span>Total rooms</span>',
      '<span>Occupancy</span>',
      '<span>Unassigned passengers</span>',
      'booking-rooming-validation',
      'Assign or move passenger',
      'getPassengerRoomingOptionLabel(passenger, booking.roomingEntries)',
      'Assign / move passenger',
      'Unassign {formatPassengerName(assignment.bookingPassenger)}',
      'Delete room',
    ]);

    expectSourceContains(cssSource, [
      '.booking-rooming-type-grid',
      '.booking-rooming-live-summary',
      '.booking-rooming-validation-valid',
      '.booking-rooming-validation-mismatch',
    ]);
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
      'renderOperationTypeOptions(service.operationType || service.serviceType)',
      '<th>Service</th>',
      '<th>Date / Day</th>',
      '<th>Vehicle / Pax</th>',
      '<th>Cost / Sell</th>',
      '<th>Voucher</th>',
      '<th>Supplier confirmation</th>',
      'getServiceVehicleName(service)',
      'getServicePaxCount(service, booking)',
      'getVoucherReadinessLabel(service)',
      'formatOperationStatus(service.operationStatus || service.confirmationStatus)',
      'name="assignedTo"',
      'name="pickupTime"',
      'name="confirmationNumber"',
      'renderOperationStatusOptions(service.operationStatus)',
      'BookingServiceTimeline',
      'Generate Voucher',
    ]);
  });

  it('renders read-only operational readiness dashboard with counters and day indicators', () => {
    expectSourceContains(pageSource, [
      'operationalReadiness?:',
      'Read-only readiness dashboard',
      'booking-operational-counter-strip',
      'Optional not selected',
      'Unresolved items',
      'Voucher readiness',
      'Passenger assignment',
      'Excursion readiness',
      'operationalReadiness.dayReadiness.find',
      'kind="readiness"',
    ]);

    expectSourceContains(cssSource, [
      '.booking-operational-readiness-grid',
      'grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));',
      '.booking-dashboard-day-readiness',
    ]);
  });

  it('renders hotel reservation operations controls for room blocks and alternatives', () => {
    expectSourceContains(bookingServicesListSource, [
      'Hotel Reservation Operations',
      'operationType',
      'getHotelReservationMetadata',
      'hotelReservationStatus',
      'blockedRoomCount',
      'roomTypes',
      'releaseDate',
      'hotelReconfirmationDueAt',
      'primaryHotelName',
      'alternativeHotels',
      'activateAlternativeHotel',
      'releaseAlternativeHotel',
      'roomingSent',
      'Save hotel reservation ops',
    ]);
    expectSourceContains(bookingServiceTimelineSource, [
      'BookingServiceDetailSection title="Overview"',
      'BookingServiceDetailSection title="Supplier Confirmation"',
      'Hotel Reservation Operations',
      'BookingServiceDetailSection title="Voucher/Documents"',
      'BookingServiceDetailSection title="Notes"',
      'operationType',
      'getHotelReservationMetadata',
      'hotelReservationStatus',
      'blockedRoomCount',
      'releaseDate',
      'hotelReconfirmationDueAt',
      'alternativeHotels',
      'roomingSent',
      'Save hotel reservation ops',
    ]);
  });

  it('keeps responsive dashboard layout and mobile action access', () => {
    expectSourceContains(pageSource, [
      '<AdminHeaderActions className="booking-dashboard-actions">',
      '<nav className="booking-dashboard-tabs" aria-label="Booking detail sections">',
      '<aside className="booking-ops-sidebar app-sticky-panel">',
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
      "fetch(`/api/bookings/${bookingId}/payments`",
      "fetch(`/api/bookings/${bookingId}/payments/${paymentId}/mark-paid`",
      'Client Payments',
      'Supplier Payments',
      'onAddPayment={handleAddPayment}',
      'onMarkPaid={handleMarkPaid}',
    ]);

    assert.doesNotMatch(financialsTabSource, /NEXT_PUBLIC_API_URL|dmcapi-production|railway\.app/i);

    expectSourceContains(cssSource, [
      '.booking-payment-proof-card-grid',
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
    ]);
  });

  it('downloads booking voucher PDFs with credentials and production labels', () => {
    expectSourceContains(documentActionsSource, [
      "credentials: 'include'",
      '`Download ${documentLabel} PDF`',
      'Prepare Email',
      'form-helper',
    ]);

    assert.doesNotMatch(documentActionsSource, /Open email draft/);
  });

  it('keeps voucher page copy production-ready with professional placeholders', () => {
    expectSourceContains(voucherPageSource, [
      'Booking Voucher',
      "return 'Pending';",
      "service.supplierName || 'Pending confirmation'",
      "primaryReference || 'Pending confirmation'",
    ]);

    assert.doesNotMatch(voucherPageSource, /Demo Company|To be advised|return 'Unknown'/);
  });

  it('keeps booking document and supplier confirmation actions on proxy routes', () => {
    expectSourceContains(supplierConfirmationPageSource, [
      "const ACTION_API_BASE_URL = '/api';",
      'apiBaseUrl={ACTION_API_BASE_URL}',
    ]);

    assert.doesNotMatch(supplierConfirmationPageSource, /apiBaseUrl=\{API_BASE_URL\}/);
    assert.doesNotMatch(documentActionsSource, /NEXT_PUBLIC_API_URL|dmcapi-production|railway\.app/i);
  });
});
