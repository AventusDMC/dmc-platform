import { CollapsibleCreatePanel } from '../../components/CollapsibleCreatePanel';
import { InlineEntityActions } from '../../components/InlineEntityActions';
import { InlineRowEditorShell } from '../../components/InlineRowEditorShell';
import { RowDetailsPanel } from '../../components/RowDetailsPanel';
import { SummaryStrip } from '../../components/SummaryStrip';
import { TableSectionShell } from '../../components/TableSectionShell';
import { QuoteBuilderEmptyState } from './QuoteBuilderEmptyState';
import { QuoteItineraryDayCard } from './QuoteItineraryDayCard';
import { QuoteItineraryDayForm } from './QuoteItineraryDayForm';
import { QuoteItineraryDayItemForm } from './QuoteItineraryDayItemForm';
import { QuoteItineraryMoveButton } from './QuoteItineraryMoveButton';
import { QuoteServiceItemRow } from './QuoteServiceItemRow';

type QuoteItineraryLinkedServiceSummary = {
  id: string;
  quoteId: string;
  optionId: string | null;
  serviceDate: string | null;
  startTime: string | null;
  pickupTime: string | null;
  pickupLocation: string | null;
  meetingPoint: string | null;
  quantity: number;
  paxCount: number | null;
  participantCount: number | null;
  adultCount: number | null;
  childCount: number | null;
  roomCount: number | null;
  nightCount: number | null;
  dayCount: number | null;
  pricingDescription: string | null;
  reconfirmationRequired: boolean;
  reconfirmationDueAt: string | null;
  service: {
    id: string;
    name: string;
    category: string;
    serviceType: {
      id: string;
      name: string;
      code: string | null;
    } | null;
  } | null;
  hotel: {
    id: string;
    name: string;
    city: string;
  } | null;
  contract: {
    id: string;
    name: string;
    validFrom: string;
    validTo: string;
    currency: string;
  } | null;
  roomCategory: {
    id: string;
    name: string;
    code: string | null;
  } | null;
  appliedVehicleRate: {
    id: string;
    routeName: string;
    vehicle: {
      id: string;
      name: string;
    } | null;
    serviceType: {
      id: string;
      name: string;
      code: string | null;
    } | null;
  } | null;
};

type QuoteItineraryDayItem = {
  id: string;
  dayId: string;
  quoteServiceId: string;
  sortOrder: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  quoteService: QuoteItineraryLinkedServiceSummary | null;
};

type QuoteItineraryDay = {
  id: string;
  quoteId: string;
  dayNumber: number;
  title: string;
  notes: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  dayItems: QuoteItineraryDayItem[];
};

export type QuoteItineraryResponse = {
  quoteId: string;
  days: QuoteItineraryDay[];
};

export type QuoteItineraryAssignableService = {
  id: string;
  optionId: string | null;
  serviceDate: string | null;
  service: {
    name: string;
    category: string;
    serviceType?: {
      name: string;
      code: string | null;
    } | null;
  };
  hotel: {
    name: string;
  } | null;
  contract: {
    name: string;
  } | null;
  roomCategory: {
    name: string;
  } | null;
  seasonName: string | null;
  occupancyType: string | null;
  mealPlan: string | null;
};

type QuoteItineraryTabProps = {
  apiBaseUrl: string;
  quoteId: string;
  itinerary: QuoteItineraryResponse;
  assignableServices: QuoteItineraryAssignableService[];
};

function summarizeNotes(notes: string | null) {
  if (!notes?.trim()) {
    return 'No notes';
  }

  return notes.trim().length > 80 ? `${notes.trim().slice(0, 77)}...` : notes.trim();
}

function buildServiceSummary(service: QuoteItineraryLinkedServiceSummary | null) {
  if (!service) {
    return 'Linked quote service missing';
  }

  if (service.hotel && service.contract && service.roomCategory && service.pricingDescription) {
    return `${service.hotel.name} | ${service.contract.name} | ${service.roomCategory.name} | ${service.pricingDescription}`;
  }

  if (service.appliedVehicleRate) {
    return `${service.appliedVehicleRate.routeName} | ${service.appliedVehicleRate.vehicle?.name || 'Vehicle'} | ${service.appliedVehicleRate.serviceType?.name || 'Transport'}`;
  }

  return service.service?.name || 'Quote service';
}

