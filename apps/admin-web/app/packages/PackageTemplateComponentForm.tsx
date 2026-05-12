'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';
import { isOperationalPackageService } from './package-template-display';
import {
  PackageTemplateComponentType,
  PackageTemplateHotelContractOption,
  PackageTemplateOption,
  PackageTemplateRouteOption,
  PackageTemplateSupplierServiceOption,
  PackageTemplateTransportServiceTypeOption,
} from './types';

type PackageTemplateComponentFormProps = {
  apiBaseUrl: string;
  packageTemplateId: string;
  durationDays: number;
  excursionTemplates: PackageTemplateOption[];
  activities: PackageTemplateOption[];
  hotelContracts: PackageTemplateHotelContractOption[];
  routes: PackageTemplateRouteOption[];
  transportServiceTypes: PackageTemplateTransportServiceTypeOption[];
  ticketServices: PackageTemplateSupplierServiceOption[];
  serviceRecords: PackageTemplateSupplierServiceOption[];
};

const COMPONENT_TYPES: Array<{ value: PackageTemplateComponentType; label: string }> = [
  { value: 'EXCURSION_TEMPLATE', label: 'Excursion template' },
  { value: 'ACTIVITY', label: 'Activity Master' },
  { value: 'HOTEL', label: 'Hotel contract' },
  { value: 'TRANSPORT', label: 'Transport structure' },
  { value: 'TICKET', label: 'Ticketing service' },
  { value: 'SERVICE', label: 'Operational service' },
];

const TRANSPORT_PRICING_MODES = [
  'Airport Transfer',
  'Point-to-Point',
  'Half Day',
  'Full Day',
  'Day Tour',
  'Stationary / Waiting',
  'Extra Hour',
  'Extra KM',
];

function isTransportPackageService(service: PackageTemplateSupplierServiceOption) {
  const values = [service.name, service.category, service.serviceType?.name, service.serviceType?.code]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase());

  return values.some((value) => /\b(transport|transfer|vehicle|coach|driver)\b/.test(value));
}

