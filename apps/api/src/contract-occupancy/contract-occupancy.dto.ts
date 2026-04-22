import { HotelOccupancyType } from '@prisma/client';

export type CreateContractOccupancyRuleDto = {
  roomCategoryId?: string | null;
  occupancyType: HotelOccupancyType;
  minAdults: number;
  maxAdults: number;
  maxChildren?: number;
  maxOccupants: number;
  isActive?: boolean;
  notes?: string | null;
};

export type UpdateContractOccupancyRuleDto = Partial<CreateContractOccupancyRuleDto>;
