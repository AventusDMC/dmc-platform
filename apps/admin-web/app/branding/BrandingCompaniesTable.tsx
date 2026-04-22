import { InlineRowEditorShell } from '../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../components/RowDetailsPanel';
import { BrandingSettingsForm } from '../companies/BrandingSettingsForm';

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

type BrandingCompaniesTableProps = {
  apiBaseUrl: string;
  requestBasePath: string;
  companies: Company[];
};

export function BrandingCompaniesTable({ apiBaseUrl, requestBasePath, companies }: BrandingCompaniesTableProps) {
  return (
    <div className="entity-list allotment-table-stack">
      <div className="table-wrap">
        <table className="data-table allotment-table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Type</th>
              <th>Website</th>
              <th>Logo</th>
              <th>Colors</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => {
              const displayName = company.branding?.displayName || company.name;
              const logoValue = company.branding?.logoUrl || company.logoUrl;
              const primaryColor = company.branding?.primaryColor || 'Not set';
              const secondaryColor = company.branding?.secondaryColor || 'Not set';

              return (
                <tr key={company.id}>
                  <td>
                    <strong>{displayName}</strong>
                    <div className="table-subcopy">{company.name !== displayName ? company.name : 'Brand display matches company name'}</div>
                  </td>
                  <td>{company.type || 'Company'}</td>
                  <td>{company.website || 'No website provided'}</td>
                  <td>{logoValue ? 'Configured' : 'Missing'}</td>
                  <td>
                    <strong>{primaryColor}</strong>
                    <div className="table-subcopy">{secondaryColor}</div>
                  </td>
                  <td>
                    <RowDetailsPanel
                      summary="Edit branding"
                      description="Identity, logo, contact details, and PDF colors"
                      className="operations-row-details"
                      bodyClassName="operations-row-details-body"
                    >
                      <InlineRowEditorShell>
                        <BrandingSettingsForm
                          apiBaseUrl={apiBaseUrl}
                          requestBasePath={requestBasePath}
                          companyId={company.id}
                          companyName={company.name}
                        />
                      </InlineRowEditorShell>
                    </RowDetailsPanel>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
