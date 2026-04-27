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
  seasonFrom?: string;
  seasonTo?: string;
  cost?: number;
  currency?: string;
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM';
  salesTaxPercent?: number | null;
  serviceChargePercent?: number | null;
  salesTaxIncluded?: boolean | null;
  serviceChargeIncluded?: boolean | null;
  uncertain?: boolean;
  notes?: string;
};

type RatePolicyPreview = {
  policyType: string;
  appliesTo?: string | null;
  ageFrom?: number | null;
  ageTo?: number | null;
  amount?: number | null;
  percent?: number | null;
  currency?: string | null;
  pricingBasis?: 'PER_PERSON' | 'PER_ROOM';
  mealPlan?: string | null;
  notes?: string | null;
};

type CancellationRulePreview = {
  daysBefore?: number;
  penaltyPercent?: number;
  windowFromValue: number;
  windowToValue: number;
  deadlineUnit: 'DAYS' | 'HOURS' | string;
  penaltyType: 'PERCENT' | 'NIGHTS' | 'FULL_STAY' | 'FIXED' | string;
  penaltyValue?: number | null;
  notes?: string | null;
};

type CancellationPolicyPreview = {
  summary?: string | null;
  notes?: string | null;
  noShowPenaltyType?: string | null;
  noShowPenaltyValue?: number | null;
  rules?: CancellationRulePreview[];
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
  supplements: Array<{ name: string; amount?: number | null; pricingBasis?: 'PER_PERSON' | 'PER_ROOM'; notes?: string; uncertain?: boolean }>;
  policies: Array<{ name: string; value: string; uncertain?: boolean }>;
  ratePolicies?: RatePolicyPreview[];
  cancellationPolicy?: CancellationPolicyPreview | null;
  childPolicy?: { rules: string[] } | null;
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

type ContractConflict = {
  code: 'CONTRACT_EXISTS';
  message: string;
  existingContract?: {
    id: string;
    name: string;
    validFrom?: string;
    validTo?: string;
  };
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
    ratePolicies: [],
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

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const normalized = Number(String(value).replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(normalized) ? normalized : null;
}

function deriveTaxes(source: Record<string, any>, rates: PreviewRate[]) {
  const meta = source.meta && typeof source.meta === 'object' ? source.meta : {};
  const rateTaxPercent = rates.map((rate) => optionalNumber(rate.salesTaxPercent)).find((value) => value !== null) ?? null;
  const rateServicePercent = rates.map((rate) => optionalNumber(rate.serviceChargePercent)).find((value) => value !== null) ?? null;
  const defaultTaxPercent = optionalNumber(meta.defaultTaxPercent);
  const defaultServicePercent = optionalNumber(meta.defaultServicePercent);
  const salesTaxPercent = rateTaxPercent ?? defaultTaxPercent;
  const serviceChargePercent = rateServicePercent ?? defaultServicePercent;
  const taxes: ContractPreview['taxes'] = [];

  if (salesTaxPercent !== null) {
    taxes.push({
      name: 'Government Tax',
      value: salesTaxPercent,
      included: Boolean(rates.find((rate) => optionalNumber(rate.salesTaxPercent) !== null)?.salesTaxIncluded ?? meta.taxIncluded),
    });
  }

  if (serviceChargePercent !== null) {
    taxes.push({
      name: 'Service Charge',
      value: serviceChargePercent,
      included: Boolean(rates.find((rate) => optionalNumber(rate.serviceChargePercent) !== null)?.serviceChargeIncluded ?? meta.serviceIncluded),
    });
  }

  return taxes;
}

function formatAgeRange(policy: RatePolicyPreview) {
  if (policy.ageFrom !== null && policy.ageFrom !== undefined && policy.ageTo !== null && policy.ageTo !== undefined) {
    return `${policy.ageFrom}-${policy.ageTo}`;
  }

  if (policy.ageFrom !== null && policy.ageFrom !== undefined) {
    return `${policy.ageFrom}+`;
  }

  if (policy.ageTo !== null && policy.ageTo !== undefined) {
    return `0-${policy.ageTo}`;
  }

  return 'eligible';
}

function normalizePricingBasis(value: unknown): 'PER_PERSON' | 'PER_ROOM' | undefined {
  const raw = String(value || '').trim();
  if (!raw) return undefined;
  if (/\bper\s+person\b|\bpp\b|\bper\s+pax\b/i.test(raw)) return 'PER_PERSON';
  if (/\bper\s+room\b|\bper\s+unit\b/i.test(raw)) return 'PER_ROOM';

  const normalized = raw.replace(/[\s-]+/g, '_').toUpperCase();
  if (normalized === 'PER_PERSON' || normalized === 'PERSON' || normalized === 'PAX') return 'PER_PERSON';
  if (normalized === 'PER_ROOM' || normalized === 'ROOM' || normalized === 'UNIT') return 'PER_ROOM';
  return undefined;
}

function formatChildPolicy(policy: RatePolicyPreview) {
  const policyType = String(policy.policyType || '').trim().toUpperCase();
  const ageRange = formatAgeRange(policy);

  if (policyType === 'CHILD_FREE') {
    return `Children ${ageRange} free`;
  }

  if (policyType === 'CHILD_DISCOUNT') {
    const percent = optionalNumber(policy.percent);
    return `Children ${ageRange} pay ${percent !== null ? `${percent}%` : 'discounted rate'}`;
  }

  return '';
}

function deriveChildPolicy(ratePolicies: RatePolicyPreview[]) {
  const rules = ratePolicies
    .filter((policy) => {
      const policyType = String(policy.policyType || '').trim().toUpperCase();
      return policyType === 'CHILD_FREE' || policyType === 'CHILD_DISCOUNT';
    })
    .map(formatChildPolicy)
    .filter(Boolean);

  return rules.length > 0 ? { rules } : null;
}

function mapExtractedToUI(extractedJson: unknown): ContractPreview {
  const source = (extractedJson && typeof extractedJson === 'object' ? extractedJson : {}) as Record<string, any>;
  const contractType = String(source.contractType || 'HOTEL').toUpperCase() as ContractPreview['contractType'];
  const contract = source.contract && typeof source.contract === 'object' ? source.contract : {};
  const supplier = source.supplier && typeof source.supplier === 'object' ? source.supplier : {};
  const hotel = source.hotel && typeof source.hotel === 'object' ? source.hotel : {};
  const cancellationPolicy = normalizeCancellationPolicy(source.cancellationPolicy || null);
  const policies = Array.isArray(source.policies) ? [...source.policies] : [];

  if (cancellationPolicy && !policies.some((policy) => /cancel/i.test(String(policy?.name || '')))) {
    policies.push({
      name: 'Cancellation policy',
      value: stringifyPolicy(cancellationPolicy, 'Cancellation policy extracted.'),
    });
  }

  const rates: PreviewRate[] = Array.isArray(source.rates)
    ? source.rates.map((rate: any) => ({
        roomType: rate.roomType || rate.roomCategory || rate.roomName || '',
        serviceName: rate.serviceName || '',
        routeName: rate.routeName || '',
        occupancyType: rate.occupancyType || rate.occupancy || 'DBL',
        mealPlan: rate.mealPlan || 'BB',
        seasonName: rate.seasonName || rate.season || 'Imported',
        seasonFrom: rate.seasonFrom || '',
        seasonTo: rate.seasonTo || '',
        cost: typeof rate.cost === 'number' ? rate.cost : Number(rate.cost ?? rate.price ?? rate.rate) || undefined,
        currency: rate.currency || contract.currency || source.currency || 'JOD',
        pricingBasis: normalizePricingBasis(rate.pricingBasis),
        salesTaxPercent: rate.salesTaxPercent ?? null,
        serviceChargePercent: rate.serviceChargePercent ?? null,
        salesTaxIncluded: rate.salesTaxIncluded ?? null,
        serviceChargeIncluded: rate.serviceChargeIncluded ?? null,
        uncertain: Boolean(rate.uncertain),
        notes: rate.notes || undefined,
      }))
    : [];
  const ratePolicies: RatePolicyPreview[] = Array.isArray(source.ratePolicies)
    ? source.ratePolicies.map((policy: any) => ({
        policyType: String(policy.policyType || policy.type || ''),
        appliesTo: policy.appliesTo || null,
        ageFrom: policy.ageFrom ?? null,
        ageTo: policy.ageTo ?? null,
        amount: policy.amount ?? null,
        percent: policy.percent ?? null,
        currency: policy.currency || contract.currency || source.currency || 'JOD',
        pricingBasis: normalizePricingBasis(policy.pricingBasis),
        mealPlan: policy.mealPlan || null,
        notes: policy.notes || null,
      }))
    : [];
  const childPolicy = deriveChildPolicy(ratePolicies);

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
    rates,
    mealPlans: Array.isArray(source.mealPlans) ? source.mealPlans : [],
    taxes: deriveTaxes(source, rates),
    supplements: Array.isArray(source.supplements)
      ? source.supplements.map((supplement: any) => ({
          name: supplement.name || supplement.type || 'Supplement',
          amount: supplement.amount ?? supplement.cost ?? null,
          pricingBasis: normalizePricingBasis(supplement.pricingBasis),
          notes: supplement.notes || supplement.chargeBasis || undefined,
          uncertain: Boolean(supplement.uncertain),
        }))
      : [],
    policies,
    ratePolicies,
    cancellationPolicy,
    childPolicy,
    missingFields: Array.isArray(source.missingFields) ? source.missingFields : [],
    uncertainFields: Array.isArray(source.uncertainFields) ? source.uncertainFields : [],
  };
}

function normalizeCancellationPolicy(value: unknown): CancellationPolicyPreview | null {
  if (!value || typeof value !== 'object') return null;
  const policy = value as Record<string, any>;
  return {
    summary: policy.summary || null,
    notes: policy.notes || null,
    noShowPenaltyType: policy.noShowPenaltyType || null,
    noShowPenaltyValue: policy.noShowPenaltyValue ?? null,
    rules: Array.isArray(policy.rules)
      ? policy.rules.map((rule: any) => ({
          daysBefore: Number(rule.daysBefore ?? rule.windowFromValue ?? 0),
          penaltyPercent: rule.penaltyPercent ?? (rule.penaltyType === 'PERCENT' ? rule.penaltyValue : undefined),
          windowFromValue: Number(rule.windowFromValue ?? rule.daysBefore ?? 0),
          windowToValue: Number(rule.windowToValue ?? 0),
          deadlineUnit: rule.deadlineUnit || 'DAYS',
          penaltyType: rule.penaltyType || 'PERCENT',
          penaltyValue: rule.penaltyValue ?? rule.penaltyPercent ?? null,
          notes: rule.notes || null,
        }))
      : [],
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
  const [contractConflict, setContractConflict] = useState<ContractConflict | null>(null);

  const warnings = useMemo(() => contractImport?.warnings || [], [contractImport]);
  const blockers = warnings.filter((warning) => warning.severity === 'blocker');

  async function handleAnalyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    console.log('Starting contract analysis');
    setError('');
    setMessage('');
    setContractConflict(null);

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

  async function handleApprove(mode?: 'replace' | 'version') {
    if (!contractImport) return;
    setError('');
    setMessage('');
    setIsApproving(true);

    try {
      const response = await fetch(`/api/contract-imports/${contractImport.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: contractImport.extractedJson, mode }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        if (payload?.code === 'CONTRACT_EXISTS') {
          setContractConflict(payload as ContractConflict);
          setMessage('');
          return;
        }
        const parsedMessage = Array.isArray(payload?.message) ? payload.message.join(', ') : payload?.message || payload?.error;
        throw new Error(parsedMessage || (await getErrorMessage(response, 'Could not approve contract import.')));
      }

      const data = await readJsonResponse<ContractImport>(response, 'Contract import approve');
      const mappedPreview = mapExtractedToUI(data.approvedJson || data.extractedJson);
      setContractImport(data);
      setPreview(mappedPreview);
      setContractConflict(null);
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
        rateIndex === index
          ? {
              ...rate,
              [field]: ['cost', 'salesTaxPercent', 'serviceChargePercent'].includes(field)
                ? Number(value) || 0
                : ['salesTaxIncluded', 'serviceChargeIncluded'].includes(field)
                  ? value === 'true'
                  : value,
            }
          : rate,
      ),
    }));
  }

  function updateRatePolicy(index: number, field: keyof RatePolicyPreview, value: string) {
    setPreview((current) => ({
      ...current,
      ratePolicies: (current.ratePolicies || []).map((policy, policyIndex) =>
        policyIndex === index
          ? {
              ...policy,
              [field]: ['ageFrom', 'ageTo', 'amount', 'percent'].includes(field) ? Number(value) || 0 : value,
            }
          : policy,
      ),
    }));
  }

  function addRatePolicy() {
    setPreview((current) => ({
      ...current,
      ratePolicies: [
        ...(current.ratePolicies || []),
        {
          policyType: 'CHILD_DISCOUNT',
          appliesTo: 'All rooms',
          ageFrom: 6,
          ageTo: 11,
          amount: null,
          percent: 50,
          currency: current.contract.currency || 'JOD',
          pricingBasis: 'PER_PERSON',
          mealPlan: 'BB',
          notes: '',
        },
      ],
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
          pricingBasis: 'PER_ROOM',
        },
      ],
    }));
  }

  function updateCancellationPolicy(field: keyof CancellationPolicyPreview, value: string) {
    setPreview((current) => ({
      ...current,
      cancellationPolicy: {
        ...(current.cancellationPolicy || { rules: [] }),
        [field]: field === 'noShowPenaltyValue' ? Number(value) || null : value,
      },
    }));
  }

  function updateCancellationRule(index: number, field: keyof CancellationRulePreview, value: string) {
    setPreview((current) => {
      const policy = current.cancellationPolicy || { rules: [] };
      const rules = policy.rules || [];
      return {
        ...current,
        cancellationPolicy: {
          ...policy,
          rules: rules.map((rule, ruleIndex) => {
            if (ruleIndex !== index) return rule;
            const numericFields: Array<keyof CancellationRulePreview> = ['daysBefore', 'penaltyPercent', 'windowFromValue', 'windowToValue', 'penaltyValue'];
            const nextValue = numericFields.includes(field) ? Number(value) || 0 : value;
            const nextRule = { ...rule, [field]: nextValue };
            if (field === 'daysBefore') {
              nextRule.windowFromValue = Number(value) || 0;
            }
            if (field === 'penaltyPercent') {
              nextRule.penaltyType = 'PERCENT';
              nextRule.penaltyValue = Number(value) || 0;
            }
            return nextRule;
          }),
        },
      };
    });
  }

  function addCancellationRule() {
    setPreview((current) => ({
      ...current,
      cancellationPolicy: {
        ...(current.cancellationPolicy || {
          summary: 'Cancellation policy extracted from contract.',
          notes: null,
          noShowPenaltyType: 'FULL_STAY',
          noShowPenaltyValue: null,
        }),
        rules: [
          ...(current.cancellationPolicy?.rules || []),
          {
            daysBefore: 1,
            penaltyPercent: 100,
            windowFromValue: 1,
            windowToValue: 0,
            deadlineUnit: 'DAYS',
            penaltyType: 'PERCENT',
            penaltyValue: 100,
            notes: 'Manual cancellation rule.',
          },
        ],
      },
    }));
  }

  async function handleDownloadExcel() {
    if (!contractImport) return;
    setError('');
    try {
      const response = await fetch(`/api/contract-imports/${contractImport.id}/export-excel`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not export extracted contract.'));
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const fileName = disposition.match(/filename="?([^"]+)"?/i)?.[1] || 'extracted-contract.xlsx';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not export extracted contract.');
    }
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
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={() => void handleDownloadExcel()}>
                Download Extracted Excel
              </button>
              <button className="primary-button" onClick={() => void handleApprove()} disabled={isApproving || blockers.length > 0}>
                {isApproving ? 'Importing...' : 'Approve import'}
              </button>
            </div>
          </div>

          {contractConflict ? (
            <div className="warning-list">
              <p className="form-error">A contract already exists for this hotel/year.</p>
              {contractConflict.existingContract ? (
                <p className="empty-state">
                  Existing contract: {contractConflict.existingContract.name} ({contractConflict.existingContract.validFrom || '-'} to{' '}
                  {contractConflict.existingContract.validTo || '-'})
                </p>
              ) : null}
              <div className="button-row">
                <button className="danger-button" type="button" onClick={() => void handleApprove('replace')} disabled={isApproving}>
                  Replace existing contract
                </button>
                <button className="secondary-button" type="button" onClick={() => void handleApprove('version')} disabled={isApproving}>
                  Create new version
                </button>
                <button className="secondary-button" type="button" onClick={() => setContractConflict(null)} disabled={isApproving}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

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
                    <th>Pricing Basis</th>
                    <th>Tax %</th>
                    <th>Service %</th>
                    <th>Tax Incl.</th>
                    <th>Svc Incl.</th>
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
                      <td>
                        <select value={rate.pricingBasis || 'PER_ROOM'} onChange={(event) => updateRate(index, 'pricingBasis', event.target.value)}>
                          <option value="PER_ROOM">PER_ROOM</option>
                          <option value="PER_PERSON">PER_PERSON</option>
                        </select>
                      </td>
                      <td><input value={String(rate.salesTaxPercent ?? '')} onChange={(event) => updateRate(index, 'salesTaxPercent', event.target.value)} inputMode="decimal" /></td>
                      <td><input value={String(rate.serviceChargePercent ?? '')} onChange={(event) => updateRate(index, 'serviceChargePercent', event.target.value)} inputMode="decimal" /></td>
                      <td>
                        <select value={String(Boolean(rate.salesTaxIncluded))} onChange={(event) => updateRate(index, 'salesTaxIncluded', event.target.value)}>
                          <option value="false">No</option>
                          <option value="true">Yes</option>
                        </select>
                      </td>
                      <td>
                        <select value={String(Boolean(rate.serviceChargeIncluded))} onChange={(event) => updateRate(index, 'serviceChargeIncluded', event.target.value)}>
                          <option value="false">No</option>
                          <option value="true">Yes</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <PreviewList title="Meal plans" items={preview.mealPlans || []} empty="No meal plans extracted." />
          <TaxesPreview taxes={preview.taxes} />
          <PreviewList title="Supplements and add-ons" items={preview.supplements} empty="No supplements extracted." />
          <section>
            <div className="section-header">
              <h3>Rate policies</h3>
              <button className="secondary-button" type="button" onClick={addRatePolicy}>
                Add rate policy
              </button>
            </div>
            {(preview.ratePolicies || []).length === 0 ? <p className="empty-state">No rate policies extracted.</p> : null}
            {(preview.ratePolicies || []).length > 0 ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Policy Type</th>
                      <th>Applies To</th>
                      <th>Age From</th>
                      <th>Age To</th>
                      <th>Amount</th>
                      <th>Percent</th>
                      <th>Currency</th>
                      <th>Pricing Basis</th>
                      <th>Meal Plan</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(preview.ratePolicies || []).map((policy, index) => (
                      <tr key={index}>
                        <td><input value={policy.policyType} onChange={(event) => updateRatePolicy(index, 'policyType', event.target.value.toUpperCase())} /></td>
                        <td><input value={policy.appliesTo || ''} onChange={(event) => updateRatePolicy(index, 'appliesTo', event.target.value)} /></td>
                        <td><input value={String(policy.ageFrom ?? '')} onChange={(event) => updateRatePolicy(index, 'ageFrom', event.target.value)} inputMode="numeric" /></td>
                        <td><input value={String(policy.ageTo ?? '')} onChange={(event) => updateRatePolicy(index, 'ageTo', event.target.value)} inputMode="numeric" /></td>
                        <td><input value={String(policy.amount ?? '')} onChange={(event) => updateRatePolicy(index, 'amount', event.target.value)} inputMode="decimal" /></td>
                        <td><input value={String(policy.percent ?? '')} onChange={(event) => updateRatePolicy(index, 'percent', event.target.value)} inputMode="decimal" /></td>
                        <td><input value={policy.currency || ''} onChange={(event) => updateRatePolicy(index, 'currency', event.target.value.toUpperCase())} /></td>
                        <td>
                          <select value={policy.pricingBasis || 'PER_ROOM'} onChange={(event) => updateRatePolicy(index, 'pricingBasis', event.target.value)}>
                            <option value="PER_ROOM">PER_ROOM</option>
                            <option value="PER_PERSON">PER_PERSON</option>
                          </select>
                        </td>
                        <td><input value={policy.mealPlan || ''} onChange={(event) => updateRatePolicy(index, 'mealPlan', event.target.value.toUpperCase())} /></td>
                        <td><input value={policy.notes || ''} onChange={(event) => updateRatePolicy(index, 'notes', event.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
          <section>
            <div className="section-header">
              <h3>Cancellation policy</h3>
              <button className="secondary-button" type="button" onClick={addCancellationRule}>
                Add cancellation rule
              </button>
            </div>
            {!preview.cancellationPolicy ? <p className="empty-state">No cancellation policy extracted.</p> : null}
            {preview.cancellationPolicy ? (
              <div className="section-stack">
                <div className="form-grid">
                  <label>
                    Summary
                    <input
                      value={preview.cancellationPolicy.summary || ''}
                      onChange={(event) => updateCancellationPolicy('summary', event.target.value)}
                    />
                  </label>
                  <label>
                    Notes
                    <input
                      value={preview.cancellationPolicy.notes || ''}
                      onChange={(event) => updateCancellationPolicy('notes', event.target.value)}
                    />
                  </label>
                </div>
                {(preview.cancellationPolicy.rules || []).length > 0 ? (
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Days before arrival</th>
                          <th>Penalty %</th>
                          <th>Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(preview.cancellationPolicy.rules || []).map((rule, index) => (
                          <tr key={index}>
                            <td>
                              <input
                                value={String(rule.daysBefore ?? rule.windowFromValue ?? '')}
                                onChange={(event) => updateCancellationRule(index, 'daysBefore', event.target.value)}
                                inputMode="numeric"
                              />
                            </td>
                            <td>
                              <input
                                value={String(rule.penaltyPercent ?? (rule.penaltyType === 'PERCENT' ? rule.penaltyValue ?? '' : ''))}
                                onChange={(event) => updateCancellationRule(index, 'penaltyPercent', event.target.value)}
                                inputMode="decimal"
                              />
                            </td>
                            <td>
                              <input
                                value={rule.notes || ''}
                                onChange={(event) => updateCancellationRule(index, 'notes', event.target.value)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="empty-state">No cancellation rules extracted.</p>
                )}
              </div>
            ) : null}
          </section>
          <ChildPolicyPreview value={preview.childPolicy} />
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

function TaxesPreview({ taxes }: { taxes: ContractPreview['taxes'] }) {
  return (
    <section>
      <h3>Taxes and service charges:</h3>
      {taxes.length === 0 ? <p className="empty-state">No taxes defined</p> : null}
      {taxes.length > 0 ? (
        <div className="summary-strip">
          {taxes.map((tax) => (
            <div className="summary-card" key={tax.name}>
              <p>
                <span>{tax.name}</span>
                <strong>{Number(tax.value).toFixed(2)}%</strong>
              </p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function ChildPolicyPreview({ value }: { value?: { rules: string[] } | null }) {
  return (
    <section>
      <h3>Child policy</h3>
      {!value?.rules?.length ? <p className="empty-state">No child policy extracted.</p> : null}
      {value?.rules?.length ? (
        <div className="summary-strip">
          {value.rules.map((rule) => (
            <div className="summary-card" key={rule}>
              <p>
                <span>Rule</span>
                <strong>{rule}</strong>
              </p>
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
