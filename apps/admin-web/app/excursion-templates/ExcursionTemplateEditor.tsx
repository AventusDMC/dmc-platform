'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchableSelect, type SearchableSelectOption } from '../components/SearchableSelect';
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
const NON_TRANSPORT_COMPONENT_SECTIONS: Array<{ id: string; title: string; types: ExcursionComponentType[]; optionalOnly?: boolean }> = [
  { id: 'tickets', title: 'Tickets', types: ['TICKET'] },
  { id: 'guides', title: 'Guides', types: ['GUIDE'] },
  { id: 'dining', title: 'Dining', types: ['DINING'] },
  { id: 'activities', title: 'Activities', types: ['ACTIVITY'] },
  { id: 'optional', title: 'Optional', types: ['TICKET', 'ACTIVITY', 'GUIDE', 'DINING'], optionalOnly: true },
];
const ROUTE_CODE_PATTERN = /\b[A-Z][A-Z0-9]*(?:[_-][A-Z0-9]+){1,}\b/;
const ORIGIN_CODE_LABELS: Record<string, string> = {
  AMM: 'Amman',
  AQJ: 'Aqaba',
  PETRA: 'Petra',
  JERASH: 'Jerash',
  DEAD: 'Dead Sea',
  MADABA: 'Madaba',
  WADI: 'Wadi Rum',
};
const TOURING_TRANSPORT_CLASSIFICATIONS = new Set(['TOURING_ROUTE', 'FULL_DAY', 'HALF_DAY', 'DAILY_PACKAGE', 'PROGRAM_SERVICE']);
const TOURING_TRANSPORT_TEXT_PATTERN = /\b(?:day tour|full day|half day|daily full day|touring route|program service|jordan program)\b/i;
const ROUTE_MOVEMENT_PATTERN = /\s(?:->|→| to )\s/i;

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
    return [component.touringRoute?.name || component.route?.name, component.transportServiceType?.name].filter(Boolean).join(' / ') || 'Transport link pending';
  }
  return component.activity?.name || component.supplierService?.name || 'Catalog link pending';
}

function formatDuration(minutes?: number | null, durationDays?: number | null) {
  if (minutes && minutes > 0) {
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return hours > 0 ? `${hours} hr${remainder ? ` ${remainder} min` : ''}` : `${minutes} min`;
  }

  if (durationDays && durationDays > 0) {
    return `${durationDays} day${durationDays === 1 ? '' : 's'}`;
  }

  return 'Duration pending';
}

function formatTouringRouteLabel(route: ExcursionTemplateCatalogs['touringRoutes'][number]) {
  const destinations = Array.isArray(route.mainDestinations) ? route.mainDestinations.filter(Boolean) : [];
  const stopNames = route.stops?.map((stop) => stop.location || stop.city).filter(Boolean) || [];
  const routePath = destinations.length > 0 ? destinations : stopNames;
  const pathLabel = routePath.length > 0 ? `${route.startCity} -> ${routePath.join(' -> ')} -> ${route.startCity}` : route.name;

  return pathLabel.toLowerCase().includes(route.startCity.toLowerCase()) ? pathLabel : `${route.startCity} -> ${pathLabel}`;
}

function getComponentDurationLabel(component: ExcursionTemplate['components'][number]) {
  return formatDuration(component.estimatedDurationMinutes || component.durationMinutes || component.route?.durationMinutes, component.touringRoute?.durationDays);
}

function extractVariantRouteCode(value: unknown) {
  const text = String(value || '').toUpperCase();
  const match = text.match(ROUTE_CODE_PATTERN);
  return match?.[0]?.replace(/-/g, '_') || '';
}

function formatOriginCode(value: string) {
  const code = value.toUpperCase();
  return ORIGIN_CODE_LABELS[code] || code.replace(/_/g, ' ');
}

function getOriginVariantStartCity(component: ExcursionTemplate['components'][number]) {
  const variantRouteCode = getVariantRouteCode(component);
  const sourceOriginCode = variantRouteCode.split('_')[0];

  return (
    component.touringRoute?.startCity ||
    component.suggestedDepartureCity ||
    component.route?.fromPlace?.name ||
    component.route?.name?.split(/\s*(?:->|→| to )\s*/i)[0] ||
    (sourceOriginCode ? formatOriginCode(sourceOriginCode) : '') ||
    'Origin pending'
  );
}

