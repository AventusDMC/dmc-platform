'use client';

import type { ReactNode } from 'react';
import { InlineRowEditorShell } from '../../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../../components/RowDetailsPanel';
import { getMarginColor, getMarginMetrics } from '../../lib/financials';
import { isActivityTaxonomyGroup, resolveServiceTaxonomyGroup } from '../../lib/service-taxonomy';
import { BookingOperationsEmptyState } from './BookingOperationsEmptyState';
import { BookingOperationsStatusBadge } from './BookingOperationsStatusBadge';

type AuditLog = {
  id: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  actorUserId?: string | null;
  actor: string | null;
  createdAt: string;
};

type Supplier = {
  id: string;
  name: string;
  type: 'hotel' | 'transport' | 'activity' | 'guide' | 'other';
};

type Guide = {
  id: string;
  fullName: string;
  languages: string[];
  regions: string[];
  phone: string | null;
  active: boolean;
  guideType: string;
};

type Restaurant = {
  id: string;
  name: string;
  city: string | null;
  region: string | null;
  cuisineType: string | null;
  capacity: number | null;
  mealTypes: string[];
  active: boolean;
  halalSupport: boolean;
  vegetarianSupport: boolean;
  veganSupport: boolean;
};

type BookingService = {
  id: string;
  description: string;
  qty: number;
  totalCost: number;
  totalSell: number;
  supplierId: string | null;
  supplierName: string | null;
  supplierStatus?: 'unresolved' | null;
  serviceType: string;
  operationType?: 'TRANSPORT' | 'GUIDE' | 'HOTEL' | 'ACTIVITY' | 'DINING' | 'SERVICE' | 'EXTERNAL_PACKAGE' | null;
  serviceDate: string | null;
  startTime?: string | null;
  pickupTime?: string | null;
  pickupLocation?: string | null;
  meetingPoint?: string | null;
  participantCount?: number | null;
  adultCount?: number | null;
  childCount?: number | null;
  supplierReference?: string | null;
  reconfirmationRequired?: boolean;
  reconfirmationDueAt?: string | null;
  status: 'pending' | 'ready' | 'in_progress' | 'confirmed' | 'cancelled';
  statusNote?: string | null;
  confirmationStatus: 'pending' | 'requested' | 'confirmed';
  confirmationNumber: string | null;
  confirmationNotes?: string | null;
  confirmationRequestedAt?: string | null;
  confirmationConfirmedAt?: string | null;
  assignedTo?: string | null;
  guidePhone?: string | null;
  guideId?: string | null;
  guideConfirmationStatus?: string | null;
  guideRequiredLanguages?: string[];
  guideReportingTime?: string | null;
  guide?: Guide | null;
  guideWarnings?: string[];
  restaurantId?: string | null;
  restaurant?: Restaurant | null;
  mealConfirmationStatus?: string | null;
  mealTiming?: string | null;
  mealSeatingNotes?: string | null;
  mealDietaryRequirements?: string[];
  mealOperationalNotes?: string | null;
  mealWarnings?: string[];
  sourceMetadata?: {
    hotelReservation?: {
      status?: string | null;
      blockedRoomCount?: number | null;
      roomTypes?: string[];
      releaseDate?: string | null;
      reconfirmationDueDate?: string | null;
      notes?: string | null;
      primaryHotelName?: string | null;
      alternativeHotels?: Array<{
        name?: string | null;
        status?: string | null;
        notes?: string | null;
      }>;
      roomingSentAt?: string | null;
    };
  } | null;
  vouchers?: Array<{
    id: string;
    type: 'TRANSPORT' | 'EXCURSION' | 'HOTEL' | 'GUIDE' | 'ACTIVITY' | 'EXTERNAL_PACKAGE';
    status: 'DRAFT' | 'READY' | 'SENT' | 'ISSUED' | 'CANCELLED';
    issuedAt?: string | null;
    notes?: string | null;
  }>;
  auditLogs?: AuditLog[];
};

type BookingServiceTimelineProps = {
  services: BookingService[];
  suppliers: Supplier[];
  guides: Guide[];
  restaurants: Restaurant[];
  highlightServiceId?: string;
};

