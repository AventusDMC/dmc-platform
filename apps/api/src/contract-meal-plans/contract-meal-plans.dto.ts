export type MealPlanCodeValue = 'RO' | 'BB' | 'HB' | 'FB' | 'AI';

export type CreateContractMealPlanDto = {
  code: MealPlanCodeValue;
  isDefault?: boolean;
  isActive?: boolean;
  notes?: string | null;
};

export type UpdateContractMealPlanDto = Partial<CreateContractMealPlanDto>;
