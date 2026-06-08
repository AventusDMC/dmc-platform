import type { ReactNode } from 'react';
import { QuotePassengersPanel, type QuotePassenger } from './QuotePassengersPanel';
import { QuoteRoomingPanel, type QuoteRoomingGroup } from './QuoteRoomingPanel';
import { TailorMadeDraftPanel } from './TailorMadeDraftPanel';
import type { QuoteItineraryResponse } from './QuoteItineraryTab';
import styles from './QuoteItineraryWorkspace.module.css';

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
  quoteCurrency?: string | null;
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
  const operationalSidebarToneClass =
    operationalSidebarTone === 'critical'
      ? styles.operationalSidebarCritical
      : operationalSidebarTone === 'warning'
        ? styles.operationalSidebarWarning
        : styles.operationalSidebarReady;

  return (
    <div className={`${styles.workspace} quote-itinerary-ops-layout`}>
      <aside className={`${styles.operationalSidebar} ${operationalSidebarToneClass} quote-operational-sidebar quote-operational-sidebar-${operationalSidebarTone}`}>
        <div className={`${styles.operationalSidebarHead} quote-operational-sidebar-head`}>
          <p className="eyebrow">Operational Readiness</p>
          <h3>{readiness.statusLabel}</h3>
        </div>
        <div className={`${styles.operationalSidebarList} quote-operational-sidebar-list`}>
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

      <div className={`${styles.main} section-stack quote-itinerary-ops-main`}>
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

        <details className="quote-operational-collapsible quote-operational-collapsible-tailor-made">
          <summary>
            <div>
              <span className="eyebrow">Tailor-Made Draft</span>
              <strong>Generate an editable day-by-day itinerary draft</strong>
            </div>
            <em>Days only — no pricing</em>
          </summary>
          <TailorMadeDraftPanel apiBaseUrl={apiBaseUrl} quoteId={quote.id} quoteCurrency={quote.quoteCurrency} />
        </details>

        {servicePlanner}
        {guidedStepFooter}
      </div>
    </div>
  );
}
