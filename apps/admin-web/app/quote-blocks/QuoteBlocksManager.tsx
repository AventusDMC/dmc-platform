'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';

type ServiceType = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
};

type SupplierService = {
  id: string;
  name: string;
  category: string;
  serviceTypeId?: string | null;
  serviceType?: ServiceType | null;
  unitType: string;
  baseCost: number;
  currency: string;
};

type QuoteBlock = {
  id: string;
  name: string;
  type: 'ITINERARY_DAY' | 'SERVICE_BLOCK';
  title: string;
  description: string | null;
  defaultServiceId: string | null;
  defaultServiceTypeId: string | null;
  defaultCategory: string | null;
  defaultCost: number | null;
  defaultSell: number | null;
  defaultService?: SupplierService | null;
  defaultServiceType?: ServiceType | null;
};

type QuoteBlocksManagerProps = {
  apiBaseUrl: string;
  blocks: QuoteBlock[];
  services: SupplierService[];
  serviceTypes: ServiceType[];
};

const BLOCK_TYPE_OPTIONS = [
  { value: 'ITINERARY_DAY', label: 'Itinerary day' },
  { value: 'SERVICE_BLOCK', label: 'Service block' },
] as const;

export function QuoteBlocksManager({ apiBaseUrl, blocks, services, serviceTypes }: QuoteBlocksManagerProps) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'ITINERARY_DAY' | 'SERVICE_BLOCK'>('ITINERARY_DAY');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [defaultServiceTypeId, setDefaultServiceTypeId] = useState('');
  const [defaultServiceId, setDefaultServiceId] = useState('');
  const [defaultCategory, setDefaultCategory] = useState('');
  const [defaultCost, setDefaultCost] = useState('');
  const [defaultSell, setDefaultSell] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const filteredServices = useMemo(() => {
    if (!defaultServiceTypeId) {
      return services;
    }

    return services.filter((service) => service.serviceTypeId === defaultServiceTypeId);
  }, [defaultServiceTypeId, services]);

  function resetForm() {
    setEditingId(null);
    setName('');
    setType('ITINERARY_DAY');
    setTitle('');
    setDescription('');
    setDefaultServiceTypeId('');
    setDefaultServiceId('');
    setDefaultCategory('');
    setDefaultCost('');
    setDefaultSell('');
    setError('');
  }

  function handleEdit(block: QuoteBlock) {
    setEditingId(block.id);
    setName(block.name);
    setType(block.type);
    setTitle(block.title);
    setDescription(block.description || '');
    setDefaultServiceTypeId(block.defaultServiceTypeId || block.defaultService?.serviceTypeId || '');
    setDefaultServiceId(block.defaultServiceId || '');
    setDefaultCategory(block.defaultCategory || '');
    setDefaultCost(block.defaultCost === null ? '' : String(block.defaultCost));
    setDefaultSell(block.defaultSell === null ? '' : String(block.defaultSell));
    setError('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/quote-blocks${editingId ? `/${editingId}` : ''}`, {
        method: editingId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          type,
          title,
          description: description.trim() || null,
          defaultServiceTypeId: type === 'SERVICE_BLOCK' ? defaultServiceTypeId || null : null,
          defaultServiceId: type === 'SERVICE_BLOCK' ? defaultServiceId || null : null,
          defaultCategory: type === 'SERVICE_BLOCK' ? defaultCategory.trim() || null : null,
          defaultCost: type === 'SERVICE_BLOCK' && defaultCost.trim() ? Number(defaultCost) : null,
          defaultSell: type === 'SERVICE_BLOCK' && defaultSell.trim() ? Number(defaultSell) : null,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${editingId ? 'update' : 'create'} block.`));
      }

      resetForm();
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save block.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const confirmed = window.confirm('Delete this quote block?');

    if (!confirmed) {
      return;
    }

    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/quote-blocks/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete block.'));
      }

      if (editingId === id) {
        resetForm();
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete block.');
    }
  }

  return (
    <div className="workspace-shell">
      <section className="workspace-section">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Block Editor</p>
            <h2>{editingId ? 'Edit reusable block' : 'Create reusable block'}</h2>
          </div>
        </div>

        <form className="entity-form" onSubmit={handleSubmit}>
          <div className="form-row form-row-2">
            <label>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Block type
              <select value={type} onChange={(event) => setType(event.target.value as 'ITINERARY_DAY' | 'SERVICE_BLOCK')}>
                {BLOCK_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </label>

          <label>
            Description
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={type === 'ITINERARY_DAY' ? 5 : 4}
              placeholder={type === 'ITINERARY_DAY' ? 'Client-facing itinerary copy' : 'Internal description or usage notes'}
            />
          </label>

          {type === 'SERVICE_BLOCK' ? (
            <>
              <div className="form-row form-row-3">
                <label>
                  Default service type
                  <select value={defaultServiceTypeId} onChange={(event) => setDefaultServiceTypeId(event.target.value)}>
                    <option value="">No default service type</option>
                    {serviceTypes.map((serviceType) => (
                      <option key={serviceType.id} value={serviceType.id}>
                        {serviceType.name}
                        {serviceType.code ? ` (${serviceType.code})` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Default service
                  <select value={defaultServiceId} onChange={(event) => setDefaultServiceId(event.target.value)}>
                    <option value="">No default service</option>
                    {filteredServices.map((service) => (
                      <option key={service.id} value={service.id}>
                        {service.name} ({service.unitType})
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Fallback category
                  <input
                    value={defaultCategory}
                    onChange={(event) => setDefaultCategory(event.target.value)}
                    placeholder="Transfer, Guide, Activity..."
                  />
                </label>
              </div>

              <div className="form-row form-row-2">
                <label>
                  Default cost
                  <input value={defaultCost} onChange={(event) => setDefaultCost(event.target.value)} type="number" min="0" step="0.01" />
                </label>
                <label>
                  Default sell
                  <input value={defaultSell} onChange={(event) => setDefaultSell(event.target.value)} type="number" min="0" step="0.01" />
                </label>
              </div>
            </>
          ) : null}

          <div className="form-row">
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : editingId ? 'Save block' : 'Create block'}
            </button>
            {editingId ? (
              <button type="button" className="secondary-button" onClick={resetForm}>
                Cancel edit
              </button>
            ) : null}
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      </section>

      <section className="workspace-section">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Saved Blocks</p>
            <h2>Reusable itinerary and service building blocks</h2>
          </div>
        </div>

        {blocks.length === 0 ? (
          <p className="empty-state">No reusable blocks created yet.</p>
        ) : (
          <div className="quote-item-list">
            {blocks.map((block) => (
              <article key={block.id} className="workspace-summary-card">
                <span>{BLOCK_TYPE_OPTIONS.find((option) => option.value === block.type)?.label || block.type}</span>
                <strong>{block.name}</strong>
                <p>{block.title}</p>
                {block.description ? <p className="support-template-content">{block.description}</p> : null}
                {block.type === 'SERVICE_BLOCK' ? (
                  <p className="detail-copy">
                    {[block.defaultService?.name, block.defaultServiceType?.name || block.defaultCategory]
                      .filter(Boolean)
                      .join(' | ') || 'No default references'}
                    {(block.defaultCost !== null || block.defaultSell !== null) &&
                    ` | Cost ${block.defaultCost?.toFixed(2) || 'n/a'} | Sell ${block.defaultSell?.toFixed(2) || 'n/a'}`}
                  </p>
                ) : null}
                <div className="form-row">
                  <button type="button" className="secondary-button" onClick={() => handleEdit(block)}>
                    Edit
                  </button>
                  <button type="button" className="secondary-button" onClick={() => handleDelete(block.id)}>
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
