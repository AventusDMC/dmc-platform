import type { ReactNode } from 'react';
import { QuotePassengersPanel, type QuotePassenger } from './QuotePassengersPanel';
import { QuoteRoomingPanel, type QuoteRoomingGroup } from './QuoteRoomingPanel';
import type { QuoteItineraryResponse } from './QuoteItineraryTab';

type QuoteItineraryWorkspaceReadiness = {
  statusLabel: string;
  unpricedServices: number;
  unresolvedItems: number;
  completionPercent: number;
  totalDays: number;
};

type QuoteItineraryWorkspaceQuote = {
  id: string;
  passengers: QuotePassenger[];
  singleSupplement: number | null;
};

type QuoteItineraryWorkspaceProps = {
  apiBaseUrl: string;
  quote: QuoteItineraryWorkspaceQuote;
  quoteItinerary: QuoteItineraryResponse;
  quoteRoomingGroups: QuoteRoomingGroup[];
  totalPax: number;
  readiness: QuoteItineraryWorkspaceReadiness;
  operationalSidebarTone: string;
  assignedPassengerCount: number;
  unassignedPassengerCount: number;
  roomingHasWarnings: boolean;
  servicePlanner: ReactNode;
  guidedStepFooter: ReactNode;
};

export function QuoteItineraryWorkspace({
  apiBaseUrl,
  quote,
  quoteItinerary,
  quoteRoomingGroups,
  totalPax,
  readiness,
  operationalSidebarTone,
  assignedPassengerCount,
  unassignedPassengerCount,
  roomingHasWarnings,
  servicePlanner,
  guidedStepFooter,
}: QuoteItineraryWorkspaceProps) {
  return (
    <div className="quote-itinerary-ops-layout">
      <aside className={`quote-operational-sidebar quote-operational-sidebar-${operationalSidebarTone}`}>
        <div className="quote-operational-sidebar-head">
          <p className="eyebrow">Operational Readiness</p>
          <h3>{readiness.statusLabel}</h3>
        </div>
        <div className="quote-operational-sidebar-list">
          <div>
            <span>Passengers</span>
            <strong>{assignedPassengerCount}/{quote.passengers.length} assigned</strong>
            {unassignedPassengerCount > 0 ? <em>{unassignedPassengerCount} unassigned</em> : <em>Ready</em>}
          </div>
          <div>
            <span>Rooming</span>
            <strong>{roomingHasWarnings ? 'Review needed' : 'Ready'}</strong>
            <em>{quoteRoomingGroups.length} room group{quoteRoomingGroups.length === 1 ? '' : 's'}</em>
          </div>
          <div>
            <span>Pricing warnings</span>
            <strong>{readiness.unpricedServices}</strong>
            <em>{readiness.unpricedServices > 0 ? 'Needs pricing review' : 'No unpriced rows'}</em>
          </div>
          <div>
            <span>Unresolved items</span>
            <strong>{readiness.unresolvedItems}</strong>
            <em>{readiness.unresolvedItems > 0 ? 'Cleanup required' : 'No unresolved rows'}</em>
          </div>
          <div>
            <span>Day coverage</span>
            <strong>{readiness.completionPercent}%</strong>
            <em>{readiness.totalDays} day{readiness.totalDays === 1 ? '' : 's'} planned</em>
          </div>
        </div>
      </aside>

      <div className="section-stack quote-itinerary-ops-main">
        <details className="quote-operational-collapsible quote-operational-collapsible-passengers" open>
          <summary>
            <div>
              <span className="eyebrow">Passengers</span>
              <strong>Passenger manifest foundation</strong>
            </div>
            <em>{quote.passengers.length}/{totalPax} passengers</em>
          </summary>
          <QuotePassengersPanel
            apiBaseUrl={apiBaseUrl}
            quoteId={quote.id}
            expectedPax={totalPax}
            passengers={quote.passengers}
          />
        </details>

        <details className="quote-operational-collapsible quote-operational-collapsible-rooming" open>
          <summary>
            <div>
              <span className="eyebrow">Rooming</span>
              <strong>Rooming readiness and manual groups</strong>
            </div>
            <em>{roomingHasWarnings ? 'Review needed' : 'Ready'}</em>
          </summary>
          <QuoteRoomingPanel
            apiBaseUrl={apiBaseUrl}
            quoteId={quote.id}
            passengers={quote.passengers}
            itinerary={quoteItinerary}
            roomingGroups={quoteRoomingGroups}
            singleSupplement={quote.singleSupplement}
          />
        </details>

        {servicePlanner}
        {guidedStepFooter}
      </div>
    </div>
  );
}
