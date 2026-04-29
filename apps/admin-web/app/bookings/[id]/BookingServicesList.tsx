'use client';

import { useEffect, useState } from 'react';
import { InlineRowEditorShell } from '../../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../../components/RowDetailsPanel';
import { getMarginColor, getMarginMetrics } from '../../lib/financials';

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
  serviceDate?: string | null;
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

function mapBookingServiceTypeToSupplierType(serviceType: string): Supplier['type'] | null {
  const normalized = serviceType.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  if (normalized.includes('hotel') || normalized.includes('accommodation')) {
    return 'hotel';
  }

  if (normalized.includes('transport') || normalized.includes('transfer') || normalized.includes('vehicle')) {
    return 'transport';
  }

  if (
    normalized.includes('activity') ||
    normalized.includes('tour') ||
    normalized.includes('excursion') ||
    normalized.includes('experience')
  ) {
    return 'activity';
  }

  if (normalized.includes('guide') || normalized.includes('escort')) {
    return 'guide';
  }

  return normalized.includes('other') ? 'other' : null;
}

type BookingServicesListProps = {
  services: BookingService[];
  suppliers: Supplier[];
  formatMoney: (amount: number, currency?: string) => string;
  formatBookingServiceStatus: (status: BookingService['status']) => string;
  formatConfirmationStatus: (status: BookingService['confirmationStatus']) => string;
  formatDateTime: (value: string) => string;
  highlightServiceId?: string;
};

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
    return 'Warning: reconfirmation overdue.';
  }

  return dueAt - now <= 48 * 60 * 60 * 1000 ? 'Warning: reconfirmation due soon.' : null;
}

