import Link from 'next/link';
import { cookies } from 'next/headers';
import { AdminForbiddenState } from '../../components/AdminForbiddenState';
import dynamic from 'next/dynamic';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { WorkspaceSubheader } from '../../components/WorkspaceSubheader';
import { TableSectionShell } from '../../components/TableSectionShell';
import { SummaryStrip } from '../../components/SummaryStrip';
import { adminPageFetchJson, isAdminForbiddenError } from '../../lib/admin-server';
import { canAccessFinance, readSessionActor } from '../../lib/auth-session';

const ReconciliationQueueTable = dynamic(
  () => import('./ReconciliationQueueTable').then((module) => module.ReconciliationQueueTable),
  {
    loading: () => <div className="table-loading-state">Loading reconciliation queue...</div>,
  },
);

const ReconciliationPerformanceSection = dynamic(
  () => import('./ReconciliationPerformanceSection').then((module) => module.ReconciliationPerformanceSection),
  {
    loading: () => <div className="table-loading-state">Loading performance insights...</div>,
  },
);

type QueueItem = {
  bookingId: string;
  bookingReference: string;
  clientName: string;
  outstandingAmount: number;
  overdue: boolean;
  overdueAmount: number;
  paymentId: string;
  paymentAmount: number;
  submittedProofReference: string | null;
  submittedProofAmount: number | null;
  receiptUrl: string | null;
  submittedAt: string | null;
  matchPct: number | null;
  confidence: 'high' | 'medium' | 'low';
  readyToConfirm: boolean;
  reminderStage: 'gentle' | 'firm' | 'urgent';
  reminderCooldownActive: boolean;
  nextReminderDueAt: string | null;
  invoiceDelivery: {
    sentAt: string | null;
    sentTo: string | null;
  };
  paymentReminderDelivery: {
    sentAt: string | null;
    sentTo: string | null;
  };
};

type ReconciliationDailySummary = {
  confirmedCount: number;
  confirmedAmount: number;
  remindersSent: number;
  avgProcessingTime: number | null;
};

type ReconciliationPerformanceSummary = {
  weekly: ReconciliationDailySummary;
  previousWeekly: ReconciliationDailySummary;
  monthly: ReconciliationDailySummary;
  previousMonthly: ReconciliationDailySummary;
  trends: {
    weekly: {
      confirmedAmount: {
        direction: 'up' | 'down' | 'flat';
        delta: number;
        changePercent: number;
        unit: 'percent' | 'pp';
      };
      avgProcessingTime: {
        direction: 'up' | 'down' | 'flat';
        delta: number;
        changePercent: number;
        unit: 'percent' | 'pp';
      };
      remindersSent: {
        direction: 'up' | 'down' | 'flat';
        delta: number;
        changePercent: number;
        unit: 'percent' | 'pp';
      };
    };
    monthly: {
      confirmedAmount: {
        direction: 'up' | 'down' | 'flat';
        delta: number;
        changePercent: number;
        unit: 'percent' | 'pp';
      };
      avgProcessingTime: {
        direction: 'up' | 'down' | 'flat';
        delta: number;
        changePercent: number;
        unit: 'percent' | 'pp';
      };
      remindersSent: {
        direction: 'up' | 'down' | 'flat';
        delta: number;
        changePercent: number;
        unit: 'percent' | 'pp';
      };
    };
  };
  insights: Array<{
    direction: 'up' | 'down' | 'flat';
    text: string;
  }>;
  series7: Array<{
    label: string;
    confirmedCount: number;
    confirmedAmount: number;
    remindersSent: number;
    avgProcessingTime: number | null;
  }>;
  series30: Array<{
    label: string;
    confirmedCount: number;
    confirmedAmount: number;
    remindersSent: number;
    avgProcessingTime: number | null;
  }>;
};

async function getQueue(): Promise<QueueItem[]> {
  return adminPageFetchJson<QueueItem[]>('/api/bookings/reconciliation/payment-proofs', 'Payment proof reconciliation queue', {
    cache: 'no-store',
  });
}

async function getDailySummary(): Promise<ReconciliationDailySummary> {
  return adminPageFetchJson<ReconciliationDailySummary>(
    '/api/bookings/reconciliation/payment-proofs/summary',
    'Daily reconciliation summary',
    {
      cache: 'no-store',
    },
  );
}

async function getPerformanceSummary(): Promise<ReconciliationPerformanceSummary> {
  return adminPageFetchJson<ReconciliationPerformanceSummary>(
    '/api/bookings/reconciliation/payment-proofs/performance',
    'Reconciliation performance summary',
    {
      cache: 'no-store',
    },
  );
}

export default async function FinanceReconciliationPage() {
  const cookieStore = await cookies();
  const session = readSessionActor(cookieStore.get('dmc_session')?.value || '');

  if (!canAccessFinance(session?.role)) {
    return (
      <AdminForbiddenState
        title="Reconciliation access restricted"
        description="Your account does not have permission to review reconciliation queues for this company."
      />
    );
  }

  try {
    const [items, dailySummary, performanceSummary] = await Promise.all([
      getQueue(),
      getDailySummary(),
      getPerformanceSummary(),
    ]);
    const overdueCount = items.filter((item) => item.overdue).length;

    return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Finance"
          title="Finance Reconciliation"
          description="Review submitted client payment proofs before confirming settlement in the booking ledger."
          summary={
            <SummaryStrip
              items={[
                { id: 'pending', label: 'Pending proofs', value: String(items.length), helper: 'Awaiting review' },
                { id: 'overdue', label: 'Overdue', value: String(overdueCount), helper: 'Need priority review' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Reconciliation"
              title="Submitted payment proofs"
              description="Newest submissions first. Review the client proof, compare it to the open receivable, then confirm payment or trigger follow-up."
              actions={
                <>
                  <Link href="/finance" className="dashboard-toolbar-link">
                    Finance overview
                  </Link>
                  <Link href="/finance?report=overdue-clients" className="dashboard-toolbar-link">
                    Overdue clients
                  </Link>
                </>
              }
            />

            <TableSectionShell
              title="Reconciliation queue"
              description="Client-submitted proofs that still need finance confirmation."
              context={<p>{items.length} submissions awaiting review</p>}
              emptyState={<p className="empty-state">No pending payment proof submissions are waiting for finance review.</p>}
            >
              {items.length > 0 ? <ReconciliationQueueTable items={items} dailySummary={dailySummary} /> : null}
            </TableSectionShell>

            <ReconciliationPerformanceSection summary={performanceSummary} />
          </section>
        </WorkspaceShell>
      </section>
    </main>
    );
  } catch (error) {
    if (isAdminForbiddenError(error)) {
      return (
        <AdminForbiddenState
          title="Reconciliation access restricted"
          description="Your account does not have permission to load reconciliation data for this company."
        />
      );
    }

    throw error;
  }
}
