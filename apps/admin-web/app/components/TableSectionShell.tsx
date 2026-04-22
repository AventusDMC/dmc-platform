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
};

export function TableSectionShell({
  title,
  description,
  context,
  actions,
  createPanel,
  emptyState,
  children,
}: TableSectionShellProps) {
  return (
    <section className="table-section-shell">
      <SectionHeader title={title} description={description} context={context} actions={actions} />
      {createPanel ? <div className="table-section-create">{createPanel}</div> : null}
      {children ? <div className="table-section-body">{children}</div> : null}
      {!children && emptyState ? <div className="table-section-empty section-header-card">{emptyState}</div> : null}
    </section>
  );
}
