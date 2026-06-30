export type OpsTabId = 'operations' | 'passengers' | 'finance' | 'documents' | 'activity';

export const OPS_TABS: { id: OpsTabId; label: string }[] = [
  { id: 'operations', label: 'Operations' },
  { id: 'passengers', label: 'Passengers & Rooming' },
  { id: 'finance', label: 'Finance' },
  { id: 'documents', label: 'Documents' },
  { id: 'activity', label: 'Activity' },
];

/**
 * URL-param tab navigation (?tab=). Server-rendered links — navigation only,
 * deep-linkable, back-button friendly. No client state.
 */
export function OpsWorkspaceTabs({ bookingId, active }: { bookingId: string; active: OpsTabId }) {
  return (
    <nav aria-label="Booking operations sections" className="border-b border-border px-4 md:px-6">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap gap-1">
        {OPS_TABS.map((tab) => {
          const isActive = tab.id === active;
          return (
            <a
              key={tab.id}
              href={`/operations/v2/${bookingId}?tab=${tab.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
