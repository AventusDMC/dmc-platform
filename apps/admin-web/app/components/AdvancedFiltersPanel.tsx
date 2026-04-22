'use client';

import { ReactNode } from 'react';

type AdvancedFiltersPanelProps = {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
};

export function AdvancedFiltersPanel({
  title,
  description,
  defaultOpen = false,
  className = '',
  children,
}: AdvancedFiltersPanelProps) {
  return (
    <details className={`advanced-filters-panel operations-collapsible-panel ${className}`.trim()} open={defaultOpen}>
      <summary className="advanced-filters-summary operations-collapsible-summary">
        <span>{title}</span>
        {description ? <span className="table-subcopy">{description}</span> : null}
      </summary>
      <div className="advanced-filters-body operations-filter-detail-grid">{children}</div>
    </details>
  );
}
