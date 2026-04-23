import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
type TourismFeeMode = 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM';
type ServiceRatePricingMode = 'PER_PERSON' | 'PER_GROUP' | 'PER_DAY';
import { Roles } from '../auth/auth.decorators';
import { ServicesService } from './services.service';

type CreateSupplierServiceBody = {
  supplierId: string;
  name: string;
  category?: string | null;
  serviceTypeId?: string | null;
  unitType: 'per_person' | 'per_room' | 'per_vehicle' | 'per_group' | 'per_night' | 'per_day';
  baseCost: number;
  currency: string;
  costBaseAmount?: number;
  costCurrency?: string;
  salesTaxPercent?: number;
  salesTaxIncluded?: boolean;
  serviceChargePercent?: number;
  serviceChargeIncluded?: boolean;
  tourismFeeAmount?: number | null;
  tourismFeeCurrency?: string | null;
  tourismFeeMode?: TourismFeeMode | null;
};

type UpdateSupplierServiceBody = Partial<CreateSupplierServiceBody>;

type CreateServiceRateBody = {
  supplierId?: string | null;
  costBaseAmount: number;
  costCurrency: string;
  pricingMode: ServiceRatePricingMode;
  salesTaxPercent?: number;
  salesTaxIncluded?: boolean;
  serviceChargePercent?: number;
  serviceChargeIncluded?: boolean;
  tourismFeeAmount?: number | null;
  tourismFeeCurrency?: string | null;
  tourismFeeMode?: TourismFeeMode | null;
};

type UpdateServiceRateBody = Partial<CreateServiceRateBody>;

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Get()
  findAll() {
    return this.servicesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.servicesService.findOne(id);
  }

  @Get(':id/rates')
  listRates(@Param('id') id: string) {
    return this.servicesService.listRates(id);
  }

  @Post()
  @Roles('admin', 'operations')
  create(@Body() body: CreateSupplierServiceBody) {
    return this.servicesService.create({
      ...body,
      serviceTypeId: body.serviceTypeId || null,
      baseCost: Number(body.baseCost),
      costBaseAmount: body.costBaseAmount === undefined ? undefined : Number(body.costBaseAmount),
      salesTaxPercent: body.salesTaxPercent === undefined ? undefined : Number(body.salesTaxPercent),
      serviceChargePercent: body.serviceChargePercent === undefined ? undefined : Number(body.serviceChargePercent),
      tourismFeeAmount:
        body.tourismFeeAmount === undefined || body.tourismFeeAmount === null ? body.tourismFeeAmount : Number(body.tourismFeeAmount),
    });
  }

  @Patch(':id')
  @Roles('admin', 'operations')
  update(@Param('id') id: string, @Body() body: UpdateSupplierServiceBody) {
    return this.servicesService.update(id, {
      ...body,
      serviceTypeId: body.serviceTypeId === undefined ? undefined : body.serviceTypeId || null,
      baseCost: body.baseCost === undefined ? undefined : Number(body.baseCost),
      costBaseAmount: body.costBaseAmount === undefined ? undefined : Number(body.costBaseAmount),
      salesTaxPercent: body.salesTaxPercent === undefined ? undefined : Number(body.salesTaxPercent),
      serviceChargePercent: body.serviceChargePercent === undefined ? undefined : Number(body.serviceChargePercent),
      tourismFeeAmount:
        body.tourismFeeAmount === undefined || body.tourismFeeAmount === null ? body.tourismFeeAmount : Number(body.tourismFeeAmount),
    });
  }

  @Post(':id/rates')
  @Roles('admin', 'operations')
  createRate(@Param('id') id: string, @Body() body: CreateServiceRateBody) {
    return this.servicesService.createRate(id, {
      supplierId: body.supplierId === undefined ? undefined : body.supplierId || null,
      costBaseAmount: Number(body.costBaseAmount),
      costCurrency: body.costCurrency,
      pricingMode: body.pricingMode,
      salesTaxPercent: body.salesTaxPercent === undefined ? undefined : Number(body.salesTaxPercent),
      salesTaxIncluded: body.salesTaxIncluded,
      serviceChargePercent: body.serviceChargePercent === undefined ? undefined : Number(body.serviceChargePercent),
      serviceChargeIncluded: body.serviceChargeIncluded,
      tourismFeeAmount:
        body.tourismFeeAmount === undefined || body.tourismFeeAmount === null ? body.tourismFeeAmount : Number(body.tourismFeeAmount),
      tourismFeeCurrency: body.tourismFeeCurrency,
      tourismFeeMode: body.tourismFeeMode,
    });
  }

  @Patch('rates/:rateId')
  @Roles('admin', 'operations')
  updateRate(@Param('rateId') rateId: string, @Body() body: UpdateServiceRateBody) {
    return this.servicesService.updateRate(rateId, {
      supplierId: body.supplierId === undefined ? undefined : body.supplierId || null,
      costBaseAmount: body.costBaseAmount === undefined ? undefined : Number(body.costBaseAmount),
      costCurrency: body.costCurrency,
      pricingMode: body.pricingMode,
      salesTaxPercent: body.salesTaxPercent === undefined ? undefined : Number(body.salesTaxPercent),
      salesTaxIncluded: body.salesTaxIncluded,
      serviceChargePercent: body.serviceChargePercent === undefined ? undefined : Number(body.serviceChargePercent),
      serviceChargeIncluded: body.serviceChargeIncluded,
      tourismFeeAmount:
        body.tourismFeeAmount === undefined || body.tourismFeeAmount === null ? body.tourismFeeAmount : Number(body.tourismFeeAmount),
      tourismFeeCurrency: body.tourismFeeCurrency,
      tourismFeeMode: body.tourismFeeMode,
    });
  }

  @Delete(':id')
  @Roles('admin', 'operations')
  remove(@Param('id') id: string) {
    return this.servicesService.remove(id);
  }

  @Delete('rates/:rateId')
  @Roles('admin', 'operations')
  removeRate(@Param('rateId') rateId: string) {
    return this.servicesService.removeRate(rateId);
  }
}