function buildServiceMeta(service: QuoteItineraryLinkedServiceSummary | null) {
  if (!service) {
    return 'Service summary unavailable';
  }

  const optionLabel = service.optionId ? 'Option service' : 'Base program';
  const dateLabel = service.serviceDate ? service.serviceDate.slice(0, 10) : 'Date pending';
  const paxLabel = service.paxCount ? `${service.paxCount} pax` : 'Pax pending';

  return `${optionLabel} | ${dateLabel} | ${paxLabel}`;
}

export function QuoteItineraryTab({ apiBaseUrl, quoteId, itinerary, assignableServices }: QuoteItineraryTabProps) {
  const activeDays = itinerary.days.filter((day) => day.isActive);
  const totalAssignedServices = itinerary.days.reduce((sum, day) => sum + day.dayItems.length, 0);
  const unassignedServices = Math.max(assignableServices.length - totalAssignedServices, 0);

  return (
    <div className="section-stack">
      <SummaryStrip
        items={[
          { id: 'itinerary-days', label: 'Days', value: String(itinerary.days.length), helper: `${activeDays.length} active` },
          { id: 'itinerary-services', label: 'Assigned services', value: String(totalAssignedServices), helper: 'Linked quote services' },
          { id: 'itinerary-unassigned', label: 'Unassigned services', value: String(unassignedServices), helper: 'Still outside day structure' },
          { id: 'itinerary-active', label: 'Active days', value: String(activeDays.length), helper: 'Visible in itinerary list' },
        ]}
      />

      <TableSectionShell
        title="Quote itinerary"
        description="Structure quote services into ordered days without changing pricing ownership or the existing quote service setup."
        context={<p>{itinerary.days.length} itinerary days in scope</p>}
        createPanel={
          <CollapsibleCreatePanel
            title="Create itinerary day"
            description="Add a day shell first, then assign existing quote services inside the row details."
            triggerLabelOpen="Add day"
          >
            <QuoteItineraryDayForm apiBaseUrl={apiBaseUrl} quoteId={quoteId} />
          </CollapsibleCreatePanel>
        }
        emptyState={
          <QuoteBuilderEmptyState
            title="No itinerary days yet"
            description="Add the first day to start structuring the trip, then assign existing quote services to each day."
          />
        }
      >
        {itinerary.days.length > 0 ? (
          <div className="quote-itinerary-day-list">
            {itinerary.days.map((day) => (
              <QuoteItineraryDayCard
                key={day.id}
                dayNumber={day.dayNumber}
                title={day.title}
                notes={day.notes}
                status={
                  <span className={`quote-ui-badge ${day.isActive ? 'quote-ui-badge-success' : 'quote-ui-badge-info'}`}>
                    {day.isActive ? 'Active' : 'Inactive'}
                  </span>
                }
                summary={[
                  { label: 'Sort order', value: day.sortOrder + 1 },
                  { label: 'Assigned services', value: day.dayItems.length },
                  { label: 'Notes', value: summarizeNotes(day.notes) },
                ]}
                moveActions={
                  <>
                    <QuoteItineraryMoveButton
                      apiBaseUrl={apiBaseUrl}
                      path={`/itinerary/day/${day.id}`}
                      payload={{ sortOrder: Math.max(day.sortOrder - 1, 0) }}
                      label="Up"
                      disabled={day.sortOrder === 0}
                    />
                    <QuoteItineraryMoveButton
                      apiBaseUrl={apiBaseUrl}
                      path={`/itinerary/day/${day.id}`}
                      payload={{ sortOrder: day.sortOrder + 1 }}
                      label="Down"
                      disabled={day.sortOrder === itinerary.days.length - 1}
                    />
                  </>
                }
                editor={
                  <InlineEntityActions
                    apiBaseUrl={apiBaseUrl}
                    deletePath={`/itinerary/day/${day.id}`}
                    deleteLabel="itinerary day"
                    confirmMessage={`Delete day ${day.dayNumber}?`}
                  >
                    <QuoteItineraryDayForm
                      apiBaseUrl={apiBaseUrl}
                      quoteId={quoteId}
                      dayId={day.id}
                      submitLabel={`Save day ${day.dayNumber}`}
                      initialValues={{
                        dayNumber: String(day.dayNumber),
                        title: day.title,
                        notes: day.notes || '',
                        sortOrder: String(day.sortOrder),
                        isActive: day.isActive,
                      }}
                    />
                  </InlineEntityActions>
                }
                assignService={
                  <InlineRowEditorShell>
                    <div className="section-stack">
                      <div className="workspace-section-head">
                        <div>
                          <p className="eyebrow">Assign services</p>
                          <h3>Add existing quote service</h3>
                        </div>
                      </div>
                      <QuoteItineraryDayItemForm apiBaseUrl={apiBaseUrl} dayId={day.id} services={assignableServices} />
                    </div>
                  </InlineRowEditorShell>
                }
                services={
                  day.dayItems.length === 0 ? (
                    <QuoteBuilderEmptyState
                      eyebrow="Day Services"
                      title="No services assigned"
                      description="Link existing quote services to make this itinerary day client-ready."
                    />
                  ) : (
                    <div className="quote-service-item-list">
                      {day.dayItems.map((item) => (
                        <QuoteServiceItemRow
                          key={item.id}
                          title={buildServiceSummary(item.quoteService)}
                          category={item.quoteService?.service?.serviceType?.name || item.quoteService?.service?.category || 'Service'}
                          summary={buildServiceMeta(item.quoteService)}
                          meta={`Sort ${item.sortOrder + 1}`}
                          notes={item.notes || 'No assignment notes'}
                          badge={
                            <span className={`quote-ui-badge ${item.isActive ? 'quote-ui-badge-success' : 'quote-ui-badge-info'}`}>
                              {item.isActive ? 'Active' : 'Inactive'}
                            </span>
                          }
                          actions={
                            <RowDetailsPanel
                              summary="Edit assignment"
                              description="Update linked service details"
                              className="operations-row-details"
                              bodyClassName="operations-row-details-body"
                              groupId="quote-itinerary-day-items"
                            >
                              <div className="section-stack">
                                <div className="table-action-row">
                                  <QuoteItineraryMoveButton
                                    apiBaseUrl={apiBaseUrl}
                                    path={`/itinerary/day/${day.id}/items/${item.id}`}
                                    payload={{ sortOrder: Math.max(item.sortOrder - 1, 0) }}
                                    label="Up"
                                    disabled={item.sortOrder === 0}
                                  />
                                  <QuoteItineraryMoveButton
                                    apiBaseUrl={apiBaseUrl}
                                    path={`/itinerary/day/${day.id}/items/${item.id}`}
                                    payload={{ sortOrder: item.sortOrder + 1 }}
                                    label="Down"
                                    disabled={item.sortOrder === day.dayItems.length - 1}
                                  />
                                </div>
                                <InlineEntityActions
                                  apiBaseUrl={apiBaseUrl}
                                  deletePath={`/itinerary/day/${day.id}/items/${item.id}`}
                                  deleteLabel="itinerary service assignment"
                                  confirmMessage={`Remove ${buildServiceSummary(item.quoteService)} from day ${day.dayNumber}?`}
                                >
                                  <QuoteItineraryDayItemForm
                                    apiBaseUrl={apiBaseUrl}
                                    dayId={day.id}
                                    itemId={item.id}
                                    submitLabel="Save assignment"
                                    services={assignableServices}
                                    initialValues={{
                                      quoteServiceId: item.quoteServiceId,
                                      sortOrder: String(item.sortOrder),
                                      notes: item.notes || '',
                                    }}
                                  />
                                </InlineEntityActions>
                              </div>
                            </RowDetailsPanel>
                          }
                        />
                      ))}
                    </div>
                  )
                }
              />
            ))}
          </div>
        ) : null}
      </TableSectionShell>
    </div>
  );
}
