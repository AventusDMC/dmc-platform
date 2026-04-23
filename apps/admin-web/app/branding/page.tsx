import Link from 'next/link';
import { AdvancedFiltersPanel } from '../components/AdvancedFiltersPanel';
import { AdminForbiddenState } from '../components/AdminForbiddenState';
import { CompactFilterBar } from '../components/CompactFilterBar';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { PageActionBar } from '../components/PageActionBar';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { ADMIN_API_BASE_URL, adminPageFetchJson, isAdminForbiddenError } from '../lib/admin-server';
import { BrandingCompaniesTable } from './BrandingCompaniesTable';

const API_BASE_URL = ADMIN_API_BASE_URL;
const BRANDING_PROXY_BASE_PATH = '/api';

type Company = {
  id: string;
  name: string;
  type: string | null;
  website: string | null;
  logoUrl: string | null;
  branding?: {
    displayName: string | null;
    logoUrl: string | null;
    primaryColor: string | null;
    secondaryColor: string | null;
  } | null;
};

async function getCompanies(): Promise<Company[]> {
  return adminPageFetchJson<Company[]>(`${API_BASE_URL}/companies`, 'Branding companies', {
    cache: 'no-store',
  });
}

export default async function BrandingPage() {
  try {
    const companies = await getCompanies();
    const brandedCount = companies.filter(
      (company) =>
        Boolean(
          company.branding?.displayName ||
            company.branding?.logoUrl ||
            company.branding?.primaryColor ||
            company.branding?.secondaryColor,
        ),
    ).length;
    const logoCount = companies.filter((company) => Boolean(company.branding?.logoUrl || company.logoUrl)).length;

    return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Admin Setup"
          title="Branding"
          description="Manage company identity, PDF presentation, and brand contact details from the same compact admin setup surface."
          switcher={
            <ModuleSwitcher
              ariaLabel="Admin setup modules"
              activeId="branding"
              items={[
                { id: 'branding', label: 'Branding', href: '/branding', helper: 'Company identity and PDF style' },
                { id: 'templates', label: 'Templates', href: '/support-text-templates', helper: 'Reusable support text' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'companies', label: 'Companies', value: String(companies.length), helper: 'Brand records in scope' },
                { id: 'branded', label: 'Configured', value: String(brandedCount), helper: 'Custom branding present' },
                { id: 'logos', label: 'Logos ready', value: String(logoCount), helper: 'Logo configured' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Admin Setup"
              title="Brand identity settings"
              description="Keep branding compact by default and open company-level settings only when you need to adjust logos, labels, or PDF colors."
              actions={
                <Link href="/support-text-templates" className="dashboard-toolbar-link">
                  Support-text templates
                </Link>
              }
            />

            <PageActionBar title="Admin shortcuts" description="Move between brand identity and reusable quote-support content without leaving setup surfaces.">
              <Link href="/support-text-templates" className="dashboard-toolbar-link">
                Template library
              </Link>
            </PageActionBar>

            <CompactFilterBar
              eyebrow="Admin Setup"
              title="Branding controls"
              description="Keep the company branding list compact while related setup guidance stays tucked away."
            >
              <div className="operations-filter-row">
                <Link href="/branding" className="secondary-button">
                  Branding
                </Link>
                <Link href="/support-text-templates" className="secondary-button">
                  Templates
                </Link>
              </div>
              <AdvancedFiltersPanel title="Branding guidance" description="What this setup surface controls">
                <div className="operations-filter-row">
                  <span className="detail-copy">Branding updates affect branded quote PDFs, company identity labels, and logo/color presentation.</span>
                </div>
              </AdvancedFiltersPanel>
            </CompactFilterBar>

            <TableSectionShell
              title="Company branding"
              description="Edit branding per company from a list-first setup surface."
              context={<p>{companies.length} companies available for branding setup</p>}
              emptyState={<p className="empty-state">No companies available for branding setup yet.</p>}
            >
              {companies.length > 0 ? (
                <BrandingCompaniesTable apiBaseUrl={API_BASE_URL} requestBasePath={BRANDING_PROXY_BASE_PATH} companies={companies} />
              ) : null}
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
    );
  } catch (error) {
    if (isAdminForbiddenError(error)) {
      return (
        <AdminForbiddenState
          title="Branding access restricted"
          description="Your account does not have permission to view or manage branding settings for this company."
        />
      );
    }

    throw error;
  }
}
