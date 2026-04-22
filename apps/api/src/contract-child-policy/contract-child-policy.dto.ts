export type ChildPolicyChargeBasisValue = 'FREE' | 'PERCENT_OF_ADULT' | 'FIXED_AMOUNT';

export type UpsertContractChildPolicyDto = {
  infantMaxAge: number;
  childMaxAge: number;
  notes?: string | null;
};

export type CreateContractChildPolicyBandDto = {
  label: string;
  minAge: number;
  maxAge: number;
  chargeBasis: ChildPolicyChargeBasisValue;
  chargeValue?: number | null;
  isActive?: boolean;
  notes?: string | null;
};

export type UpdateContractChildPolicyBandDto = Partial<CreateContractChildPolicyBandDto>;
