'use client';

import { FormEvent, useMemo, useState } from 'react';
import { getErrorMessage, readJsonResponse } from '../../lib/api';

type Supplier = {
  id: string;
  name: string;
  type: string;
};

type Warning = {
  severity: 'blocker' | 'warning';
  field: string;
  message: string;
};

type PreviewRate = {
  roomType?: string;
  serviceName?: string;
  routeName?: string;
  occupancyType?: string;
  mealPlan?: string;
  seasonName?: string;
  cost?: number;
  currency?: string;
  uncertain?: boolean;
  notes?: string;
};

type ContractPreview = {
  contractType: 'HOTEL' | 'TRANSPORT' | 'ACTIVITY';
  supplier: {
    id?: string | null;
    name: string;
    isNew: boolean;
  };
  contract: {
    name: string;
    year?: number | null;
    validFrom?: string | null;
    validTo?: string | null;
    currency: string;
  };
  hotel?: {
    name: string;
    city: string;
    category: string;
  };
  roomCategories?: Array<{ name: string; code?: string | null; description?: string | null; uncertain?: boolean }>;
  seasons?: Array<{ name: string; validFrom?: string | null; validTo?: string | null; uncertain?: boolean }>;
  rates: PreviewRate[];
  mealPlans?: Array<{ code: string; isDefault?: boolean; notes?: string | null; uncertain?: boolean }>;
  taxes: Array<{ name: string; value: number; included: boolean; uncertain?: boolean }>;
  supplements: Array<{ name: string; amount?: number | null; notes?: string; uncertain?: boolean }>;
  policies: Array<{ name: string; value: string; uncertain?: boolean }>;
  cancellationPolicy?: Record<string, unknown> | null;
  childPolicy?: Record<string, unknown> | null;
  missingFields: string[];
  uncertainFields: string[];
};

type ContractImport = {
  id: string;
  status: string;
  extractedJson: unknown;
  approvedJson?: unknown | null;
  warnings?: Warning[] | null;
  errors?: Warning[] | null;
  sourceFileName: string;
};

type ContractImportFlowProps = {
  suppliers: Supplier[];
};

function emptyPreview(contractType: ContractPreview['contractType']): ContractPreview {
  return {
    contractType,
    supplier: { name: '', isNew: true },
    contract: { name: '', validFrom: '', validTo: '', currency: 'JOD' },
    hotel: contractType === 'HOTEL' ? { name: '', city: 'Amman', category: 'Unclassified' } : undefined,
    rates: [],
    taxes: [],
    supplements: [],
    policies: [],
    missingFields: [],
    uncertainFields: [],
  };
}

function stringifyPolicy(value: unknown, fallback: string) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return String(value);

  const record = value as Record<string, unknown>;
  return (
    String(record.summary || record.notes || '') ||
    Object.entries(record)
      .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== '')
      .map(([key, entryValue]) => `${key}: ${Array.isArray(entryValue) ? `${entryValue.length} item(s)` : String(entryValue)}`)
      .join(', ') ||
    fallback
  );
}

