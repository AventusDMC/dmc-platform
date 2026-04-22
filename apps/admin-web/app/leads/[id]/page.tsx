import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LeadEditForm } from './LeadEditForm';
import { LeadConvertForm } from './LeadConvertForm';

import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../../lib/admin-server';

const API_BASE_URL = ADMIN_API_BASE_URL;

type Lead = {
  id: string;
  companyId: string | null;
  inquiry: string;
  source: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

async function getLead(id: string): Promise<Lead | null> {
  return adminPageFetchJson<Lead | null>(`${API_BASE_URL}/leads/${id}`, 'Lead detail', {
    cache: 'no-store',
    allow404: true,
  });
}

type LeadDetailsPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function LeadDetailsPage({ params }: LeadDetailsPageProps) {
  const { id } = await params;
  const lead = await getLead(id);

  if (!lead) {
    notFound();
  }

  return (
    <main className="page">
      <section className="panel">
        <Link href="/leads" className="back-link">
          Back to leads
        </Link>

        <div className="panel-header">
          <div>
            <p className="eyebrow">Lead Details</p>
            <h1 className="section-title">Review and update lead</h1>
          </div>
        </div>

        <div className="detail-grid">
          <article className="detail-card">
            <h2>Lead</h2>
            <div className="detail-fields">
              <p>
                <strong>Created:</strong> {new Date(lead.createdAt).toLocaleString()}
              </p>
              <p>
                <strong>Updated:</strong> {new Date(lead.updatedAt).toLocaleString()}
              </p>
              <p>
                <strong>Source:</strong> {lead.source || 'No source provided'}
              </p>
              <p>
                <strong>Status:</strong> {lead.status}
              </p>
            </div>
            <p className="detail-copy">{lead.inquiry}</p>
          </article>

          <div className="detail-card">
            <h2>Edit</h2>
            <LeadEditForm
              apiBaseUrl={API_BASE_URL}
              leadId={lead.id}
              initialInquiry={lead.inquiry}
              initialSource={lead.source}
              initialStatus={lead.status}
            />
            <LeadConvertForm
              apiBaseUrl={API_BASE_URL}
              leadId={lead.id}
              disabled={lead.status === 'converted'}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
