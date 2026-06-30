import type { DocumentsVM } from '../../../app/operations/v2/ops-documents-vm';
import { DisabledAction } from './disabled-action';
import { DocumentsList } from './documents-list';
import { OpenInClassicButton } from './open-in-classic-button';
import { ReadOnlyNotice } from './read-only-notice';

/**
 * Documents tab body (read-only preview). Lists documents derived from booking
 * detail (vouchers, manifest readiness, supplier-confirmation pointer). Every
 * document action renders DISABLED + "Coming later" — no real generate, download,
 * send, preview, export, or print mechanics; no PDF or export hrefs, no forms,
 * no inputs.
 */
export function DocumentsTab({ vm, bookingId }: { vm: DocumentsVM; bookingId: string }) {
  return (
    <div className="space-y-6">
      <ReadOnlyNotice message="Document generation, download, and sending are disabled in this preview. Changes are made in Classic." />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold text-foreground">Documents</h2>
        <OpenInClassicButton href={`/bookings/${bookingId}?tab=documents`} label="Open documents in Classic" />
      </div>

      {/* Future document actions — disabled in Round 1. */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <DisabledAction label="Generate" />
        <DisabledAction label="Download" />
        <DisabledAction label="Send" />
        <DisabledAction label="Preview" />
        <DisabledAction label="Export" />
        <DisabledAction label="Print" />
      </div>

      {vm.groups.map((group) => (
        <DocumentsList key={group.title} group={group} />
      ))}
    </div>
  );
}
