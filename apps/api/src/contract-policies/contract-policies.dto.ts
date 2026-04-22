export type CancellationPenaltyTypeValue = 'PERCENT' | 'NIGHTS' | 'FULL_STAY' | 'FIXED';
export type CancellationDeadlineUnitValue = 'DAYS' | 'HOURS';

export type UpsertContractCancellationPolicyDto = {
  summary?: string | null;
  notes?: string | null;
  noShowPenaltyType?: CancellationPenaltyTypeValue | null;
  noShowPenaltyValue?: number | null;
};

export type CreateContractCancellationRuleDto = {
  windowFromValue: number;
  windowToValue: number;
  deadlineUnit: CancellationDeadlineUnitValue;
  penaltyType: CancellationPenaltyTypeValue;
  penaltyValue?: number | null;
  isActive?: boolean;
  notes?: string | null;
};

export type UpdateContractCancellationRuleDto = Partial<CreateContractCancellationRuleDto>;
