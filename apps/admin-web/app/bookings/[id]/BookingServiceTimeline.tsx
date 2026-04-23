'use client';

import { InlineRowEditorShell } from '../../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../../components/RowDetailsPanel';
import { getMarginColor, getMarginMetrics } from '../../lib/financials';
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

type BookingService = {
  id: string;
  description: string;
  qty: number;
  totalCost: number;
  totalSell: number;
  supplierId: string | null;
  supplierName: string | null;
  serviceType: string;
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
  auditLogs?: AuditLog[];
};

type BookingServiceTimelineProps = {
  services: BookingService[];
  suppliers: Supplier[];
  highlightServiceId?: string;
};

type ServiceGroup = {
  key: string;
  label: string;
  services: BookingService[];
};

function mapBookingServiceTypeToSupplierType(serviceType: string): Supplier['type'] | null {
  const normalized = serviceType.trim().toLowerCase();

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
  const normalized = serviceType.trim().toLowerCase();

  return (
    normalized.includes('activity') ||
    normalized.includes('tour') ||
    normalized.includes('excursion') ||
    normalized.includes('experience') ||
    normalized.includes('sightseeing')
  );
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function BookingServiceTimeline({
  services,
  suppliers,
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
              const supplierType = mapBookingServiceTypeToSupplierType(service.serviceType);
              const supplierOptions = supplierType ? suppliers.filter((supplier) => supplier.type === supplierType) : suppliers;
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
                      summary="Manage"
                      className="operations-row-details"
                      bodyClassName="operations-row-details-body"
                    >
                      <div className="section-stack">
                        <div className="quote-preview-total-list">
                          <div>
                            <span>Lifecycle</span>
                            <strong>{service.status}</strong>
                          </div>
                          <div>
                            <span>Confirmation</span>
                            <strong>{service.confirmationStatus}</strong>
                          </div>
                          <div>
                            <span>Cost</span>
                            <strong>{formatMoney(service.totalCost)}</strong>
                          </div>
                          <div>
                            <span>Sell</span>
                            <strong>{formatMoney(service.totalSell)}</strong>
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

                        {activityService ? (
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
                        ) : null}

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
                        ) : null}
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
