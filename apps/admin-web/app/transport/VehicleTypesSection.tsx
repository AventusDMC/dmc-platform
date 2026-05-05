'use client';

import { FormEvent, Fragment, useEffect, useState } from 'react';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import {
  buildVehicleTypeOption,
  getDefaultVehicleTypeOptions,
  getVehicleTypeOptionsWithFallback,
  readStoredVehicleTypeOptions,
  writeStoredVehicleTypeOptions,
  type VehicleTypeOption,
} from '../lib/vehicle-types';

type VehicleTypeFormProps = {
  initialLabel?: string;
  submitLabel?: string;
  onSubmit: (label: string) => void;
};

function VehicleTypeForm({ initialLabel = '', submitLabel = 'Add vehicle type', onSubmit }: VehicleTypeFormProps) {
  const [label, setLabel] = useState(initialLabel);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextLabel = label.trim();

    if (!nextLabel) {
      return;
    }

    onSubmit(nextLabel);
    if (!initialLabel) {
      setLabel('');
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <label>
        Label
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Sedan, Van, Coach" required />
      </label>

      <button type="submit">{submitLabel}</button>
    </form>
  );
}

export function VehicleTypesSection() {
  const [vehicleTypes, setVehicleTypes] = useState<VehicleTypeOption[]>(getDefaultVehicleTypeOptions());
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setVehicleTypes(readStoredVehicleTypeOptions());
  }, []);

  function saveVehicleTypes(nextVehicleTypes: VehicleTypeOption[]) {
    const normalized = getVehicleTypeOptionsWithFallback(nextVehicleTypes);
    setVehicleTypes(normalized);
    writeStoredVehicleTypeOptions(normalized);
  }

  function handleAdd(label: string) {
    const nextOption = buildVehicleTypeOption(label);

    if (vehicleTypes.some((option) => option.id === nextOption.id)) {
      return;
    }

    saveVehicleTypes([...vehicleTypes, nextOption]);
  }

  function handleEdit(vehicleType: VehicleTypeOption, label: string) {
    const nextOption = buildVehicleTypeOption(label);
    saveVehicleTypes(vehicleTypes.map((option) => (option.id === vehicleType.id ? nextOption : option)));
    setEditingId(null);
  }

  function handleDelete(vehicleType: VehicleTypeOption) {
    if (!window.confirm(`Delete ${vehicleType.label}?`)) {
      return;
    }

    saveVehicleTypes(vehicleTypes.filter((option) => option.id !== vehicleType.id));
    if (editingId === vehicleType.id) {
      setEditingId(null);
    }
  }

  return (
    <section className="table-section-shell app-card app-section app-table-section">
      <div className="section-header-card app-section-header">
        <div className="section-header-copy">
          <h2 className="section-header-title">Vehicle Types</h2>
          <p>Maintain the configurable fleet taxonomy used by vehicle setup and quote transport selection.</p>
        </div>
        <div className="section-header-side">
          <div className="section-header-context">
            <p>{vehicleTypes.length} vehicle types in scope</p>
          </div>
        </div>
      </div>

      <div className="table-section-create">
        <CollapsibleCreatePanel title="Create vehicle type" description="Add reusable vehicle type labels." triggerLabelOpen="Add vehicle type">
          <VehicleTypeForm onSubmit={handleAdd} />
        </CollapsibleCreatePanel>
      </div>

      <div className="table-section-body app-table-section-body">
        <div className="entity-list allotment-table-stack">
          <div className="table-wrap">
            <table className="data-table allotment-table">
              <thead>
                <tr>
                  <th>Vehicle type</th>
                  <th>Label</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicleTypes.map((vehicleType) => {
                  const isEditing = editingId === vehicleType.id;

                  return (
                    <Fragment key={vehicleType.id}>
                      <tr>
                        <td>
                          <strong>{vehicleType.label}</strong>
                        </td>
                        <td>{vehicleType.label}</td>
                        <td>
                          <div className="table-action-row">
                            <button type="button" className="compact-button" onClick={() => setEditingId((current) => (current === vehicleType.id ? null : vehicleType.id))}>
                              {isEditing ? 'Close edit' : 'Edit'}
                            </button>
                            <button type="button" className="compact-button compact-button-danger" onClick={() => handleDelete(vehicleType)}>
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isEditing ? (
                        <tr>
                          <td colSpan={3}>
                            <InlineRowEditorShell>
                              <VehicleTypeForm initialLabel={vehicleType.label} submitLabel="Save vehicle type" onSubmit={(label) => handleEdit(vehicleType, label)} />
                            </InlineRowEditorShell>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
