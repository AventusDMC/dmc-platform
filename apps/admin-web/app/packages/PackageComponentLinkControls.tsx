'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';
import type { PackageTemplateComponent, PackageTemplateComponentType } from './types';

type LinkOption = { id: string; label: string };

type PackageComponentLinkControlsProps = {
  apiBaseUrl: string;
  packageTemplateId: string;
  component: PackageTemplateComponent;
  options: LinkOption[];
};

const FK_FIELD: Partial<Record<PackageTemplateComponentType, keyof PackageTemplateComponent>> = {
  HOTEL: 'hotelContractId',
  ACTIVITY: 'activityId',
  EXCURSION_TEMPLATE: 'excursionTemplateId',
  TRANSPORT: 'routeId',
  TICKET: 'supplierServiceId',
  ENTRANCE: 'supplierServiceId',
  SERVICE: 'supplierServiceId',
  DINING: 'supplierServiceId',
  MEAL: 'supplierServiceId',
  GUIDE: 'supplierServiceId',
  OTHER: 'supplierServiceId',
};

export function PackageComponentLinkControls({ apiBaseUrl, packageTemplateId, component, options }: PackageComponentLinkControlsProps) {
  const router = useRouter();
  const fkField = FK_FIELD[component.componentType];
  const currentId = fkField ? ((component[fkField] as string | null) ?? '') : '';
  const [isOpen, setIsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(currentId);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!fkField || options.length === 0) {
    return null;
  }

  const isLinked = Boolean(currentId);

  async function save() {
    setIsSaving(true);
    setError('');

    try {
      const payload = {
        componentType: component.componentType,
        dayNumber: component.dayNumber,
        label: component.label,
        sortOrder: component.sortOrder,
        isOptional: component.isOptional,
        active: component.active,
        operationalNotes: component.operationalNotes,
        excursionTemplateId: fkField === 'excursionTemplateId' ? selectedId || null : null,
        activityId: fkField === 'activityId' ? selectedId || null : null,
        hotelContractId: fkField === 'hotelContractId' ? selectedId || null : null,
        routeId: fkField === 'routeId' ? selectedId || null : null,
        transportServiceTypeId: component.transportServiceTypeId,
        pricingMode: component.pricingMode,
        supplierServiceId: fkField === 'supplierServiceId' ? selectedId || null : null,
      };

      const response = await fetch(`${apiBaseUrl}/package-templates/${packageTemplateId}/components/${component.id}`, {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not link this component.'));
      }

      setIsOpen(false);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not link this component.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <button type="button" className={isLinked ? 'compact-button' : 'secondary-button'} onClick={() => setIsOpen(true)}>
        {isLinked ? 'Relink' : 'Link'}
      </button>
    );
  }

  return (
    <span className="table-action-group" onClick={(event) => event.stopPropagation()}>
      {error ? <span className="form-error">{error}</span> : null}
      <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={isSaving} aria-label="Link to catalog record">
        <option value="">— Not linked —</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <button type="button" className="primary-button" onClick={save} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save'}
      </button>
      <button
        type="button"
        className="compact-button"
        onClick={() => {
          setSelectedId(currentId);
          setIsOpen(false);
          setError('');
        }}
        disabled={isSaving}
      >
        Cancel
      </button>
    </span>
  );
}
