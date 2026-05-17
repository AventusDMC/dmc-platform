import { adminPageFetchJson } from '../../lib/admin-server';
import { AgentDepartureRequestForm } from './AgentDepartureRequestForm';

type AgentDeparture = {
  id: string;
  seriesCode: string | null;
  seriesName: string;
  departureCode: string | null;
  departureDate: string | null;
  status: string;
  availability: {
    totalCapacity: number;
    seatsSold: number;
    seatsRemaining: number | null;
    guaranteed: boolean;
    soldOut: boolean;
    lowAvailability: boolean;
    stopSale: boolean;
  };
  guaranteed: boolean;
  soldOut: boolean;
  hotelCategories: string[];
  branchExtensions: string[];
  hotelCategoryAvailability?: Array<{
    name: string;
    availableRooms: number | null;
    stopSale: boolean;
    status: string;
  }>;
  branchAvailability?: Array<{
    name: string;
    status: string;
  }>;
  bookingRequest: {
    endpoint: string;
    requestOnly: boolean;
  };
  financials: {
    estimatedTotal: number;
    depositDue: number;
    balanceDue: number;
    currency: string;
    invoiceStatus: string;
  };
};

function formatDate(value: string | null) {
  return value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value)) : 'Date pending';
}

async function getDepartures() {
  return adminPageFetchJson<AgentDeparture[]>('/api/agent/departures', 'Agent departures', { cache: 'no-store' });
}

export default async function AgentDeparturesPage() {
  const departures = await getDepartures();

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="section-stack">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Agent Portal</p>
              <h1>Series departures</h1>
              <p className="detail-copy">Live regular tour availability with request-only booking workflow. Admin confirmation is required before seats are confirmed.</p>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Series</th>
                  <th>Departure</th>
                  <th>Date</th>
                  <th>Availability</th>
                  <th>Hotel categories</th>
                  <th>Branches</th>
                  <th>Financials</th>
                  <th>Status</th>
                  <th>Request</th>
                </tr>
              </thead>
              <tbody>
                {departures.map((departure) => (
                  <tr key={departure.id}>
                    <td>{departure.seriesCode ? `${departure.seriesCode} | ${departure.seriesName}` : departure.seriesName}</td>
                    <td>{departure.departureCode || departure.id}</td>
                    <td>{formatDate(departure.departureDate)}</td>
                    <td>
                      {departure.availability.seatsRemaining === null ? 'On request' : `${departure.availability.seatsRemaining} seats remaining`}
                      {departure.availability.lowAvailability ? <span className="status-badge">Low availability</span> : null}
                    </td>
                    <td>
                      {(departure.hotelCategoryAvailability || []).map((category) => `${category.name}: ${category.stopSale ? 'stop sale' : category.availableRooms === null ? 'on request' : `${category.availableRooms} rooms`}`).join(', ') || 'Category pending'}
                    </td>
                    <td>{(departure.branchAvailability || []).map((branch) => `${branch.name}: ${branch.status}`).join(', ') || departure.branchExtensions.join(', ') || 'Core program'}</td>
                    <td>
                      {departure.financials.estimatedTotal > 0 ? `${departure.financials.currency} ${departure.financials.estimatedTotal.toFixed(2)} est.` : 'On request'}
                      <br />
                      Deposit: {departure.financials.depositDue > 0 ? `${departure.financials.currency} ${departure.financials.depositDue.toFixed(2)}` : 'On request'}
                    </td>
                    <td><span className="status-badge">{departure.availability.stopSale ? 'Stop sale' : departure.soldOut ? 'Sold out' : departure.guaranteed ? 'Guaranteed' : departure.status}</span></td>
                    <td>
                      <AgentDepartureRequestForm
                        departureId={departure.id}
                        endpoint={departure.bookingRequest.endpoint}
                        disabled={departure.availability.stopSale}
                        hotelCategories={departure.hotelCategories}
                        branchExtensions={departure.branchExtensions}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
