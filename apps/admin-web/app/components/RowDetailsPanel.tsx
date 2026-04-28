'use client';

import { ReactNode, useRef } from 'react';

type RowDetailsPanelProps = {
  id?: string;
  summary: string;
  description?: string;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  bodyClassName?: string;
  groupId?: string;
  children: ReactNode;
};

export function RowDetailsPanel({
  id,
  summary,
  description,
  defaultOpen = false,
  open,
  onOpenChange,
  className = '',
  bodyClassName = '',
  groupId,
  children,
}: RowDetailsPanelProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const isControlled = open !== undefined;

  function handleToggle() {
    const current = detailsRef.current;

    if (!current) {
      return;
    }

    onOpenChange?.(current.open);

    if (!groupId || !current.open) {
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
      id={id}
      ref={detailsRef}
      className={`row-details-panel operations-collapsible-panel ${className}`.trim()}
      {...(isControlled ? { open } : defaultOpen ? { open: true } : {})}
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