function mapExtractedToUI(extractedJson: unknown): ContractPreview {
  const source = (extractedJson && typeof extractedJson === 'object' ? extractedJson : {}) as Record<string, any>;
  const contractType = String(source.contractType || 'HOTEL').toUpperCase() as ContractPreview['contractType'];
  const contract = source.contract && typeof source.contract === 'object' ? source.contract : {};
  const supplier = source.supplier && typeof source.supplier === 'object' ? source.supplier : {};
  const hotel = source.hotel && typeof source.hotel === 'object' ? source.hotel : {};
  const cancellationPolicy = source.cancellationPolicy || null;
  const childPolicy = source.childPolicy || null;
  const policies = Array.isArray(source.policies) ? [...source.policies] : [];

  if (cancellationPolicy && !policies.some((policy) => /cancel/i.test(String(policy?.name || '')))) {
    policies.push({
      name: 'Cancellation policy',
      value: stringifyPolicy(cancellationPolicy, 'Cancellation policy extracted.'),
    });
  }

  if (childPolicy && !policies.some((policy) => /child/i.test(String(policy?.name || '')))) {
    policies.push({
      name: 'Child policy',
      value: stringifyPolicy(childPolicy, 'Child policy extracted.'),
    });
  }

  return {
    contractType,
    supplier: {
      id: supplier.id || null,
      name: String(supplier.name || source.supplierName || source.hotelName || ''),
      isNew: supplier.isNew ?? !supplier.id,
    },
    contract: {
      name: String(contract.name || source.contractName || source.hotelName || 'Imported Contract'),
      year: contract.year ?? source.contractYear ?? null,
      validFrom: contract.validFrom || source.contractStartDate || source.validFrom || '',
      validTo: contract.validTo || source.contractEndDate || source.validTo || '',
      currency: String(contract.currency || source.currency || 'JOD'),
    },
    hotel:
      contractType === 'HOTEL'
        ? {
            name: String(hotel.name || source.hotelName || supplier.name || ''),
            city: String(hotel.city || source.city || 'Amman'),
            category: String(hotel.category || source.category || 'Unclassified'),
          }
        : undefined,
    roomCategories: Array.isArray(source.roomCategories) ? source.roomCategories : [],
    seasons: Array.isArray(source.seasons) ? source.seasons : [],
    rates: Array.isArray(source.rates)
      ? source.rates.map((rate: any) => ({
          roomType: rate.roomType || rate.roomCategory || rate.roomName || '',
          serviceName: rate.serviceName || '',
          routeName: rate.routeName || '',
          occupancyType: rate.occupancyType || rate.occupancy || 'DBL',
          mealPlan: rate.mealPlan || 'BB',
          seasonName: rate.seasonName || rate.season || 'Imported',
          cost: typeof rate.cost === 'number' ? rate.cost : Number(rate.cost ?? rate.price ?? rate.rate) || undefined,
          currency: rate.currency || contract.currency || source.currency || 'JOD',
          uncertain: Boolean(rate.uncertain),
          notes: rate.notes || undefined,
        }))
      : [],
    mealPlans: Array.isArray(source.mealPlans) ? source.mealPlans : [],
    taxes: Array.isArray(source.taxes) ? source.taxes : [],
    supplements: Array.isArray(source.supplements)
      ? source.supplements.map((supplement: any) => ({
          name: supplement.name || supplement.type || 'Supplement',
          amount: supplement.amount ?? supplement.cost ?? null,
          notes: supplement.notes || supplement.chargeBasis || undefined,
          uncertain: Boolean(supplement.uncertain),
        }))
      : [],
    policies,
    cancellationPolicy,
    childPolicy,
    missingFields: Array.isArray(source.missingFields) ? source.missingFields : [],
    uncertainFields: Array.isArray(source.uncertainFields) ? source.uncertainFields : [],
  };
}

