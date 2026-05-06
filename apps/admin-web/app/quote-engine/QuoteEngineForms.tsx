'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DmcQuote, DmcQuoteDay, DmcQuoteHotelOptionSet, DmcQuoteSegment } from './types';

const SEGMENT_TYPES = ['INTERNAL_JORDAN', 'EXTERNAL_PACKAGE'] as const;
const CONNECTION_TYPES = ['FLIGHT', 'BORDER', 'TRANSFER', 'NONE'] as const;
const SERVICE_TYPES = ['TRANSPORT', 'HOTEL', 'MEAL', 'GUIDE', 'ENTRANCE', 'ACTIVITY', 'OTHER'] as const;
const PRICING_BASIS = ['PER_PERSON', 'PER_GROUP'] as const;
const REQUEST_STATUSES = ['DRAFT', 'SENT', 'RECEIVED'] as const;

type QuoteEngineFormsProps = {
  quote: DmcQuote;
};

async function sendJson(path: string, method: string, body?: Record<string, unknown>) {
  const response = await fetch(`/api/quote-engine${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message || 'Quote engine action failed.');
  }

  return response.json().catch(() => null);
}

function toDateInput(value?: string | null) {
  return value ? value.slice(0, 10) : '';
}

function parseJsonText(value: string, fallback: unknown) {
  if (!value.trim()) return fallback;
  return JSON.parse(value);
}

export function NewQuoteForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    clientName: '',
    title: '',
    startDate: '',
    endDate: '',
    currency: 'USD',
    status: 'DRAFT',
  });

  async function submit() {
    setError('');
    try {
      const quote = await sendJson('/quotes', 'POST', form);
      router.push(`/quote-engine/${quote.id}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not create quote.');
    }
  }

  return (
    <div className="form-card">
      <h2>Create quote</h2>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="form-row form-row-3">
        <label>Client<input value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} /></label>
        <label>Title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label>Currency<input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} /></label>
        <label>Start<input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label>
        <label>End<input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label>
        <label>Status<input value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} /></label>
      </div>
      <button className="button" type="button" onClick={submit}>Create quote</button>
    </div>
  );
}

