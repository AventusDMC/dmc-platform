import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { HotelOccupancyType } from '@prisma/client';
import { AuthenticatedActor } from '../auth/auth.types';
import { CreateContractOccupancyRuleDto, UpdateContractOccupancyRuleDto } from './contract-occupancy.dto';
import { ContractOccupancyService } from './contract-occupancy.service';

type CreateContractOccupancyRuleBody = {
  roomCategoryId?: string | null;
  occupancyType: HotelOccupancyType;
  minAdults: number | string;
  maxAdults: number | string;
  maxChildren?: number | string;
  maxOccupants: number | string;
  isActive?: boolean;
  notes?: string | null;
};

type UpdateContractOccupancyRuleBody = Partial<CreateContractOccupancyRuleBody>;

type RequestWithActor = {
  authenticatedActor?: AuthenticatedActor;
};

@Controller('hotel-contracts/:contractId/occupancy-rules')
export class ContractOccupancyController {
  constructor(private readonly contractOccupancyService: ContractOccupancyService) {}

  @Get()
  findAll(@Param('contractId') contractId: string) {
    return this.contractOccupancyService.findAll(contractId);
  }

  @Post()
  create(@Param('contractId') contractId: string, @Body() body: CreateContractOccupancyRuleBody, @Req() request: RequestWithActor) {
    return this.contractOccupancyService.create(contractId, this.toCreateDto(body), this.toActor(request.authenticatedActor));
  }

  @Patch(':ruleId')
  update(
    @Param('contractId') contractId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: UpdateContractOccupancyRuleBody,
    @Req() request: RequestWithActor,
  ) {
    return this.contractOccupancyService.update(contractId, ruleId, this.toUpdateDto(body), this.toActor(request.authenticatedActor));
  }

  @Delete(':ruleId')
  remove(@Param('contractId') contractId: string, @Param('ruleId') ruleId: string, @Req() request: RequestWithActor) {
    return this.contractOccupancyService.remove(contractId, ruleId, this.toActor(request.authenticatedActor));
  }

  private toCreateDto(body: CreateContractOccupancyRuleBody): CreateContractOccupancyRuleDto {
    return {
      roomCategoryId: body.roomCategoryId,
      occupancyType: body.occupancyType,
      minAdults: Number(body.minAdults),
      maxAdults: Number(body.maxAdults),
      maxChildren: body.maxChildren === undefined ? undefined : Number(body.maxChildren),
      maxOccupants: Number(body.maxOccupants),
      isActive: body.isActive,
      notes: body.notes,
    };
  }

  private toUpdateDto(body: UpdateContractOccupancyRuleBody): UpdateContractOccupancyRuleDto {
    return {
      roomCategoryId: body.roomCategoryId,
      occupancyType: body.occupancyType,
      minAdults: body.minAdults === undefined ? undefined : Number(body.minAdults),
      maxAdults: body.maxAdults === undefined ? undefined : Number(body.maxAdults),
      maxChildren: body.maxChildren === undefined ? undefined : Number(body.maxChildren),
      maxOccupants: body.maxOccupants === undefined ? undefined : Number(body.maxOccupants),
      isActive: body.isActive,
      notes: body.notes,
    };
  }

  private toActor(actor?: AuthenticatedActor | null) {
    return actor ? { id: actor.id, auditLabel: actor.auditLabel } : null;
  }
}