type ServiceGroup = {
  key: string;
  label: string;
  services: BookingService[];
};

function mapBookingServiceTypeToSupplierType(serviceType: string, operationType?: string | null): Supplier['type'] | null {
  const normalized = [operationType, serviceType].filter(Boolean).join(' ').trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes('hotel') || normalized.includes('accommodation')) return 'hotel';
  if (normalized.includes('transport') || normalized.includes('transfer') || normalized.includes('vehicle')) return 'transport';
  if (normalized.includes('activity') || normalized.includes('tour') || normalized.includes('excursion') || normalized.includes('experience')) return 'activity';
  if (normalized.includes('guide') || normalized.includes('escort')) return 'guide';
  return normalized.includes('other') ? 'other' : null;
}

function formatAuditAction(action: string) {
  return action
    .replace(/^service_/, '')
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function isActivityService(serviceType: string) {
  return isActivityTaxonomyGroup({ category: serviceType });
}

function isGuideService(service: Pick<BookingService, 'serviceType' | 'operationType' | 'guideId'>) {
  return (
    resolveServiceTaxonomyGroup({ category: service.operationType || service.serviceType }) === 'guide' ||
    mapBookingServiceTypeToSupplierType(service.serviceType, service.operationType) === 'guide' ||
    Boolean(service.guideId)
  );
}

function isMealService(service: Pick<BookingService, 'serviceType' | 'operationType' | 'restaurantId'>) {
  const normalized = [service.operationType, service.serviceType].filter(Boolean).join(' ');
  return (
    resolveServiceTaxonomyGroup({ category: service.operationType || service.serviceType }) === 'meal' ||
    mapBookingServiceTypeToSupplierType(service.serviceType, service.operationType) === 'other' && /meal|dining|restaurant|lunch|dinner/i.test(normalized) ||
    Boolean(service.restaurantId)
  );
}

function isHotelService(service: Pick<BookingService, 'serviceType' | 'operationType' | 'sourceMetadata'>) {
  return (
    resolveServiceTaxonomyGroup({ category: service.operationType || service.serviceType }) === 'hotel' ||
    mapBookingServiceTypeToSupplierType(service.serviceType, service.operationType) === 'hotel' ||
    Boolean(service.sourceMetadata?.hotelReservation)
  );
}

function getHotelReservationMetadata(service: Pick<BookingService, 'sourceMetadata' | 'reconfirmationDueAt' | 'supplierName'>) {
  return {
    status: service.sourceMetadata?.hotelReservation?.status || 'Requested',
    blockedRoomCount: service.sourceMetadata?.hotelReservation?.blockedRoomCount ?? 0,
    roomTypes: service.sourceMetadata?.hotelReservation?.roomTypes || [],
    releaseDate: service.sourceMetadata?.hotelReservation?.releaseDate || null,
    reconfirmationDueDate: service.sourceMetadata?.hotelReservation?.reconfirmationDueDate || service.reconfirmationDueAt || null,
    notes: service.sourceMetadata?.hotelReservation?.notes || '',
    primaryHotelName: service.sourceMetadata?.hotelReservation?.primaryHotelName || service.supplierName || '',
    alternativeHotels: service.sourceMetadata?.hotelReservation?.alternativeHotels || [],
    roomingSentAt: service.sourceMetadata?.hotelReservation?.roomingSentAt || null,
  };
}

function getReconfirmationWarning(service: Pick<BookingService, 'reconfirmationRequired' | 'reconfirmationDueAt' | 'confirmationStatus'>) {
  if (!service.reconfirmationRequired || !service.reconfirmationDueAt || service.confirmationStatus === 'confirmed') {
    return null;
  }

  const dueAt = new Date(service.reconfirmationDueAt).getTime();
  if (Number.isNaN(dueAt)) {
    return null;
  }

  const now = Date.now();
  if (dueAt <= now) {
    return 'Reconfirmation overdue';
  }

  return dueAt - now <= 48 * 60 * 60 * 1000 ? 'Reconfirmation due soon' : null;
}

function buildServiceGroups(services: BookingService[]): ServiceGroup[] {
  const grouped = new Map<string, BookingService[]>();

  for (const service of services) {
    const key = service.serviceDate ? service.serviceDate.slice(0, 10) : 'unscheduled';
    const current = grouped.get(key) || [];
    current.push(service);
    grouped.set(key, current);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => {
      if (left === 'unscheduled') return 1;
      if (right === 'unscheduled') return -1;
      return new Date(left).getTime() - new Date(right).getTime();
    })
    .map(([key, groupedServices]) => ({
      key,
      label:
        key === 'unscheduled'
          ? 'Date Pending'
          : new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(key)),
      services: groupedServices.sort((left, right) => {
        const leftTime = left.startTime || left.pickupTime || '';
        const rightTime = right.startTime || right.pickupTime || '';
        return leftTime.localeCompare(rightTime) || left.description.localeCompare(right.description);
      }),
    }));
}

