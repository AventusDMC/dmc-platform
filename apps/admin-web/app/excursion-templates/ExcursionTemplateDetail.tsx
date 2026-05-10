import Link from 'next/link';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { ExcursionTemplate, ExcursionTemplateComponent, SuggestedTransportResponse } from './types';

type ExcursionTemplateDetailProps = {
  template: ExcursionTemplate;
  suggestedTransport: SuggestedTransportResponse | null;
};

function formatDuration(minutes?: number | null) {
  if (!minutes) {
    return 'Duration pending';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function formatMoney(amount?: number | null, currency?: string | null) {
  if (amount === undefined || amount === null) {
    return 'Cost pending';
  }
  return `${currency || 'USD'} ${Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function getComponentReference(component: ExcursionTemplateComponent) {
  if (component.componentType === 'TRANSPORT') {
    return [component.route?.name, component.transportServiceType?.name].filter(Boolean).join(' / ') || 'Transport link pending';
  }

  if (component.activity) {
    return component.activity.name;
  }

  if (component.supplierService) {
    return component.supplierService.name;
  }

  return 'Catalog link pending';
}

function getComponentScope(component: ExcursionTemplateComponent) {
  if (component.componentType === 'TRANSPORT') {
    return [component.suggestedDepartureCity, component.suggestedArrivalCity].filter(Boolean).join(' to ') || 'Route scope pending';
  }

  return component.supplierService?.serviceType?.name || component.supplierService?.category || component.activity?.name || 'Operational catalog';
}

export function ExcursionTemplateDetail({ template, suggestedTransport }: ExcursionTemplateDetailProps) {
  const orderedComponents = [...(template.components || [])].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section className="section-stack">
      <WorkspaceSubheader
        eyebrow="Operational Template"
        title={template.name}
        description={template.description || 'Reusable excursion orchestration assembled from existing operating modules.'}
        actions={
          <Link href="/excursion-templates" className="dashboard-toolbar-link">
            Back to templates
          </Link>
        }
      />

      {template.operationalNotes ? <p className="form-helper">{template.operationalNotes}</p> : null}

      <TableSectionShell
        title="Ordered components"
        description="Read-only operational sequence. Components link to existing modules instead of duplicating product records."
        context={
          <p>
            {template.defaultDepartureCity || 'Departure city pending'} / {formatDuration(template.durationMinutes)}
          </p>
        }
        emptyState={
          orderedComponents.length === 0 ? (
            <div className="empty-state ui-empty-state">
              <strong>No components yet.</strong>
              <p>This template exists, but its operational components have not been linked.</p>
            </div>
          ) : undefined
        }
      >
        {orderedComponents.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Type</th>
                  <th>Component</th>
                  <th>Linked record</th>
                  <th>Scope</th>
                  <th>Duration</th>
                  <th>Optional</th>
                </tr>
              </thead>
              <tbody>
                {orderedComponents.map((component) => (
                  <tr key={component.id}>
                    <td>{component.sortOrder + 1}</td>
                    <td>
                      <span className="status-pill">{component.componentType}</span>
                    </td>
                    <td>
                      <strong>{component.label}</strong>
                      {component.operationalNotes ? <p className="table-cell-copy">{component.operationalNotes}</p> : null}
                    </td>
                    <td>{getComponentReference(component)}</td>
                    <td>{getComponentScope(component)}</td>
                    <td>{formatDuration(component.durationMinutes || component.route?.durationMinutes)}</td>
                    <td>
                      <span className={component.isOptional ? 'status-pill status-pill-muted' : 'status-pill status-pill-success'}>
                        {component.isOptional ? 'Optional' : 'Required'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </TableSectionShell>

      <TableSectionShell
        title="Suggested transport"
        description="Candidates are read from the existing transport pricing rules for linked transport components."
        context={<p>{suggestedTransport ? `${suggestedTransport.pax} pax lookup` : 'Transport suggestion unavailable'}</p>}
        emptyState={
          !suggestedTransport || suggestedTransport.suggestions.every((suggestion) => suggestion.candidates.length === 0) ? (
            <div className="empty-state ui-empty-state">
              <strong>No transport candidates found.</strong>
              <p>Link a route and transport service type, or add active transport pricing rules for this route.</p>
            </div>
          ) : undefined
        }
      >
        {suggestedTransport?.suggestions.some((suggestion) => suggestion.candidates.length > 0) ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Supplier</th>
                  <th>Vehicle</th>
                  <th>Service</th>
                  <th>Pax range</th>
                  <th>Base cost</th>
                </tr>
              </thead>
              <tbody>
                {suggestedTransport.suggestions.flatMap((suggestion) =>
                  suggestion.candidates.map((candidate) => (
                    <tr key={`${suggestion.componentId}-${candidate.id}`}>
                      <td>{suggestion.label}</td>
                      <td>{candidate.supplier?.name || 'Supplier pending'}</td>
                      <td>{candidate.vehicle?.name || 'Vehicle pending'}</td>
                      <td>{candidate.transportServiceType?.name || 'Service pending'}</td>
                      <td>
                        {candidate.minPax || 1}-{candidate.maxPax || candidate.vehicle?.maxPax || 'open'}
                      </td>
                      <td>{formatMoney(candidate.baseCost, candidate.currency)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        ) : null}
      </TableSectionShell>
    </section>
  );
}
