export type ContractSupplementTypeValue =
  | 'EXTRA_BREAKFAST'
  | 'EXTRA_LUNCH'
  | 'EXTRA_DINNER'
  | 'GALA_DINNER'
  | 'EXTRA_BED';

export type ContractChargeBasisValue = 'PER_PERSON' | 'PER_ROOM' | 'PER_STAY' | 'PER_NIGHT';

export type CreateContractSupplementDto = {
  roomCategoryId?: string | null;
  type: ContractSupplementTypeValue;
  chargeBasis: ContractChargeBasisValue;
  amount: number;
  currency: string;
  isMandatory?: boolean;
  isActive?: boolean;
  notes?: string | null;
};

export type UpdateContractSupplementDto = Partial<CreateContractSupplementDto>;
