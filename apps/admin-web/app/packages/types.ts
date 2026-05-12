export type PackageTemplateComponentType = 'EXCURSION_TEMPLATE' | 'ACTIVITY' | 'HOTEL' | 'TRANSPORT' | 'TICKET' | 'SERVICE';

export type PackageTemplateComponent = {
  id: string;
  componentType: PackageTemplateComponentType;
  dayNumber: number;
  label: string;
  sortOrder: number;
  isOptional: boolean;
  active: boolean;
  operationalNotes: string | null;
  excursionTemplateId: string | null;
  activityId: string | null;
  hotelContractId: string | null;
  routeId: string | null;
  transportServiceTypeId: string | null;
  pricingMode: string | null;
  supplierServiceId: string | null;
  excursionTemplate?: { id: string; name: string; code?: string | null } | null;
  activity?: { id: string; name: string; code?: string | null; category?: string | null } | null;
  hotelContract?: { id: string; name: string; hotel?: { id: string; name: string; city?: string | null } | null } | null;
  route?: { id: string; name: string } | null;
  transportServiceType?: { id: string; name: string; code: string } | null;
  supplierService?: { id: string; name: string; category: string; entranceFee?: { name?: string | null; siteName?: string | null } | null } | null;
};

export type PackageTemplate = {
  id: string;
  name: string;
  durationDays: number;
  targetMarket: string | null;
  season: string | null;
  active: boolean;
  operationalNotes: string | null;
  components: PackageTemplateComponent[];
};

export type PackageTemplateOption = {
  id: string;
  name: string;
  code?: string | null;
};

export type PackageTemplateHotelContractOption = {
  id: string;
  name: string;
  hotel: {
    id: string;
    name: string;
    city?: string | null;
  };
};

export type PackageTemplateRouteOption = {
  id: string;
  name: string;
};

export type PackageTemplateTransportServiceTypeOption = {
  id: string;
  name: string;
  code: string;
};

export type PackageTemplateSupplierServiceOption = {
  id: string;
  name: string;
  category: string;
  entranceFee?: { name?: string | null; siteName?: string | null } | null;
};
