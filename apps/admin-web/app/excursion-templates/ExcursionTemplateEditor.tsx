'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiError } from '../lib/api';
import { ExcursionComponentType, ExcursionTemplate, ExcursionTemplateCatalogs } from './types';

type ExcursionTemplateEditorProps = {
  template: ExcursionTemplate;
  catalogs: ExcursionTemplateCatalogs;
};

type FillMissingMetadataResponse = {
  updatedTemplateFields: number;
  updatedComponentFields: number;
  skippedExistingFields: number;
  message: string;
};

const COMPONENT_TYPES: ExcursionComponentType[] = ['TRANSPORT', 'TICKET', 'ACTIVITY', 'GUIDE', 'DINING'];

function catalogText(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return String(value || '').toLowerCase();
  }
  return Object.values(value as Record<string, unknown>)
    .map(catalogText)
    .join(' ')
    .toLowerCase();
}

function isTicketService(service: ExcursionTemplateCatalogs['services'][number]) {
  const text = catalogText(service);
  return text.includes('ticket') || text.includes('entrance') || Boolean(service.ticketRateVariants?.length);
}

function isDiningService(service: ExcursionTemplateCatalogs['services'][number]) {
  const text = catalogText(service);
  return text.includes('dining') || text.includes('lunch') || text.includes('meal') || text.includes('restaurant');
}

function getReferenceLabel(component: ExcursionTemplate['components'][number]) {
  if (component.componentType === 'TRANSPORT') {
    return [component.route?.name, component.transportServiceType?.name].filter(Boolean).join(' / ') || 'Transport link pending';
  }
  return component.activity?.name || component.supplierService?.name || 'Catalog link pending';
}

function parseBooleanFormValue(value: FormDataEntryValue | null) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return null;
}

function booleanSelectValue(value: boolean | null | undefined) {
  if (value === true) return 'true';
  if (value === false) return 'false';
  return '';
}

async function parseMutationResponse(response: Response, fallback: string) {
  if (!response.ok) {
    const apiError = await getApiError(response, fallback);
    throw new Error(apiError.message);
  }
  return response.json().catch(() => null);
}

