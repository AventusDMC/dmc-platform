import type { DocumentGroupVM } from '../../../app/operations/v2/ops-documents-vm';
import { FileText } from 'lucide-react';
import { OperationalStatusBadge } from './operational-status-badge';

function dateLabel(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(d);
}

/**
 * Read-only documents list, grouped by type. Display only — no generate,
 * download, send, preview, export, or print mechanics, no forms, no inputs.
 * Renders only allowlisted document fields (never voucher snapshot JSON or
 * financials).
 */
export function DocumentsList({ group }: { group: DocumentGroupVM }) {
  return (
    <section aria-label={group.title} className="space-y-2">
      <h3 className="font-heading text-sm font-semibold text-foreground">{group.title}</h3>
      {group.documents.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing generated yet.
        </div>
      ) : (
        <ul className="space-y-2">
          {group.documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{doc.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {[doc.sourceService, doc.supplier, doc.details].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {doc.date ? <span className="text-xs text-muted-foreground">{dateLabel(doc.date)}</span> : null}
                <OperationalStatusBadge variant={doc.statusVariant} label={doc.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
