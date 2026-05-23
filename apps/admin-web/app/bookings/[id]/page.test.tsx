import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const financialsTabSource = readFileSync(new URL('./BookingFinancialsTab.tsx', import.meta.url), 'utf8');
const invoiceButtonSource = readFileSync(new URL('./BookingInvoicePdfButton.tsx', import.meta.url), 'utf8');
const documentActionsSource = readFileSync(new URL('./BookingDocumentActions.tsx', import.meta.url), 'utf8');
const bookingServicesListSource = readFileSync(new URL('./BookingServicesList.tsx', import.meta.url), 'utf8');
const bookingServiceTimelineSource = readFileSync(new URL('./BookingServiceTimeline.tsx', import.meta.url), 'utf8');
const bookingPaymentsSectionSource = readFileSync(new URL('./BookingPaymentsSection.tsx', import.meta.url), 'utf8');
const amendBookingButtonSource = readFileSync(new URL('./AmendBookingButton.tsx', import.meta.url), 'utf8');
const voucherPageSource = readFileSync(new URL('./voucher/page.tsx', import.meta.url), 'utf8');
const supplierConfirmationPageSource = readFileSync(new URL('./supplier-confirmation/page.tsx', import.meta.url), 'utf8');
const operationsGridPageSource = readFileSync(new URL('./operations/page.tsx', import.meta.url), 'utf8');
const operationAssignmentRouteSource = readFileSync(new URL('../../api/bookings/[id]/operations/[operationId]/assign-supplier/route.ts', import.meta.url), 'utf8');
const serviceUpdateRouteSource = readFileSync(new URL('../../api/bookings/[id]/days/[dayId]/services/[serviceId]/route.ts', import.meta.url), 'utf8');
const financePageSource = readFileSync(new URL('../../finance/page.tsx', import.meta.url), 'utf8');
const financialDocumentPdfRouteSource = readFileSync(new URL('../../api/bookings/[id]/financial-documents/[documentType]/pdf/route.ts', import.meta.url), 'utf8');
const invoiceGenerationRouteSource = readFileSync(new URL('../../api/bookings/[id]/invoice/route.ts', import.meta.url), 'utf8');
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

