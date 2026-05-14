export type ExcursionComponentType = 'TRANSPORT' | 'TICKET' | 'ACTIVITY' | 'GUIDE' | 'DINING';

export type ExcursionTemplateComponent = {
  id: string;
  componentType: ExcursionComponentType;
  label: string;
  sortOrder: number;
  isOptional: boolean;
  active?: boolean;
  operationalNotes?: string | null;
  supplierServiceId?: string | null;
  activityId?: string | null;
  routeId?: string | null;
  touringRouteId?: string | null;
  transportServiceTypeId?: string | null;
  suggestedDepartureCity?: string | null;
  suggestedArrivalCity?: string | null;
  durationMinutes?: number | null;
  requiredArrivalTime?: string | null;
  supplierConfirmationRequired?: boolean | null;
  voucherRequired?: boolean | null;
  pickupNotes?: string | null;
  operationalDependency?: string | null;
  estimatedDurationMinutes?: number | null;
  activity?: {
    id: string;
    name: string;
  } | null;
  route?: {
    id: string;
    name: string;
    durationMinutes?: number | null;
    fromPlace?: { name?: string | null } | null;
    toPlace?: { name?: string | null } | null;
  } | null;
  touringRoute?: {
    id: string;
    code?: string | null;
    name: string;
    startCity: string;
    durationDays?: number;
    mainDestinations?: string[] | null;
    includedKm?: number | null;
    includedHours?: number | null;
    stops?: Array<{ location?: string | null; city?: string | null }>;
    pricings?: Array<{
      id: string;
      pricingBasis?: string | null;
      minPax?: number | null;
      maxPax?: number | null;
      currency: string;
      baseCost: number;
      costPerDay?: number | null;
      includedKm?: number | null;
      includedHours?: number | null;
      active?: boolean | null;
      notes?: string | null;
      supplier?: { id?: string | null; name?: string | null } | null;
      vehicle?: { id?: string | null; name?: string | null; vehicleType?: string | null; maxPax?: number | null } | null;
      transportServiceType?: { id?: string | null; name?: string | null; code?: string | null; classification?: string | null } | null;
    }>;
  } | null;
  supplierService?: {
    id: string;
    name: string;
    category?: string | null;
    serviceType?: { name?: string | null } | null;
    entranceFee?: { name?: string | null } | null;
  } | null;
  transportServiceType?: {
    id: string;
    name: string;
    code?: string | null;
    classification?: string | null;
  } | null;
};

export type ExcursionTemplateCatalogs = {
  routes: Array<{ id: string; name: string; durationMinutes?: number | null }>;
  touringRoutes: Array<{
    id: string;
    code?: string | null;
    name: string;
    startCity: string;
    durationDays?: number;
    active?: boolean;
    mainDestinations?: string[] | null;
    includedKm?: number | null;
    includedHours?: number | null;
    stops?: Array<{ location?: string | null; city?: string | null }>;
    pricings?: Array<{
      id: string;
      pricingBasis?: string | null;
      minPax?: number | null;
      maxPax?: number | null;
      currency: string;
      baseCost: number;
      costPerDay?: number | null;
      includedKm?: number | null;
      includedHours?: number | null;
      active?: boolean | null;
      notes?: string | null;
      supplier?: { id?: string | null; name?: string | null } | null;
      vehicle?: { id?: string | null; name?: string | null; vehicleType?: string | null; maxPax?: number | null } | null;
      transportServiceType?: { id?: string | null; name?: string | null; code?: string | null; classification?: string | null } | null;
    }>;
  }>;
  transportServiceTypes: Array<{ id: string; name: string; code?: string | null; classification?: string | null }>;
  activities: Array<{ id: string; name: string; active?: boolean; durationMinutes?: number | null }>;
  services: Array<{
    id: string;
    name: string;
    category?: string | null;
    serviceType?: { name?: string | null; code?: string | null } | null;
    ticketRateVariants?: Array<{ id: string }> | null;
  }>;
};

export type ExcursionTemplate = {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  defaultDepartureCity?: string | null;
  durationMinutes?: number | null;
  operationalNotes?: string | null;
  operatingDays?: string | null;
  recommendedDepartureTime?: string | null;
  estimatedReturnTime?: string | null;
  minimumPax?: number | null;
  maximumPax?: number | null;
  weatherSensitive?: boolean | null;
  childFriendly?: boolean | null;
  wheelchairAccessible?: boolean | null;
  seasonalRestrictions?: string | null;
  operationalWarnings?: string | null;
  active: boolean;
  components: ExcursionTemplateComponent[];
};

export type SuggestedTransportResponse = {
  templateId: string;
  pax: number;
  suggestions: Array<{
    componentId: string;
    label: string;
    routeId?: string | null;
    transportServiceTypeId?: string | null;
    reason?: string;
    candidates: Array<{
      id: string;
      baseCost?: number | null;
      currency?: string | null;
      minPax?: number | null;
      maxPax?: number | null;
      route?: { name?: string | null } | null;
      supplier?: { name?: string | null } | null;
      transportServiceType?: { name?: string | null } | null;
      vehicle?: { name?: string | null; maxPax?: number | null } | null;
    }>;
  }>;
};
