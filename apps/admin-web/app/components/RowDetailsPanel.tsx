'use client';

import { ReactNode, useRef } from 'react';

type RowDetailsPanelProps = {
  summary: string;
  description?: string;
  defaultOpen?: boolean;
  className?: string;
  bodyClassName?: string;
  groupId?: string;
  children: ReactNode;
};

export function RowDetailsPanel({
  summary,
  description,
  defaultOpen = false,
  className = '',
  bodyClassName = '',
  groupId,
  children,
}: RowDetailsPanelProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  function handleToggle() {
    const current = detailsRef.current;

    if (!current || !groupId || !current.open) {
      return;
    }

    const selector = `details[data-row-details-group="${groupId}"]`;
    document.querySelectorAll<HTMLDetailsElement>(selector).forEach((panel) => {
      if (panel !== current) {
        panel.open = false;
      }
    });
  }

  return (
    <details
      ref={detailsRef}
      className={`row-details-panel operations-collapsible-panel ${className}`.trim()}
      open={defaultOpen}
      data-row-details-group={groupId}
      onToggle={handleToggle}
    >
      <summary className="row-details-summary operations-collapsible-summary">
        <span>{summary}</span>
        {description ? <span className="table-subcopy">{description}</span> : null}
      </summary>
      <div className={`row-details-body operations-row-details-body ${bodyClassName}`.trim()}>{children}</div>
    </details>
  );
}
