import { ReactNode } from 'react';
import { SectionHeader } from './SectionHeader';

type TableSectionShellProps = {
  title: string;
  description?: string;
  context?: ReactNode;
  actions?: ReactNode;
  createPanel?: ReactNode;
  emptyState?: ReactNode;
  children?: ReactNode;
  className?: string;
};

export function TableSectionShell({
  title,
  description,
  context,
  actions,
  createPanel,
  emptyState,
  children,
  className = '',
}: TableSectionShellProps) {
  return (
    <section className={`table-section-shell app-card app-section app-table-section ${className}`.trim()}>
      <SectionHeader title={title} description={description} context={context} actions={actions} />
      {createPanel ? <div className="table-section-create">{createPanel}</div> : null}
      {children ? <div className="table-section-body app-table-section-body">{children}</div> : null}
      {!children && emptyState ? <div className="table-section-empty section-header-card">{emptyState}</div> : null}
    </section>
  );
}
