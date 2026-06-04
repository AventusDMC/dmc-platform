export type TouringRouteDetail = {
  id: string;
  code: string;
  name: string;
  startCity: string;
  durationDays: number;
  routeDescription?: string | null;
  mainDestinations?: string[] | null;
  includedKm?: number | null;
  includedHours?: number | null;
  estimatedDistanceKm?: number | null;
  estimatedDriveHours?: number | null;
  region?: string | null;
  longDistance?: boolean | null;
  desertRoad?: boolean | null;
  mountainRoad?: boolean | null;
  seasonalHeatRisk?: boolean | null;
  sicPossible?: boolean | null;
  overnightRisk?: boolean | null;
  reviewNotes?: string | null;
  active?: boolean;
  stops?: Array<{
    id: string;
    order: number;
    city: string;
    location?: string | null;
    notes?: string | null;
    poiId?: string | null;
    pointOfInterest?: { id: string; name: string; code?: string | null } | null;
  }>;
  pricings?: TouringRoutePricingDetail[];
};

export type TouringRoutePricingDetail = {
  id: string;
  supplierId?: string | null;
  vehicleId?: string | null;
  transportServiceTypeId?: string | null;
  pricingBasis: 'PER_VEHICLE' | 'PER_DAY';
  minPax: number;
  maxPax: number;
  currency: string;
  baseCost: number;
  costPerDay?: number | null;
  includedKm?: number | null;
  includedHours?: number | null;
  extraKmRate?: number | null;
  extraHourRate?: number | null;
  validFrom?: string | null;
  validTo?: string | null;
  active?: boolean;
  notes?: string | null;
  supplier?: { id?: string; name?: string | null } | null;
  vehicle?: { id?: string; name?: string | null; vehicleType?: string | null; maxPax?: number | null } | null;
  transportServiceType?: { id?: string; name?: string | null; code?: string | null; classification?: string | null } | null;
};

export type TouringRouteCatalogs = {
  suppliers: Array<{ id: string; name: string; active?: boolean | null; type?: string | null }>;
  vehicles: Array<{ id: string; name: string; vehicleType?: string | null; maxPax?: number | null }>;
  transportServiceTypes: Array<{ id: string; name: string; code?: string | null; classification?: string | null }>;
  pois: Array<{ id: string; name: string; code?: string | null }>;
};
