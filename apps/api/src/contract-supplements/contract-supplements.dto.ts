export type ContractSupplementTypeValue =
  | 'EXTRA_BREAKFAST'
  | 'EXTRA_LUNCH'
  | 'EXTRA_DINNER'
  | 'GALA_DINNER'
  | 'EXTRA_BED';

export type ContractChargeBasisValue = 'PER_PERSON' | 'PER_ROOM' | 'PER_STAY' | 'PER_NIGHT';

// Same enum as Prisma HotelMealPlan — kept duplicated here so the DTO
// stays decoupled from the Prisma import in services that consume it.
export type ContractSupplementMealPlanValue = 'RO' | 'BB' | 'HB' | 'FB' | 'AI';

export type CreateContractSupplementDto = {
  roomCategoryId?: string | null;
  type: ContractSupplementTypeValue;
  // Optional meal-plan tag. When set, this supplement is the canonical
  // add-on the quote engine uses to convert a base BB rate into the
  // requested meal plan (HB / FB / etc). null = legacy behavior, engine
  // infers from `type`. See contract-policies/hotel-pricing.resolver.ts.
  mealPlanCode?: ContractSupplementMealPlanValue | null;
  chargeBasis: ContractChargeBasisValue;
  amount: number;
  currency: string;
  // Optional date window the supplement is charged on (ISO date strings
  // or Date). When set, the engine applies it only on nights the stay
  // covers within [appliesFrom, appliesTo] — e.g. a dated Gala Dinner.
  // Both null = charged across the whole stay (legacy behaviour).
  appliesFrom?: string | Date | null;
  appliesTo?: string | Date | null;
  isMandatory?: boolean;
  isActive?: boolean;
  notes?: string | null;
};

export type UpdateContractSupplementDto = Partial<CreateContractSupplementDto>;
