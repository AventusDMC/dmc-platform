import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { AuthenticatedActor } from '../auth/auth.types';
import {
  ContractChargeBasisValue,
  ContractSupplementTypeValue,
  CreateContractSupplementDto,
  UpdateContractSupplementDto,
} from './contract-supplements.dto';
import { ContractSupplementsService } from './contract-supplements.service';

type CreateContractSupplementBody = {
  roomCategoryId?: string | null;
  type: ContractSupplementTypeValue;
  chargeBasis: ContractChargeBasisValue;
  amount: number | string;
  currency: string;
  isMandatory?: boolean;
  isActive?: boolean;
  notes?: string | null;
};

type UpdateContractSupplementBody = Partial<CreateContractSupplementBody>;

type RequestWithActor = {
  authenticatedActor?: AuthenticatedActor;
};

@Controller('hotel-contracts/:contractId/supplements')
export class ContractSupplementsController {
  constructor(private readonly contractSupplementsService: ContractSupplementsService) {}

  @Get()
  findAll(@Param('contractId') contractId: string) {
    return this.contractSupplementsService.findAll(contractId);
  }

  @Post()
  create(@Param('contractId') contractId: string, @Body() body: CreateContractSupplementBody, @Req() request: RequestWithActor) {
    return this.contractSupplementsService.create(contractId, this.toCreateDto(body), this.toActor(request.authenticatedActor));
  }

  @Patch(':supplementId')
  update(
    @Param('contractId') contractId: string,
    @Param('supplementId') supplementId: string,
    @Body() body: UpdateContractSupplementBody,
    @Req() request: RequestWithActor,
  ) {
    return this.contractSupplementsService.update(contractId, supplementId, this.toUpdateDto(body), this.toActor(request.authenticatedActor));
  }

  @Delete(':supplementId')
  remove(@Param('contractId') contractId: string, @Param('supplementId') supplementId: string, @Req() request: RequestWithActor) {
    return this.contractSupplementsService.remove(contractId, supplementId, this.toActor(request.authenticatedActor));
  }

  private toCreateDto(body: CreateContractSupplementBody): CreateContractSupplementDto {
    return {
      roomCategoryId: body.roomCategoryId,
      type: body.type,
      chargeBasis: body.chargeBasis,
      amount: Number(body.amount),
      currency: body.currency,
      isMandatory: body.isMandatory,
      isActive: body.isActive,
      notes: body.notes,
    };
  }

  private toUpdateDto(body: UpdateContractSupplementBody): UpdateContractSupplementDto {
    return {
      roomCategoryId: body.roomCategoryId,
      type: body.type,
      chargeBasis: body.chargeBasis,
      amount: body.amount === undefined ? undefined : Number(body.amount),
      currency: body.currency,
      isMandatory: body.isMandatory,
      isActive: body.isActive,
      notes: body.notes,
    };
  }

  private toActor(actor?: AuthenticatedActor | null) {
    return actor ? { id: actor.id, auditLabel: actor.auditLabel } : null;
  }
}
