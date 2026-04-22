import Link from 'next/link';

type AdminPageTab = {
  id: string;
  label: string;
  href: string;
  badge?: number | null;
  badgeTitle?: string;
  badgeTone?: 'default' | 'warning' | 'error';
};

type AdminPageTabsProps = {
  ariaLabel: string;
  tabs: AdminPageTab[];
  activeTab: string;
};

export function AdminPageTabs({ ariaLabel, tabs, activeTab }: AdminPageTabsProps) {
  return (
    <nav className="page-tabs" aria-label={ariaLabel}>
      {tabs.map((tab) => (
        <Link key={tab.id} href={tab.href} className={`page-tab-link${activeTab === tab.id ? ' page-tab-link-active' : ''}`}>
          <span>{tab.label}</span>
          {tab.badge && tab.badge > 0 ? (
            <span
              className={`page-tab-badge${tab.badgeTone === 'warning' ? ' page-tab-badge-warning' : ''}${tab.badgeTone === 'error' ? ' page-tab-badge-error' : ''}`}
              aria-label={`${tab.badge} items`}
              title={tab.badgeTitle}
            >
              {tab.badge}
            </span>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
