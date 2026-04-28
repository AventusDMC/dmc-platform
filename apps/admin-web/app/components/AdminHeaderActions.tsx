import Link from 'next/link';
import { ReactNode } from 'react';

type AdminHeaderActionsProps = {
  children?: ReactNode;
  className?: string;
};

export function AdminHeaderActions({ children, className = '' }: AdminHeaderActionsProps) {
  return (
    <div className={`admin-header-actions ${className}`.trim()}>
      <Link href="/admin/dashboard" className="dashboard-toolbar-link">
        Dashboard
      </Link>
      {children}
    </div>
  );
}
