import { adminPageFetchJson } from '../lib/admin-server';
import { TableSectionShell } from '../components/TableSectionShell';
import { RoomCategoriesManager, type RoomCategorySummary } from '../hotel-room-categories/RoomCategoriesManager';
import { BareRoomCategoryForm } from '../hotel-room-categories/BareRoomCategoryForm';

// Hotel Master Room Categories — binary isolation ladder.
//
// PR #125 confirmed the freeze persists AFTER the lightweight summary
// endpoint loads cleanly — the runaway render is inside a Room
// Categories client subcomponent. This module is now the binary-
// search gate for the hunt.
//
// `?cats=<mode>` controls how much of the Room Categories tree
// hydrates. We start with the most minimal payload and re-enable
// layers one-by-one until the freeze returns; the LAST layer added
// is the culprit.
//
// Modes (least heavy → heaviest):
//   minimal       — only "Loaded X room categories" static text.
//                   No client component mounts.
//   table         — adds the table rows. No form, no expand, no
//                   delete. Read-only static grid.
//   form          — adds the inline create form below the table.
//   expand        — adds expandable detail loader (the
//                   per-category /hotels/room-categories/:id fetch).
//   full          — everything (default, matches pre-isolation
//                   behaviour). Operator can verify the issue
//                   reproduces.
//
// We default to `minimal` so the page never freezes again from a
// cold visit. Operators (or QA) add `?cats=full` to reproduce the
// runaway and identify which layer trips it.

const API_BASE_URL = '/api';

export type RoomCategoriesIsolationMode = 'minimal' | 'table' | 'form' | 'expand' | 'full' | 'formSafeOnly' | 'managerOnly';

function resolveIsolationMode(value: string | undefined): RoomCategoriesIsolationMode {
  switch (value) {
    case 'full':
    case 'expand':
    case 'form':
    case 'table':
    case 'minimal':
    case 'formSafeOnly':
    case 'managerOnly':
      return value;
    default:
      // Default to minimal — see module header. The shell already
      // forces operators to click "Load room categories" before this
      // section even mounts, so they've explicitly consented to
      // loading at this point; we keep it minimal until they opt
      // into more.
      return 'minimal';
  }
}

async function getRoomCategoriesSummary(hotelId?: string): Promise<RoomCategorySummary[]> {
  const url = hotelId
    ? `${API_BASE_URL}/hotels/room-categories-summary?hotelId=${encodeURIComponent(hotelId)}`
    : `${API_BASE_URL}/hotels/room-categories-summary`;
  return adminPageFetchJson<RoomCategorySummary[]>(url, 'Room categories summary', {
    cache: 'no-store',
  });
}

