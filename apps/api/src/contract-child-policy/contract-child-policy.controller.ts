import { Body, Controller, Delete, Get, Param, Patch, Put, Post, Req } from '@nestjs/common';
import { AuthenticatedActor } from '../auth/auth.types';
import {
  ChildPolicyChargeBasisValue,
  CreateContractChildPolicyBandDto,
  UpdateContractChildPolicyBandDto,
  UpsertContractChildPolicyDto,
} from './contract-child-policy.dto';
import { ContractChildPolicyService } from './contract-child-policy.service';

type UpsertContractChildPolicyBody = {
  infantMaxAge: number | string;
  childMaxAge: number | string;
  notes?: string | null;
};

type CreateContractChildPolicyBandBody = {
  label: string;
  minAge: number | string;
  maxAge: number | string;
  chargeBasis: ChildPolicyChargeBasisValue;
  chargeValue?: number | string | null;
  isActive?: boolean;
  notes?: string | null;
};

type UpdateContractChildPolicyBandBody = Partial<CreateContractChildPolicyBandBody>;

type RequestWithActor = {
  authenticatedActor?: AuthenticatedActor;
};

@Controller('hotel-contracts/:contractId/child-policy')
export class ContractChildPolicyController {
  constructor(private readonly contractChildPolicyService: ContractChildPolicyService) {}

  @Get()
  findOne(@Param('contractId') contractId: string) {
    return this.contractChildPolicyService.findOne(contractId);
  }

  @Put()
  upsert(@Param('contractId') contractId: string, @Body() body: UpsertContractChildPolicyBody, @Req() request: RequestWithActor) {
    return this.contractChildPolicyService.upsert(contractId, this.toPolicyDto(body), this.toActor(request.authenticatedActor));
  }

  @Post('bands')
  createBand(
    @Param('contractId') contractId: string,
    @Body() body: CreateContractChildPolicyBandBody,
    @Req() request: RequestWithActor,
  ) {
    return this.contractChildPolicyService.createBand(contractId, this.toCreateBandDto(body), this.toActor(request.authenticatedActor));
  }

  @Patch('bands/:bandId')
  updateBand(
    @Param('contractId') contractId: string,
    @Param('bandId') bandId: string,
    @Body() body: UpdateContractChildPolicyBandBody,
    @Req() request: RequestWithActor,
  ) {
    return this.contractChildPolicyService.updateBand(contractId, bandId, this.toUpdateBandDto(body), this.toActor(request.authenticatedActor));
  }

  @Delete('bands/:bandId')
  removeBand(@Param('contractId') contractId: string, @Param('bandId') bandId: string, @Req() request: RequestWithActor) {
    return this.contractChildPolicyService.removeBand(contractId, bandId, this.toActor(request.authenticatedActor));
  }

  private toPolicyDto(body: UpsertContractChildPolicyBody): UpsertContractChildPolicyDto {
    return {
      infantMaxAge: Number(body.infantMaxAge),
      childMaxAge: Number(body.childMaxAge),
      notes: body.notes,
    };
  }

  private toCreateBandDto(body: CreateContractChildPolicyBandBody): CreateContractChildPolicyBandDto {
    return {
      label: body.label,
      minAge: Number(body.minAge),
      maxAge: Number(body.maxAge),
      chargeBasis: body.chargeBasis,
      chargeValue: body.chargeValue == null ? null : Number(body.chargeValue),
      isActive: body.isActive,
      notes: body.notes,
    };
  }

  private toUpdateBandDto(body: UpdateContractChildPolicyBandBody): UpdateContractChildPolicyBandDto {
    return {
      label: body.label,
      minAge: body.minAge === undefined ? undefined : Number(body.minAge),
      maxAge: body.maxAge === undefined ? undefined : Number(body.maxAge),
      chargeBasis: body.chargeBasis,
      chargeValue: body.chargeValue === undefined ? undefined : body.chargeValue == null ? null : Number(body.chargeValue),
      isActive: body.isActive,
      notes: body.notes,
    };
  }

  private toActor(actor?: AuthenticatedActor | null) {
    return actor ? { id: actor.id, auditLabel: actor.auditLabel } : null;
  }
}
