import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
import { AdminBreadcrumbs } from '../components/AdminBreadcrumbs';

export const dynamic = 'force-dynamic';

type DriverRecord = {
  id: string;
  fullName: string;
  phone: string | null;
  licenseNumber: string | null;
  languages: string[];
  supplierId: string | null;
  active: boolean;
  notes: string | null;
  bookingServices?: Array<{ id: string }>;
};

type SupplierOption = { id: string; name: string; type?: string | null };

async function loadDrivers(): Promise<DriverRecord[]> {
  try {
    return await adminPageFetchJson<DriverRecord[]>('/api/drivers', 'Drivers', { cache: 'no-store' });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[drivers] list unavailable', error);
    return [];
  }
}

async function loadSuppliers(): Promise<SupplierOption[]> {
  try {
    return await adminPageFetchJson<SupplierOption[]>('/api/suppliers', 'Suppliers', { cache: 'no-store' });
  } catch {
    return [];
  }
}

export default async function DriversPage({ searchParams }: { searchParams?: Promise<{ success?: string; error?: string }> }) {
  const resolved = searchParams ? await searchParams : undefined;
  const [drivers, suppliers] = await Promise.all([loadDrivers(), loadSuppliers()]);
  const supplierById = new Map(suppliers.map((s) => [s.id, s] as const));
  const transportSuppliers = suppliers.filter((s) => /(TRANSPORT|TRANSFER|LOGISTIC|VEHICLE|FLEET)/i.test(`${s.type || ''} ${s.name || ''}`));
  const supplierOptions = transportSuppliers.length > 0 ? transportSuppliers : suppliers;

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs items={[{ label: 'Operations', href: '/operations' }, { label: 'Drivers' }]} />
        <h1>Drivers</h1>
        <p className="admin-muted-copy">
          Transport drivers available for booking-service assignment. Linked to a supplier so the operations grid can show
          same-supplier drivers first when assigning a transport row.
        </p>
      </div>

      {resolved?.success ? (
        <section className="success-banner" aria-label="Driver action">
          <p>{resolved.success}</p>
        </section>
      ) : null}
      {resolved?.error ? (
        <section className="warning-banner" aria-label="Driver action error">
          <p className="form-error">{resolved.error}</p>
        </section>
      ) : null}

      <section
        style={{
          background: '#ffffff',
          border: '1px solid #e4e7ec',
          borderRadius: 10,
          padding: '1rem',
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Add driver</h2>
        <form
          method="POST"
          action="/api/drivers"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Full name *</span>
            <input name="fullName" required placeholder="Ahmed Al-Khatib" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Phone</span>
            <input name="phone" placeholder="+962 79 555 1102" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>License number</span>
            <input name="licenseNumber" placeholder="JD-DR-2241" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Languages (comma-separated)</span>
            <input name="languages" placeholder="Arabic, English" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Supplier (optional)</span>
            <select name="supplierId" defaultValue="">
              <option value="">No supplier (freelance)</option>
              {supplierOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', gridColumn: '1 / -1' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Notes</span>
            <input name="notes" placeholder="Optional notes about availability, vehicle preferences, etc." />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="button button-primary">Add driver</button>
          </div>
        </form>
      </section>

      <section style={{ background: '#ffffff', border: '1px solid #e4e7ec', borderRadius: 10, padding: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>
          {drivers.length} driver{drivers.length === 1 ? '' : 's'}
        </h2>
        {drivers.length === 0 ? (
          <p style={{ color: '#667085' }}>
            No drivers yet. Add one above so transport rows in the operations grid can be assigned a driver.
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Name</th>
                <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Phone</th>
                <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>License</th>
                <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Languages</th>
                <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Supplier</th>
                <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Active</th>
                <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Assignments</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => {
                const supplier = d.supplierId ? supplierById.get(d.supplierId) : null;
                return (
                  <tr key={d.id} style={{ borderBottom: '1px solid #f2f4f7' }}>
                    <td style={{ padding: '0.5rem' }}>
                      <strong>{d.fullName}</strong>
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      {d.phone ? <a href={`tel:${d.phone}`}>{d.phone}</a> : <span style={{ color: '#98a2b3' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.5rem', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {d.licenseNumber || <span style={{ color: '#98a2b3' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      {Array.isArray(d.languages) && d.languages.length > 0 ? d.languages.join(', ') : <span style={{ color: '#98a2b3' }}>—</span>}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      {supplier?.name || (d.supplierId ? <code style={{ fontSize: '0.7rem' }}>{d.supplierId.slice(0, 8)}…</code> : <span style={{ color: '#98a2b3' }}>Freelance</span>)}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      <span
                        style={{
                          background: d.active ? '#ecfdf3' : '#f2f4f7',
                          color: d.active ? '#067647' : '#475467',
                          padding: '0.1rem 0.5rem',
                          borderRadius: 999,
                          fontSize: '0.75rem',
                          fontWeight: 600,
                        }}
                      >
                        {d.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ padding: '0.5rem', color: '#475467' }}>
                      {Array.isArray(d.bookingServices) ? d.bookingServices.length : 0}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
