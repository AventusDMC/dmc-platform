import type { ReactNode } from 'react';
import styles from './QuoteDayPlannerLayout.module.css';

type QuoteDayPlannerLayoutProps = {
  dayNavigation: ReactNode;
  children: ReactNode;
};

type QuoteDayPlannerDayLayoutProps = {
  main: ReactNode;
  sidePanel?: ReactNode;
};

export function QuoteDayPlannerLayout({ dayNavigation, children }: QuoteDayPlannerLayoutProps) {
  return (
    <div className={styles.container}>
      <div className={`${styles.shell} quote-service-planner-shell quote-service-planner-saas-grid`}>
        {dayNavigation}
        <div className={`${styles.mainColumn} quote-service-day-column`}>{children}</div>
      </div>
    </div>
  );
}

export function QuoteDayPlannerDayLayout({ main, sidePanel }: QuoteDayPlannerDayLayoutProps) {
  return (
    <div className={`${styles.dayLayout} quote-service-day-layout quote-service-day-layout-visual`}>
      <section className={`${styles.mainEditor} quote-service-current-services quote-service-day-main`}>
        {main}
      </section>
      {sidePanel ? <div className={styles.sidePanelStack}>{sidePanel}</div> : null}
    </div>
  );
}

export function getQuoteDayNavigationClassName() {
  return `${styles.dayNavigation} quote-service-day-nav`;
}
