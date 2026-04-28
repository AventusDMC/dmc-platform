export default function ReportsLoading() {
  return (
    <main className="page">
      <section className="panel reports-dashboard">
        <div className="page-header">
          <div>
            <p className="eyebrow">Reports</p>
            <h1>Reporting Dashboard</h1>
          </div>
        </div>
        <section className="dashboard-grid" aria-label="Loading report metrics">
          {['Revenue', 'Cost', 'Profit', 'Margin', 'Bookings', 'Cancelled'].map((label) => (
            <article className="dashboard-card reports-loading-card" key={label}>
              <span>{label}</span>
              <strong>Loading...</strong>
              <p>Fetching report data</p>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
