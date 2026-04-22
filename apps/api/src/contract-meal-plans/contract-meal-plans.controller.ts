import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { AuthenticatedActor } from '../auth/auth.types';
import {
  CreateContractMealPlanDto,
  MealPlanCodeValue,
  UpdateContractMealPlanDto,
} from './contract-meal-plans.dto';
import { ContractMealPlansService } from './contract-meal-plans.service';

type CreateContractMealPlanBody = {
  code: MealPlanCodeValue;
  isActive?: boolean;
  notes?: string | null;
};

type UpdateContractMealPlanBody = Partial<CreateContractMealPlanBody>;

type RequestWithActor = {
  authenticatedActor?: AuthenticatedActor;
};

@Controller('hotel-contracts/:contractId/meal-plans')
export class ContractMealPlansController {
  constructor(private readonly contractMealPlansService: ContractMealPlansService) {}

  @Get()
  findAll(@Param('contractId') contractId: string) {
    return this.contractMealPlansService.findAll(contractId);
  }

  @Post()
  create(@Param('contractId') contractId: string, @Body() body: CreateContractMealPlanBody, @Req() request: RequestWithActor) {
    return this.contractMealPlansService.create(contractId, this.toCreateDto(body), this.toActor(request.authenticatedActor));
  }

  @Patch(':mealPlanId')
  update(
    @Param('contractId') contractId: string,
    @Param('mealPlanId') mealPlanId: string,
    @Body() body: UpdateContractMealPlanBody,
    @Req() request: RequestWithActor,
  ) {
    return this.contractMealPlansService.update(contractId, mealPlanId, this.toUpdateDto(body), this.toActor(request.authenticatedActor));
  }

  @Delete(':mealPlanId')
  remove(@Param('contractId') contractId: string, @Param('mealPlanId') mealPlanId: string, @Req() request: RequestWithActor) {
    return this.contractMealPlansService.remove(contractId, mealPlanId, this.toActor(request.authenticatedActor));
  }

  private toCreateDto(body: CreateContractMealPlanBody): CreateContractMealPlanDto {
    return {
      code: body.code,
      isActive: body.isActive,
      notes: body.notes,
    };
  }

  private toUpdateDto(body: UpdateContractMealPlanBody): UpdateContractMealPlanDto {
    return {
      code: body.code,
      isActive: body.isActive,
      notes: body.notes,
    };
  }

  private toActor(actor?: AuthenticatedActor | null) {
    return actor ? { id: actor.id, auditLabel: actor.auditLabel } : null;
  }
}
