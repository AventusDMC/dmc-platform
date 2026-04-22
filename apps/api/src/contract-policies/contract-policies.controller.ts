import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { AuthenticatedActor } from '../auth/auth.types';
import {
  CancellationDeadlineUnitValue,
  CancellationPenaltyTypeValue,
  CreateContractCancellationRuleDto,
  UpdateContractCancellationRuleDto,
  UpsertContractCancellationPolicyDto,
} from './contract-policies.dto';
import { ContractPoliciesService } from './contract-policies.service';

type UpsertContractCancellationPolicyBody = {
  summary?: string | null;
  notes?: string | null;
  noShowPenaltyType?: CancellationPenaltyTypeValue | null;
  noShowPenaltyValue?: number | string | null;
};

type CreateContractCancellationRuleBody = {
  windowFromValue: number | string;
  windowToValue: number | string;
  deadlineUnit: CancellationDeadlineUnitValue;
  penaltyType: CancellationPenaltyTypeValue;
  penaltyValue?: number | string | null;
  isActive?: boolean;
  notes?: string | null;
};

type UpdateContractCancellationRuleBody = Partial<CreateContractCancellationRuleBody>;

type RequestWithActor = {
  authenticatedActor?: AuthenticatedActor;
};

@Controller('hotel-contracts/:contractId/cancellation-policy')
export class ContractPoliciesController {
  constructor(private readonly contractPoliciesService: ContractPoliciesService) {}

  @Get()
  findOne(@Param('contractId') contractId: string) {
    return this.contractPoliciesService.findOne(contractId);
  }

  @Put()
  upsert(@Param('contractId') contractId: string, @Body() body: UpsertContractCancellationPolicyBody, @Req() request: RequestWithActor) {
    return this.contractPoliciesService.upsert(contractId, this.toPolicyDto(body), this.toActor(request.authenticatedActor));
  }

  @Post('rules')
  createRule(
    @Param('contractId') contractId: string,
    @Body() body: CreateContractCancellationRuleBody,
    @Req() request: RequestWithActor,
  ) {
    return this.contractPoliciesService.createRule(contractId, this.toCreateRuleDto(body), this.toActor(request.authenticatedActor));
  }

  @Patch('rules/:ruleId')
  updateRule(
    @Param('contractId') contractId: string,
    @Param('ruleId') ruleId: string,
    @Body() body: UpdateContractCancellationRuleBody,
    @Req() request: RequestWithActor,
  ) {
    return this.contractPoliciesService.updateRule(contractId, ruleId, this.toUpdateRuleDto(body), this.toActor(request.authenticatedActor));
  }

  @Delete('rules/:ruleId')
  removeRule(@Param('contractId') contractId: string, @Param('ruleId') ruleId: string, @Req() request: RequestWithActor) {
    return this.contractPoliciesService.removeRule(contractId, ruleId, this.toActor(request.authenticatedActor));
  }

  private toPolicyDto(body: UpsertContractCancellationPolicyBody): UpsertContractCancellationPolicyDto {
    return {
      summary: body.summary,
      notes: body.notes,
      noShowPenaltyType: body.noShowPenaltyType,
      noShowPenaltyValue:
        body.noShowPenaltyValue === undefined ? undefined : body.noShowPenaltyValue == null ? null : Number(body.noShowPenaltyValue),
    };
  }

  private toCreateRuleDto(body: CreateContractCancellationRuleBody): CreateContractCancellationRuleDto {
    return {
      windowFromValue: Number(body.windowFromValue),
      windowToValue: Number(body.windowToValue),
      deadlineUnit: body.deadlineUnit,
      penaltyType: body.penaltyType,
      penaltyValue: body.penaltyValue == null ? null : Number(body.penaltyValue),
      isActive: body.isActive,
      notes: body.notes,
    };
  }

  private toUpdateRuleDto(body: UpdateContractCancellationRuleBody): UpdateContractCancellationRuleDto {
    return {
      windowFromValue: body.windowFromValue === undefined ? undefined : Number(body.windowFromValue),
      windowToValue: body.windowToValue === undefined ? undefined : Number(body.windowToValue),
      deadlineUnit: body.deadlineUnit,
      penaltyType: body.penaltyType,
      penaltyValue: body.penaltyValue === undefined ? undefined : body.penaltyValue == null ? null : Number(body.penaltyValue),
      isActive: body.isActive,
      notes: body.notes,
    };
  }

  private toActor(actor?: AuthenticatedActor | null) {
    return actor ? { id: actor.id, auditLabel: actor.auditLabel } : null;
  }
}