// Companion fetch — minimal list of (hotel id, name) tuples used by
// the "add room category" form's dropdown. Comes from the summary too
// (we already have hotel name + id on each row) so the page never
// calls the heavy hotels list endpoint a second time.
function collectHotelOptions(summary: RoomCategorySummary[]) {
  const byId = new Map<string, { id: string; name: string; city: string }>();
  for (const row of summary) {
    if (!byId.has(row.hotelId)) {
      byId.set(row.hotelId, { id: row.hotelId, name: row.hotelName, city: row.hotelCity });
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

type RoomCategoriesSectionProps = {
  hotelId?: string;
  catsMode?: string;
  // ROOM_CATEGORY_FORM_SAFE — when `?formSafe=1` is in the URL, the
  // RoomCategoryForm renders uncontrolled HTML inputs instead of the
  // controlled-state variant. Lets us split "is the freeze in the
  // form component as a whole" from "is the freeze in controlled-
  // input churn specifically".
  formSafeMode?: boolean;
  // EXPAND_SAFE — when `?expandSafe=1` is in the URL, the
  // RoomCategoryDetailPanel renders only the category name, no
  // contracts list, no counts grid, no derived grouping. Used to
  // bisect the `?cats=expand` freeze.
  expandSafeMode?: boolean;
  // ?noInstrument=1 — disables every diagnostic hook (render counter,
  // hard guard, router guard, fetch guard). Rules out instrumentation
  // as the loop source.
  disableInstrumentation?: boolean;
};

export async function RoomCategoriesSection({
  hotelId,
  catsMode,
  formSafeMode = false,
  expandSafeMode = false,
  disableInstrumentation = false,
}: RoomCategoriesSectionProps = {}) {
  const isolationMode = resolveIsolationMode(catsMode);
  const summary = await getRoomCategoriesSummary(hotelId);
  const hotels = collectHotelOptions(summary);
  const activeCount = summary.filter((row) => row.isActive).length;

  // managerOnly — strips TableSectionShell + isolation ladder. Mounts
  // ONLY <RoomCategoriesManager /> directly under a plain <section>.
  // Cuts every server-side wrapper that minimal mode still kept.
  //
  // The manager itself receives `isolationMode="full"` so internally
  // it renders the same way as full mode — the only difference from
  // `?cats=full` is the absence of the ladder + shell wrappers.
  //
  // If managerOnly works but full fails → loop is in TableSectionShell
  // or the IsolationLadder (FormSafeToggleLink suspect, since it was
  // added in PR #127).
  // If managerOnly ALSO fails → loop is in the manager itself (or in
  // an instrumentation hook). Next step is to disable the hooks one
  // by one via env var (already wired into the manager — see
  // disableInstrumentation prop below).
  if (isolationMode === 'managerOnly') {
    return (
      <section data-testid="room-categories-manager-only" style={{ padding: '1rem' }}>
        <p style={{ fontSize: '0.78rem', color: '#475467', margin: '0 0 0.5rem' }}>
          managerOnly — TableSectionShell + isolation ladder stripped. {summary.length} room
          categories loaded.
        </p>
        <RoomCategoriesManager
          apiBaseUrl={API_BASE_URL}
          hotels={hotels}
          initialSummary={summary}
          isolationMode="full"
          formSafeMode={formSafeMode}
          expandSafeMode={expandSafeMode}
          disableInstrumentation={disableInstrumentation}
        />
      </section>
    );
  }

  // formSafeOnly — the nuclear isolation level. Bypasses everything:
  // no TableSectionShell, no isolation ladder, no manager wrapper,
  // no error boundary, no render counters. Just the form leaf mounted
  // bare. If THIS freezes, the runaway is in something React itself
  // does during hydration of the form (router subscription, context
  // provider chain, etc.), NOT in our code. If it renders cleanly,
  // the issue is in one of the wrappers we stripped.
  if (isolationMode === 'formSafeOnly') {
    return (
      <section data-testid="room-categories-form-safe-only" style={{ padding: '1rem' }}>
        <p style={{ fontSize: '0.78rem', color: '#475467', margin: '0 0 0.5rem' }}>
          formSafeOnly — bare form mount, zero shell. Loaded {summary.length} room categories.
        </p>
        <BareRoomCategoryForm apiBaseUrl={API_BASE_URL} hotels={hotels} />
      </section>
    );
  }

  // Minimal isolation mode — no client component mounts, just the
  // count. If this freezes, the runaway is OUTSIDE the Room
  // Categories subtree (probably WorkspaceShell or the summary strip).
  if (isolationMode === 'minimal') {
    return (
      <TableSectionShell
        title="Room Category Setup"
        description="Binary isolation — minimal mode. Click an option below to enable the next layer."
        context={<p data-testid="room-categories-minimal-count">Loaded {summary.length} room categories.</p>}
      >
        <RoomCategoriesIsolationLadder currentMode={isolationMode} hotelId={hotelId} formSafeMode={formSafeMode} />
      </TableSectionShell>
    );
  }

  return (
    <TableSectionShell
      title="Room Category Setup"
      description="Define sellable room categories per hotel so contracts and rates can reference structured room inventory."
      context={
        <p>
          {summary.length} room categories in scope &middot; {activeCount} active &middot;
          {' '}
          {hotels.length} hotel{hotels.length === 1 ? '' : 's'}
        </p>
      }
    >
      <RoomCategoriesIsolationLadder currentMode={isolationMode} hotelId={hotelId} formSafeMode={formSafeMode} />
      <RoomCategoriesManager
        apiBaseUrl={API_BASE_URL}
        hotels={hotels}
        initialSummary={summary}
        isolationMode={isolationMode}
        formSafeMode={formSafeMode}
        expandSafeMode={expandSafeMode}
        disableInstrumentation={disableInstrumentation}
      />
    </TableSectionShell>
  );
}

// Server-rendered ladder that lets operators step through the
// isolation modes without typing URLs. Each Link preserves the
// load/tab/formSafe params and only flips `cats`.
function RoomCategoriesIsolationLadder({
  currentMode,
  hotelId,
  formSafeMode,
}: {
  currentMode: RoomCategoriesIsolationMode;
  hotelId: string | undefined;
  formSafeMode: boolean;
}) {
  const modes: Array<{ id: RoomCategoriesIsolationMode; label: string; helper: string }> = [
    { id: 'formSafeOnly', label: 'Form-only', helper: 'Bare form mount — no shell, no router, no React state' },
    { id: 'managerOnly', label: 'Manager-only', helper: 'Manager mounted directly — no shell, no ladder' },
    { id: 'minimal', label: 'Minimal', helper: 'Static count only — zero client mounts' },
    { id: 'table', label: 'Table', helper: 'Adds read-only summary table' },
    { id: 'form', label: 'Form', helper: 'Adds inline create form' },
    { id: 'expand', label: 'Expand', helper: 'Adds per-row detail loader' },
    { id: 'full', label: 'Full', helper: 'Everything (default before isolation)' },
  ];
  return (
    <nav
      aria-label="Room categories isolation ladder"
      data-testid="room-categories-isolation-ladder"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.4rem',
        padding: '0.6rem',
        background: '#f9fafb',
        border: '1px dashed #d0d5dd',
        borderRadius: 8,
        marginBottom: '0.75rem',
      }}
    >
      <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#475467', marginRight: '0.3rem' }}>
        Isolation:
      </span>
      {modes.map((mode) => {
        const params = new URLSearchParams();
        params.set('tab', 'room-categories');
        params.set('load', '1');
        if (hotelId) params.set('hotelId', hotelId);
        if (formSafeMode) params.set('formSafe', '1');
        params.set('cats', mode.id);
        const href = `/hotels?${params.toString()}`;
        const isCurrent = mode.id === currentMode;
        return (
          <a
            key={mode.id}
            href={href}
            title={mode.helper}
            data-testid={`room-categories-isolation-${mode.id}`}
            aria-current={isCurrent ? 'page' : undefined}
            style={{
              padding: '0.25rem 0.6rem',
              fontSize: '0.78rem',
              fontWeight: 600,
              borderRadius: 999,
              textDecoration: 'none',
              background: isCurrent ? '#1d4ed8' : '#fff',
              color: isCurrent ? '#fff' : '#1d4ed8',
              border: `1px solid ${isCurrent ? '#1d4ed8' : '#bfdbfe'}`,
            }}
          >
            {mode.label}
          </a>
        );
      })}
      {/* formSafe toggle — separate ladder row so operators can switch
          to uncontrolled-input form variant without leaving the
          current cats= mode. */}
      <FormSafeToggleLink hotelId={hotelId} currentMode={currentMode} formSafeMode={formSafeMode} />
    </nav>
  );
}

function FormSafeToggleLink({
  hotelId,
  currentMode,
  formSafeMode,
}: {
  hotelId: string | undefined;
  currentMode: RoomCategoriesIsolationMode;
  formSafeMode: boolean;
}) {
  const params = new URLSearchParams();
  params.set('tab', 'room-categories');
  params.set('load', '1');
  params.set('cats', currentMode);
  if (hotelId) params.set('hotelId', hotelId);
  if (!formSafeMode) params.set('formSafe', '1');
  const href = `/hotels?${params.toString()}`;
  return (
    <a
      href={href}
      title={formSafeMode ? 'Restore controlled-input form' : 'Switch form to uncontrolled HTML inputs (no React state churn)'}
      data-testid="room-categories-form-safe-toggle"
      style={{
        padding: '0.25rem 0.6rem',
        fontSize: '0.78rem',
        fontWeight: 600,
        borderRadius: 999,
        textDecoration: 'none',
        background: formSafeMode ? '#dc2626' : '#fff',
        color: formSafeMode ? '#fff' : '#dc2626',
        border: `1px solid ${formSafeMode ? '#dc2626' : '#fecaca'}`,
        marginLeft: 'auto',
      }}
    >
      {formSafeMode ? 'Form: SAFE' : 'Form: SAFE off'}
    </a>
  );
}