function getOriginVariantName(component: ExcursionTemplate['components'][number]) {
  return component.touringRoute?.name || component.route?.name || component.label || 'Touring route pending';
}

function getVariantRouteCode(component: ExcursionTemplate['components'][number]) {
  return (
    component.touringRoute?.code ||
    extractVariantRouteCode(component.route?.name) ||
    extractVariantRouteCode(component.label) ||
    extractVariantRouteCode(component.operationalNotes) ||
    extractVariantRouteCode(component.pickupNotes) ||
    extractVariantRouteCode(component.operationalDependency) ||
    ''
  );
}

function getTransportServiceText(component: ExcursionTemplate['components'][number]) {
  return [
    component.transportServiceType?.name,
    component.transportServiceType?.code,
    component.transportServiceType?.classification,
    component.label,
    component.operationalNotes,
  ]
    .filter(Boolean)
    .join(' ');
}

function hasTouringTransportServiceType(component: ExcursionTemplate['components'][number]) {
  const classification = String(component.transportServiceType?.classification || component.transportServiceType?.code || '').toUpperCase();
  return TOURING_TRANSPORT_CLASSIFICATIONS.has(classification) || TOURING_TRANSPORT_TEXT_PATTERN.test(getTransportServiceText(component));
}

function hasRouteMovement(component: ExcursionTemplate['components'][number]) {
  return Boolean(
    component.route?.fromPlace?.name ||
      component.route?.toPlace?.name ||
      component.suggestedDepartureCity ||
      component.suggestedArrivalCity ||
      ROUTE_MOVEMENT_PATTERN.test(component.route?.name || '') ||
      ROUTE_MOVEMENT_PATTERN.test(component.label || ''),
  );
}

function isTouringVariantTransport(component: ExcursionTemplate['components'][number]) {
  if (component.componentType !== 'TRANSPORT') return false;
  if (component.touringRouteId || component.touringRoute || getVariantRouteCode(component)) return true;
  if (hasTouringTransportServiceType(component) && !component.routeId) return true;
  return hasTouringTransportServiceType(component) && hasRouteMovement(component);
}

function isOriginVariantTransport(component: ExcursionTemplate['components'][number]) {
  return isTouringVariantTransport(component);
}

function isQuoteReadyOriginVariant(component: ExcursionTemplate['components'][number]) {
  return component.componentType === 'TRANSPORT' && Boolean(component.touringRouteId && component.touringRoute);
}

function getComponentStatusLabel(component: ExcursionTemplate['components'][number]) {
  if (isOriginVariantTransport(component) && !isQuoteReadyOriginVariant(component)) {
    return 'Draft / Missing touring route';
  }

  return component.active === false ? 'Inactive' : component.isOptional ? 'Optional' : 'Required';
}

