import Link from 'next/link';
import { EmptyState, FormSection } from '../../components/ui';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { WorkspaceSubheader } from '../../components/WorkspaceSubheader';
import { QuotesForm } from '../QuotesForm';
import { adminPageFetchJson } from '../../lib/admin-server';

type Company = {
  id: string;
  name: string;
};

type Contact = {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
};

type User = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'super_admin' | 'agent_admin' | 'viewer' | 'operations' | 'finance' | 'agent';
  companyId?: string | null;
  companyName?: string | null;
  active?: boolean;
  status: 'active' | 'inactive';
};

type Lead = {
  id: string;
  inquiry: string;
  source: string | null;
};

type NewQuotePageProps = {
  searchParams?: Promise<{
    leadId?: string;
    // Guided Quote Builder hand-off params. The wizard at /quotes/new/guided
    // builds a city journey + pax + dates client-side, then deep-links here so
    // QuotesForm initialValues can pre-fill nightCount/adults/children/dates/
    // title without the operator re-typing. cities is "Name:Nights,Name:Nights".
    source?: string;
    arrivalCity?: string;
    arrivalDate?: string;
    departureDate?: string;
    adults?: string;
    children?: string;
    market?: string;
    budget?: string;
    style?: string;
    cities?: string;
  }>;
};

type GuidedHandoff = {
  initialValues: NonNullable<Parameters<typeof QuotesForm>[0]['initialValues']>;
  redirectQuery: string;
};

