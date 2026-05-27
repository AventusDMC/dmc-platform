import { RoomCategoriesDebugIsland } from './RoomCategoriesDebugIsland';

// Standalone debug route — `/hotels-room-categories-debug`.
//
// Bypasses the entire /hotels page wrapper (WorkspaceShell, summary
// strip, ModuleSwitcher with useSearchParams, HotelsDirectoryErrorBoundary,
// HotelsPerfDebugPanel, RoomCategoriesIsolationLadder, TableSectionShell)
// so we can answer the next question definitively:
//
//   "Does RoomCategoriesManager itself freeze, or is the freeze in
//    something the /hotels page mounts around it?"
//
// If this route renders cleanly → the loop is in one of the /hotels
// page wrappers, NOT in the manager. If this route ALSO freezes → the
// loop is inside RoomCategoriesManager / RoomCategoriesManagerInner.
//
// The debug page also accepts ?manager=off to skip mounting the
// manager entirely (renders only static text), so we can confirm
// whether the freeze is the page itself rather than the manager.

export const dynamic = 'force-dynamic';

type DebugPageProps = {
  searchParams?: Promise<{ manager?: string; size?: string }>;
};

export default async function HotelsRoomCategoriesDebugPage({ searchParams }: DebugPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const managerEnabled = params?.manager !== 'off';
  const fixtureSize = Math.min(Math.max(Number(params?.size || '4'), 1), 50);

  return (
    <main style={{ padding: '1.5rem', maxWidth: 960, margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1 style={{ margin: 0 }}>Room Categories standalone debug</h1>
      <p style={{ color: '#475467', fontSize: '0.85rem' }}>
        Bypasses the /hotels page wrapper entirely. If this renders cleanly, the freeze is in
        one of the wrappers (WorkspaceShell, ModuleSwitcher, summary strip, error boundary,
        perf overlay). If this ALSO freezes, the runaway is inside RoomCategoriesManager.
      </p>
      <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: '0.3rem 0 1rem' }}>
        Tip: append <code>?manager=off</code> to skip mounting the manager. Append{' '}
        <code>?size=N</code> (1–50) to vary the mock fixture row count.
      </p>
      {managerEnabled ? (
        <RoomCategoriesDebugIsland fixtureSize={fixtureSize} />
      ) : (
        <section
          data-testid="hotels-room-categories-debug-no-manager"
          style={{ background: '#f9fafb', border: '1px solid #d0d5dd', padding: '1rem', borderRadius: 8 }}
        >
          Manager skipped. If this still freezes, the freeze is in the debug page itself (extremely unlikely).
        </section>
      )}
    </main>
  );
}
