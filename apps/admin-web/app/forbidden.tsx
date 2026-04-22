export default function ForbiddenPage() {
  return (
    <main className="page">
      <section className="detail-card" style={{ maxWidth: 640 }}>
        <p className="eyebrow">Access denied</p>
        <h1>Permission required</h1>
        <p className="detail-copy">
          You are signed in, but your account does not have permission to view this area. If this looks incorrect, ask an
          administrator to review your role access.
        </p>
      </section>
    </main>
  );
}
