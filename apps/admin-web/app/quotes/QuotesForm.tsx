'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiValidationError, getApiError } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { CurrencySelect } from '../components/CurrencySelect';
import { type SupportedCurrency } from '../lib/currencyOptions';

type CompanyOption = {
  id: string;
  name: string;
};

type ContactOption = {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
};

type AgentOption = {
  id: string;
  name: string;
  email: string;
  role: 'agent';
};

type QuotesFormProps = {
  apiBaseUrl: string;
  companies: CompanyOption[];
  contacts: ContactOption[];
  agents?: AgentOption[];
  quoteId?: string;
  submitLabel?: string;
  initialValues?: {
    clientCompanyId: string;
    brandCompanyId: string;
    contactId: string;
    agentId: string;
    quoteType: 'FIT' | 'GROUP';
    bookingType: 'FIT' | 'GROUP' | 'SERIES';
    title: string;
    description: string;
    quoteCurrency: SupportedCurrency;
    pricingMode: 'SLAB' | 'FIXED';
    pricingSlabs: Array<{
      id?: string;
      minPax: string;
      maxPax: string;
      price: string;
    }>;
    fixedPricePerPerson: string;
    focType: 'none' | 'ratio' | 'fixed';
    focRatio: string;
    focCount: string;
    focRoomType: 'single' | 'double' | '';
    adults: string;
    children: string;
    roomCount: string;
    nightCount: string;
    singleSupplement: string;
    travelStartDate: string;
    validUntil: string;
  };
};

type PricingSlabFormValue = {
  id?: string;
  clientId: string;
  minPax: string;
  maxPax: string;
  price: string;
};

function createPricingSlabValue(values?: Partial<PricingSlabFormValue>): PricingSlabFormValue {
  return {
    id: values?.id,
    clientId: values?.clientId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    minPax: values?.minPax || '',
    maxPax: values?.maxPax || '',
    price: values?.price || '',
  };
}

