import { ReactNode } from 'react';

type PageActionBarProps = {
  title?: string;
  description?: string;
  children: ReactNode;
};

export function PageActionBar({ title, description, children }: PageActionBarProps) {
  return (
    <section className="page-action-bar">
      {title || description ? (
        <div className="page-action-bar-copy">
          {title ? <h2 className="page-action-bar-title">{title}</h2> : null}
          {description ? <p>{description}</p> : null}
        </div>
      ) : null}
      <div className="page-action-bar-actions">{children}</div>
    </section>
  );
}
