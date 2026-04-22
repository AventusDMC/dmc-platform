'use client';

export type QuoteBulkActionNoticeState = {
  tone: 'success' | 'error';
  title: string;
  summary: string;
  affectedCount?: number;
  skippedCount?: number;
};

type QuoteBulkActionNoticeProps = {
  notice: QuoteBulkActionNoticeState | null;
};

export function QuoteBulkActionNotice({ notice }: QuoteBulkActionNoticeProps) {
  if (!notice) {
    return null;
  }

  return (
    <div className={`quote-bulk-notice quote-bulk-notice-${notice.tone}`} role="status" aria-live="polite">
      <div>
        <strong>{notice.title}</strong>
        <p>{notice.summary}</p>
      </div>
      {notice.affectedCount !== undefined || notice.skippedCount !== undefined ? (
        <div className="quote-bulk-notice-stats">
          {notice.affectedCount !== undefined ? (
            <span>{notice.affectedCount} updated</span>
          ) : null}
          {notice.skippedCount !== undefined ? (
            <span>{notice.skippedCount} skipped</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
