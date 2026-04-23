import Link from 'next/link';

type DashboardStatCardProps = {
  label: string;
  value: string;
  helper?: string;
  tone?: 'neutral' | 'accent' | 'warning' | 'danger';
  href?: string;
};

export function DashboardStatCard({ label, value, helper, tone = 'neutral', href }: DashboardStatCardProps) {
  const content = (
    <>
      <span>{label}</span>
      <strong>{value}</strong>
      {helper ? <p>{helper}</p> : null}
    </>
  );

  return href ? (
    <Link href={href} className={`executive-dashboard-stat-card executive-dashboard-stat-card-${tone} executive-dashboard-stat-card-link`}>
      {content}
    </Link>
  ) : (
    <article className={`executive-dashboard-stat-card executive-dashboard-stat-card-${tone}`}>{content}</article>
  );
}
