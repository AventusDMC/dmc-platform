import Link from 'next/link';

// Hotels safe shell — click-to-load gate.
//
// The initial /hotels visit renders ONLY this shell (header + tabs +
// two Load buttons). The expensive tab body (HotelDirectory cards,
// filters, room category summaries, contract summary strip) mounts
// ONLY after the operator clicks the matching "Load" button.
//
// Bypass: append `?load=1` to the URL (e.g. `/hotels?tab=room-categories&load=1`).
// The shell links carry that flag automatically.
//
// Trade-off: one extra click on the first visit per tab, in exchange
// for the page never doing heavy server-side work until the operator
// has consented to it. Cold visits stay snappy and a regression in
// any tab body can't cascade into the workspace header.

export type HotelsSafeShellProps = {
  activeTab: string;
  activeTabLabel: string;
  searchParams?: Record<string, string | undefined>;
};

export function HotelsSafeShell({ activeTab, activeTabLabel, searchParams }: HotelsSafeShellProps) {
  // Preserve every search param the operator already had AND set load=1
  // so the link reloads the same tab fully hydrated.
  const params = new URLSearchParams();
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && key !== 'load') {
        params.set(key, value);
      }
    }
  }
  if (!params.has('tab')) params.set('tab', activeTab);
  params.set('load', '1');
  const loadHref = `/hotels?${params.toString()}`;

  // Separate explicit load links for the two specifically called-out
  // workspaces in the spec — operators see exactly what they will load.
  const directoryParams = new URLSearchParams(params);
  directoryParams.set('tab', 'hotels');
  const directoryHref = `/hotels?${directoryParams.toString()}`;

  const roomCategoriesParams = new URLSearchParams(params);
  roomCategoriesParams.set('tab', 'room-categories');
  const roomCategoriesHref = `/hotels?${roomCategoriesParams.toString()}`;

  return (
    <div
      className="detail-card"
      data-testid="hotels-safe-shell"
      data-active-tab={activeTab}
      role="region"
      aria-label="Hotels safe-shell load gate"
    >
      <p className="eyebrow">Safe mode</p>
      <h2>Click to load {activeTabLabel.toLowerCase()}</h2>
      <p className="detail-copy">
        The Hotels workspace is in safe-shell mode while a frontend render-loop is being
        investigated. Nothing heavy mounts on initial load — choose what to load below.
      </p>

      <div
        style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}
        data-testid="hotels-safe-shell-buttons"
      >
        <Link className="primary-button" href={loadHref}>
          Load {activeTabLabel.toLowerCase()}
        </Link>
        {activeTab !== 'hotels' ? (
          <Link className="compact-button" href={directoryHref}>
            Load hotels directory
          </Link>
        ) : null}
        {activeTab !== 'room-categories' ? (
          <Link className="compact-button" href={roomCategoriesHref}>
            Load room categories
          </Link>
        ) : null}
      </div>

      <p className="table-subcopy" style={{ marginTop: '0.75rem' }}>
        Tip: append <code>?load=1</code> to the URL to skip this gate.
      </p>
    </div>
  );
}