function getInventoryWarnings(component: ExcursionTemplate['components'][number]) {
  const warnings: string[] = [];

  if (component.componentType === 'TRANSPORT') {
    if (!component.touringRouteId && !component.touringRoute && !component.routeId && !component.route) {
      warnings.push('Touring route link pending');
    }
    if (!component.transportServiceTypeId && !component.transportServiceType) {
      warnings.push('Transport service type pending');
    }
  } else if (component.componentType === 'ACTIVITY' || component.componentType === 'GUIDE') {
    if (!component.activityId && !component.activity && !component.supplierServiceId && !component.supplierService) {
      warnings.push('Activity or guide inventory link pending');
    }
  } else if (!component.supplierServiceId && !component.supplierService) {
    warnings.push('Reusable service link pending');
  }

  if (!component.estimatedDurationMinutes && !component.durationMinutes && !component.touringRoute?.durationDays && !component.route?.durationMinutes) {
    warnings.push('Duration pending');
  }

  return warnings;
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

function uniqueOptions(options: SearchableSelectOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (!option.value || seen.has(option.value)) return false;
    seen.add(option.value);
    return true;
  });
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
  const [transportProductType, setTransportProductType] = useState<'TRANSFER' | 'TOURING_ROUTE'>('TRANSFER');
  const [selectedRouteId, setSelectedRouteId] = useState('');
  const [selectedTouringRouteId, setSelectedTouringRouteId] = useState('');
  const [selectedTransportServiceTypeId, setSelectedTransportServiceTypeId] = useState('');
  const [selectedActivityId, setSelectedActivityId] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [newComponentRequirement, setNewComponentRequirement] = useState<'REQUIRED' | 'OPTIONAL'>('REQUIRED');
  const [componentCatalogDrafts, setComponentCatalogDrafts] = useState<
    Record<string, { originCity?: string; routeId?: string; touringRouteId?: string; transportServiceTypeId?: string; activityId?: string; supplierServiceId?: string; isOptional?: string }>
  >({});
  const activeComponents = useMemo(
    () => [...(template.components || [])].filter((component) => component.active !== false).sort((a, b) => a.sortOrder - b.sortOrder),
    [template.components],
  );
  const removedComponents = useMemo(
    () => [...(template.components || [])].filter((component) => component.active === false).sort((a, b) => a.sortOrder - b.sortOrder),
    [template.components],
  );
  const originVariantComponents = useMemo(() => activeComponents.filter(isOriginVariantTransport), [activeComponents]);
  const otherTransportComponents = useMemo(
    () => activeComponents.filter((component) => component.componentType === 'TRANSPORT' && !isOriginVariantTransport(component)),
    [activeComponents],
  );
  const nonTransportSections = useMemo(
    () =>
      NON_TRANSPORT_COMPONENT_SECTIONS.map((section) => ({
        ...section,
        components: activeComponents.filter(
          (component) =>
            component.componentType !== 'TRANSPORT' &&
            section.types.includes(component.componentType) &&
            (section.optionalOnly ? component.isOptional : !component.isOptional),
        ),
      })),
    [activeComponents],
  );
  const ticketServices = useMemo(() => catalogs.services.filter(isTicketService), [catalogs.services]);
  const diningServices = useMemo(() => catalogs.services.filter(isDiningService), [catalogs.services]);
  const routeOptions = useMemo<SearchableSelectOption[]>(
    () =>
      catalogs.routes.map((route) => ({
        value: route.id,
        label: route.name,
        helper: route.durationMinutes ? formatDuration(route.durationMinutes) : 'Transfer route',
      })),
    [catalogs.routes],
  );
  const touringRouteOptions = useMemo<SearchableSelectOption[]>(
    () =>
      catalogs.touringRoutes
        .filter((route) => route.active !== false)
        .sort((a, b) => a.startCity.localeCompare(b.startCity) || a.name.localeCompare(b.name) || Number(a.durationDays || 0) - Number(b.durationDays || 0))
        .map((route) => ({
          value: route.id,
          label: formatTouringRouteLabel(route),
          helper: [route.startCity, route.name, route.durationDays ? `${route.durationDays}D` : null, route.code].filter(Boolean).join(' / '),
        })),
    [catalogs.touringRoutes],
  );
  const transportTypeOptions = useMemo<SearchableSelectOption[]>(
    () =>
      catalogs.transportServiceTypes.map((entry) => ({
        value: entry.id,
        label: entry.name,
        helper: [entry.code, entry.classification].filter(Boolean).join(' / '),
      })),
    [catalogs.transportServiceTypes],
  );
  const activityOptions = useMemo<SearchableSelectOption[]>(
    () =>
      catalogs.activities
        .filter((activity) => activity.active !== false)
        .map((activity) => ({
          value: activity.id,
          label: activity.name,
          helper: activity.durationMinutes ? formatDuration(activity.durationMinutes) : 'Activity Master',
        })),
    [catalogs.activities],
  );
  const ticketServiceOptions = useMemo<SearchableSelectOption[]>(
    () =>
      ticketServices.map((service) => ({
        value: service.id,
        label: service.name,
        helper: [service.category, service.serviceType?.name, service.ticketRateVariants?.length ? 'Ticket inventory' : null].filter(Boolean).join(' / '),
      })),
    [ticketServices],
  );
  const diningServiceOptions = useMemo<SearchableSelectOption[]>(
    () =>
      diningServices.map((service) => ({
        value: service.id,
        label: service.name,
        helper: [service.category, service.serviceType?.name].filter(Boolean).join(' / '),
      })),
    [diningServices],
  );
  const originCityOptions = useMemo<SearchableSelectOption[]>(
    () =>
      uniqueOptions([
        ...catalogs.touringRoutes.map((route) => ({ value: route.startCity, label: route.startCity, helper: 'Touring route origin' })),
        ...activeComponents
          .map(getOriginVariantStartCity)
          .filter((city) => city && city !== 'Origin pending')
          .map((city) => ({ value: city, label: city, helper: 'Saved template origin' })),
      ]),
    [activeComponents, catalogs.touringRoutes],
  );
  const defaultOriginTransportServiceTypeId =
    originVariantComponents.find((component) => component.transportServiceTypeId || component.transportServiceType?.id)?.transportServiceTypeId ||
    originVariantComponents.find((component) => component.transportServiceTypeId || component.transportServiceType?.id)?.transportServiceType?.id ||
    catalogs.transportServiceTypes.find((entry) => TOURING_TRANSPORT_CLASSIFICATIONS.has(String(entry.classification || entry.code || '').toUpperCase()))?.id ||
    catalogs.transportServiceTypes[0]?.id ||
    '';

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

  function updateComponentDraft(componentId: string, patch: NonNullable<(typeof componentCatalogDrafts)[string]>) {
    setComponentCatalogDrafts((current) => ({ ...current, [componentId]: { ...(current[componentId] || {}), ...patch } }));
  }

  function saveComponentCatalogLinks(component: ExcursionTemplate['components'][number], formData: FormData) {
    const nextIsOptional = formData.get('isOptional') === 'true';
    const nextTouringRouteId = String(formData.get('touringRouteId') || '');
    const nextRouteId = String(formData.get('routeId') || '');
    const nextActivityId = String(formData.get('activityId') || '');
    const nextSupplierServiceId = String(formData.get('supplierServiceId') || '');
    const selectedTouringRoute = catalogs.touringRoutes.find((route) => route.id === nextTouringRouteId);
    const selectedRoute = catalogs.routes.find((route) => route.id === nextRouteId);
    const selectedActivity = catalogs.activities.find((activity) => activity.id === nextActivityId);
    const selectedService = catalogs.services.find((service) => service.id === nextSupplierServiceId);
    const nextLabel = selectedTouringRoute?.name || selectedRoute?.name || selectedActivity?.name || selectedService?.name || component.label;
    const nextOriginCity = String(formData.get('originCity') || '');

    if (
      component.componentType === 'TRANSPORT' &&
      nextTouringRouteId &&
      originVariantComponents.some(
        (entry) =>
          entry.id !== component.id &&
          (entry.touringRouteId || entry.touringRoute?.id) === nextTouringRouteId &&
          getOriginVariantStartCity(entry).trim().toLowerCase() === nextOriginCity.trim().toLowerCase(),
      )
    ) {
      setError('Duplicate origin variant: this origin city and touring route variant already exist.');
      return;
    }

    void mutate(
      `/api/excursion-templates/${template.id}/components/${component.id}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: nextLabel,
          isOptional: nextIsOptional,
          suggestedDepartureCity: nextOriginCity,
          routeId: component.componentType === 'TRANSPORT' ? nextRouteId || null : null,
          touringRouteId: component.componentType === 'TRANSPORT' ? nextTouringRouteId || null : null,
          transportServiceTypeId: component.componentType === 'TRANSPORT' ? formData.get('transportServiceTypeId') || null : null,
          activityId: component.componentType === 'ACTIVITY' || component.componentType === 'GUIDE' ? nextActivityId || null : null,
          supplierServiceId: component.componentType === 'TICKET' || component.componentType === 'DINING' ? nextSupplierServiceId || null : null,
        }),
      },
      'Could not save component catalog links.',
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

  function renderComponentCatalogLinkForm(component: ExcursionTemplate['components'][number], options: { originVariant?: boolean } = {}) {
    const draft = componentCatalogDrafts[component.id] || {};
    const resolvedOriginCity = draft.originCity ?? component.suggestedDepartureCity ?? getOriginVariantStartCity(component);
    const originCity = resolvedOriginCity === 'Origin pending' ? '' : resolvedOriginCity;
    const routeId = draft.routeId ?? component.routeId ?? component.route?.id ?? '';
    const touringRouteId = draft.touringRouteId ?? component.touringRouteId ?? component.touringRoute?.id ?? '';
    const transportServiceTypeId = draft.transportServiceTypeId ?? component.transportServiceTypeId ?? component.transportServiceType?.id ?? '';
    const activityId = draft.activityId ?? component.activityId ?? component.activity?.id ?? '';
    const supplierServiceId = draft.supplierServiceId ?? component.supplierServiceId ?? component.supplierService?.id ?? '';
    const isOptional = draft.isOptional ?? (component.isOptional ? 'true' : 'false');
    const serviceOptions = component.componentType === 'TICKET' ? ticketServiceOptions : diningServiceOptions;

    return (
      <form action={(formData) => saveComponentCatalogLinks(component, formData)} className="form-field-stack">
        <input type="hidden" name="originCity" value={originCity} />
        <input type="hidden" name="routeId" value={routeId} />
        <input type="hidden" name="touringRouteId" value={touringRouteId} />
        <input type="hidden" name="transportServiceTypeId" value={transportServiceTypeId} />
        <input type="hidden" name="activityId" value={activityId} />
        <input type="hidden" name="supplierServiceId" value={supplierServiceId} />
        <div className="form-grid">
          {options.originVariant ? (
            <SearchableSelect
              label="Origin city"
              value={originCity}
              options={originCityOptions}
              onChange={(value) => updateComponentDraft(component.id, { originCity: value })}
              placeholder="Select origin city"
              missingText="Saved origin is not in the touring route origin catalog."
            />
          ) : null}
          {component.componentType === 'TRANSPORT' ? (
            <>
              <SearchableSelect
                label={options.originVariant ? 'Touring route variant' : 'Transport route / touring route'}
                value={touringRouteId || routeId}
                options={options.originVariant || touringRouteId ? touringRouteOptions : routeOptions}
                onChange={(value) =>
                  options.originVariant || touringRouteId
                    ? updateComponentDraft(component.id, { touringRouteId: value, routeId: '' })
                    : updateComponentDraft(component.id, { routeId: value, touringRouteId: '' })
                }
                placeholder="Select catalog route"
                missingText="Selected transport route is missing from the catalog."
                showAllOnFocus={options.originVariant}
              />
              <SearchableSelect
                label="Transport type"
                value={transportServiceTypeId}
                options={transportTypeOptions}
                onChange={(value) => updateComponentDraft(component.id, { transportServiceTypeId: value })}
                placeholder="Select transport type"
                missingText="Selected transport type is missing from the catalog."
              />
            </>
          ) : component.componentType === 'ACTIVITY' || component.componentType === 'GUIDE' ? (
            <SearchableSelect
              label={component.componentType === 'GUIDE' ? 'Guide inventory' : 'Activity Master / Variant'}
              value={activityId}
              options={activityOptions}
              onChange={(value) => updateComponentDraft(component.id, { activityId: value })}
              placeholder="Select activity record"
              missingText="Selected activity or guide inventory is missing from the catalog."
            />
          ) : (
            <SearchableSelect
              label={component.componentType === 'TICKET' ? 'Ticket inventory' : 'Dining/service inventory'}
              value={supplierServiceId}
              options={serviceOptions}
              onChange={(value) => updateComponentDraft(component.id, { supplierServiceId: value })}
              placeholder="Select service record"
              missingText="Selected service inventory is missing from the catalog."
            />
          )}
          <label>
            Required / Optional
            <select name="isOptional" value={isOptional} onChange={(event) => updateComponentDraft(component.id, { isOptional: event.currentTarget.value })}>
              <option value="false">Required</option>
              <option value="true">Optional</option>
            </select>
          </label>
        </div>
        <button type="submit" className="secondary-button" disabled={isSaving}>
          Save catalog links
        </button>
      </form>
    );
  }

  function removeComponent(componentId: string) {
    void mutate(
      `/api/excursion-templates/${template.id}/components/${componentId}`,
      { method: 'DELETE' },
      'Could not remove component.',
    );
  }

  function addOriginVariant() {
    void mutate(
      `/api/excursion-templates/${template.id}/components`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentType: 'TRANSPORT',
          label: 'Origin variant draft',
          isOptional: false,
          transportServiceTypeId: defaultOriginTransportServiceTypeId || null,
          routeId: null,
          touringRouteId: null,
          suggestedDepartureCity: null,
          operationalNotes: '',
        }),
      },
      'Could not add origin variant.',
    );
  }

  function duplicateOriginVariant(component: ExcursionTemplate['components'][number]) {
    void mutate(
      `/api/excursion-templates/${template.id}/components`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentType: 'TRANSPORT',
          label: `${component.label || 'Origin variant'} Copy`,
          isOptional: component.isOptional,
          transportServiceTypeId: component.transportServiceTypeId || component.transportServiceType?.id || null,
          routeId: null,
          touringRouteId: null,
          suggestedDepartureCity: null,
          suggestedArrivalCity: component.suggestedArrivalCity || null,
          durationMinutes: component.durationMinutes ?? null,
          estimatedDurationMinutes: component.estimatedDurationMinutes ?? null,
          requiredArrivalTime: component.requiredArrivalTime || null,
          supplierConfirmationRequired: component.supplierConfirmationRequired ?? null,
          voucherRequired: component.voucherRequired ?? null,
          pickupNotes: component.pickupNotes || null,
          operationalDependency: component.operationalDependency || null,
          operationalNotes: component.operationalNotes || null,
        }),
      },
      'Could not duplicate origin variant.',
    );
  }

  function renderComponentOperationsForm(component: ExcursionTemplate['components'][number]) {
    return (
      <form action={(formData) => saveComponentOperations(component.id, formData)} className="form-field-stack">
        <div className="form-grid">
          <label>
            Arrival time
            <input name="requiredArrivalTime" defaultValue={component.requiredArrivalTime || ''} placeholder="HH:MM" />
          </label>
          <label>
            Est. duration min
            <input name="estimatedDurationMinutes" type="number" min="0" defaultValue={component.estimatedDurationMinutes ?? ''} />
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
    );
  }

  function renderComponentControls(component: ExcursionTemplate['components'][number], options: { removeLabel?: string } = {}) {
    const componentIndex = activeComponents.findIndex((entry) => entry.id === component.id);

    return (
      <div className="table-action-group">
        <button type="button" className="secondary-button" disabled={componentIndex <= 0 || isSaving} onClick={() => moveComponent(component.id, -1)}>
          Up
        </button>
        <button
          type="button"
          className="secondary-button"
          disabled={componentIndex === activeComponents.length - 1 || componentIndex < 0 || isSaving}
          onClick={() => moveComponent(component.id, 1)}
        >
          Down
        </button>
        <button type="button" className="secondary-button" disabled={isSaving} onClick={() => removeComponent(component.id)}>
          {options.removeLabel || 'Remove'}
        </button>
      </div>
    );
  }

  function renderOptionalToggle(component: ExcursionTemplate['components'][number]) {
    return (
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={component.isOptional}
          onChange={(event) => toggleOptional(component.id, event.currentTarget.checked)}
        />
        Optional
      </label>
    );
  }

  function renderComponentRows(components: ExcursionTemplate['components'], options: { showType?: boolean } = {}) {
    return components.map((component) => (
      <tr key={component.id}>
        <td>{activeComponents.findIndex((entry) => entry.id === component.id) + 1}</td>
        {options.showType ? (
          <td>
            <span className="status-pill">{component.componentType}</span>
          </td>
        ) : null}
        <td>
          <strong>{component.label}</strong>
          {component.operationalNotes ? <p className="table-cell-copy">{component.operationalNotes}</p> : null}
          {renderComponentCatalogLinkForm(component)}
          {renderComponentOperationsForm(component)}
        </td>
        <td>{getReferenceLabel(component)}</td>
        <td>{getComponentDurationLabel(component)}</td>
        <td>{component.isOptional ? 'Optional' : 'Required'}</td>
        <td>{renderComponentControls(component)}</td>
      </tr>
    ));
  }

  function addComponent(formData: FormData) {
    const type = String(formData.get('componentType') || 'TRANSPORT') as ExcursionComponentType;
    const selectedRoute = catalogs.routes.find((route) => route.id === selectedRouteId);
    const selectedTouringRoute = catalogs.touringRoutes.find((route) => route.id === selectedTouringRouteId);
    const selectedTransportType = catalogs.transportServiceTypes.find((entry) => entry.id === selectedTransportServiceTypeId);
    const selectedActivity = catalogs.activities.find((activity) => activity.id === selectedActivityId);
    const servicePool = type === 'TICKET' ? ticketServices : diningServices;
    const selectedService = servicePool.find((service) => service.id === selectedServiceId);
    const basePayload = {
      componentType: type,
      isOptional: formData.get('isOptional') === 'OPTIONAL',
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
            label: [transportProductType === 'TOURING_ROUTE' ? selectedTouringRoute?.name : selectedRoute?.name, selectedTransportType?.name]
              .filter(Boolean)
              .join(' / ') || 'Transport component',
            routeId: transportProductType === 'TRANSFER' ? selectedRouteId : null,
            touringRouteId: transportProductType === 'TOURING_ROUTE' ? selectedTouringRouteId : null,
            transportServiceTypeId: selectedTransportServiceTypeId,
            durationMinutes: transportProductType === 'TOURING_ROUTE' ? (selectedTouringRoute?.durationDays || 1) * 24 * 60 : selectedRoute?.durationMinutes ?? null,
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

        <section className="excursion-component-section">
            <div className="workspace-section-head">
              <div>
                <h4>Origin Variants</h4>
                <p>Transport variants grouped by origin so this remains one excursion with multiple pickup markets.</p>
              </div>
              <button type="button" className="secondary-button" disabled={isSaving} onClick={addOriginVariant}>
                Add Origin Variant
              </button>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Origin</th>
                    <th>Route / variant</th>
                    <th>Duration</th>
                    <th>Status</th>
                    <th>Inventory warnings</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {originVariantComponents.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <p className="form-helper">No origin variants yet. Add a blank origin variant, then choose its origin city and touring route variant.</p>
                      </td>
                    </tr>
                  ) : null}
                  {originVariantComponents.map((component) => {
                    const warnings = getInventoryWarnings(component);
                    return (
                      <tr key={component.id}>
                        <td>
                          <strong>{getOriginVariantStartCity(component)}</strong>
                          {component.suggestedArrivalCity ? <p className="table-cell-copy">To {component.suggestedArrivalCity}</p> : null}
                        </td>
                        <td>
                          <strong>{getOriginVariantName(component)}</strong>
                          <p className="table-cell-copy">{getReferenceLabel(component)}</p>
                          {component.operationalNotes ? <p className="table-cell-copy">{component.operationalNotes}</p> : null}
                          {renderComponentCatalogLinkForm(component, { originVariant: true })}
                          {renderComponentOperationsForm(component)}
                        </td>
                        <td>{getComponentDurationLabel(component)}</td>
                        <td>
                          <span className={component.isOptional ? 'status-pill status-pill-muted' : 'status-pill status-pill-success'}>
                            {getComponentStatusLabel(component)}
                          </span>
                          {!isQuoteReadyOriginVariant(component) ? (
                            <p className="form-helper">Link a touring route to make this origin available in quotes.</p>
                          ) : null}
                        </td>
                        <td>
                          {warnings.length > 0 ? (
                            warnings.map((warning) => (
                              <p className="table-cell-copy" key={`${component.id}-${warning}`}>
                                {warning}
                              </p>
                            ))
                          ) : (
                            <span className="status-pill status-pill-success">Linked</span>
                          )}
                        </td>
                        <td>
                          <div className="table-action-group">
                            {component.touringRouteId || component.touringRoute ? (
                              <Link href="/transport?tab=touring-routes" className="secondary-button">
                                Open route
                              </Link>
                            ) : null}
                            <button type="button" className="secondary-button" disabled={isSaving} onClick={() => duplicateOriginVariant(component)}>
                              Duplicate Variant
                            </button>
                            {renderComponentControls(component, { removeLabel: 'Remove Variant' })}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

        {otherTransportComponents.length > 0 ? (
          <section className="excursion-component-section">
            <div className="workspace-section-head">
              <div>
                <h4>Other Transport</h4>
                <p>Transport rows that are not linked to a touring route variant.</p>
              </div>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Component</th>
                    <th>Linked record</th>
                    <th>Duration</th>
                    <th>Optional</th>
                    <th>Controls</th>
                  </tr>
                </thead>
                <tbody>{renderComponentRows(otherTransportComponents)}</tbody>
              </table>
            </div>
          </section>
        ) : null}

        {nonTransportSections.map((section) =>
          section.components.length > 0 ? (
            <section className="excursion-component-section" key={section.id}>
              <div className="workspace-section-head">
                <div>
                  <h4>{section.title}</h4>
                </div>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Order</th>
                      <th>Component</th>
                      <th>Linked record</th>
                      <th>Duration</th>
                      <th>Optional</th>
                      <th>Controls</th>
                    </tr>
                  </thead>
                  <tbody>{renderComponentRows(section.components)}</tbody>
                </table>
              </div>
            </section>
          ) : null,
        )}

        {activeComponents.length === 0 ? <p className="form-helper">No active components are linked yet.</p> : null}
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
                  Transport product
                  <select
                    value={transportProductType}
                    onChange={(event) => {
                      const nextType = event.currentTarget.value as 'TRANSFER' | 'TOURING_ROUTE';
                      setTransportProductType(nextType);
                      setSelectedRouteId('');
                      setSelectedTouringRouteId('');
                    }}
                  >
                    <option value="TRANSFER">Transfer route</option>
                    <option value="TOURING_ROUTE">Touring route</option>
                  </select>
                </label>
                <SearchableSelect
                  label={transportProductType === 'TOURING_ROUTE' ? 'Touring route variant' : 'Transfer route'}
                  value={transportProductType === 'TOURING_ROUTE' ? selectedTouringRouteId : selectedRouteId}
                  options={transportProductType === 'TOURING_ROUTE' ? touringRouteOptions : routeOptions}
                  onChange={(value) => (transportProductType === 'TOURING_ROUTE' ? setSelectedTouringRouteId(value) : setSelectedRouteId(value))}
                  placeholder={`Select ${transportProductType === 'TOURING_ROUTE' ? 'touring route' : 'route'}`}
                  missingText="Selected transport route is missing from the catalog."
                  showAllOnFocus={transportProductType === 'TOURING_ROUTE'}
                  required
                />
                <SearchableSelect
                  label="Transport type"
                  value={selectedTransportServiceTypeId}
                  options={transportTypeOptions}
                  onChange={setSelectedTransportServiceTypeId}
                  placeholder="Select transport type"
                  missingText="Selected transport type is missing from the catalog."
                  required
                />
              </>
            ) : componentType === 'ACTIVITY' || componentType === 'GUIDE' ? (
              <SearchableSelect
                label={componentType === 'GUIDE' ? 'Guide inventory' : 'Activity Master / Variant'}
                value={selectedActivityId}
                options={activityOptions}
                onChange={setSelectedActivityId}
                placeholder="Select activity record"
                missingText="Selected activity or guide inventory is missing from the catalog."
                required
              />
            ) : (
              <SearchableSelect
                label={componentType === 'TICKET' ? 'Ticket inventory' : 'Dining/service inventory'}
                value={selectedServiceId}
                options={componentType === 'TICKET' ? ticketServiceOptions : diningServiceOptions}
                onChange={setSelectedServiceId}
                placeholder="Select service record"
                missingText="Selected service inventory is missing from the catalog."
                required
              />
            )}
            <label>
              Required / Optional
              <select name="isOptional" value={newComponentRequirement} onChange={(event) => setNewComponentRequirement(event.currentTarget.value as 'REQUIRED' | 'OPTIONAL')}>
                <option value="REQUIRED">Required</option>
                <option value="OPTIONAL">Optional</option>
              </select>
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
