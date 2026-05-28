import Link from 'next/link';
import { RateHawkImportWizard } from './RateHawkImportWizard';

// Hotels Engine — RateHawk import wizard page.
//
// Server shell. Renders the wizard client component which talks to
// /api/ratehawk/* proxies. The wizard supports:
//   1. Sync inventory from RateHawk into staging (fixture-driven
//      until credentials arrive; live thereafter — same UI).
//   2. Filter staged candidates by country / city / star / search.
//   3. Multi-select rows + bulk import into the live hotels catalog.
//
// Imported candidates are auto-attached to an auto-created "RateHawk
// Inventory" supplier. The operator can switch the supplier on the
// hotel edit page after import.

export const dynamic = 'force-dynamic';

export default function ImportPage() {
  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <header style={{ marginBottom: '1.5rem' }}>
          <p className="eyebrow">Hotels Engine — Import hotels</p>
          <h1 className="section-title">RateHawk import wizard</h1>
          <p className="copy section-copy">
            Pull hotel master data (names, addresses, photos, descriptions, amenities) from
            RateHawk into the live hotels catalog. No rates — content only. Each imported
            hotel gets a full fact sheet pre-filled and can be edited like any other.
          </p>
          <p className="table-subcopy" style={{ marginTop: '0.5rem' }}>
            <Link href="/hotels" prefetch={false}>
              ← Back to hotels
            </Link>
          </p>
        </header>
        <RateHawkImportWizard />
      </section>
    </main>
  );
}
