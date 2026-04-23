'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getValidatedTripSummary } from '../lib/tripSummary';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import { ConvertToBookingButton } from './[id]/ConvertToBookingButton';

type QuoteStatus = 'DRAFT' | 'READY' | 'SENT' | 'ACCEPTED' | 'CONFIRMED' | 'REVISION_REQUESTED' | 'EXPIRED' | 'CANCELLED';

type Company = {
  id: string;
  name: string;
};

type Contact = {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
};

type Quote = {
  id: string;
  quoteNumber: string | null;
  bookingType: 'FIT' | 'GROUP' | 'SERIES';
  title: string;
  description: string | null;
  adults: number;
  children: number;
  nightCount: number;
  status: QuoteStatus;
  travelStartDate: string | null;
  validUntil: string | null;
  invoice: {
    id: string;
    status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
    dueDate: string;
    totalAmount: number;
    currency: string;
  } | null;
  booking?: {
    id: string;
  } | null;
  company: Company;
  brandCompany?: Company;
  contact: Contact;
};

type QuotesTableProps = {
  apiBaseUrl: string;
  quotes: Quote[];
  companies: Company[];
};

function formatQuoteStatus(status: QuoteStatus) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}

function isQuoteExpired(quote: Pick<Quote, 'status' | 'validUntil'>) {
  if (quote.status === 'EXPIRED') {
    return true;
  }

  if (!quote.validUntil || quote.status === 'ACCEPTED' || quote.status === 'CONFIRMED' || quote.status === 'CANCELLED') {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(quote.validUntil).getTime() < today.getTime();
}

function matchesDateFilter(travelStartDate: string | null, dateFrom: string) {
  if (!dateFrom) {
    return true;
  }

  if (!travelStartDate) {
    return false;
  }

  return travelStartDate.slice(0, 10) >= dateFrom;
}

export function QuotesTable({ apiBaseUrl, quotes, companies }: QuotesTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');

  const filteredQuotes = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return quotes.filter((quote) => {
      const tripSummary = getValidatedTripSummary({
        quoteTitle: quote.title,
        quoteDescription: quote.description,
        totalPax: quote.adults + quote.children,
        nightCount: quote.nightCount,
      });
      const haystack = [quote.title, quote.company.name, quote.description || '', tripSummary].join(' ').toLowerCase();
      const matchesSearch = normalizedSearch ? haystack.includes(normalizedSearch) : true;
      const matchesStatus = statusFilter === 'all' ? true : quote.status === statusFilter;
      const matchesClient = clientFilter === 'all' ? true : quote.company.id === clientFilter;
      const matchesDate = matchesDateFilter(quote.travelStartDate, dateFrom);

      return matchesSearch && matchesStatus && matchesClient && matchesDate;
    });
  }, [clientFilter, dateFrom, quotes, search, statusFilter]);

  const activeFilters = [
    search ? `Search: ${search}` : null,
    statusFilter !== 'all' ? `Status: ${formatQuoteStatus(statusFilter as QuoteStatus)}` : null,
    clientFilter !== 'all' ? `Client: ${companies.find((company) => company.id === clientFilter)?.name || 'Selected client'}` : null,
    dateFrom ? `Travel from: ${formatDate(dateFrom)}` : null,
  ].filter(Boolean) as string[];

  async function handleDelete(quote: Quote) {
    if (!window.confirm(`Delete ${quote.title}?`)) {
      return;
    }

    setDeletingId(quote.id);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quote.id}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not delete quote.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not delete quote.');
    } finally {
      setDeletingId(null);
    }
  }

  function resetFilters() {
    setSearch('');
    setStatusFilter('all');
    setClientFilter('all');
    setDateFrom('');
  }

  return (
    <div className="entity-list allotment-table-stack quote-list-shell">
      {error ? <p className="form-error">{error}</p> : null}

      <section className="workspace-section quote-list-filters">
        <div className="workspace-section-head">
          <div>
            <p className="eyebrow">Filter Bar</p>
            <h3>Find the right quote fast</h3>
          </div>
          <button type="button" className="secondary-button" onClick={resetFilters}>
            Reset
          </button>
        </div>

        <div className="quote-list-filter-grid">
          <label className="quote-list-filter-field">
            <span>Search</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search quote, client, or destination"
            />
          </label>

          <label className="quote-list-filter-field">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              {(['DRAFT', 'READY', 'SENT', 'ACCEPTED', 'CONFIRMED', 'REVISION_REQUESTED', 'EXPIRED', 'CANCELLED'] as QuoteStatus[]).map((status) => (
                <option key={status} value={status}>
                  {formatQuoteStatus(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="quote-list-filter-field">
            <span>Client</span>
            <select value={clientFilter} onChange={(event) => setClientFilter(event.target.value)}>
              <option value="all">All clients</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>

          <label className="quote-list-filter-field">
            <span>Travel from</span>
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>
        </div>

        {activeFilters.length > 0 ? (
          <div className="quote-list-active-filters">
            {activeFilters.map((filter) => (
              <span key={filter} className="page-tab-badge">
                {filter}
              </span>
            ))}
          </div>
        ) : null}
      </section>

      {filteredQuotes.length === 0 ? (
        <p className="empty-state">No quotes match the current filters.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table allotment-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Client</th>
                <th>Dates</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.map((quote) => {
                const expired = isQuoteExpired(quote);

                return (
                  <tr key={quote.id} className={expired ? 'quote-card-expired' : undefined}>
                    <td>
                      <strong>{quote.title}</strong>
                      <div className="table-subcopy">{quote.quoteNumber || 'Quote number pending'}</div>
                      <div className="table-subcopy">
                        {getValidatedTripSummary({
                          quoteTitle: quote.title,
                          quoteDescription: quote.description,
                          totalPax: quote.adults + quote.children,
                          nightCount: quote.nightCount,
                        })}
                      </div>
                    </td>
                    <td>
                      <strong>{quote.company.name}</strong>
                      <div className="table-subcopy">
                        {quote.contact.firstName} {quote.contact.lastName}
                      </div>
                    </td>
                    <td>
                      <strong>{formatDate(quote.travelStartDate)}</strong>
                      <div className="table-subcopy">Valid until: {formatDate(quote.validUntil)}</div>
                    </td>
                    <td>
                      <span className={`status-badge${expired ? ' status-badge-expired' : ''}`}>{formatQuoteStatus(quote.status)}</span>
                    </td>
                    <td>
                      <div className="table-action-row">
                        <Link href={`/quotes/${quote.id}`} className="compact-button">
                          View
                        </Link>
                        <Link href={`/quotes/${quote.id}?tab=overview`} className="compact-button">
                          Edit
                        </Link>
                        <button
                          type="button"
                          className="compact-button compact-button-danger"
                          onClick={() => handleDelete(quote)}
                          disabled={deletingId === quote.id}
                        >
                          {deletingId === quote.id ? 'Deleting...' : 'Delete'}
                        </button>
                        {quote.invoice ? (
                          <Link href={`/invoices/${quote.invoice.id}`} className="compact-button">
                            Invoice
                          </Link>
                        ) : (
                          <span className="table-subcopy">Invoice pending</span>
                        )}
                        {quote.booking ? (
                          <Link href={`/bookings/${quote.booking.id}`} className="compact-button">
                            Booking
                          </Link>
                        ) : quote.status === 'ACCEPTED' || quote.status === 'CONFIRMED' ? (
                          <ConvertToBookingButton quoteId={quote.id} label="Create Booking" />
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