function buildGuidedHandoff(
  params: NonNullable<Awaited<NewQuotePageProps['searchParams']>>,
  defaults: { clientCompanyId: string; brandCompanyId: string; contactId: string },
): GuidedHandoff | null {
  if (params.source !== 'guided') {
    return null;
  }

  // Parse "Amman:2,Petra:2,Wadi Rum:1" -> [{name, nights}, ...]
  const journey = (params.cities || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [rawName, rawNights] = entry.split(':');
      const name = (rawName || '').trim();
      const nights = Math.max(0, Math.floor(Number(rawNights) || 0));
      return { name, nights };
    })
    .filter((stop) => stop.name);

  const summedNights = journey.reduce((sum, stop) => sum + stop.nights, 0);

  // Fall back to arrival/departure date diff if nights aren't carried per-city.
  const dateDiffNights = (() => {
    if (!params.arrivalDate || !params.departureDate) return 0;
    const a = new Date(`${params.arrivalDate}T00:00:00.000Z`).getTime();
    const d = new Date(`${params.departureDate}T00:00:00.000Z`).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(d) || d <= a) return 0;
    return Math.round((d - a) / (24 * 60 * 60 * 1000));
  })();

  const resolvedNights = Math.max(1, summedNights || dateDiffNights || 1);

  const adultsParsed = Math.max(0, Math.floor(Number(params.adults) || 0));
  const childrenParsed = Math.max(0, Math.floor(Number(params.children) || 0));
  const totalPax = Math.max(1, adultsParsed + childrenParsed || 2);
  const resolvedAdults = adultsParsed > 0 ? adultsParsed : 2;
  const roomCountGuess = Math.max(1, Math.ceil(totalPax / 2));

  const cityList = journey.map((stop) => stop.name);
  const titleCore = cityList.length ? cityList.join(' + ') : params.arrivalCity || 'Jordan trip';
  // Keep the title client-safe: cities + duration only. The travel style /
  // market / budget are internal planning taxonomy and must not surface on the
  // shared proposal hero, so they are deliberately omitted here.
  const guidedTitle = `${titleCore} (${resolvedNights} nights)`.slice(0, 96);

  // The quote description doubles as the proposal's journey overview, so it must
  // read as plain client copy — never the internal "Built via... / Market: /
  // Style:" taxonomy that used to leak onto the shared document.
  const cityPhrase =
    cityList.length === 0
      ? ''
      : cityList.length === 1
        ? cityList[0]
        : `${cityList.slice(0, -1).join(', ')} and ${cityList[cityList.length - 1]}`;
  const paxPhrase = `${resolvedAdults} adult${resolvedAdults === 1 ? '' : 's'}${
    childrenParsed ? ` and ${childrenParsed} child${childrenParsed === 1 ? '' : 'ren'}` : ''
  }`;
  const guidedDescription = cityPhrase
    ? `A ${resolvedNights}-night journey through ${cityPhrase} for ${paxPhrase}.`
    : `A ${resolvedNights}-night journey for ${paxPhrase}.`;

  // Carry the city list onto /quotes/{id} so the Auto Itinerary Builder can
  // pre-fill its routeText with "Amman -> Petra -> Wadi Rum" AND, critically,
  // preserve the per-city night distribution as "Name:N" pairs. Without the
  // :N segment the auto-builder assigns cities to days by simple index,
  // clamping extra days to the last city — so a 7-night journey of
  // "3+2+1+1" got rendered as "1+1+1+5". The Auto Builder picks up the
  // :N segments via the same `cities` query param.
  const redirectParams = new URLSearchParams();
  redirectParams.set('tab', 'services');
  redirectParams.set('source', 'guided');
  if (journey.length) {
    const citiesWithNights = journey.map((stop) => `${stop.name}:${stop.nights}`).join(',');
    redirectParams.set('cities', citiesWithNights);
  } else if (cityList.length) {
    redirectParams.set('cities', cityList.join(','));
  }
  if (resolvedNights > 0) {
    redirectParams.set('nights', String(resolvedNights));
  }

  return {
    initialValues: {
      clientCompanyId: defaults.clientCompanyId,
      brandCompanyId: defaults.brandCompanyId,
      contactId: defaults.contactId,
      agentId: '',
      quoteType: 'FIT',
      jordanPassType: 'NONE',
      bookingType: 'FIT',
      title: guidedTitle,
      description: guidedDescription,
      quoteCurrency: 'USD',
      pricingMode: 'FIXED',
      pricingSlabs: [],
      fixedPricePerPerson: '',
      focType: 'none',
      focRatio: '',
      focCount: '',
      focRoomType: '',
      adults: String(resolvedAdults),
      children: String(childrenParsed),
      roomCount: String(roomCountGuess),
      nightCount: String(resolvedNights),
      singleSupplement: '',
      travelStartDate: params.arrivalDate || '',
      validUntil: '',
    },
    redirectQuery: `?${redirectParams.toString()}`,
  };
}

async function getCompanies(): Promise<Company[]> {
  return adminPageFetchJson<Company[]>('/api/companies', 'New quote companies', {
    cache: 'no-store',
  });
}

async function getContacts(): Promise<Contact[]> {
  return adminPageFetchJson<Contact[]>('/api/contacts', 'New quote contacts', {
    cache: 'no-store',
  });
}

async function getAgents(): Promise<User[]> {
  return adminPageFetchJson<User[]>('/api/users/agents', 'New quote agents', {
    cache: 'no-store',
  });
}

async function getLeadForQuotePrefill(leadId?: string): Promise<Lead | null> {
  if (!leadId) {
    return null;
  }

  try {
    return await adminPageFetchJson<Lead | null>(`/api/leads/${leadId}`, 'Lead quote prefill', {
      cache: 'no-store',
    });
  } catch (error) {
    console.error('[NewQuotePage] Could not load lead prefill.', error);
    return null;
  }
}

function buildLeadQuoteTitle(lead: Lead | null) {
  if (!lead?.inquiry?.trim()) {
    return '';
  }

  return lead.inquiry.trim().slice(0, 96);
}

