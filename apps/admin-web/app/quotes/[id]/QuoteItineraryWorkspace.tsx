import type { ReactNode } from 'react';
import { QuotePassengersPanel, type QuotePassenger } from './QuotePassengersPanel';
import { QuoteRoomingPanel, type QuoteRoomingGroup } from './QuoteRoomingPanel';
import { TailorMadeDraftPanel } from './TailorMadeDraftPanel';
import { QuoteBuilderEntry } from './QuoteBuilderEntry';
import { RoutePlannerPreview } from './RoutePlannerPreview';
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
  // Phase R.6D-1 — GUIDE-type QuoteService id (apply); forwarded to the panel.
  guideServiceId?: string | null;
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
  guideServiceId,
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
  // Phase R.6C-1 — per-(day, record) experience guard keys. For an applied
  // activity the key is `${dayId}:act:${activityId}`; for an applied
  // entrance/ticket it is `${dayId}:svc:${serviceId}`. The panel blocks
  // re-applying the SAME matched activity/service to the SAME day while leaving
  // other experiences (and other days) applyable. Read-only derivation.
  // R.6C-2: a matched activity keys by activityId; every other applied
  // entrance/ticket/experience keys by its service id. Hotel and transport items
  // are guarded separately (appliedHotelDayIds / appliedTransportDayIds), so skip
  // them here and emit a svc key for any remaining applied service. This replaces
  // the earlier category allowlist, which missed entrances whose catalog service
  // carries an off-list category (e.g. Petra resolves to a `variant_archived`
  // service) — so its cross-reload re-apply guard silently failed. Emitting a svc
  // key for a non-experience service is harmless: it only ever blocks a suggestion
  // whose matchedServiceId is that exact service on that exact day.
  const appliedExperienceKeys = quoteItinerary.days.flatMap((day) =>
    (day.dayItems || []).flatMap((item) => {
      const qs = item.quoteService;
      if (!qs) return [];
      if (qs.activityId) return [`${day.id}:act:${qs.activityId}`];
      if (qs.hotel || qs.appliedVehicleRate) return [];
      return qs.service?.id ? [`${day.id}:svc:${qs.service.id}`] : [];
    }),
  );
  // Phase R.6D-1 — itinerary days that ALREADY have a guide item, so the panel's
  // guide guard is per-day (one guide per day). A guide item's linked service is a
  // GUIDE service-type / "Guide"-category service. Read-only derivation.
  const appliedGuideDayIds = quoteItinerary.days
    .filter((day) =>
      (day.dayItems || []).some((item) => {
        const svc = item.quoteService?.service;
        return svc?.serviceType?.code === 'GUIDE' || /guide/i.test(svc?.category || '');
      }),
    )
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
        {/* Phase S.1 — unified Quote Builder front door (UI organization only). */}
        <QuoteBuilderEntry />
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

        <details id="qb-tailor-made" className="quote-operational-collapsible quote-operational-collapsible-tailor-made">
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
            appliedExperienceKeys={appliedExperienceKeys}
            guideServiceId={guideServiceId}
            appliedGuideDayIds={appliedGuideDayIds}
          />
        </details>

        {/* Phase S.2D-1/-2 — per-day Route Planner. Preview presets and "Apply to
            Day" writes the selected preset to ONE day's title + notes via the
            existing PATCH /itinerary/day. No generator/services/pricing. */}
        <details id="qb-route-planner" className="quote-operational-collapsible quote-operational-collapsible-route-planner">
          <summary>
            <div>
              <span className="eyebrow">Route Planner</span>
              <strong>Apply route presets per day</strong>
            </div>
            <em>Title & narrative only</em>
          </summary>
          <RoutePlannerPreview
            apiBaseUrl={apiBaseUrl}
            days={quoteItinerary.days.map((day) => ({ id: day.id, dayNumber: day.dayNumber, title: day.title }))}
          />
        </details>

        {servicePlanner}
        {guidedStepFooter}
      </div>
    </div>
  );
}