export function QuotesForm({ apiBaseUrl, companies, contacts, agents = [], quoteId, submitLabel, initialValues }: QuotesFormProps) {
  const router = useRouter();
  const defaultBrandCompanyId = initialValues?.brandCompanyId || companies[0]?.id || '';
  const [clientCompanyId, setClientCompanyId] = useState(initialValues?.clientCompanyId || companies[0]?.id || '');
  const [brandCompanyId, setBrandCompanyId] = useState(defaultBrandCompanyId);
  const availableContacts = contacts.filter((contact) => contact.companyId === clientCompanyId);
  const [contactId, setContactId] = useState(initialValues?.contactId || availableContacts[0]?.id || '');
  const [agentId, setAgentId] = useState(initialValues?.agentId || '');
  const [quoteType, setQuoteType] = useState<'FIT' | 'GROUP'>(initialValues?.quoteType || 'FIT');
  const [bookingType, setBookingType] = useState<'FIT' | 'GROUP' | 'SERIES'>(initialValues?.bookingType || 'FIT');
  const [title, setTitle] = useState(initialValues?.title || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [quoteCurrency, setQuoteCurrency] = useState<SupportedCurrency>(initialValues?.quoteCurrency || 'USD');
  const [pricingMode, setPricingMode] = useState<'SLAB' | 'FIXED'>(initialValues?.pricingMode || 'FIXED');
  const [pricingSlabs, setPricingSlabs] = useState<PricingSlabFormValue[]>(
    initialValues?.pricingSlabs?.length
      ? initialValues.pricingSlabs.map((slab) => createPricingSlabValue(slab))
      : [createPricingSlabValue()],
  );
  const [fixedPricePerPerson, setFixedPricePerPerson] = useState(initialValues?.fixedPricePerPerson || '');
  const [focType, setFocType] = useState<'none' | 'ratio' | 'fixed'>(initialValues?.focType || 'none');
  const [focRatio, setFocRatio] = useState(initialValues?.focRatio || '');
  const [focCount, setFocCount] = useState(initialValues?.focCount || '');
  const [focRoomType, setFocRoomType] = useState<'single' | 'double' | ''>(initialValues?.focRoomType || '');
  const [adults, setAdults] = useState(initialValues?.adults || '2');
  const [children, setChildren] = useState(initialValues?.children || '0');
  const [roomCount, setRoomCount] = useState(initialValues?.roomCount || '1');
  const [nightCount, setNightCount] = useState(initialValues?.nightCount || '1');
  const [singleSupplement, setSingleSupplement] = useState(initialValues?.singleSupplement || '');
  const [travelStartDate, setTravelStartDate] = useState(initialValues?.travelStartDate || '');
  const [validUntil, setValidUntil] = useState(initialValues?.validUntil || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<ApiValidationError[]>([]);
  const isEditing = Boolean(quoteId);

  function handleClientCompanyChange(nextCompanyId: string) {
    setClientCompanyId(nextCompanyId);
    const nextContact = contacts.find((contact) => contact.companyId === nextCompanyId);
    setContactId(nextContact?.id || '');
  }

  function handleFocTypeChange(nextFocType: 'none' | 'ratio' | 'fixed') {
    setFocType(nextFocType);

    if (nextFocType === 'none') {
      setFocRatio('');
      setFocCount('');
      setFocRoomType('');
    } else if (!focRoomType) {
      setFocRoomType('single');
    }
  }

  function handlePricingModeChange(nextPricingMode: 'SLAB' | 'FIXED') {
    setPricingMode(nextPricingMode);

    if (nextPricingMode === 'SLAB' && pricingSlabs.length === 0) {
      setPricingSlabs([createPricingSlabValue()]);
    }
  }

  function updatePricingSlab(clientId: string, field: 'minPax' | 'maxPax' | 'price', value: string) {
    setPricingSlabs((current) =>
      current.map((slab) => (slab.clientId === clientId ? { ...slab, [field]: value } : slab)),
    );
  }

  function addPricingSlab() {
    setPricingSlabs((current) => [...current, createPricingSlabValue()]);
  }

  function removePricingSlab(clientId: string) {
    setPricingSlabs((current) => {
      if (current.length === 1) {
        return [createPricingSlabValue()];
      }

      return current.filter((slab) => slab.clientId !== clientId);
    });
  }

  async function getBackendErrorMessage(response: Response, fallback: string) {
    const clonedResponse = response.clone();
    const apiError = await getApiError(response, fallback);

    if (apiError.message && apiError.message !== fallback) {
      return apiError;
    }

    try {
      const rawText = (await clonedResponse.text()).trim();

      if (rawText && !rawText.startsWith('<')) {
        return {
          message: rawText,
          errors: apiError.errors,
        };
      }
    } catch {
      return apiError;
    }

    return apiError;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setValidationErrors([]);

    try {
      const normalizedPricingSlabs =
        pricingMode === 'SLAB'
          ? pricingSlabs
              .map((slab) => ({
                id: slab.id,
                minPax: slab.minPax.trim(),
                maxPax: slab.maxPax.trim(),
                price: slab.price.trim(),
              }))
              .filter((slab) => slab.minPax || slab.maxPax || slab.price)
          : [];

      if (
        pricingMode === 'SLAB' &&
        normalizedPricingSlabs.some((slab) => !slab.minPax || !slab.maxPax || !slab.price)
      ) {
        throw new Error('Complete every pricing slab row before saving the quote.');
      }

      if (pricingMode === 'FIXED' && fixedPricePerPerson.trim() && Number(fixedPricePerPerson) < 0) {
        throw new Error('Package sell price per person must be zero or greater.');
      }

      if (focType === 'ratio') {
        if (!focRatio.trim() || Number(focRatio) <= 0) {
          throw new Error('FOC ratio must be greater than zero.');
        }

        if (!focRoomType) {
          throw new Error('Select an FOC room type.');
        }
      }

      if (focType === 'fixed') {
        if (!focCount.trim() || Number(focCount) < 0) {
          throw new Error('FOC count must be zero or greater.');
        }

        if (!focRoomType) {
          throw new Error('Select an FOC room type.');
        }
      }

      const response = await fetch(`${apiBaseUrl}/quotes${quoteId ? `/${quoteId}` : ''}`, {
        method: quoteId ? 'PATCH' : 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          clientCompanyId,
          companyId: clientCompanyId,
          brandCompanyId,
          contactId,
          agentId: agentId.trim() || (isEditing ? null : undefined),
          quoteType,
          bookingType,
          title,
          description,
          quoteCurrency,
          pricingMode,
          pricingType: pricingMode === 'SLAB' ? 'group' : 'simple',
          fixedPricePerPerson:
            pricingMode === 'FIXED' ? (fixedPricePerPerson.trim() ? Number(fixedPricePerPerson) : null) : 0,
          pricingSlabs: normalizedPricingSlabs.map((slab) => ({
            minPax: Number(slab.minPax),
            maxPax: Number(slab.maxPax),
            price: Number(slab.price),
          })),
          focType,
          focRatio: focType === 'ratio' ? Number(focRatio) : null,
          focCount: focType === 'fixed' ? Number(focCount) : null,
          focRoomType: focType === 'none' ? null : focRoomType,
          adults: Number(adults),
          children: Number(children),
          roomCount: Number(roomCount),
          nightCount: Number(nightCount),
          singleSupplement: singleSupplement.trim() ? Number(singleSupplement) : null,
          travelStartDate: travelStartDate || null,
          validUntil: validUntil || null,
        }),
      });

      if (!response.ok) {
        const apiError = await getBackendErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} quote.`);
        setValidationErrors(apiError.errors);
        throw new Error(apiError.message);
      }

      const payload = (await response.json().catch(() => null)) as { id?: string } | null;

      if (!isEditing && payload?.id) {
        router.push(`/quotes/${payload.id}?tab=services`);
        router.refresh();
        return;
      }

      if (!isEditing) {
        setClientCompanyId(companies[0]?.id || '');
        setBrandCompanyId(companies[0]?.id || '');
        setContactId(contacts.find((contact) => contact.companyId === companies[0]?.id)?.id || '');
        setAgentId('');
        setQuoteType('FIT');
        setBookingType('FIT');
        setTitle('');
        setDescription('');
        setQuoteCurrency('USD');
        setPricingMode('FIXED');
        setPricingSlabs([createPricingSlabValue()]);
        setFixedPricePerPerson('');
        setFocType('none');
        setFocRatio('');
        setFocCount('');
        setFocRoomType('');
        setAdults('2');
        setChildren('0');
        setRoomCount('1');
        setNightCount('1');
        setSingleSupplement('');
        setTravelStartDate('');
        setValidUntil('');
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} quote.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  const canSubmit = companies.length > 0 && availableContacts.length > 0;

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <div className="form-row">
        <label>
          Client Company
          <select
            value={clientCompanyId}
            onChange={(event) => handleClientCompanyChange(event.target.value)}
            required
            disabled={companies.length === 0}
          >
            {companies.length === 0 ? (
              <option value="">Create a company first</option>
            ) : (
              companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))
            )}
          </select>
        </label>

        <label>
          Branding Company
          <select
            value={brandCompanyId}
            onChange={(event) => setBrandCompanyId(event.target.value)}
            required
            disabled={companies.length === 0}
          >
            {companies.length === 0 ? (
              <option value="">Create a company first</option>
            ) : (
              companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <div className="form-row">
        <label>
          Contact
          <select
            value={contactId}
            onChange={(event) => setContactId(event.target.value)}
            required
            disabled={availableContacts.length === 0}
          >
            {availableContacts.length === 0 ? (
              <option value="">Create a contact for this company first</option>
            ) : (
              availableContacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.firstName} {contact.lastName}
                </option>
              ))
            )}
          </select>
        </label>

        <label>
          Assigned Agent
          <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            <option value="">Unassigned</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name} ({agent.email})
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="form-row">
        <label>
          Quote Type
          <select value={quoteType} onChange={(event) => setQuoteType(event.target.value as 'FIT' | 'GROUP')}>
            <option value="FIT">FIT</option>
            <option value="GROUP">GROUP</option>
          </select>
        </label>

        <label>
          Booking Type
          <select value={bookingType} onChange={(event) => setBookingType(event.target.value as 'FIT' | 'GROUP' | 'SERIES')}>
            <option value="FIT">FIT</option>
            <option value="GROUP">GROUP</option>
            <option value="SERIES">SERIES</option>
          </select>
        </label>
      </div>

      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>

      <label>
        Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
      </label>

      <div className="form-row">
        <label>
          Quote Currency
          <CurrencySelect value={quoteCurrency} onChange={(value) => setQuoteCurrency((value || 'USD') as SupportedCurrency)} required />
        </label>

        <label>
          Pricing Mode
          <select value={pricingMode} onChange={(event) => handlePricingModeChange(event.target.value as 'SLAB' | 'FIXED')}>
            <option value="SLAB">Slab Pricing</option>
            <option value="FIXED">Fixed Price</option>
          </select>
        </label>
      </div>

      {pricingMode === 'SLAB' ? (
        <div className="stacked-card">
          <div className="panel-header" style={{ marginBottom: 12 }}>
            <div>
              <p className="eyebrow">Group Pricing</p>
              <h3 className="section-title" style={{ fontSize: '1rem' }}>Pricing slabs</h3>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Min Pax</th>
                  <th>Max Pax</th>
                  <th>Price / Paying Pax</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pricingSlabs.map((slab) => (
                  <tr key={slab.clientId}>
                    <td>
                      <input
                        value={slab.minPax}
                        onChange={(event) => updatePricingSlab(slab.clientId, 'minPax', event.target.value)}
                        type="number"
                        min="1"
                      />
                    </td>
                    <td>
                      <input
                        value={slab.maxPax}
                        onChange={(event) => updatePricingSlab(slab.clientId, 'maxPax', event.target.value)}
                        type="number"
                        min="1"
                      />
                    </td>
                    <td>
                      <input
                        value={slab.price}
                        onChange={(event) => updatePricingSlab(slab.clientId, 'price', event.target.value)}
                        type="number"
                        min="0"
                        step="0.01"
                      />
                    </td>
                    <td>
                      <button type="button" className="secondary-button" onClick={() => removePricingSlab(slab.clientId)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" className="secondary-button" onClick={addPricingSlab}>
            Add row
          </button>
        </div>
      ) : (
        <div className="stacked-card">
          <div className="panel-header" style={{ marginBottom: 12 }}>
            <div>
              <p className="eyebrow">Fixed Pricing</p>
              <h3 className="section-title" style={{ fontSize: '1rem' }}>Package sell price can be set later</h3>
            </div>
          </div>
          <p className="detail-copy">
            The guided workflow does not require package sell pricing during setup. You can leave this blank now and set the package sell price per person in the Pricing step.
          </p>
          <label>
            Package Sell Price Per Person
            <input
              value={fixedPricePerPerson}
              onChange={(event) => setFixedPricePerPerson(event.target.value)}
              type="number"
              min="0"
              step="0.01"
              placeholder="Optional during setup"
            />
          </label>
        </div>
      )}

      <div className="stacked-card">
        <div className="panel-header" style={{ marginBottom: 12 }}>
          <div>
            <p className="eyebrow">FOC Configuration</p>
            <h3 className="section-title" style={{ fontSize: '1rem' }}>Free of charge policy</h3>
          </div>
        </div>

        <div className="form-row">
          <label>
            <input
              type="radio"
              name="focType"
              value="none"
              checked={focType === 'none'}
              onChange={() => handleFocTypeChange('none')}
            />
            None
          </label>
          <label>
            <input
              type="radio"
              name="focType"
              value="ratio"
              checked={focType === 'ratio'}
              onChange={() => handleFocTypeChange('ratio')}
            />
            Auto ratio
          </label>
          <label>
            <input
              type="radio"
              name="focType"
              value="fixed"
              checked={focType === 'fixed'}
              onChange={() => handleFocTypeChange('fixed')}
            />
            Fixed FOC count
          </label>
        </div>

        {focType === 'ratio' ? (
          <div className="form-row">
            <label>
              Ratio
              <input value={focRatio} onChange={(event) => setFocRatio(event.target.value)} type="number" min="1" step="1" />
            </label>

            <label>
              Room Type
              <select value={focRoomType} onChange={(event) => setFocRoomType(event.target.value as 'single' | 'double' | '')}>
                <option value="">Select room type</option>
                <option value="single">Single</option>
                <option value="double">Double</option>
              </select>
            </label>
          </div>
        ) : null}

        {focType === 'fixed' ? (
          <div className="form-row">
            <label>
              FOC Count
              <input value={focCount} onChange={(event) => setFocCount(event.target.value)} type="number" min="0" step="1" />
            </label>

            <label>
              Room Type
              <select value={focRoomType} onChange={(event) => setFocRoomType(event.target.value as 'single' | 'double' | '')}>
                <option value="">Select room type</option>
                <option value="single">Single</option>
                <option value="double">Double</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>

      <div className="form-row">
        <label>
          Adults
          <input value={adults} onChange={(event) => setAdults(event.target.value)} type="number" min="0" required />
        </label>

        <label>
          Children
          <input value={children} onChange={(event) => setChildren(event.target.value)} type="number" min="0" required />
        </label>
      </div>

      <div className="form-row">
        <label>
          Rooms
          <input value={roomCount} onChange={(event) => setRoomCount(event.target.value)} type="number" min="1" required />
        </label>

        <label>
          Nights
          <input value={nightCount} onChange={(event) => setNightCount(event.target.value)} type="number" min="1" required />
        </label>
      </div>

      <label>
        Single Supplement
        <input
          value={singleSupplement}
          onChange={(event) => setSingleSupplement(event.target.value)}
          type="number"
          min="0"
          step="0.01"
        />
      </label>

      <label>
        Travel Start Date
        <input value={travelStartDate} onChange={(event) => setTravelStartDate(event.target.value)} type="date" />
      </label>

      <label>
        Valid Until
        <input value={validUntil} onChange={(event) => setValidUntil(event.target.value)} type="date" />
      </label>

      <button type="submit" disabled={isSubmitting || !canSubmit}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Create quote')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
      {validationErrors.length > 0 ? (
        <div className="form-error">
          {validationErrors.map((validationError) => (
            <p key={`${validationError.path}:${validationError.code}`}>{validationError.message}</p>
          ))}
        </div>
      ) : null}
    </form>
  );
}
