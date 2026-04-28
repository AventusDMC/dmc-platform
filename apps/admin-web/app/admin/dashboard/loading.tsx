export default function AdminDashboardLoading() {
  return (
    <main className="page">
      <section className="panel reports-dashboard admin-dashboard-page">
        <div className="page-header">
          <div>
            <p className="eyebrow">Internal/Admin only</p>
            <h1>Admin Dashboard</h1>
          </div>
        </div>
        <section className="dashboard-grid" aria-label="Loading dashboard metrics">
          {['Revenue', 'Profit', 'Receivables', 'Overdue', 'Bookings', 'Margin'].map((label) => (
            <article className="dashboard-card reports-loading-card" key={label}>
              <span>{label}</span>
              <strong>Loading...</strong>
              <p>Fetching dashboard data</p>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