function getOperationEditorBranch(type: string) {
  const marker = `editorType === '${type}'`;
  const start = pageSource.indexOf(marker);
  assert.notEqual(start, -1, `Expected ${type} operation editor branch to exist`);

  // Stop at the next sibling branch OR this branch's own `) : null}` close —
  // without the latter, the SERVICE branch (which is last) over-captures the
  // rest of the file and matches text that belongs to unrelated sections.
  const nextSibling = pageSource.indexOf("{editorType === '", start + marker.length);
  const branchEnd = pageSource.indexOf(') : null}', start);
  const candidates = [nextSibling, branchEnd].filter((idx) => idx !== -1);
  const end = candidates.length === 0 ? pageSource.length : Math.min(...candidates);
  const slice = pageSource.slice(start, end);
  // The editor branches share a tail via renderCommonOperationFields(service);
  // inline that helper's body when present so assertions about confirmation
  // fields work for branches that delegate to it.
  if (slice.includes('renderCommonOperationFields(service)')) {
    const commonStart = pageSource.indexOf('function renderCommonOperationFields');
    if (commonStart !== -1) {
      // Look for the function's closing `}` followed by a newline (CRLF or LF).
      const commonEnd = pageSource.slice(commonStart).search(/\r?\n\}\r?\n/);
      if (commonEnd !== -1) {
        return slice + pageSource.slice(commonStart, commonStart + commonEnd + 4);
      }
    }
  }
  return slice;
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
      '<Link href={`/bookings/${booking.id}/operations`} className="secondary-button">',
      'Assign operations',
      '<Link href={buildTabHref(\'passengers\')} className="secondary-button">',
      'Add passengers',
      '<AmendBookingButton bookingId={booking.id} disabled={bookingReadOnly} services={booking.services} days={booking.days || []} />',
      '{!bookingReadOnly ? <CancelBookingButton bookingId={booking.id} /> : null}',
    ]);
  });

  it('disables or hides invalid actions for cancelled and read-only amendment bookings', () => {
    expectSourceContains(pageSource, [
      "const bookingCancelled = booking.status === 'cancelled';",
      'const bookingReadOnly = bookingCancelled || booking.isLatestAmendment === false;',
      'allowedTransitions.length > 0 && !bookingReadOnly',
      '<AmendBookingButton bookingId={booking.id} disabled={bookingReadOnly} services={booking.services} days={booking.days || []} />',
      '{!bookingReadOnly ? <CancelBookingButton bookingId={booking.id} /> : null}',
      'const primaryAction = bookingReadOnly ? null : getBookingPrimaryAction(booking.status, allowedTransitions, booking.id);',
    ]);
  });

  it('opens the amendment workflow before submitting operational amendment payloads', () => {
    expectSourceContains(amendBookingButtonSource, [
      'setIsOpen((value) => !value)',
      'amendment-workflow-panel',
      '`/api/bookings/${bookingId}/operational-amendments`',
      'JSON.stringify(payload)',
      'amendmentType',
      'serviceId',
      'confirmProtected',
      'roomingImpacted',
      'Submit amendment',
    ]);
    assert.equal(amendBookingButtonSource.includes('window.confirm'), false);
    assert.equal(amendBookingButtonSource.includes('`/api/bookings/${bookingId}/amend`'), false);
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
      // confirmationReference is reached transitively via renderCommonOperationFields
      // and the per-type editor branches; covered by the per-branch tests below.
      'renderOperationTypeAwareEditor',
      'renderOperationStatusOptions(service.operationStatus)',
      'BookingServiceTimeline',
      'Generate Voucher',
    ]);
  });

  it('exposes supplier assignment workflow on the operations grid', () => {
    expectSourceContains(`${operationsGridPageSource}\n${operationAssignmentRouteSource}`, [
      'assignedSupplierId',
      'assignmentStatus',
      'assignmentNotes',
      'booking-operations-row-card',
      'assign-supplier',
      'method="POST"',
      'name="assignedSupplierId"',
      'name="bookingId"',
      'name="operationId"',
      'name="assignmentStatus"',
      'name="assignmentNotes"',
      "redirectUrl.searchParams.set('tab', 'operations')",
      'assignedSupplierId = optionalFormValue',
      'Operation assignment debug',
      'UNASSIGNED',
      'REQUESTED',
      'CONFIRMED',
      'REJECTED',
    ]);
    assert.doesNotMatch(operationsGridPageSource, /OperationSupplierAssignmentForm|CLIENT EDITOR ACTIVE/);
    assert.doesNotMatch(operationAssignmentRouteSource, /warningText|console\./);
  });

  it('exposes supplier confirmation workflow on the operations grid', () => {
    expectSourceContains(operationsGridPageSource, [
      'supplierConfirmationStatus',
      'confirmationReference',
      'confirmationNotes',
      'confirmationRequestedAt',
      'confirmationReceivedAt',
      'Request Confirmation',
      'Mark Confirmed',
      'Mark Rejected',
      '/confirmation',
      // severity-critical and operations-readiness-ready are computed at runtime
      // from readiness values; verify the className expressions exist instead of
      // grepping for literals that template literals will never produce.
      'severity-${getSeverityClass(',
      'operations-readiness-${',
    ]);
  });

  it('renders simplified operational action center and grouped workflow cards', () => {
    expectSourceContains(operationsGridPageSource, [
      'Operational Action Center',
      'Suppliers unassigned',
      'Confirmations pending',
      'Confirmations rejected',
      'Vouchers pending',
      'Manifest incomplete',
      'Rooming incomplete',
      "'INFO'",
      "'ACTION REQUIRED'",
      "'CRITICAL'",
      "'Needs Assignment'",
      "'Needs Confirmation'",
      "'Ready for Voucher'",
      "'Operationally Ready'",
      "'Critical Issues'",
      'booking-operations-sidebar app-sticky-panel',
      'Secondary details',
      'Assign Supplier',
      'Generate Voucher',
    ]);
  });

  it('renders operation-type-aware booking service editors', () => {
    expectSourceContains(pageSource, [
      'renderOperationTypeAwareEditor',
      'booking-operation-editor-${editorType.toLowerCase()}',
      'getOperationEditorHeading',
      'Transport operation details',
      'Hotel operation details',
      'Activity operation details',
      'Guide operation details',
      'Ticket operation details',
      'Service details',
      "editorType === 'TRANSPORT'",
      "editorType === 'HOTEL'",
      "editorType === 'ACTIVITY'",
      "editorType === 'GUIDE'",
      "editorType === 'TICKET'",
      "editorType === 'SERVICE'",
    ]);
    assert.doesNotMatch(pageSource, />\{editorType\} editor</);
    assert.doesNotMatch(pageSource, /SERVICE editor|HOTEL editor|TRANSPORT editor|ACTIVITY editor|GUIDE editor|TICKET editor/);
  });

  it('keeps SERVICE operation editors free of transport-only fields', () => {
    const serviceEditor = getOperationEditorBranch('SERVICE');
    assert.doesNotMatch(serviceEditor, /renderRouteOptions|renderVehicleOptions|name="assignedTo"|name="guidePhone"/);
    expectSourceContains(serviceEditor, [
      'Operational notes',
      'name="meetingPoint"',
      'name="startTime"',
      'name="confirmationReference"',
    ]);
  });

  it('keeps TRANSPORT operation editors focused on route and vehicle execution', () => {
    const transportEditor = getOperationEditorBranch('TRANSPORT');
    expectSourceContains(transportEditor, [
      'renderRouteOptions(transportRoutes, service.referenceId)',
      'renderVehicleOptions(vehicles, service.vehicleId)',
      'Driver',
      'name="pickupTime"',
    ]);
  });

  it('renders ACTIVITY operation editors with timing and participant controls only', () => {
    const activityEditor = getOperationEditorBranch('ACTIVITY');
    expectSourceContains(activityEditor, [
      'name="startTime"',
      'name="pickupTime"',
      'name="meetingPoint"',
      'name="participantCount"',
    ]);
    assert.doesNotMatch(activityEditor, /renderRouteOptions|renderVehicleOptions|name="guidePhone"/);
  });

  it('renders HOTEL operation editors with rooming and occupancy context', () => {
    const hotelEditor = getOperationEditorBranch('HOTEL');
    expectSourceContains(hotelEditor, [
      'Hotel supplier',
      'Rooming summary',
      'Occupancy:',
      'name="confirmationReference"',
    ]);
    assert.doesNotMatch(hotelEditor, /renderRouteOptions|renderVehicleOptions|name="guidePhone"/);
  });

  it('softens stale operation update errors and clears stale warnings after successful saves', () => {
    expectSourceContains(serviceUpdateRouteSource, [
      'response.status === 404',
      'This operation row was refreshed or is no longer available. Please reopen the row.',
      "redirectUrl.searchParams.delete('warningText')",
      "redirectUrl.searchParams.delete('warning')",
      "redirectUrl.searchParams.delete('error')",
      "redirectUrl.searchParams.set('success'",
    ]);
    assert.doesNotMatch(serviceUpdateRouteSource, /Booking service not found/);
  });

  it('persists booking operation editor saves through service, assignment, and confirmation endpoints', () => {
    expectSourceContains(pageSource, [
      'name="bookingId"',
      'name="operationId"',
      'name="supplierId"',
      'name="assignmentStatus"',
      'name="operationalNotes"',
      'name="meetingPoint"',
      'name="startTime"',
      'name="confirmationReference"',
      'name="confirmationNotes"',
      'name="supplierConfirmationStatus"',
    ]);
    expectSourceContains(serviceUpdateRouteSource, [
      '/operations/${serviceId}/assign-supplier',
      '/operations/${serviceId}/confirmation',
      'operationalNotes',
      'confirmationReference',
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

  it('renders guide operations controls inside booking service manage panel', () => {
    expectSourceContains(pageSource, [
      'type Guide',
      'getGuides',
      'guides={guides}',
    ]);

    expectSourceContains(bookingServiceTimelineSource, [
      'type Guide',
      'guides: Guide[]',
      'isGuideService',
      'BookingServiceDetailSection title="Guide Operations"',
      'guide-assignment',
      'name="guideId"',
      'name="guideConfirmationStatus"',
      'name="guideRequiredLanguages"',
      'name="guideReportingTime"',
      'name="pickupTime"',
      'guideWarnings',
      'Save guide assignment',
    ]);
  });

  it('renders dining operations controls inside booking service manage panel', () => {
    expectSourceContains(pageSource, [
      'type Restaurant',
      'getRestaurants',
      'restaurants={restaurants}',
    ]);

    expectSourceContains(bookingServiceTimelineSource, [
      'type Restaurant',
      'restaurants: Restaurant[]',
      'isMealService',
      'BookingServiceDetailSection title="Dining Operations"',
      'restaurant-assignment',
      'name="restaurantId"',
      'name="mealConfirmationStatus"',
      'name="mealTiming"',
      'name="mealDietaryRequirements"',
      'name="mealSeatingNotes"',
      'mealWarnings',
      'Save restaurant assignment',
    ]);
  });

  it('keeps booking service manage panel scrollable so hotel controls are accessible', () => {
    expectSourceContains(bookingServiceTimelineSource, [
      'bodyClassName="operations-row-details-body booking-service-detail-body"',
      'Hotel Reservation Operations',
      'hotelReservationStatus',
      'blockedRoomCount',
      'releaseDate',
      'hotelReconfirmationDueAt',
      'alternativeHotels',
      'roomingSent',
    ]);

    expectSourceContains(cssSource, [
      '.booking-service-detail-body',
      'max-height: min(76dvh, 760px);',
      'overflow-y: auto;',
      'overflow-x: hidden;',
      'overscroll-behavior-y: auto;',
      'scrollbar-gutter: stable;',
    ]);
  });

  it('gives the booking service manage drawer desktop width for operational forms', () => {
    expectSourceContains(cssSource, [
      '.booking-service-card:has(.operations-row-details[open])',
      'grid-template-columns: minmax(0, 1fr);',
      'grid-column: 1 / -1;',
      'width: min(100%, 1180px);',
      'grid-template-columns: repeat(auto-fit, minmax(min(100%, 15rem), 1fr));',
      'grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr));',
      'min-width: max-content;',
      'white-space: normal;',
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
      'BOOKING_UUID_PATTERN',
      'Invoice generation requires the booking UUID. The booking code is display-only.',
      'Financial documents: client invoice, deposit invoice, payment receipt, supplier payable summary, and credit note placeholder.',
      'Payment methods shown on PDFs: bank transfer, CliQ, MB WAY, cash, credit card, custom/manual.',
      "fetch(`/api/bookings/${resolvedBookingId}/invoice`",
      "fetch(`/api/bookings/${bookingId}/payments`",
      "fetch(`/api/bookings/${bookingId}/payments/${paymentId}/mark-paid`",
      'Client Payments',
      'Supplier Payments',
      'onAddPayment={handleAddPayment}',
      'onMarkPaid={handleMarkPaid}',
    ]);

    assert.doesNotMatch(financialsTabSource, /NEXT_PUBLIC_API_URL|dmcapi-production|railway\.app/i);

    expectSourceContains(invoiceGenerationRouteSource, [
      'BOOKING_UUID_PATTERN',
      'Invoice generation requires a booking UUID. Booking references/codes are display-only.',
      '/bookings/${id}/invoice',
    ]);

    expectSourceContains(cssSource, [
      '.booking-payment-proof-card-grid',
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
    ]);
  });

  it('exposes invoice and financial document generation actions', () => {
    expectSourceContains(invoiceButtonSource, [
      "type BookingFinancialDocumentType = 'client-invoice' | 'deposit-invoice' | 'payment-receipt' | 'supplier-payable-summary' | 'credit-note';",
      'Financial document',
      '<option value="client-invoice">Client invoice</option>',
      '<option value="deposit-invoice">Deposit invoice</option>',
      '<option value="payment-receipt">Payment receipt</option>',
      '<option value="supplier-payable-summary">Supplier payable summary</option>',
      '<option value="credit-note">Credit note placeholder</option>',
      'Download Financial Document PDF',
      'BOOKING_UUID_PATTERN',
      'Financial document download requires the booking UUID. The booking code is display-only.',
      "fetch(`/api/bookings/${resolvedBookingId}/financial-documents/${documentType}/pdf?mode=${mode}`",
    ]);

    expectSourceContains(financialDocumentPdfRouteSource, [
      '/bookings/${id}/financial-documents/${documentType}/pdf',
      'BOOKING_UUID_PATTERN',
      'Financial document download requires a booking UUID. Booking references/codes are display-only.',
      'forwardProxyContentResponse',
      'buildActorHeaders(request)',
    ]);
  });

  it('exposes agent portal ownership linkage on booking documents', () => {
    expectSourceContains(pageSource, [
      'Agent Portal Ownership',
      'booking.quote.agent?.email',
      'Fallback company visibility applies until an agent is assigned.',
      'Assign quote agent/company',
      'href={`/quotes/${booking.quote.id}`}',
    ]);
  });

  it('uses production-safe public app URL for invoice portal links', () => {
    expectSourceContains(pageSource, [
      'getPublicAppBaseUrl',
      'const APP_BASE_URL = getPublicAppBaseUrl();',
      'const portalUrl = `${APP_BASE_URL}/invoice/${encodeURIComponent(booking.accessToken)}`;',
    ]);

    expectSourceContains(readFileSync(new URL('../../lib/admin-server.ts', import.meta.url), 'utf8'), [
      'APP_PUBLIC_URL',
      'NEXT_PUBLIC_APP_URL',
      'https://dmc-platform-admin-web.vercel.app',
      "return 'http://localhost:3000';",
    ]);

    assert.doesNotMatch(pageSource, /NEXT_PUBLIC_APP_URL \|\| ['"]http:\/\/localhost:3000['"]/);
  });

  it('uses booking UUID rather than booking display code for financial document PDF downloads', () => {
    expectSourceContains(pageSource, [
      '<BookingFinancialsTab',
      'bookingId={booking.id}',
      'bookingRef={bookingRef}',
    ]);

    assert.doesNotMatch(invoiceButtonSource, /bookingId=\{bookingRef\}|bookingId=\{booking\.bookingRef\}/);
    assert.match(invoiceButtonSource, /fetch\(`\/api\/bookings\/\$\{resolvedBookingId\}\/financial-documents\/\$\{documentType\}\/pdf\?mode=\$\{mode\}`\)/);
  });

  it('uses booking UUID rather than booking display code for persisted invoice generation', () => {
    expectSourceContains(pageSource, [
      '<BookingFinancialsTab',
      'bookingId={booking.id}',
      'bookingRef={bookingRef}',
    ]);

    assert.doesNotMatch(financialsTabSource, /fetch\(`\/api\/bookings\/\$\{bookingRef\}\/invoice`|bookingId=\{bookingRef\}|bookingId=\{booking\.bookingRef\}/);
    assert.match(financialsTabSource, /fetch\(`\/api\/bookings\/\$\{resolvedBookingId\}\/invoice`/);
  });

  it('surfaces invoice counts and payment document KPIs on finance dashboard', () => {
    expectSourceContains(financePageSource, [
      "adminPageFetchJson<Invoice[]>('/api/invoices'",
      'invoiceCount',
      'unpaidInvoiceCount',
      'partiallyPaidInvoiceCount',
      'overdueInvoiceCount',
      "label: 'Invoices'",
      "label: 'Unpaid invoices'",
      "label: 'Partially paid invoices'",
      "label: 'Overdue invoices'",
    ]);
  });

  it('supports finance reconciliation phase one payment methods and statuses', () => {
    expectSourceContains(bookingPaymentsSectionSource, [
      'bank_transfer',
      'CliQ',
      'mb_way',
      'MB WAY',
      'credit_card',
      'custom_manual',
      'Custom/manual',
      "status: 'PAID'",
      'Payment date',
      'paidAt: draft.status ===',
      'notes: draft.notes.trim() || null',
      'Payment notes, bank advice, reconciliation context',
    ]);
    expectSourceContains(pageSource, [
      'depositsReceived?: number;',
      'remainingBalance?: number;',
      "clientPaymentStatus?: 'unpaid' | 'deposit_paid' | 'partially_paid' | 'paid';",
      "supplierPayableStatus?: 'unpaid' | 'partially_paid' | 'paid';",
      'supplierPayableAmount?: number | null;',
      'supplierPaymentNotes?: string | null;',
      'finance={booking.finance}',
    ]);
    expectSourceContains(bookingServiceTimelineSource, [
      '<BookingServiceDetailSection title="Financials">',
      'Client Financials',
      'Deposits received',
      'Remaining balance',
      'Supplier Payables',
      'Supplier payable amount',
      'Payment Methods',
      'Finance dashboard',
    ]);
    expectSourceContains(financialsTabSource, [
      'Finance Dashboard',
      '/finance/reconciliation',
      '/finance/supplier-payables',
      'Payment Methods',
      'Payment References',
    ]);
  });

  it('surfaces phase two finance dashboard activity and supplier aging', () => {
    expectSourceContains(financePageSource, [
      'FinanceDashboardSection',
      "adminPageFetchJson<FinanceDashboardSummary>('/api/bookings/dashboard/finance'",
      'financeDashboard',
      '<FinanceDashboardSection summary={financeDashboard} />',
      'recentPayments',
      'supplierPayable',
      'totalCollected',
      'overdueBreakdown',
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
