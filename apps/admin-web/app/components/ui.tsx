import Link from 'next/link';
import { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

type PolymorphicProps<T extends ElementType> = {
  as?: T;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'className' | 'children'>;

export function AppShell({ className, children, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cx('app-shell', className)} {...props}>
      {children}
    </div>
  );
}

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cx('page-header app-page-header', className)}>
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="detail-copy">{description}</p> : null}
      </div>
      {actions ? <div className="app-page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function PageContent({ className, children, ...props }: ComponentPropsWithoutRef<'section'>) {
  return (
    <section className={cx('page-content app-page-content', className)} {...props}>
      {children}
    </section>
  );
}

type AppCardProps<T extends ElementType = 'section'> = PolymorphicProps<T> & {
  tone?: 'default' | 'muted' | 'accent';
};

export function AppCard<T extends ElementType = 'section'>({
  as,
  tone = 'default',
  className,
  children,
  ...props
}: AppCardProps<T>) {
  const Component = as || 'section';

  return (
    <Component className={cx('app-card', tone !== 'default' && `app-card-${tone}`, className)} {...props}>
      {children}
    </Component>
  );
}

type AppButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  href?: string;
};

export function AppButton({ variant = 'primary', href, className, children, ...props }: AppButtonProps) {
  const buttonClassName = cx('app-button', `app-button-${variant}`, className);

  if (href) {
    return (
      <Link href={href} className={buttonClassName}>
        {children}
      </Link>
    );
  }

  return (
    <button className={buttonClassName} {...props}>
      {children}
    </button>
  );
}

type AppBadgeProps = ComponentPropsWithoutRef<'span'> & {
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
};

export function AppBadge({ tone = 'neutral', className, children, ...props }: AppBadgeProps) {
  return (
    <span className={cx('app-badge', `app-badge-${tone}`, className)} {...props}>
      {children}
    </span>
  );
}

export function AppTabs({ className, children, ...props }: ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav className={cx('app-tabs', className)} {...props}>
      {children}
    </nav>
  );
}

export function AppTable({ className, children, ...props }: ComponentPropsWithoutRef<'table'>) {
  return (
    <table className={cx('data-table app-table', className)} {...props}>
      {children}
    </table>
  );
}

export function AppInput({ className, ...props }: ComponentPropsWithoutRef<'input'>) {
  return <input className={cx('app-input', className)} {...props} />;
}

export function AppSelect({ className, children, ...props }: ComponentPropsWithoutRef<'select'>) {
  return (
    <select className={cx('app-select', className)} {...props}>
      {children}
    </select>
  );
}

export function AppTextarea({ className, ...props }: ComponentPropsWithoutRef<'textarea'>) {
  return <textarea className={cx('app-textarea', className)} {...props} />;
}

type EmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cx('empty-state app-empty-state', className)}>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action ? <div className="app-empty-state-action">{action}</div> : null}
    </div>
  );
}

type MetricCardProps = {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
  className?: string;
};

export function MetricCard({ label, value, helper, tone = 'neutral', className }: MetricCardProps) {
  return (
    <article className={cx('metric-card app-metric-card', `app-metric-card-${tone}`, className)}>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <p>{helper}</p> : null}
    </article>
  );
}

export function SummaryPanel({ className, children, ...props }: ComponentPropsWithoutRef<'section'>) {
  return (
    <section className={cx('summary-panel app-summary-panel', className)} {...props}>
      {children}
    </section>
  );
}

type FormSectionProps = {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function FormSection({ title, description, children, className }: FormSectionProps) {
  return (
    <section className={cx('form-section app-form-section', className)}>
      {title || description ? (
        <header className="app-form-section-head">
          {title ? <h3>{title}</h3> : null}
          {description ? <p>{description}</p> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function ActionBar({ className, children, ...props }: ComponentPropsWithoutRef<'div'>) {
  return (
    <div className={cx('action-bar app-action-bar', className)} {...props}>
      {children}
    </div>
  );
}

type MarginBadgeProps = {
  value: number | null | undefined;
  currency?: string;
  className?: string;
};

export function MarginBadge({ value, currency = 'USD', className }: MarginBadgeProps) {
  const amount = Number(value || 0);
  const tone = amount < 0 ? 'danger' : amount === 0 ? 'warning' : 'success';

  return (
    <AppBadge tone={tone} className={cx('margin-badge', className)}>
      Margin {currency} {amount.toFixed(2)}
    </AppBadge>
  );
}

type ServiceCardProps = {
  title: string;
  meta?: ReactNode;
  price?: ReactNode;
  selected?: boolean;
  action?: ReactNode;
  className?: string;
};

export function ServiceCard({ title, meta, price, selected, action, className }: ServiceCardProps) {
  return (
    <article className={cx('service-card app-service-card', selected && 'app-service-card-selected', className)}>
      <div className="app-service-card-copy">
        <strong>{title}</strong>
        {meta ? <span>{meta}</span> : null}
      </div>
      {price ? <div className="app-service-card-price">{price}</div> : null}
      {action ? <div className="app-service-card-action">{action}</div> : null}
    </article>
  );
}
