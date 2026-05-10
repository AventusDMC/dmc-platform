'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiError } from '../lib/api';
import { ExcursionComponentType, ExcursionTemplate, ExcursionTemplateCatalogs } from './types';

type ExcursionTemplateEditorProps = {
  template: ExcursionTemplate;
  catalogs: ExcursionTemplateCatalogs;
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
  const [isSaving, setIsSaving] = useState(false);
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
          <button type="submit" disabled={isSaving}>
            Save metadata
          </button>
        </form>
      </section>

      <section className="workspace-section">
        <h3>Components</h3>
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
          <button type="submit" disabled={isSaving}>
            Add component
          </button>
        </form>
      </section>
    </section>
  );
}