export function BookingServicesList({
  services,
  suppliers,
  formatMoney,
  formatBookingServiceStatus,
  formatConfirmationStatus,
  formatDateTime,
  highlightServiceId,
}: BookingServicesListProps) {
  const [localServices, setLocalServices] = useState(services);
  const [highlightedServiceId, setHighlightedServiceId] = useState<string | null>(null);
  const [assigningServiceId, setAssigningServiceId] = useState<string | null>(null);
  const [assignmentFeedback, setAssignmentFeedback] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});

  async function assignResolvedSupplier(serviceId: string, supplierId: string) {
    if (!supplierId) {
      return;
    }

    setAssigningServiceId(serviceId);
    setAssignmentFeedback((current) => {
      const next = { ...current };
      delete next[serviceId];
      return next;
    });
    try {
      const response = await fetch(`/api/bookings/services/${serviceId}/assign-supplier`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ supplierId }),
      });

      if (response.ok) {
        const assignedSupplier = suppliers.find((supplier) => supplier.id === supplierId);
        setLocalServices((current) =>
          current.map((service) =>
            service.id === serviceId
              ? {
                  ...service,
                  supplierId,
                  supplierName: assignedSupplier?.name || service.supplierName,
                  supplierStatus: null,
                }
              : service,
          ),
        );
        setAssignmentFeedback((current) => ({ ...current, [serviceId]: { type: 'success', message: 'Supplier assigned' } }));
      } else {
        setAssignmentFeedback((current) => ({ ...current, [serviceId]: { type: 'error', message: 'Failed to assign supplier' } }));
      }
    } catch {
      setAssignmentFeedback((current) => ({ ...current, [serviceId]: { type: 'error', message: 'Failed to assign supplier' } }));
    } finally {
      setAssigningServiceId(null);
    }
  }

  useEffect(() => {
    setLocalServices(services);
  }, [services]);

  useEffect(() => {
    if (!highlightServiceId) {
      return undefined;
    }

    const element = document.getElementById(`service-${highlightServiceId}`);

    if (!element) {
      return undefined;
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedServiceId(highlightServiceId);

    const timeoutId = window.setTimeout(() => {
      setHighlightedServiceId((current) => (current === highlightServiceId ? null : current));
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [highlightServiceId]);

  if (services.length === 0) {
    return <p className="empty-state">No booking services created yet.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Service</th>
            <th>Supplier</th>
            <th>Confirmation</th>
            <th>Financials</th>
            <th>Status</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
      {localServices.map((service) => {
        const mappedSupplierType = mapBookingServiceTypeToSupplierType(service.serviceType);
        const matchingSuppliers = mappedSupplierType ? suppliers.filter((supplier) => supplier.type === mappedSupplierType) : [];
        const supplierOptions = matchingSuppliers.length > 0 ? matchingSuppliers : suppliers;
        const marginMetrics = getMarginMetrics(service.totalSell, service.totalCost);
        const activityService = isActivityService(service.serviceType);
        const supplierReference = service.supplierReference || service.confirmationNumber;
        const reconfirmationWarning = getReconfirmationWarning(service);

        return (
          <tr
            key={service.id}
            id={`service-${service.id}`}
            className={highlightedServiceId === service.id ? 'booking-service-highlight' : undefined}
          >
            <td>
              <strong>{service.description}</strong>
              <div className="table-subcopy">
                {service.serviceType} | Qty {service.qty}
              </div>
            </td>
            <td>
              <strong>{service.supplierName || 'Unassigned'}</strong>
              {service.supplierStatus === 'unresolved' ? <span className="status-pill warning supplier-warning-badge">Unresolved supplier</span> : null}
              <div className="table-subcopy">
                {mappedSupplierType ? `Suggested ${mappedSupplierType} suppliers` : 'General supplier pool'}
              </div>
            </td>
            <td>
              <strong>{formatConfirmationStatus(service.confirmationStatus)}</strong>
              <div className="table-subcopy">{supplierReference ? `Ref ${supplierReference}` : 'No supplier ref'}</div>
            </td>
            <td>
              <strong>{formatMoney(service.totalSell)}</strong>
              <div className="table-subcopy" style={{ color: getMarginColor(marginMetrics.tone) }}>
                Margin {formatMoney(marginMetrics.margin)} ({marginMetrics.marginPercent.toFixed(2)}%)
              </div>
            </td>
            <td>
              <strong>{formatBookingServiceStatus(service.status)}</strong>
              {service.confirmationStatus !== 'confirmed' ? <div className="form-error">Confirmation pending</div> : null}
              {activityService && reconfirmationWarning ? <div className="form-error">{reconfirmationWarning}</div> : null}
            </td>
            <td>
              <RowDetailsPanel
                summary={service.supplierStatus === 'unresolved' ? 'Assign supplier' : 'Open details'}
                description="Assignment, confirmation, operational detail, and audit"
                className="operations-row-details"
                bodyClassName="operations-row-details-body"
              >
                <div className="section-stack">
                  <div className="quote-preview-total-list">
                    <div>
                      <span>Supplier</span>
                      <strong>{service.supplierName || 'Unassigned'}</strong>
                      {service.supplierStatus === 'unresolved' ? <span className="status-pill warning supplier-warning-badge">Unresolved supplier</span> : null}
                    </div>
                    <div>
                      <span>Confirmation</span>
                      <strong>{formatConfirmationStatus(service.confirmationStatus)}</strong>
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
                    {service.supplierStatus === 'unresolved' ? (
                      <label>
                        Supplier
                        <select
                          name="supplierId"
                          defaultValue=""
                          disabled={assigningServiceId === service.id}
                          onChange={(event) => assignResolvedSupplier(service.id, event.target.value)}
                        >
                          <option value="">Select supplier</option>
                          {supplierOptions.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <form action={`/api/bookings/services/${service.id}/assign-supplier`} method="POST">
                        <input type="hidden" name="serviceId" value={service.id} />
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
                    )}
                  </InlineRowEditorShell>
                  {assignmentFeedback[service.id]?.message ? (
                    <p className={assignmentFeedback[service.id].type === 'error' ? 'form-error' : 'form-helper'}>
                      {assignmentFeedback[service.id].message}
                    </p>
                  ) : null}

                  <InlineRowEditorShell>
                    <form action={`/api/bookings/services/${service.id}/confirmation`} method="POST">
                      <input type="hidden" name="serviceId" value={service.id} />
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
                      <div className="audit-log-list">
                        <div className="audit-log-item">
                          <strong>Activity operations snapshot</strong>
                          <p>Service date: {service.serviceDate ? formatDateTime(service.serviceDate) : 'Missing'}</p>
                          <p>Start time: {service.startTime || 'Missing'} | Pickup time: {service.pickupTime || 'Missing'}</p>
                          <p>Pickup location: {service.pickupLocation || 'Missing'} | Meeting point: {service.meetingPoint || 'Missing'}</p>
                          <p>
                            Pax: {service.participantCount ?? 0} | Adults: {service.adultCount ?? 0} | Children: {service.childCount ?? 0}
                          </p>
                          <p>
                            Reconfirmation: {service.reconfirmationRequired ? 'Required' : 'Not required'}
                            {service.reconfirmationDueAt ? ` | Due ${formatDateTime(service.reconfirmationDueAt)}` : ''}
                          </p>
                        </div>
                      </div>
                      <form action={`/api/bookings/services/${service.id}/operational`} method="POST" className="operations-inline-form">
                        <input type="datetime-local" name="serviceDate" defaultValue={service.serviceDate ? service.serviceDate.slice(0, 16) : ''} />
                        <input type="text" name="startTime" defaultValue={service.startTime || ''} placeholder="Start HH:MM" />
                        <input type="text" name="pickupTime" defaultValue={service.pickupTime || ''} placeholder="Pickup HH:MM" />
                        <input type="text" name="pickupLocation" defaultValue={service.pickupLocation || ''} placeholder="Pickup location" />
                        <input type="text" name="meetingPoint" defaultValue={service.meetingPoint || ''} placeholder="Meeting point" />
                        <input type="number" name="participantCount" min="0" defaultValue={service.participantCount ?? ''} placeholder="Participants" />
                        <input type="number" name="adultCount" min="0" defaultValue={service.adultCount ?? ''} placeholder="Adults" />
                        <input type="number" name="childCount" min="0" defaultValue={service.childCount ?? ''} placeholder="Children" />
                        <input type="text" name="supplierReference" defaultValue={supplierReference || ''} placeholder="Supplier reference" />
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

                  {service.confirmationRequestedAt || service.confirmationConfirmedAt || service.statusNote ? (
                    <div className="audit-log-list">
                      <div className="audit-log-item">
                        <strong>Service notes</strong>
                        {service.confirmationRequestedAt ? <p>Requested: {formatDateTime(service.confirmationRequestedAt)}</p> : null}
                        {service.confirmationConfirmedAt ? <p>Confirmed: {formatDateTime(service.confirmationConfirmedAt)}</p> : null}
                        {service.statusNote ? <p>Override note: {service.statusNote}</p> : null}
                      </div>
                    </div>
                  ) : null}

                  {service.auditLogs && service.auditLogs.length > 0 ? (
                    <div className="audit-log-list">
                      {service.auditLogs.map((auditLog) => (
                        <div key={auditLog.id} className="audit-log-item">
                          <strong>{formatAuditAction(auditLog.action)}</strong>
                          <p>
                            {formatDateTime(auditLog.createdAt)}
                            {auditLog.actor ? ` | ${auditLog.actor}` : ''}
                          </p>
                          {(auditLog.oldValue || auditLog.newValue) ? (
                            <p>
                              {auditLog.oldValue || '-'} to {auditLog.newValue || '-'}
                            </p>
                          ) : null}
                          {auditLog.note ? <p>{auditLog.note}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {marginMetrics.isNegative ? <p className="form-error">Warning: negative margin on this service.</p> : null}
                  {!service.supplierName ? <p className="form-error">Warning: supplier missing.</p> : null}
                  {service.totalCost <= 0 || service.totalSell <= 0 ? <p className="form-error">Warning: pricing missing.</p> : null}
                  {activityService && !service.serviceDate ? <p className="form-error">Warning: activity date missing.</p> : null}
                  {activityService && (!service.startTime && !service.pickupTime) ? <p className="form-error">Warning: start/pickup time missing.</p> : null}
                  {activityService && (!service.pickupLocation && !service.meetingPoint) ? <p className="form-error">Warning: pickup or meeting point missing.</p> : null}
                  {activityService && !(service.participantCount || ((service.adultCount || 0) + (service.childCount || 0))) ? (
                    <p className="form-error">Warning: participant counts missing.</p>
                  ) : null}
                </div>
              </RowDetailsPanel>
            </td>
          </tr>
        );
      })}
        </tbody>
      </table>
    </div>
  );
}