export default async function NewQuotePage({ searchParams }: NewQuotePageProps) {
  const resolvedSearchParams = await searchParams;
  const [companies, contacts, agents, leadPrefill] = await Promise.all([
    getCompanies(),
    getContacts(),
    getAgents(),
    getLeadForQuotePrefill(resolvedSearchParams?.leadId),
  ]);
  const activeAgents = agents
    .filter((user): user is User & { role: 'agent' } => user.role === 'agent' && user.status !== 'inactive')
    .map((user) => ({
      id: user.id,
      name: user.companyName ? `${user.name} - ${user.companyName}` : user.name,
      email: user.email,
      role: user.role,
    }));
  const defaultCompanyId = companies[0]?.id || '';
  const defaultContactId = contacts.find((contact) => contact.companyId === defaultCompanyId)?.id || contacts[0]?.id || '';
  const leadQuoteTitle = buildLeadQuoteTitle(leadPrefill);
  const guidedHandoff = resolvedSearchParams
    ? buildGuidedHandoff(resolvedSearchParams, {
        clientCompanyId: defaultCompanyId,
        brandCompanyId: defaultCompanyId,
        contactId: defaultContactId,
      })
    : null;

  return (
    <main className="page">
      <section className="panel workspace-panel app-page-content">
        <WorkspaceShell
          eyebrow="Sales"
          title="Create Quote"
          description="Start with the core commercial setup, then continue in the full quote builder after creation."
          switcher={
            <div className="table-action-row">
              <Link href="/quotes" className="secondary-button">
                Back to quotes
              </Link>
            </div>
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Quote Setup"
              title="Initial quote details"
              description="Use the same quote workspace pattern for setup, review, and builder handoff."
            />

            {guidedHandoff ? (
              <div
                style={{
                  background: '#f5f8f5',
                  border: '1px solid #cdd7cd',
                  borderRadius: 10,
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.3rem',
                }}
              >
                <span
                  style={{
                    color: '#3a5a3a',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                  }}
                >
                  Guided Builder handoff
                </span>
                <span style={{ color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.88rem' }}>
                  Pre-filled from the wizard: <strong>{guidedHandoff.initialValues.title}</strong>. Confirm the commercial baseline below — nights,
                  pax, dates, and the city sequence carry through to the day-by-day builder.
                </span>
              </div>
            ) : null}

            {companies.length === 0 ? (
              <EmptyState
                title="Create a company first"
                description="A quote needs a client company and contact before it can be created."
                action={
              <div className="table-action-row">
                <Link href="/companies" className="primary-button">
                  Open companies
                </Link>
                <Link href="/contacts" className="secondary-button">
                  Open contacts
                </Link>
              </div>
                }
              />
            ) : (
              <FormSection title="Quote setup" description="Capture the commercial baseline before opening the day-by-day builder.">
              <QuotesForm
                apiBaseUrl="/api"
                companies={companies}
                contacts={contacts}
                agents={activeAgents}
                submitLabel="Create quote"
                postCreateQuery={guidedHandoff?.redirectQuery}
                initialValues={
                  guidedHandoff
                    ? guidedHandoff.initialValues
                    : leadPrefill
                    ? {
                        clientCompanyId: defaultCompanyId,
                        brandCompanyId: defaultCompanyId,
                        contactId: defaultContactId,
                        agentId: '',
                        quoteType: 'FIT',
                        jordanPassType: 'NONE',
                        bookingType: 'FIT',
                        title: leadQuoteTitle || 'Lead inquiry',
                        description: leadPrefill.inquiry || '',
                        quoteCurrency: 'USD',
                        pricingMode: 'FIXED',
                        pricingSlabs: [],
                        fixedPricePerPerson: '',
                        focType: 'none',
                        focRatio: '',
                        focCount: '',
                        focRoomType: '',
                        adults: '2',
                        children: '0',
                        roomCount: '1',
                        nightCount: '1',
                        singleSupplement: '',
                        travelStartDate: '',
                        validUntil: '',
                      }
                    : undefined
                }
              />
              </FormSection>
            )}
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