export function ContractImportFlow({ suppliers }: ContractImportFlowProps) {
  const [contractType, setContractType] = useState<ContractPreview['contractType']>('HOTEL');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [contractYear, setContractYear] = useState(String(new Date().getFullYear()));
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [contractImport, setContractImport] = useState<ContractImport | null>(null);
  const [preview, setPreview] = useState<ContractPreview>(emptyPreview('HOTEL'));
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const warnings = useMemo(() => contractImport?.warnings || [], [contractImport]);
  const blockers = warnings.filter((warning) => warning.severity === 'blocker');

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    console.log('Starting contract analysis');
    setError('');
    setMessage('');

    if (!file) {
      console.error('Analyze error', 'No contract file selected');
      setError('Choose a contract file before analyzing.');
      return;
    }

    const formData = new FormData();
    formData.set('contractType', contractType);
    formData.set('supplierId', supplierId);
    formData.set('supplierName', supplierName);
    formData.set('contractYear', contractYear);
    formData.set('validFrom', validFrom);
    formData.set('validTo', validTo);
    formData.set('file', file);

    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/contract-imports/analyze', {
        method: 'POST',
        body: formData,
      });
      const rawResponse = await response.text();
      console.log('Analyze response', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        rawResponse: rawResponse || '[empty response]',
      });

      if (!response.ok) {
        let message = 'Could not analyze contract.';
        try {
          const parsedError = rawResponse ? (JSON.parse(rawResponse) as { message?: string | string[]; error?: string }) : null;
          const parsedMessage = parsedError?.message;
          message = Array.isArray(parsedMessage) ? parsedMessage.join(', ') : parsedMessage || parsedError?.error || message;
        } catch {
          message = rawResponse || message;
        }
        throw new Error(message);
      }

      if (!rawResponse) {
        console.error('Analyze response was empty', {
          status: response.status,
          statusText: response.statusText,
        });
        throw new Error('Contract analysis returned an empty response.');
      }

      const data = JSON.parse(rawResponse) as ContractImport;
      if (!data.extractedJson) {
        console.error('Analyze response missing extractedJson', data);
        throw new Error('Contract analysis did not return extracted preview data.');
      }

      console.log('RAW CONTRACT IMPORT PREVIEW:', data.extractedJson);
      console.log("EXTRACTED RAW:", data.extractedJson);
      console.log("MAPPED PREVIEW:", mapExtractedToUI(data.extractedJson));
      const mappedPreview = mapExtractedToUI(data.extractedJson);
      setContractImport(data);
      setPreview(mappedPreview);
      setMessage('Contract analyzed. Review and edit extracted values before approval.');
    } catch (caughtError) {
      console.error('Analyze error', caughtError);
      setError(caughtError instanceof Error ? caughtError.message : 'Could not analyze contract.');
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleApprove() {
    if (!contractImport) return;
    setError('');
    setMessage('');
    setIsApproving(true);

    try {
      const response = await fetch(`/api/contract-imports/${contractImport.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: preview }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not approve contract import.'));
      }

      const data = await readJsonResponse<ContractImport>(response, 'Contract import approve');
      const mappedPreview = mapExtractedToUI(data.approvedJson || data.extractedJson);
      setContractImport(data);
      setPreview(mappedPreview);
      setMessage('Contract approved and imported.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not approve contract import.');
    } finally {
      setIsApproving(false);
    }
  }

  function updatePreview(next: Partial<ContractPreview>) {
    setPreview((current) => ({ ...current, ...next }));
  }

  function updateContract(field: keyof ContractPreview['contract'], value: string) {
    setPreview((current) => ({
      ...current,
      contract: { ...current.contract, [field]: field === 'year' ? Number(value) || null : value },
    }));
  }

  function updateSupplierName(value: string) {
    setPreview((current) => ({
      ...current,
      supplier: { ...current.supplier, name: value, isNew: !current.supplier.id },
    }));
  }

  function updateHotel(field: keyof NonNullable<ContractPreview['hotel']>, value: string) {
    setPreview((current) => ({
      ...current,
      hotel: { ...(current.hotel || { name: '', city: '', category: '' }), [field]: value },
    }));
  }

  function updateRate(index: number, field: keyof PreviewRate, value: string) {
    setPreview((current) => ({
      ...current,
      rates: current.rates.map((rate, rateIndex) =>
        rateIndex === index ? { ...rate, [field]: field === 'cost' ? Number(value) || 0 : value } : rate,
      ),
    }));
  }

  function addRate() {
    setPreview((current) => ({
      ...current,
      rates: [
        ...current.rates,
        {
          roomType: current.contractType === 'HOTEL' ? 'Standard' : '',
          serviceName: current.contractType === 'ACTIVITY' ? 'Activity service' : '',
          routeName: current.contractType === 'TRANSPORT' ? 'Route' : '',
          occupancyType: 'DBL',
          mealPlan: 'BB',
          seasonName: 'Imported',
          cost: 0,
          currency: current.contract.currency || 'JOD',
        },
      ],
    }));
  }

  return (
    <div className="contract-import-layout">
      <form className="form-card" onSubmit={handleAnalyze}>
        <div className="form-grid">
          <label>
            Contract type
            <select value={contractType} onChange={(event) => setContractType(event.target.value as ContractPreview['contractType'])}>
              <option value="HOTEL">Hotel</option>
              <option value="TRANSPORT">Transport</option>
              <option value="ACTIVITY">Activity</option>
            </select>
          </label>
          <label>
            Existing supplier
            <select value={supplierId} onChange={(event) => setSupplierId(event.target.value)}>
              <option value="">New supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            New supplier name
            <input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} disabled={Boolean(supplierId)} />
          </label>
          <label>
            Contract year
            <input value={contractYear} onChange={(event) => setContractYear(event.target.value)} inputMode="numeric" />
          </label>
          <label>
            Valid from
            <input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
          </label>
          <label>
            Valid to
            <input type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} />
          </label>
          <label className="wide-field">
            Contract file
            <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} />
          </label>
        </div>
        <button className="primary-button" type="submit" disabled={isAnalyzing}>
          {isAnalyzing ? 'Analyzing...' : 'Analyze contract'}
        </button>
      </form>

      {error ? <div className="form-error">{error}</div> : null}
      {message ? <div className="success-message">{message}</div> : null}

      {contractImport ? (
        <section className="table-section">
          <div className="section-header">
            <div>
              <h2>Review extracted data</h2>
              <p>{contractImport.sourceFileName} | Status: {contractImport.status}</p>
            </div>
            <button className="primary-button" onClick={handleApprove} disabled={isApproving || blockers.length > 0}>
              {isApproving ? 'Importing...' : 'Approve import'}
            </button>
          </div>

          {warnings.length > 0 ? (
            <div className="warning-list">
              {warnings.map((warning) => (
                <p key={`${warning.field}-${warning.message}`} className={warning.severity === 'blocker' ? 'form-error' : 'empty-state'}>
                  {warning.message}
                </p>
              ))}
            </div>
          ) : null}

          <div className="form-grid">
            <label>
              Supplier
              <input value={preview.supplier.name} onChange={(event) => updateSupplierName(event.target.value)} />
            </label>
            <label>
              Contract name
              <input value={preview.contract.name} onChange={(event) => updateContract('name', event.target.value)} />
            </label>
            <label>
              Currency
              <input value={preview.contract.currency} onChange={(event) => updateContract('currency', event.target.value.toUpperCase())} />
            </label>
            <label>
              Valid from
              <input value={preview.contract.validFrom || ''} type="date" onChange={(event) => updateContract('validFrom', event.target.value)} />
            </label>
            <label>
              Valid to
              <input value={preview.contract.validTo || ''} type="date" onChange={(event) => updateContract('validTo', event.target.value)} />
            </label>
            {preview.contractType === 'HOTEL' ? (
              <>
                <label>
                  Hotel
                  <input value={preview.hotel?.name || ''} onChange={(event) => updateHotel('name', event.target.value)} />
                </label>
                <label>
                  City
                  <input value={preview.hotel?.city || ''} onChange={(event) => updateHotel('city', event.target.value)} />
                </label>
                <label>
                  Category
                  <input value={preview.hotel?.category || ''} onChange={(event) => updateHotel('category', event.target.value)} />
                </label>
              </>
            ) : null}
          </div>

          <div className="section-header">
            <h3>Rates</h3>
            <button className="secondary-button" type="button" onClick={addRate}>
              Add rate
            </button>
          </div>
          <PreviewList title="Room categories" items={preview.roomCategories || []} empty="No room categories extracted." />
          <PreviewList title="Seasons" items={preview.seasons || []} empty="No seasons extracted." />
          {preview.rates.length === 0 ? <p className="empty-state">No rates extracted yet. Add rates before approval if needed.</p> : null}
          {preview.rates.length > 0 ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{preview.contractType === 'HOTEL' ? 'Room' : 'Service/Route'}</th>
                    <th>Season</th>
                    <th>Occupancy</th>
                    <th>Meal</th>
                    <th>Cost</th>
                    <th>Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rates.map((rate, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          value={preview.contractType === 'TRANSPORT' ? rate.routeName || '' : rate.roomType || rate.serviceName || ''}
                          onChange={(event) =>
                            updateRate(index, preview.contractType === 'TRANSPORT' ? 'routeName' : preview.contractType === 'HOTEL' ? 'roomType' : 'serviceName', event.target.value)
                          }
                        />
                      </td>
                      <td><input value={rate.seasonName || ''} onChange={(event) => updateRate(index, 'seasonName', event.target.value)} /></td>
                      <td><input value={rate.occupancyType || ''} onChange={(event) => updateRate(index, 'occupancyType', event.target.value)} /></td>
                      <td><input value={rate.mealPlan || ''} onChange={(event) => updateRate(index, 'mealPlan', event.target.value)} /></td>
                      <td><input value={String(rate.cost ?? '')} onChange={(event) => updateRate(index, 'cost', event.target.value)} inputMode="decimal" /></td>
                      <td><input value={rate.currency || ''} onChange={(event) => updateRate(index, 'currency', event.target.value.toUpperCase())} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <PreviewList title="Meal plans" items={preview.mealPlans || []} empty="No meal plans extracted." />
          <PreviewList title="Taxes and service charges" items={preview.taxes} empty="No taxes or service charges extracted." />
          <PreviewList title="Supplements and add-ons" items={preview.supplements} empty="No supplements extracted." />
          <PreviewObject title="Cancellation policy" value={preview.cancellationPolicy} empty="No cancellation policy extracted." />
          <PreviewObject title="Child policy" value={preview.childPolicy} empty="No child policy extracted." />
          <PreviewList title="Policies" items={preview.policies} empty="No policies extracted." />
        </section>
      ) : null}
    </div>
  );
}

function PreviewList({ title, items, empty }: { title: string; items: Array<Record<string, unknown>>; empty: string }) {
  return (
    <section>
      <h3>{title}</h3>
      {items.length === 0 ? <p className="empty-state">{empty}</p> : null}
      {items.length > 0 ? (
        <div className="summary-strip">
          {items.map((item, index) => (
            <div className="summary-card" key={index}>
              {Object.entries(item).map(([key, value]) => (
                <p key={key}>
                  <span>{key}</span>
                  <strong>{String(value)}</strong>
                </p>
              ))}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function PreviewObject({ title, value, empty }: { title: string; value?: Record<string, unknown> | null; empty: string }) {
  if (!value || Object.keys(value).length === 0) {
    return (
      <section>
        <h3>{title}</h3>
        <p className="empty-state">{empty}</p>
      </section>
    );
  }

  return (
    <section>
      <h3>{title}</h3>
      <pre className="raw-preview-block">{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}
