'use client';

import { ReactNode, useState } from 'react';

type CollapsibleCreatePanelProps = {
  title: string;
  description?: string;
  triggerLabelOpen?: string;
  triggerLabelClose?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function CollapsibleCreatePanel({
  title,
  description,
  triggerLabelOpen = 'Add new',
  triggerLabelClose = 'Hide form',
  defaultOpen = false,
  children,
}: CollapsibleCreatePanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="collapsible-create-panel">
      <div className="collapsible-create-panel-head">
        <div>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        <button type="button" className="compact-button" onClick={() => setIsOpen((current) => !current)}>
          {isOpen ? triggerLabelClose : triggerLabelOpen}
        </button>
      </div>
      {isOpen ? <div className="collapsible-create-panel-body">{children}</div> : null}
    </section>
  );
}
