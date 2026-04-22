import { ReactNode } from 'react';

type DashboardListItemProps = {
  title: ReactNode;
  meta?: ReactNode;
  summary?: ReactNode;
  chips?: ReactNode;
  aside?: ReactNode;
};

export function DashboardListItem({ title, meta, summary, chips, aside }: DashboardListItemProps) {
  return (
    <article className="dashboard-list-item">
      <div className="dashboard-list-item-copy">
        <div className="dashboard-list-item-title">{title}</div>
        {meta ? <div className="dashboard-list-item-meta">{meta}</div> : null}
        {summary ? <div className="dashboard-list-item-summary">{summary}</div> : null}
        {chips ? <div className="dashboard-issue-links">{chips}</div> : null}
      </div>
      {aside ? <div className="dashboard-list-item-aside">{aside}</div> : null}
    </article>
  );
}