export function QuoteEngineWorkspace({ quote }: QuoteEngineFormsProps) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [quoteForm, setQuoteForm] = useState({
    clientName: quote.clientName,
    title: quote.title,
    startDate: toDateInput(quote.startDate),
    endDate: toDateInput(quote.endDate),
    currency: quote.currency,
    status: quote.status,
  });
  const [segmentForm, setSegmentForm] = useState({
    type: 'INTERNAL_JORDAN',
    country: 'Jordan',
    title: 'Jordan segment',
    durationDays: '1',
    startDate: '',
    endDate: '',
    notes: '',
  });
  const [connectionForm, setConnectionForm] = useState({
    fromSegmentId: '',
    toSegmentId: '',
    type: 'NONE',
    description: '',
    costAmount: '',
    costCurrency: quote.currency,
    pricingBasis: 'PER_GROUP',
  });
  const [totalMatrixText, setTotalMatrixText] = useState(JSON.stringify(quote.pricingMatrices?.find((matrix) => matrix.scope === 'TOTAL_QUOTE')?.rowsJson || [], null, 2));

  const segments = useMemo(() => [...(quote.segments || [])].sort((left, right) => left.orderIndex - right.orderIndex), [quote.segments]);
  const totalMatrix = quote.pricingMatrices?.find((matrix) => matrix.scope === 'TOTAL_QUOTE');

  async function run(action: () => Promise<unknown>) {
    setError('');
    try {
      await action();
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Quote engine action failed.');
    }
  }

  async function moveSegment(segment: DmcQuoteSegment, direction: -1 | 1) {
    const index = segments.findIndex((entry) => entry.id === segment.id);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= segments.length) return;
    const next = [...segments];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    await sendJson(`/quotes/${quote.id}/segments/reorder`, 'PATCH', { segmentIds: next.map((entry) => entry.id) });
  }

  return (
    <div className="section-stack">
      {error ? <p className="form-error">{error}</p> : null}

      <section className="form-card">
        <h2>Quote</h2>
        <div className="form-row form-row-3">
          <label>Client<input value={quoteForm.clientName} onChange={(event) => setQuoteForm({ ...quoteForm, clientName: event.target.value })} /></label>
          <label>Title<input value={quoteForm.title} onChange={(event) => setQuoteForm({ ...quoteForm, title: event.target.value })} /></label>
          <label>Currency<input value={quoteForm.currency} onChange={(event) => setQuoteForm({ ...quoteForm, currency: event.target.value.toUpperCase() })} /></label>
          <label>Start<input type="date" value={quoteForm.startDate} onChange={(event) => setQuoteForm({ ...quoteForm, startDate: event.target.value })} /></label>
          <label>End<input type="date" value={quoteForm.endDate} onChange={(event) => setQuoteForm({ ...quoteForm, endDate: event.target.value })} /></label>
          <label>Status<input value={quoteForm.status} onChange={(event) => setQuoteForm({ ...quoteForm, status: event.target.value })} /></label>
        </div>
        <button className="button" type="button" onClick={() => run(() => sendJson(`/quotes/${quote.id}`, 'PATCH', quoteForm))}>Save quote</button>
      </section>

      <section className="form-card">
        <h2>Segments</h2>
        <div className="form-row form-row-3">
          <label>Type<select value={segmentForm.type} onChange={(event) => setSegmentForm({ ...segmentForm, type: event.target.value })}>{SEGMENT_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label>Country<input value={segmentForm.country} onChange={(event) => setSegmentForm({ ...segmentForm, country: event.target.value })} /></label>
          <label>Title<input value={segmentForm.title} onChange={(event) => setSegmentForm({ ...segmentForm, title: event.target.value })} /></label>
          <label>Duration days<input type="number" min="1" value={segmentForm.durationDays} onChange={(event) => setSegmentForm({ ...segmentForm, durationDays: event.target.value })} /></label>
          <label>Start<input type="date" value={segmentForm.startDate} onChange={(event) => setSegmentForm({ ...segmentForm, startDate: event.target.value })} /></label>
          <label>End<input type="date" value={segmentForm.endDate} onChange={(event) => setSegmentForm({ ...segmentForm, endDate: event.target.value })} /></label>
        </div>
        <label>Notes<textarea value={segmentForm.notes} onChange={(event) => setSegmentForm({ ...segmentForm, notes: event.target.value })} /></label>
        <button className="button" type="button" onClick={() => run(() => sendJson(`/quotes/${quote.id}/segments`, 'POST', { ...segmentForm, orderIndex: segments.length }))}>Add segment</button>
      </section>

      <section className="form-card">
        <h2>Connections</h2>
        <div className="form-row form-row-3">
          <label>From<select value={connectionForm.fromSegmentId} onChange={(event) => setConnectionForm({ ...connectionForm, fromSegmentId: event.target.value })}><option value="">Select</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.title}</option>)}</select></label>
          <label>To<select value={connectionForm.toSegmentId} onChange={(event) => setConnectionForm({ ...connectionForm, toSegmentId: event.target.value })}><option value="">Select</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.title}</option>)}</select></label>
          <label>Type<select value={connectionForm.type} onChange={(event) => setConnectionForm({ ...connectionForm, type: event.target.value })}>{CONNECTION_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label>Cost<input type="number" value={connectionForm.costAmount} onChange={(event) => setConnectionForm({ ...connectionForm, costAmount: event.target.value })} /></label>
          <label>Currency<input value={connectionForm.costCurrency} onChange={(event) => setConnectionForm({ ...connectionForm, costCurrency: event.target.value.toUpperCase() })} /></label>
          <label>Basis<select value={connectionForm.pricingBasis} onChange={(event) => setConnectionForm({ ...connectionForm, pricingBasis: event.target.value })}>{PRICING_BASIS.map((basis) => <option key={basis}>{basis}</option>)}</select></label>
        </div>
        <label>Description<textarea value={connectionForm.description} onChange={(event) => setConnectionForm({ ...connectionForm, description: event.target.value })} /></label>
        <button className="button" type="button" onClick={() => run(() => sendJson(`/quotes/${quote.id}/connections`, 'POST', { ...connectionForm, orderIndex: quote.connections?.length || 0 }))}>Add connection</button>
        <div className="table-wrap">
          <table className="data-table">
            <tbody>
              {(quote.connections || []).map((connection) => (
                <tr key={connection.id}>
                  <td>{connection.type}</td>
                  <td>{connection.description || 'No description'}</td>
                  <td>{connection.costAmount ? `${connection.costAmount} ${connection.costCurrency}` : 'No cost'}</td>
                  <td><button className="compact-button" type="button" onClick={() => run(() => sendJson(`/connections/${connection.id}`, 'DELETE'))}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="form-card">
        <h2>Total pricing matrix</h2>
        <textarea rows={8} value={totalMatrixText} onChange={(event) => setTotalMatrixText(event.target.value)} />
        <button className="button" type="button" onClick={() => run(() => sendJson(`/quotes/${quote.id}/pricing-matrices`, 'POST', { id: totalMatrix?.id, scope: 'TOTAL_QUOTE', rowsJson: parseJsonText(totalMatrixText, []) }))}>Save total matrix</button>
      </section>

      {segments.map((segment, index) => (
        <SegmentCard key={segment.id} quote={quote} segment={segment} index={index} onRun={run} onMove={moveSegment} />
      ))}
    </div>
  );
}

function SegmentCard({
  quote,
  segment,
  index,
  onRun,
  onMove,
}: {
  quote: DmcQuote;
  segment: DmcQuoteSegment;
  index: number;
  onRun: (action: () => Promise<unknown>) => Promise<void>;
  onMove: (segment: DmcQuoteSegment, direction: -1 | 1) => Promise<void>;
}) {
  const [dayForm, setDayForm] = useState({ dayNumber: String((segment.days?.length || 0) + 1), title: '', description: '', mealsIncludedText: '' });
  const [hotelSetForm, setHotelSetForm] = useState({ name: '4 Star STD', sortOrder: String(segment.hotelOptionSets?.length || 0) });
  const [requestForm, setRequestForm] = useState({ supplierName: '', paxRange: '', hotelCategory: '', boardBasis: '', itineraryText: '', notes: '', status: 'DRAFT' });
  const segmentMatrix = segment.pricingMatrices?.find((matrix) => matrix.scope === 'SEGMENT');
  const [segmentMatrixText, setSegmentMatrixText] = useState(JSON.stringify(segmentMatrix?.rowsJson || [], null, 2));
  const isInternal = segment.type === 'INTERNAL_JORDAN';

  return (
    <section className="form-card">
      <div className="split-header">
        <div>
          <h2>{index + 1}. {segment.title}</h2>
          <p>{segment.country} | {segment.type} | {segment.durationDays} day{segment.durationDays === 1 ? '' : 's'}</p>
        </div>
        <div className="button-row">
          <button className="compact-button" type="button" onClick={() => onRun(() => onMove(segment, -1))}>Up</button>
          <button className="compact-button" type="button" onClick={() => onRun(() => onMove(segment, 1))}>Down</button>
          <button className="compact-button" type="button" onClick={() => onRun(() => sendJson(`/segments/${segment.id}`, 'DELETE'))}>Delete</button>
        </div>
      </div>

      <div className="page-tabs">
        {(isInternal ? ['Itinerary', 'Hotels', 'Services', 'Pricing'] : ['Request', 'Supplier Reply', 'Pricing Matrix']).map((tab) => (
          <span key={tab} className="page-tab">{tab}</span>
        ))}
      </div>

      {isInternal ? (
        <>
          <h3>Itinerary</h3>
          <div className="form-row form-row-3">
            <label>Day<input type="number" value={dayForm.dayNumber} onChange={(event) => setDayForm({ ...dayForm, dayNumber: event.target.value })} /></label>
            <label>Title<input value={dayForm.title} onChange={(event) => setDayForm({ ...dayForm, title: event.target.value })} /></label>
            <label>Meals<input value={dayForm.mealsIncludedText} onChange={(event) => setDayForm({ ...dayForm, mealsIncludedText: event.target.value })} /></label>
          </div>
          <label>Description<textarea value={dayForm.description} onChange={(event) => setDayForm({ ...dayForm, description: event.target.value })} /></label>
          <button className="button" type="button" onClick={() => onRun(() => sendJson(`/segments/${segment.id}/days`, 'POST', dayForm))}>Add day</button>
          {(segment.days || []).map((day) => <DayCard key={day.id} quote={quote} day={day} onRun={onRun} />)}

          <h3>Hotels</h3>
          <div className="form-row form-row-2">
            <label>Option set<select value={hotelSetForm.name} onChange={(event) => setHotelSetForm({ ...hotelSetForm, name: event.target.value })}>{['3 Star', '4 Star STD', '4 Star DLX', 'Custom'].map((name) => <option key={name}>{name}</option>)}</select></label>
            <label>Sort<input type="number" value={hotelSetForm.sortOrder} onChange={(event) => setHotelSetForm({ ...hotelSetForm, sortOrder: event.target.value })} /></label>
          </div>
          <button className="button" type="button" onClick={() => onRun(() => sendJson(`/segments/${segment.id}/hotel-option-sets`, 'POST', hotelSetForm))}>Add hotel option set</button>
          {(segment.hotelOptionSets || []).map((set) => <HotelOptionSetCard key={set.id} optionSet={set} onRun={onRun} />)}
        </>
      ) : (
        <>
          <h3>Request</h3>
          <div className="form-row form-row-3">
            <label>Supplier<input value={requestForm.supplierName} onChange={(event) => setRequestForm({ ...requestForm, supplierName: event.target.value })} /></label>
            <label>Pax range<input value={requestForm.paxRange} onChange={(event) => setRequestForm({ ...requestForm, paxRange: event.target.value })} /></label>
            <label>Status<select value={requestForm.status} onChange={(event) => setRequestForm({ ...requestForm, status: event.target.value })}>{REQUEST_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label>Hotel category<input value={requestForm.hotelCategory} onChange={(event) => setRequestForm({ ...requestForm, hotelCategory: event.target.value })} /></label>
            <label>Board basis<input value={requestForm.boardBasis} onChange={(event) => setRequestForm({ ...requestForm, boardBasis: event.target.value })} /></label>
          </div>
          <label>Itinerary text<textarea value={requestForm.itineraryText} onChange={(event) => setRequestForm({ ...requestForm, itineraryText: event.target.value })} /></label>
          <label>Notes<textarea value={requestForm.notes} onChange={(event) => setRequestForm({ ...requestForm, notes: event.target.value })} /></label>
          <button className="button" type="button" onClick={() => onRun(() => sendJson(`/segments/${segment.id}/external-requests`, 'POST', requestForm))}>Add request</button>
          {(segment.externalPackageRequests || []).map((request) => <ExternalRequestCard key={request.id} request={request} onRun={onRun} />)}
        </>
      )}

      <h3>{isInternal ? 'Pricing' : 'Pricing Matrix'}</h3>
      <textarea rows={6} value={segmentMatrixText} onChange={(event) => setSegmentMatrixText(event.target.value)} />
      <button className="button" type="button" onClick={() => onRun(() => sendJson(`/quotes/${quote.id}/pricing-matrices`, 'POST', { id: segmentMatrix?.id, scope: 'SEGMENT', segmentId: segment.id, rowsJson: parseJsonText(segmentMatrixText, []) }))}>Save segment matrix</button>
    </section>
  );
}

function DayCard({ quote, day, onRun }: { quote: DmcQuote; day: DmcQuoteDay; onRun: (action: () => Promise<unknown>) => Promise<void> }) {
  const [serviceForm, setServiceForm] = useState({ type: 'ACTIVITY', title: '', description: '', costAmount: '', costCurrency: quote.currency, pricingBasis: 'PER_PERSON' });

  return (
    <div className="subsection">
      <div className="split-header">
        <h4>Day {day.dayNumber}: {day.title}</h4>
        <button className="compact-button" type="button" onClick={() => onRun(() => sendJson(`/days/${day.id}`, 'DELETE'))}>Delete day</button>
      </div>
      <p>{day.description}</p>
      <p>{day.mealsIncludedText ? `Meals: ${day.mealsIncludedText}` : 'Meals outside hotels are tracked as services.'}</p>
      <h5>Services</h5>
      <div className="form-row form-row-3">
        <label>Type<select value={serviceForm.type} onChange={(event) => setServiceForm({ ...serviceForm, type: event.target.value })}>{SERVICE_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label>Title<input value={serviceForm.title} onChange={(event) => setServiceForm({ ...serviceForm, title: event.target.value })} /></label>
        <label>Cost<input type="number" value={serviceForm.costAmount} onChange={(event) => setServiceForm({ ...serviceForm, costAmount: event.target.value })} /></label>
        <label>Currency<input value={serviceForm.costCurrency} onChange={(event) => setServiceForm({ ...serviceForm, costCurrency: event.target.value.toUpperCase() })} /></label>
        <label>Basis<select value={serviceForm.pricingBasis} onChange={(event) => setServiceForm({ ...serviceForm, pricingBasis: event.target.value })}>{PRICING_BASIS.map((basis) => <option key={basis}>{basis}</option>)}</select></label>
      </div>
      <label>Description<textarea value={serviceForm.description} onChange={(event) => setServiceForm({ ...serviceForm, description: event.target.value })} /></label>
      <button className="compact-button" type="button" onClick={() => onRun(() => sendJson(`/days/${day.id}/services`, 'POST', serviceForm))}>Add service</button>
      <ul>
        {(day.services || []).map((service) => <li key={service.id}>{service.type}: {service.title} {service.costAmount ? `(${service.costAmount} ${service.costCurrency})` : ''}</li>)}
      </ul>
    </div>
  );
}

function HotelOptionSetCard({ optionSet, onRun }: { optionSet: DmcQuoteHotelOptionSet; onRun: (action: () => Promise<unknown>) => Promise<void> }) {
  const [optionForm, setOptionForm] = useState({ city: '', hotelNameSnapshot: '', nights: '1', roomType: 'Standard', mealPlan: 'BB' });

  return (
    <div className="subsection">
      <h4>{optionSet.name}</h4>
      <div className="form-row form-row-3">
        <label>City<input value={optionForm.city} onChange={(event) => setOptionForm({ ...optionForm, city: event.target.value })} /></label>
        <label>Hotel snapshot<input value={optionForm.hotelNameSnapshot} onChange={(event) => setOptionForm({ ...optionForm, hotelNameSnapshot: event.target.value })} /></label>
        <label>Nights<input type="number" value={optionForm.nights} onChange={(event) => setOptionForm({ ...optionForm, nights: event.target.value })} /></label>
        <label>Room<input value={optionForm.roomType} onChange={(event) => setOptionForm({ ...optionForm, roomType: event.target.value })} /></label>
        <label>Meal plan<input value={optionForm.mealPlan} onChange={(event) => setOptionForm({ ...optionForm, mealPlan: event.target.value })} /></label>
      </div>
      <button className="compact-button" type="button" onClick={() => onRun(() => sendJson(`/hotel-option-sets/${optionSet.id}/options`, 'POST', optionForm))}>Add hotel</button>
      <ul>
        {(optionSet.options || []).map((option) => <li key={option.id}>{option.city}: {option.hotelNameSnapshot} | {option.nights} night(s) | {option.roomType} | {option.mealPlan}</li>)}
      </ul>
    </div>
  );
}

function ExternalRequestCard({ request, onRun }: { request: NonNullable<DmcQuoteSegment['externalPackageRequests']>[number]; onRun: (action: () => Promise<unknown>) => Promise<void> }) {
  const [replyForm, setReplyForm] = useState({ supplierName: request.supplierName, pricingMatrixJson: '[]', singleSupplement: '', includesText: '', excludesText: '', notes: '' });

  return (
    <div className="subsection">
      <h4>{request.supplierName} | {request.status}</h4>
      <p>{request.paxRange} | {request.hotelCategory || 'Any category'} | {request.boardBasis || 'Board TBC'}</p>
      <h5>Supplier reply</h5>
      <div className="form-row form-row-2">
        <label>Supplier<input value={replyForm.supplierName} onChange={(event) => setReplyForm({ ...replyForm, supplierName: event.target.value })} /></label>
        <label>Single supplement<input type="number" value={replyForm.singleSupplement} onChange={(event) => setReplyForm({ ...replyForm, singleSupplement: event.target.value })} /></label>
      </div>
      <label>Pricing matrix JSON<textarea value={replyForm.pricingMatrixJson} onChange={(event) => setReplyForm({ ...replyForm, pricingMatrixJson: event.target.value })} /></label>
      <label>Includes<textarea value={replyForm.includesText} onChange={(event) => setReplyForm({ ...replyForm, includesText: event.target.value })} /></label>
      <label>Excludes<textarea value={replyForm.excludesText} onChange={(event) => setReplyForm({ ...replyForm, excludesText: event.target.value })} /></label>
      <button className="compact-button" type="button" onClick={() => onRun(() => sendJson(`/external-requests/${request.id}/quotes`, 'POST', { ...replyForm, pricingMatrixJson: parseJsonText(replyForm.pricingMatrixJson, []) }))}>Save supplier reply</button>
      <ul>
        {(request.supplierQuotes || []).map((reply) => <li key={reply.id}>{reply.supplierName}: supplement {reply.singleSupplement || 0}</li>)}
      </ul>
    </div>
  );
}