export function PackageTemplateComponentForm({
  apiBaseUrl,
  packageTemplateId,
  durationDays,
  excursionTemplates,
  activities,
  hotelContracts,
  routes,
  transportServiceTypes,
  ticketServices,
  serviceRecords,
}: PackageTemplateComponentFormProps) {
  const router = useRouter();
  const [componentType, setComponentType] = useState<PackageTemplateComponentType>('EXCURSION_TEMPLATE');
  const [dayNumber, setDayNumber] = useState('1');
  const [label, setLabel] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [isOptional, setIsOptional] = useState(false);
  const [active, setActive] = useState(true);
  const [operationalNotes, setOperationalNotes] = useState('');
  const [excursionTemplateId, setExcursionTemplateId] = useState('');
  const [activityId, setActivityId] = useState('');
  const [hotelContractId, setHotelContractId] = useState('');
  const [routeId, setRouteId] = useState('');
  const [transportServiceTypeId, setTransportServiceTypeId] = useState('');
  const [pricingMode, setPricingMode] = useState(TRANSPORT_PRICING_MODES[0]);
  const [supplierServiceId, setSupplierServiceId] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const operationalServiceRecords = useMemo(() => serviceRecords.filter(isOperationalPackageService), [serviceRecords]);
  const transportServiceRecords = useMemo(() => serviceRecords.filter(isTransportPackageService), [serviceRecords]);

  const selectedReferenceLabel = useMemo(() => {
    if (componentType === 'EXCURSION_TEMPLATE') return excursionTemplates.find((item) => item.id === excursionTemplateId)?.name || '';
    if (componentType === 'ACTIVITY') return activities.find((item) => item.id === activityId)?.name || '';
    if (componentType === 'HOTEL') {
      const contract = hotelContracts.find((item) => item.id === hotelContractId);
      return contract ? `${contract.hotel?.name || 'Hotel'} - ${contract.name}` : '';
    }
    if (componentType === 'TRANSPORT') {
      const routeName = routes.find((item) => item.id === routeId)?.name || '';
      const serviceTypeName = transportServiceTypes.find((item) => item.id === transportServiceTypeId)?.name || pricingMode;
      return [routeName, serviceTypeName].filter(Boolean).join(' - ');
    }
    if (componentType === 'SERVICE') return operationalServiceRecords.find((item) => item.id === supplierServiceId)?.name || '';
    return ticketServices.find((item) => item.id === supplierServiceId)?.name || '';
  }, [
    activities,
    activityId,
    componentType,
    excursionTemplateId,
    excursionTemplates,
    hotelContractId,
    hotelContracts,
    routeId,
    routes,
    operationalServiceRecords,
    transportServiceTypeId,
    transportServiceTypes,
    pricingMode,
    supplierServiceId,
    ticketServices,
  ]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedDay = Number(dayNumber);
    const normalizedSortOrder = Number(sortOrder);
    const payload = {
      componentType,
      dayNumber: normalizedDay,
      label: label.trim() || selectedReferenceLabel,
      sortOrder: Number.isInteger(normalizedSortOrder) ? normalizedSortOrder : 0,
      isOptional,
      active,
      operationalNotes: operationalNotes.trim() || null,
      excursionTemplateId: componentType === 'EXCURSION_TEMPLATE' ? excursionTemplateId : null,
      activityId: componentType === 'ACTIVITY' ? activityId : null,
      hotelContractId: componentType === 'HOTEL' ? hotelContractId : null,
      routeId: componentType === 'TRANSPORT' ? routeId : null,
      transportServiceTypeId: componentType === 'TRANSPORT' ? transportServiceTypeId || null : null,
      pricingMode: componentType === 'TRANSPORT' ? pricingMode : null,
      supplierServiceId: componentType === 'TRANSPORT' || componentType === 'TICKET' || componentType === 'SERVICE' ? supplierServiceId || null : null,
    };

    if (!Number.isInteger(normalizedDay) || normalizedDay < 1 || normalizedDay > durationDays) {
      setError(`Day number must be between 1 and ${durationDays}.`);
      return;
    }

    if (!payload.label) {
      setError('Component label is required.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/package-templates/${packageTemplateId}/components`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not add package component.'));
      }

      setLabel('');
      setOperationalNotes('');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not add package component.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="form-row form-row-3">
        <label>
          Component type
          <select value={componentType} onChange={(event) => setComponentType(event.target.value as PackageTemplateComponentType)}>
            {COMPONENT_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Day
          <input type="number" min="1" max={durationDays} value={dayNumber} onChange={(event) => setDayNumber(event.target.value)} />
        </label>
        <label>
          Sort order
          <input type="number" min="0" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
        </label>
      </div>

      {componentType === 'EXCURSION_TEMPLATE' ? (
        <label>
          Excursion template
          <select value={excursionTemplateId} onChange={(event) => setExcursionTemplateId(event.target.value)} required>
            <option value="">Select excursion template</option>
            {excursionTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {componentType === 'ACTIVITY' ? (
        <label>
          Activity Master
          <select value={activityId} onChange={(event) => setActivityId(event.target.value)} required>
            <option value="">Select activity</option>
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {componentType === 'HOTEL' ? (
        <label>
          Hotel contract
          <select value={hotelContractId} onChange={(event) => setHotelContractId(event.target.value)} required>
            <option value="">Select hotel contract</option>
            {hotelContracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.hotel?.name || 'Hotel'} - {contract.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {componentType === 'TRANSPORT' ? (
        <div className="form-row form-row-3">
          <label>
            Route
            <select value={routeId} onChange={(event) => setRouteId(event.target.value)} required>
              <option value="">Select route</option>
              {routes.map((route) => (
                <option key={route.id} value={route.id}>
                  {route.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Pricing mode
            <select value={pricingMode} onChange={(event) => setPricingMode(event.target.value)}>
              {TRANSPORT_PRICING_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          <label>
            Service type
            <select value={transportServiceTypeId} onChange={(event) => setTransportServiceTypeId(event.target.value)}>
              <option value="">Optional service type</option>
              {transportServiceTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Transport service
            <select value={supplierServiceId} onChange={(event) => setSupplierServiceId(event.target.value)}>
              <option value="">Auto-match transport service</option>
              {transportServiceRecords.map((service) => (
                <option key={service.id} value={service.id}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}

      {componentType === 'TICKET' ? (
        <label>
          Ticketing service
          <select value={supplierServiceId} onChange={(event) => setSupplierServiceId(event.target.value)} required>
            <option value="">Select ticketing service</option>
            {ticketServices.map((service) => (
              <option key={service.id} value={service.id}>
                {service.entranceFee?.siteName || service.entranceFee?.name || service.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {componentType === 'SERVICE' ? (
        <label>
          Operational service
          <select value={supplierServiceId} onChange={(event) => setSupplierServiceId(event.target.value)} required>
            <option value="">Select operational service</option>
            {operationalServiceRecords.map((service) => (
              <option key={service.id} value={service.id}>
                {service.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label>
        Display label
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={selectedReferenceLabel || 'Component label'} />
      </label>
      <label>
        Operational notes
        <textarea rows={3} value={operationalNotes} onChange={(event) => setOperationalNotes(event.target.value)} />
      </label>
      <div className="form-row form-row-2">
        <label className="checkbox-field">
          <input type="checkbox" checked={isOptional} onChange={(event) => setIsOptional(event.target.checked)} />
          Optional component
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Active
        </label>
      </div>
      <button type="submit" className="primary-button" disabled={isSubmitting}>
        {isSubmitting ? 'Adding...' : 'Add operational component'}
      </button>
    </form>
  );
}
