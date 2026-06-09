import type { ReactNode } from 'react';
import { QuotePassengersPanel, type QuotePassenger } from './QuotePassengersPanel';
import { QuoteRoomingPanel, type QuoteRoomingGroup } from './QuoteRoomingPanel';
import { TailorMadeDraftPanel } from './TailorMadeDraftPanel';
import type { QuoteItineraryResponse } from './QuoteItineraryTab';
import type { RouteOption } from '../../lib/routes';
import type { TransportServiceTypeOption } from './tailor-made-transport-resolve';
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
  // Phase R.6A-1/R.6A-2 — tailor-made hotel apply inputs (forwarded to the panel).
  hotelServiceId?: string | null;
  // Phase R.6B-0 — route + transport-service-type catalogs (forwarded to the panel
  // for the read-only transport price preview).
  routes?: RouteOption[];
  transportServiceTypes?: TransportServiceTypeOption[];
  // Phase R.6B-1 — TRANSPORT-type QuoteService id (apply); forwarded to the panel.
  transportServiceId?: string | null;
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
  hotelServiceId,
  routes,
  transportServiceTypes,
  transportServiceId,
}: QuoteItineraryWorkspaceProps) {
  // Phase R.6A-2 — itinerary days that ALREADY have a hotel item, so the panel's
  // conflict guard is stay-level (a stay is blocked only when its first day has a
  // hotel). Derived from the itinerary's day-item join (hotel set on the linked
  // service). Read-only derivation; no writes.
  const appliedHotelDayIds = quoteItinerary.days
    .filter((day) => (day.dayItems || []).some((item) => Boolean(item.quoteService?.hotel)))
    .map((day) => day.id);
  // Phase R.6B-1 — itinerary days that ALREADY have a transport item (a linked
  // service carrying an appliedVehicleRate), so the panel's transport guard is
  // per-day. Read-only derivation; no writes.
  const appliedTransportDayIds = quoteItinerary.days
    .filter((day) => (day.dayItems || []).some((item) => Boolean(item.quoteService?.appliedVehicleRate)))
    .map((day) => day.id);
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
          <TailorMadeDraftPanel
            apiBaseUrl={apiBaseUrl}
            quoteId={quote.id}
            quoteCurrency={quote.quoteCurrency}
            hotelServiceId={hotelServiceId}
            appliedHotelDayIds={appliedHotelDayIds}
            routes={routes}
            transportServiceTypes={transportServiceTypes}
            transportServiceId={transportServiceId}
            appliedTransportDayIds={appliedTransportDayIds}
            defaultPax={totalPax}
          />
        </details>

        {servicePlanner}
        {guidedStepFooter}
      </div>
    </div>
  );
}
