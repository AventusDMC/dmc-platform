import { adminPageFetchJson } from '../../lib/admin-server';

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
    stopSale: boolean;
  };
  hotelCategories: string[];
  branchExtensions: string[];
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
              <p className="detail-copy">Read-only regular tour visibility for dates, seats remaining, hotel categories, branch extensions, and stop sale status.</p>
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
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {departures.map((departure) => (
                  <tr key={departure.id}>
                    <td>{departure.seriesCode ? `${departure.seriesCode} | ${departure.seriesName}` : departure.seriesName}</td>
                    <td>{departure.departureCode || departure.id}</td>
                    <td>{formatDate(departure.departureDate)}</td>
                    <td>{departure.availability.seatsRemaining === null ? 'On request' : `${departure.availability.seatsRemaining} seats remaining`}</td>
                    <td>{departure.hotelCategories.join(', ') || 'Category pending'}</td>
                    <td>{departure.branchExtensions.join(', ') || 'Core program'}</td>
                    <td><span className="status-badge">{departure.availability.stopSale ? 'Stop sale' : departure.status}</span></td>
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
