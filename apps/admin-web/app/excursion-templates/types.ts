export type ExcursionComponentType = 'TRANSPORT' | 'TICKET' | 'ACTIVITY' | 'GUIDE' | 'DINING';

export type ExcursionTemplateComponent = {
  id: string;
  componentType: ExcursionComponentType;
  label: string;
  sortOrder: number;
  isOptional: boolean;
  operationalNotes?: string | null;
  supplierServiceId?: string | null;
  activityId?: string | null;
  routeId?: string | null;
  transportServiceTypeId?: string | null;
  suggestedDepartureCity?: string | null;
  suggestedArrivalCity?: string | null;
  durationMinutes?: number | null;
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

export type ExcursionTemplate = {
  id: string;
  name: string;
  code?: string | null;
  description?: string | null;
  defaultDepartureCity?: string | null;
  durationMinutes?: number | null;
  operationalNotes?: string | null;
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