function buildExecutionDetails(service: BookingService) {
  return {
    time: service.startTime || service.pickupTime || 'Pending',
    location: service.pickupLocation || service.meetingPoint || 'Pending',
  };
}

function formatMoney(amount: number, currency = 'USD') {
  return `${currency} ${amount.toFixed(2)}`;
}

function BookingServiceDetailSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="booking-service-detail-section">
      <h3>{title}</h3>
      <div className="booking-service-detail-section-body">{children}</div>
    </section>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function BookingServiceTimeline({
  services,
  suppliers,
  guides,
  restaurants,
  highlightServiceId,
}: BookingServiceTimelineProps) {
  if (services.length === 0) {
    return (
      <BookingOperationsEmptyState
        eyebrow="Services"
        title="No booking services yet"
        description="Service rows will appear here once the booking has operational items to execute."
      />
    );
  }

  const groups = buildServiceGroups(services);

  return (
    <div className="booking-service-timeline">
      {groups.map((group) => (
        <section key={group.key} className="booking-service-group">
          <header className="booking-service-group-head">
            <div>
              <p className="eyebrow">Service Day</p>
              <h3>{group.label}</h3>
            </div>
            <span className="booking-service-group-count">{group.services.length} services</span>
          </header>

          <div className="booking-service-group-list">
            {group.services.map((service) => {
              const activityService = isActivityService(service.serviceType);
              const reconfirmationWarning = getReconfirmationWarning(service);
              const supplierReference = service.supplierReference || service.confirmationNumber;
              const marginMetrics = getMarginMetrics(service.totalSell, service.totalCost);
              const executionDetails = buildExecutionDetails(service);
              const supplierType = mapBookingServiceTypeToSupplierType(service.serviceType, service.operationType);
              const supplierOptions = supplierType ? suppliers.filter((supplier) => supplier.type === supplierType) : suppliers;
              const guideService = isGuideService(service);
              const guideOptions = guides.filter((guide) => guide.active || guide.id === service.guideId);
              const selectedGuide = service.guide || guideOptions.find((guide) => guide.id === service.guideId) || null;
              const mealService = isMealService(service);
              const restaurantOptions = restaurants.filter((restaurant) => restaurant.active || restaurant.id === service.restaurantId);
              const selectedRestaurant = service.restaurant || restaurantOptions.find((restaurant) => restaurant.id === service.restaurantId) || null;
              const hotelService = isHotelService(service);
              const hotelReservation = getHotelReservationMetadata(service);
              const hasOpsIssue =
                activityService &&
                (!service.serviceDate || (!service.startTime && !service.pickupTime) || (!service.pickupLocation && !service.meetingPoint));

              return (
                <article
                  key={service.id}
                  id={`service-${service.id}`}
                  className={`booking-service-card${highlightServiceId === service.id ? ' booking-service-card-highlight' : ''}`}
                >
                  <div className="booking-service-card-main">
                    <div className="booking-service-card-head">
                      <div>
                        <strong>{service.description}</strong>
                        <p>{service.serviceType}</p>
                      </div>
                    </div>

                    <div className="booking-service-card-grid">
                      <div>
                        <span>Execution</span>
                        <div className="booking-service-card-detail-list">
                          <p>
                            <em>Time</em>
                            <strong>{executionDetails.time}</strong>
                          </p>
                          <p>
                            <em>Location</em>
                            <strong>{executionDetails.location}</strong>
                          </p>
                        </div>
                      </div>
                      <div>
                        <span>Supplier</span>
                        <strong>{service.supplierName || 'Unassigned supplier'}</strong>
                        {service.supplierStatus === 'unresolved' ? <span className="status-pill warning supplier-warning-badge">Unresolved supplier</span> : null}
                      </div>
                      <div>
                        <span>Reference</span>
                        <strong>{supplierReference || 'Reference pending'}</strong>
                      </div>
                      <div>
                        <span>Commercial</span>
                        <div className="booking-service-card-detail-list">
                          <p>
                            <em>Sell</em>
                            <strong>{formatMoney(service.totalSell)}</strong>
                          </p>
                          <p>
                            <em>Cost</em>
                            <strong style={{ color: getMarginColor(marginMetrics.tone) }}>{formatMoney(service.totalCost)}</strong>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="booking-service-card-meta">
                      <span>Qty {service.qty}</span>
                      {service.participantCount ? <span>{service.participantCount} pax</span> : null}
                      {service.reconfirmationRequired ? (
                        <span>
                          Reconfirm
                          {service.reconfirmationDueAt ? ` by ${formatDateTime(service.reconfirmationDueAt)}` : ''}
                        </span>
                      ) : null}
                    </div>

                    {reconfirmationWarning || hasOpsIssue || !service.supplierName ? (
                      <div className="booking-service-card-alerts">
                        {!service.supplierName ? <p>Supplier missing</p> : null}
                        {hasOpsIssue ? <p>Execution details incomplete</p> : null}
                        {reconfirmationWarning ? <p>{reconfirmationWarning}</p> : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="booking-service-card-actions">
                    <div className="booking-service-card-badges">
                      <BookingOperationsStatusBadge kind="lifecycle" status={service.status} />
                      <BookingOperationsStatusBadge kind="confirmation" status={service.confirmationStatus} />
                    </div>
                    <RowDetailsPanel
                      summary={service.supplierStatus === 'unresolved' ? 'Assign supplier' : 'Manage'}
                      className="operations-row-details"
                      bodyClassName="operations-row-details-body booking-service-detail-body"
                    >
                      <div className="booking-service-detail-sections">
                        <BookingServiceDetailSection title="Overview">
                          <div className="quote-preview-total-list">
                            <div>
                              <span>Lifecycle</span>
                              <strong>{service.status}</strong>
                            </div>
                            <div>
                              <span>Supplier</span>
                              <strong>{service.supplierName || 'Unassigned'}</strong>
                            </div>
                            <div>
                              <span>Reference</span>
                              <strong>{supplierReference || 'Pending'}</strong>
                            </div>
                            <div>
                              <span>Service</span>
                              <strong>{service.operationType || service.serviceType}</strong>
                            </div>
                          </div>
                          <InlineRowEditorShell>
                            <form action={`/api/bookings/services/${service.id}/assign-supplier`} method="POST">
                              <label>
                                Supplier
                                <select name="supplierId" defaultValue={service.supplierId || ''}>
                                  <option value="">Select supplier</option>
                                  {supplierOptions.map((supplier) => (
                                    <option key={supplier.id} value={supplier.id}>
                                      {supplier.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <div className="quote-status-actions">
                                <button type="submit" className="secondary-button">
                                  Assign supplier
                                </button>
                              </div>
                            </form>
                          </InlineRowEditorShell>
                        </BookingServiceDetailSection>

                        <BookingServiceDetailSection title="Supplier Confirmation">
                          <InlineRowEditorShell>
                            <form action={`/api/bookings/services/${service.id}/confirmation`} method="POST">
                              <label>
                                Confirmation status
                                <select name="confirmationStatus" defaultValue={service.confirmationStatus}>
                                  <option value="pending">Pending</option>
                                  <option value="requested">Requested</option>
                                  <option value="confirmed">Confirmed</option>
                                </select>
                              </label>
                              <label>
                                Supplier reference
                                <input type="text" name="supplierReference" defaultValue={supplierReference || ''} placeholder="Supplier reference" />
                              </label>
                              <label>
                                Confirmation note
                                <input type="text" name="notes" defaultValue={service.confirmationNotes || ''} placeholder="Confirmation note" />
                              </label>
                              <div className="quote-status-actions">
                                <button type="submit" className="secondary-button">
                                  Save confirmation
                                </button>
                              </div>
                            </form>
                          </InlineRowEditorShell>
                        </BookingServiceDetailSection>

                        {guideService ? (
                          <BookingServiceDetailSection title="Guide Operations">
                            {service.guideWarnings && service.guideWarnings.length > 0 ? (
                              <div className="booking-service-card-alerts">
                                {service.guideWarnings.map((warning) => (
                                  <p key={warning}>{warning}</p>
                                ))}
                              </div>
                            ) : null}
                            <div className="booking-service-hotel-summary">
                              <div>
                                <span>Assigned guide</span>
                                <strong>{selectedGuide?.fullName || service.assignedTo || 'Unassigned'}</strong>
                              </div>
                              <div>
                                <span>Confirmation</span>
                                <strong>{service.guideConfirmationStatus || 'PENDING'}</strong>
                              </div>
                              <div>
                                <span>Languages</span>
                                <strong>{selectedGuide?.languages?.length ? selectedGuide.languages.join(', ') : 'Not set'}</strong>
                              </div>
                              <div>
                                <span>Regions</span>
                                <strong>{selectedGuide?.regions?.length ? selectedGuide.regions.join(', ') : 'Not set'}</strong>
                              </div>
                              <div>
                                <span>Contact</span>
                                <strong>{selectedGuide?.phone || service.guidePhone || 'Not set'}</strong>
                              </div>
                            </div>
                            <InlineRowEditorShell>
                              <form action={`/api/bookings/services/${service.id}/guide-assignment`} method="POST" className="operations-inline-form">
                                <label>
                                  Assign guide
                                  <select name="guideId" defaultValue={service.guideId || ''}>
                                    <option value="">No guide assigned</option>
                                    {guideOptions.map((guide) => (
                                      <option key={guide.id} value={guide.id}>
                                        {guide.fullName} ({guide.guideType})
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Guide confirmation status
                                  <select name="guideConfirmationStatus" defaultValue={service.guideConfirmationStatus || 'PENDING'}>
                                    <option value="PENDING">Pending</option>
                                    <option value="REQUESTED">Requested</option>
                                    <option value="CONFIRMED">Confirmed</option>
                                    <option value="REJECTED">Rejected</option>
                                    <option value="CANCELLED">Cancelled</option>
                                  </select>
                                </label>
                                <label>
                                  Required languages
                                  <input
                                    type="text"
                                    name="guideRequiredLanguages"
                                    defaultValue={(service.guideRequiredLanguages || []).join(', ')}
                                    placeholder="English, Arabic"
                                  />
                                </label>
                                <label>
                                  Guide contact
                                  <input type="text" name="guidePhone" defaultValue={service.guidePhone || selectedGuide?.phone || ''} placeholder="Phone or WhatsApp" />
                                </label>
                                <label>
                                  Reporting time
                                  <input type="time" name="guideReportingTime" defaultValue={service.guideReportingTime || ''} />
                                </label>
                                <label>
                                  Pickup time
                                  <input type="time" name="pickupTime" defaultValue={service.pickupTime || ''} />
                                </label>
                                <label>
                                  Assignment note
                                  <input type="text" name="note" placeholder="Reason for assignment or reassignment" />
                                </label>
                                <div className="quote-status-actions">
                                  <button type="submit" className="secondary-button">
                                    Save guide assignment
                                  </button>
                                </div>
                              </form>
                            </InlineRowEditorShell>
                          </BookingServiceDetailSection>
                        ) : null}

                        {mealService ? (
                          <BookingServiceDetailSection title="Dining Operations">
                            {service.mealWarnings && service.mealWarnings.length > 0 ? (
                              <div className="booking-service-card-alerts">
                                {service.mealWarnings.map((warning) => (
                                  <p key={warning}>{warning}</p>
                                ))}
                              </div>
                            ) : null}
                            <div className="booking-service-hotel-summary">
                              <div>
                                <span>Restaurant</span>
                                <strong>{selectedRestaurant?.name || service.supplierName || 'Unassigned'}</strong>
                              </div>
                              <div>
                                <span>Confirmation</span>
                                <strong>{service.mealConfirmationStatus || 'PENDING'}</strong>
                              </div>
                              <div>
                                <span>Capacity</span>
                                <strong>{selectedRestaurant?.capacity ?? 'Not set'}</strong>
                              </div>
                              <div>
                                <span>Meal timing</span>
                                <strong>{service.mealTiming || service.pickupTime || 'Not set'}</strong>
                              </div>
                              <div>
                                <span>Dietary support</span>
                                <strong>
                                  {[
                                    selectedRestaurant?.halalSupport ? 'Halal' : null,
                                    selectedRestaurant?.vegetarianSupport ? 'Vegetarian' : null,
                                    selectedRestaurant?.veganSupport ? 'Vegan' : null,
                                  ].filter(Boolean).join(', ') || 'Not set'}
                                </strong>
                              </div>
                            </div>
                            <InlineRowEditorShell>
                              <form action={`/api/bookings/services/${service.id}/restaurant-assignment`} method="POST" className="operations-inline-form">
                                <label>
                                  Assign restaurant
                                  <select name="restaurantId" defaultValue={service.restaurantId || ''}>
                                    <option value="">No restaurant assigned</option>
                                    {restaurantOptions.map((restaurant) => (
                                      <option key={restaurant.id} value={restaurant.id}>
                                        {restaurant.name}
                                        {restaurant.capacity ? ` (${restaurant.capacity} seats)` : ''}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label>
                                  Reconfirmation status
                                  <select name="mealConfirmationStatus" defaultValue={service.mealConfirmationStatus || 'PENDING'}>
                                    <option value="PENDING">Pending</option>
                                    <option value="REQUESTED">Requested</option>
                                    <option value="CONFIRMED">Confirmed</option>
                                    <option value="REJECTED">Rejected</option>
                                    <option value="CANCELLED">Cancelled</option>
                                  </select>
                                </label>
                                <label>
                                  Seating capacity
                                  <input type="number" name="participantCount" min="0" defaultValue={service.participantCount ?? ''} />
                                </label>
                                <label>
                                  Meal timing
                                  <input type="time" name="mealTiming" defaultValue={service.mealTiming || service.pickupTime || ''} />
                                </label>
                                <label>
                                  Special dietary requests
                                  <input
                                    type="text"
                                    name="mealDietaryRequirements"
                                    defaultValue={(service.mealDietaryRequirements || []).join(', ')}
                                    placeholder="Halal, vegetarian, vegan"
                                  />
                                </label>
                                <label>
                                  Seating notes
                                  <input type="text" name="mealSeatingNotes" defaultValue={service.mealSeatingNotes || ''} placeholder="Table layout or seating note" />
                                </label>
                                <label>
                                  Operational notes
                                  <input type="text" name="mealOperationalNotes" defaultValue={service.mealOperationalNotes || ''} placeholder="Restaurant operations note" />
                                </label>
                                <label>
                                  Assignment note
                                  <input type="text" name="note" placeholder="Reason for assignment or reconfirmation" />
                                </label>
                                <div className="quote-status-actions">
                                  <button type="submit" className="secondary-button">
                                    Save restaurant assignment
                                  </button>
                                </div>
                              </form>
                            </InlineRowEditorShell>
                          </BookingServiceDetailSection>
                        ) : null}

                        {hotelService ? (
                          <BookingServiceDetailSection title="Hotel Reservation Operations">
                            <div className="booking-service-hotel-summary">
                              <div>
                                <span>Status</span>
                                <strong>{hotelReservation.status}</strong>
                              </div>
                              <div>
                                <span>Room block</span>
                                <strong>
                                  {hotelReservation.blockedRoomCount}
                                  {hotelReservation.roomTypes.length ? ` | ${hotelReservation.roomTypes.join(', ')}` : ''}
                                </strong>
                              </div>
                              <div>
                                <span>Release date</span>
                                <strong>{hotelReservation.releaseDate ? formatDateTime(hotelReservation.releaseDate) : 'Not set'}</strong>
                              </div>
                              <div>
                                <span>Reconfirmation due</span>
                                <strong>{hotelReservation.reconfirmationDueDate ? formatDateTime(hotelReservation.reconfirmationDueDate) : 'Not set'}</strong>
                              </div>
                              <div>
                                <span>Alternative hotels</span>
                                <strong>
                                  {hotelReservation.alternativeHotels.length
                                    ? hotelReservation.alternativeHotels
                                        .map((hotel) => `${hotel.name || 'Hotel'} (${hotel.status || 'waitlist'})`)
                                        .join(', ')
                                    : 'None'}
                                </strong>
                              </div>
                            </div>
                            <form action={`/api/bookings/services/${service.id}/operational`} method="POST" className="operations-inline-form">
                              <label>
                                Reservation status
                                <select name="hotelReservationStatus" defaultValue={hotelReservation.status}>
                                  <option value="Requested">Requested</option>
                                  <option value="Blocked">Blocked</option>
                                  <option value="Waitlist">Waitlist</option>
                                  <option value="Tentative">Tentative</option>
                                  <option value="Confirmed">Confirmed</option>
                                  <option value="Released">Released</option>
                                  <option value="Cancelled">Cancelled</option>
                                </select>
                              </label>
                              <input
                                type="number"
                                name="blockedRoomCount"
                                min="0"
                                defaultValue={hotelReservation.blockedRoomCount || ''}
                                placeholder="Blocked rooms"
                              />
                              <input
                                type="text"
                                name="roomTypes"
                                defaultValue={hotelReservation.roomTypes.join(', ')}
                                placeholder="Room types"
                              />
                              <input
                                type="datetime-local"
                                name="releaseDate"
                                defaultValue={hotelReservation.releaseDate ? hotelReservation.releaseDate.slice(0, 16) : ''}
                              />
                              <input
                                type="datetime-local"
                                name="hotelReconfirmationDueAt"
                                defaultValue={hotelReservation.reconfirmationDueDate ? hotelReservation.reconfirmationDueDate.slice(0, 16) : ''}
                              />
                              <input
                                type="text"
                                name="primaryHotelName"
                                defaultValue={hotelReservation.primaryHotelName}
                                placeholder="Primary hotel"
                              />
                              <textarea
                                name="alternativeHotels"
                                defaultValue={hotelReservation.alternativeHotels.map((hotel) => hotel.name).filter(Boolean).join('\n')}
                                placeholder="Backup/waitlist hotels, one per line"
                                rows={3}
                              />
                              <input type="text" name="activateAlternativeHotel" placeholder="Activate alternative hotel by name" />
                              <input type="text" name="releaseAlternativeHotel" placeholder="Release alternative hotel by name" />
                              <label>
                                <input type="checkbox" name="roomingSent" defaultChecked={Boolean(hotelReservation.roomingSentAt)} /> Rooming sent
                              </label>
                              <input
                                type="text"
                                name="hotelReservationNotes"
                                defaultValue={hotelReservation.notes}
                                placeholder="Operational notes"
                              />
                              <input type="text" name="note" placeholder="Reason for update" />
                              <button type="submit" className="secondary-button">
                                Save hotel reservation ops
                              </button>
                            </form>
                          </BookingServiceDetailSection>
                        ) : null}

                        {activityService ? (
                          <BookingServiceDetailSection title="Activity Operations">
                            <InlineRowEditorShell>
                              <form action={`/api/bookings/services/${service.id}/operational`} method="POST" className="operations-inline-form">
                                <input type="datetime-local" name="serviceDate" defaultValue={service.serviceDate ? service.serviceDate.slice(0, 16) : ''} />
                                <input type="text" name="startTime" defaultValue={service.startTime || ''} placeholder="Start HH:MM" />
                                <input type="text" name="pickupTime" defaultValue={service.pickupTime || ''} placeholder="Pickup HH:MM" />
                                <input type="text" name="pickupLocation" defaultValue={service.pickupLocation || ''} placeholder="Pickup location" />
                                <input type="text" name="meetingPoint" defaultValue={service.meetingPoint || ''} placeholder="Meeting point" />
                                <input type="number" name="participantCount" min="0" defaultValue={service.participantCount ?? ''} placeholder="Participants" />
                                <input type="number" name="adultCount" min="0" defaultValue={service.adultCount ?? ''} placeholder="Adults" />
                                <input type="number" name="childCount" min="0" defaultValue={service.childCount ?? ''} placeholder="Children" />
                                <label>
                                  <input type="checkbox" name="reconfirmationRequired" defaultChecked={Boolean(service.reconfirmationRequired)} /> Reconfirm
                                </label>
                                <input
                                  type="datetime-local"
                                  name="reconfirmationDueAt"
                                  defaultValue={service.reconfirmationDueAt ? service.reconfirmationDueAt.slice(0, 16) : ''}
                                />
                                <input type="text" name="note" placeholder="Reason for update" />
                                <button type="submit" className="secondary-button">
                                  Save activity ops
                                </button>
                              </form>
                            </InlineRowEditorShell>
                          </BookingServiceDetailSection>
                        ) : null}

                        <BookingServiceDetailSection title="Voucher/Documents">
                          {service.vouchers && service.vouchers.length > 0 ? (
                            <div className="booking-service-document-list">
                              {service.vouchers.map((voucher) => (
                                <div key={voucher.id}>
                                  <strong>{voucher.type} voucher</strong>
                                  <span>{voucher.status}</span>
                                  <div className="quote-status-actions">
                                    <a href={`/api/vouchers/${voucher.id}/pdf`} className="secondary-button">
                                      Download PDF
                                    </a>
                                    {voucher.type === 'HOTEL' ? (
                                      <a href={`/vouchers/${voucher.id}/preview`} className="secondary-button">
                                        Preview
                                      </a>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="table-subcopy">No vouchers or service documents generated yet.</p>
                          )}
                        </BookingServiceDetailSection>

                        <BookingServiceDetailSection title="Notes">
                          <InlineRowEditorShell>
                            <form action={`/api/bookings/services/${service.id}/status`} method="POST">
                              <label>
                                Manual action
                                <select name="action" defaultValue="">
                                  <option value="" disabled>
                                    Select action
                                  </option>
                                  <option value="cancel">Cancel service</option>
                                  <option value="reopen">Reopen service</option>
                                  <option value="mark_ready">Mark ready manually</option>
                                </select>
                              </label>
                              <label>
                                Reason
                                <input type="text" name="note" placeholder="Reason for manual override" required minLength={3} />
                              </label>
                              <div className="quote-status-actions">
                                <button type="submit" className="secondary-button">
                                  Apply override
                                </button>
                              </div>
                            </form>
                          </InlineRowEditorShell>

                          {service.auditLogs && service.auditLogs.length > 0 ? (
                            <div className="audit-log-list">
                              {service.auditLogs.map((auditLog) => (
                                <div key={auditLog.id} className="audit-log-item">
                                  <strong>{formatAuditAction(auditLog.action)}</strong>
                                  <p>
                                    {formatDateTime(auditLog.createdAt)}
                                    {auditLog.actor ? ` | ${auditLog.actor}` : ''}
                                  </p>
                                  {auditLog.oldValue || auditLog.newValue ? (
                                    <p>
                                      {auditLog.oldValue || '-'} to {auditLog.newValue || '-'}
                                    </p>
                                  ) : null}
                                  {auditLog.note ? <p>{auditLog.note}</p> : null}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="table-subcopy">No service notes or audit entries yet.</p>
                          )}
                        </BookingServiceDetailSection>
                      </div>
                    </RowDetailsPanel>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