export function ExcursionTemplateEditor({ template, catalogs }: ExcursionTemplateEditorProps) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isFillingMetadata, setIsFillingMetadata] = useState(false);
  const [componentType, setComponentType] = useState<ExcursionComponentType>('TRANSPORT');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [selectedTransportServiceTypeId, setSelectedTransportServiceTypeId] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const activeComponents = useMemo(
    () => [...(template.components || [])].filter((component) => component.active !== false).sort((a, b) => a.sortOrder - b.sortOrder),
    [template.components],
  );
  const removedComponents = useMemo(
    () => [...(template.components || [])].filter((component) => component.active === false).sort((a, b) => a.sortOrder - b.sortOrder),
    [template.components],
  );
  const ticketServices = useMemo(() => catalogs.services.filter(isTicketService), [catalogs.services]);
  const diningServices = useMemo(() => catalogs.services.filter(isDiningService), [catalogs.services]);

  async function mutate(url: string, init: RequestInit, fallback: string) {
    setError('');
    setStatusMessage('');
    setIsSaving(true);
    try {
      await parseMutationResponse(await fetch(url, init), fallback);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : fallback);
    } finally {
      setIsSaving(false);
    }
  }

  async function fillMissingMetadata() {
    setError('');
    setStatusMessage('');
    setIsFillingMetadata(true);
    try {
      const result = (await parseMutationResponse(
        await fetch(`/api/excursion-templates/${template.id}/fill-missing-metadata`, { method: 'POST' }),
        'Could not fill missing operational metadata.',
      )) as FillMissingMetadataResponse | null;
      setStatusMessage(result?.message || 'No blank metadata fields needed filling.');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not fill missing operational metadata.');
    } finally {
      setIsFillingMetadata(false);
    }
  }

  async function saveMetadata(formData: FormData) {
    await mutate(
      `/api/excursion-templates/${template.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.get('name'),
          durationMinutes: Number(formData.get('durationHours') || 0) * 60,
          defaultDepartureCity: formData.get('defaultDepartureCity'),
          operationalNotes: formData.get('operationalNotes'),
          operatingDays: formData.get('operatingDays'),
          recommendedDepartureTime: formData.get('recommendedDepartureTime'),
          estimatedReturnTime: formData.get('estimatedReturnTime'),
          minimumPax: formData.get('minimumPax') ? Number(formData.get('minimumPax')) : null,
          maximumPax: formData.get('maximumPax') ? Number(formData.get('maximumPax')) : null,
          weatherSensitive: parseBooleanFormValue(formData.get('weatherSensitive')),
          childFriendly: parseBooleanFormValue(formData.get('childFriendly')),
          wheelchairAccessible: parseBooleanFormValue(formData.get('wheelchairAccessible')),
          seasonalRestrictions: formData.get('seasonalRestrictions'),
          operationalWarnings: formData.get('operationalWarnings'),
          active: formData.get('active') === 'on',
        }),
      },
      'Could not save template metadata.',
    );
  }

  function moveComponent(componentId: string, direction: -1 | 1) {
    const currentIndex = activeComponents.findIndex((component) => component.id === componentId);
    const nextIndex = currentIndex + direction;
    if (currentIndex < 0 || nextIndex < 0 || nextIndex >= activeComponents.length) {
      return;
    }
    const next = [...activeComponents];
    const [component] = next.splice(currentIndex, 1);
    next.splice(nextIndex, 0, component);
    void mutate(
      `/api/excursion-templates/${template.id}/components/reorder`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ componentIds: next.map((entry) => entry.id) }),
      },
      'Could not reorder components.',
    );
  }

  function toggleOptional(componentId: string, isOptional: boolean) {
    void mutate(
      `/api/excursion-templates/${template.id}/components/${componentId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOptional }),
      },
      'Could not update optional state.',
    );
  }

  function saveComponentOperations(componentId: string, formData: FormData) {
    void mutate(
      `/api/excursion-templates/${template.id}/components/${componentId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requiredArrivalTime: formData.get('requiredArrivalTime'),
          supplierConfirmationRequired: parseBooleanFormValue(formData.get('supplierConfirmationRequired')),
          voucherRequired: parseBooleanFormValue(formData.get('voucherRequired')),
          pickupNotes: formData.get('pickupNotes'),
          operationalDependency: formData.get('operationalDependency'),
          estimatedDurationMinutes: formData.get('estimatedDurationMinutes') ? Number(formData.get('estimatedDurationMinutes')) : null,
        }),
      },
      'Could not save component operations metadata.',
    );
  }

  function removeComponent(componentId: string) {
    void mutate(
      `/api/excursion-templates/${template.id}/components/${componentId}`,
      { method: 'DELETE' },
      'Could not remove component.',
    );
  }

  function addComponent(formData: FormData) {
    const type = String(formData.get('componentType') || 'TRANSPORT') as ExcursionComponentType;
    const selectedRoute = catalogs.routes.find((route) => route.id === selectedRouteId);
    const selectedTransportType = catalogs.transportServiceTypes.find((entry) => entry.id === selectedTransportServiceTypeId);
    const selectedActivity = catalogs.activities.find((activity) => activity.id === selectedActivityId);
    const servicePool = type === 'TICKET' ? ticketServices : diningServices;
    const selectedService = servicePool.find((service) => service.id === selectedServiceId);
    const basePayload = {
      componentType: type,
      isOptional: formData.get('isOptional') === 'on',
      operationalNotes: formData.get('operationalNotes'),
      requiredArrivalTime: formData.get('requiredArrivalTime'),
      supplierConfirmationRequired: parseBooleanFormValue(formData.get('supplierConfirmationRequired')),
      voucherRequired: parseBooleanFormValue(formData.get('voucherRequired')),
      pickupNotes: formData.get('pickupNotes'),
      operationalDependency: formData.get('operationalDependency'),
      estimatedDurationMinutes: formData.get('estimatedDurationMinutes') ? Number(formData.get('estimatedDurationMinutes')) : null,
    };
    const payload =
      type === 'TRANSPORT'
        ? {
            ...basePayload,
            label: [selectedRoute?.name, selectedTransportType?.name].filter(Boolean).join(' / ') || 'Transport component',
            routeId: selectedRouteId,
            transportServiceTypeId: selectedTransportServiceTypeId,
            durationMinutes: selectedRoute?.durationMinutes ?? null,
          }
        : type === 'ACTIVITY' || type === 'GUIDE'
          ? {
              ...basePayload,
              componentType: type,
              label: selectedActivity?.name || `${type} component`,
              activityId: selectedActivityId,
            }
          : {
              ...basePayload,
              label: selectedService?.name || `${type} component`,
              supplierServiceId: selectedServiceId,
            };

    void mutate(
      `/api/excursion-templates/${template.id}/components`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      'Could not add component.',
    );
  }

  return (
    <section className="section-stack">
      {error ? <p className="form-error">{error}</p> : null}
      {statusMessage ? <p className="form-success">{statusMessage}</p> : null}

      <section className="workspace-section">
        <form action={saveMetadata} className="entity-form">
          <div className="form-grid">
            <label>
              Title
              <input name="name" defaultValue={template.name} required />
            </label>
            <label>
              Duration hours
              <input name="durationHours" type="number" min="0" step="0.5" defaultValue={(template.durationMinutes || 0) / 60} />
            </label>
            <label>
              Departure city
              <input name="defaultDepartureCity" defaultValue={template.defaultDepartureCity || ''} />
            </label>
            <label className="checkbox-field">
              <input name="active" type="checkbox" defaultChecked={template.active} />
              Active
            </label>
          </div>
          <label>
            Operational notes
            <textarea name="operationalNotes" rows={3} defaultValue={template.operationalNotes || ''} />
          </label>
          <div className="form-grid">
            <label>
              Operating days
              <input name="operatingDays" defaultValue={template.operatingDays || ''} placeholder="Daily, Mon-Sat, seasonal" />
            </label>
            <label>
              Recommended departure time
              <input name="recommendedDepartureTime" defaultValue={template.recommendedDepartureTime || ''} placeholder="08:00" />
            </label>
            <label>
              Estimated return time
              <input name="estimatedReturnTime" defaultValue={template.estimatedReturnTime || ''} placeholder="18:00" />
            </label>
            <label>
              Minimum pax
              <input name="minimumPax" type="number" min="0" defaultValue={template.minimumPax ?? ''} />
            </label>
            <label>
              Maximum pax
              <input name="maximumPax" type="number" min="0" defaultValue={template.maximumPax ?? ''} />
            </label>
            <label>
              Weather sensitive
              <select name="weatherSensitive" defaultValue={booleanSelectValue(template.weatherSensitive)}>
                <option value="">Not set</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label>
              Child friendly
              <select name="childFriendly" defaultValue={booleanSelectValue(template.childFriendly)}>
                <option value="">Not set</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label>
              Wheelchair accessible
              <select name="wheelchairAccessible" defaultValue={booleanSelectValue(template.wheelchairAccessible)}>
                <option value="">Not set</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          </div>
          <label>
            Seasonal restrictions
            <textarea name="seasonalRestrictions" rows={2} defaultValue={template.seasonalRestrictions || ''} />
          </label>
          <label>
            Operational warnings
            <textarea name="operationalWarnings" rows={2} defaultValue={template.operationalWarnings || ''} />
          </label>
          <button type="submit" disabled={isSaving}>
            Save metadata
          </button>
        </form>
      </section>

      <section className="workspace-section">
        <h3>Components</h3>
        <div className="table-action-row">
          <button type="button" className="secondary-button" disabled={isSaving || isFillingMetadata} onClick={fillMissingMetadata}>
            {isFillingMetadata ? 'Filling...' : 'Fill Missing Metadata'}
          </button>
          <p className="form-helper">Fills only blank operational fields with safe defaults. Existing values and pricing are preserved.</p>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Type</th>
                <th>Component</th>
                <th>Linked record</th>
                <th>Optional</th>
                <th>Controls</th>
              </tr>
            </thead>
            <tbody>
              {activeComponents.map((component, index) => (
                <tr key={component.id}>
                  <td>{index + 1}</td>
                  <td>
                    <span className="status-pill">{component.componentType}</span>
                  </td>
                  <td>
                    <strong>{component.label}</strong>
                    {component.operationalNotes ? <p className="table-cell-copy">{component.operationalNotes}</p> : null}
                    <form action={(formData) => saveComponentOperations(component.id, formData)} className="form-field-stack">
                      <div className="form-grid">
                        <label>
                          Arrival time
                          <input name="requiredArrivalTime" defaultValue={component.requiredArrivalTime || ''} placeholder="HH:MM" />
                        </label>
                        <label>
                          Est. duration min
                          <input
                            name="estimatedDurationMinutes"
                            type="number"
                            min="0"
                            defaultValue={component.estimatedDurationMinutes ?? ''}
                          />
                        </label>
                        <label>
                          Supplier confirmation
                          <select name="supplierConfirmationRequired" defaultValue={booleanSelectValue(component.supplierConfirmationRequired)}>
                            <option value="">Not set</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        </label>
                        <label>
                          Voucher
                          <select name="voucherRequired" defaultValue={booleanSelectValue(component.voucherRequired)}>
                            <option value="">Not set</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        </label>
                      </div>
                      <label>
                        Pickup notes
                        <input name="pickupNotes" defaultValue={component.pickupNotes || ''} />
                      </label>
                      <label>
                        Operational dependency
                        <input name="operationalDependency" defaultValue={component.operationalDependency || ''} />
                      </label>
                      <button type="submit" className="secondary-button" disabled={isSaving}>
                        Save ops
                      </button>
                    </form>
                  </td>
                  <td>{getReferenceLabel(component)}</td>
                  <td>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={component.isOptional}
                        onChange={(event) => toggleOptional(component.id, event.currentTarget.checked)}
                      />
                      Optional
                    </label>
                  </td>
                  <td>
                    <div className="table-action-group">
                      <button type="button" className="secondary-button" disabled={index === 0 || isSaving} onClick={() => moveComponent(component.id, -1)}>
                        Up
                      </button>
                      <button
                        type="button"
                        className="secondary-button"
                        disabled={index === activeComponents.length - 1 || isSaving}
                        onClick={() => moveComponent(component.id, 1)}
                      >
                        Down
                      </button>
                      <button type="button" className="secondary-button" disabled={isSaving} onClick={() => removeComponent(component.id)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {removedComponents.length > 0 ? <p className="form-helper">{removedComponents.length} soft-removed component rows preserved.</p> : null}
      </section>

      <section className="workspace-section">
        <h3>Add linked component</h3>
        <form action={addComponent} className="entity-form">
          <div className="form-grid">
            <label>
              Component type
              <select name="componentType" value={componentType} onChange={(event) => setComponentType(event.currentTarget.value as ExcursionComponentType)}>
                {COMPONENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            {componentType === 'TRANSPORT' ? (
              <>
                <label>
                  Route
                  <select value={selectedRouteId} onChange={(event) => setSelectedRouteId(event.currentTarget.value)} required>
                    <option value="">Select route</option>
                    {catalogs.routes.map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Transport type
                  <select value={selectedTransportServiceTypeId} onChange={(event) => setSelectedTransportServiceTypeId(event.currentTarget.value)} required>
                    <option value="">Select transport type</option>
                    {catalogs.transportServiceTypes.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : componentType === 'ACTIVITY' || componentType === 'GUIDE' ? (
              <label>
                Activity Master record
                <select value={selectedActivityId} onChange={(event) => setSelectedActivityId(event.currentTarget.value)} required>
                  <option value="">Select activity</option>
                  {catalogs.activities
                    .filter((activity) => activity.active !== false)
                    .map((activity) => (
                      <option key={activity.id} value={activity.id}>
                        {activity.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <label>
                Service record
                <select value={selectedServiceId} onChange={(event) => setSelectedServiceId(event.currentTarget.value)} required>
                  <option value="">Select service</option>
                  {(componentType === 'TICKET' ? ticketServices : diningServices).map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="checkbox-field">
              <input name="isOptional" type="checkbox" />
              Optional
            </label>
          </div>
          <label>
            Operational notes
            <textarea name="operationalNotes" rows={2} />
          </label>
          <div className="form-grid">
            <label>
              Required arrival time
              <input name="requiredArrivalTime" placeholder="HH:MM" />
            </label>
            <label>
              Estimated duration minutes
              <input name="estimatedDurationMinutes" type="number" min="0" />
            </label>
            <label>
              Supplier confirmation required
              <select name="supplierConfirmationRequired" defaultValue="">
                <option value="">Not set</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
            <label>
              Voucher required
              <select name="voucherRequired" defaultValue="">
                <option value="">Not set</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          </div>
          <label>
            Pickup notes
            <input name="pickupNotes" />
          </label>
          <label>
            Operational dependency
            <input name="operationalDependency" />
          </label>
          <button type="submit" disabled={isSaving}>
            Add component
          </button>
        </form>
      </section>
    </section>
  );
}
