import { BadRequestException } from '@nestjs/common';

export type SupportedCurrency = 'USD' | 'JOD' | 'EUR';
export type TourismFeeMode = 'PER_NIGHT_PER_PERSON' | 'PER_NIGHT_PER_ROOM';

type SupplierChargeConfig = {
  costBaseAmount: number;
  costCurrency: string;
  salesTaxPercent?: number | null;
  salesTaxIncluded?: boolean | null;
  serviceChargePercent?: number | null;
  serviceChargeIncluded?: boolean | null;
  tourismFeeAmount?: number | null;
  tourismFeeCurrency?: string | null;
  tourismFeeMode?: TourismFeeMode | null;
};

type PricingUnits = {
  pricingUnits: number;
  roomCount: number;
  nightCount: number;
  paxCount: number;
};

type PricingInput = {
  supplierPricing: SupplierChargeConfig;
  pricingUnits: PricingUnits;
  quoteCurrency: string;
  markupPercent: number;
  legacyPricing?: {
    totalCost?: number | null;
    totalSell?: number | null;
    currency?: string | null;
  } | null;
};

const FX_RATE_DATE = '2026-04-23';

const FX_TO_USD: Record<SupportedCurrency, number> = {
  USD: 1,
  EUR: 1.08,
  JOD: 1.41,
};

function isSupportedCurrency(value: string | null | undefined): value is SupportedCurrency {
  return Boolean(value && value.trim().toUpperCase() in FX_TO_USD);
}

function normalizeCurrency(
  value: string | null | undefined,
  fieldName: string,
  fallback: SupportedCurrency = 'USD',
): SupportedCurrency {
  const currency = value?.trim().toUpperCase() as SupportedCurrency | undefined;

  if (!currency || !(currency in FX_TO_USD)) {
    return fallback;
  }

  return currency;
}

function roundMoney(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(2));
}

function safeNumber(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(value as number) ? Number(value) : fallback;
}

function addIncludedPercent(baseAmount: number, percent: number, included: boolean) {
  if (!percent || percent <= 0) {
    return baseAmount;
  }

  if (included) {
    return baseAmount;
  }

  return baseAmount * (1 + percent / 100);
}

function convertCurrency(amount: number, fromCurrency: SupportedCurrency, toCurrency: SupportedCurrency) {
  if (fromCurrency === toCurrency) {
    return {
      amount: roundMoney(amount),
      fxRate: null,
      fxFromCurrency: null,
      fxToCurrency: null,
      fxRateDate: null,
    };
  }

  const amountInUsd = amount * FX_TO_USD[fromCurrency];
  const fxRate = FX_TO_USD[fromCurrency] / FX_TO_USD[toCurrency];

  return {
    amount: roundMoney(amountInUsd / FX_TO_USD[toCurrency]),
    fxRate: Number(fxRate.toFixed(6)),
    fxFromCurrency: fromCurrency,
    fxToCurrency: toCurrency,
    fxRateDate: new Date(`${FX_RATE_DATE}T00:00:00.000Z`),
  };
}

function calculateStayBasedTourismFeeTotal(args: {
  tourismFeeAmount: number;
  tourismFeeMode: TourismFeeMode | null;
  nightCount: number;
  paxCount: number;
  roomCount: number;
}) {
  const { tourismFeeAmount, tourismFeeMode, nightCount, paxCount, roomCount } = args;

  if (tourismFeeAmount <= 0 || !tourismFeeMode) {
    return 0;
  }

  if (tourismFeeMode === 'PER_NIGHT_PER_PERSON') {
    return tourismFeeAmount * nightCount * paxCount;
  }

  if (tourismFeeMode === 'PER_NIGHT_PER_ROOM') {
    return tourismFeeAmount * nightCount * roomCount;
  }

  return 0;
}

export function calculateMultiCurrencyQuoteItemPricing(input: PricingInput) {
  const legacyCurrency = isSupportedCurrency(input.legacyPricing?.currency) ? input.legacyPricing?.currency.trim().toUpperCase() as SupportedCurrency : 'USD';
  const quoteCurrency = normalizeCurrency(input.quoteCurrency, 'quoteCurrency', legacyCurrency);
  const costCurrency = normalizeCurrency(input.supplierPricing.costCurrency, 'costCurrency', legacyCurrency);
  const tourismFeeCurrency = safeNumber(input.supplierPricing.tourismFeeAmount) > 0
    ? normalizeCurrency(input.supplierPricing.tourismFeeCurrency ?? input.supplierPricing.costCurrency, 'tourismFeeCurrency', costCurrency)
    : costCurrency;

  const pricingUnits = Math.max(1, safeNumber(input.pricingUnits.pricingUnits, 1));
  const roomCount = Math.max(1, safeNumber(input.pricingUnits.roomCount, 1));
  const nightCount = Math.max(1, safeNumber(input.pricingUnits.nightCount, 1));
  const paxCount = Math.max(1, safeNumber(input.pricingUnits.paxCount, 1));

  const unitBaseAmount = Math.max(0, safeNumber(input.supplierPricing.costBaseAmount));
  const salesTaxPercent = Math.max(0, safeNumber(input.supplierPricing.salesTaxPercent));
  const serviceChargePercent = Math.max(0, safeNumber(input.supplierPricing.serviceChargePercent));
  const tourismFeeAmount = Math.max(0, safeNumber(input.supplierPricing.tourismFeeAmount));
  const tourismFeeMode = input.supplierPricing.tourismFeeMode || null;
  const markupPercent = Math.max(0, safeNumber(input.markupPercent));

  let supplierSubtotal = unitBaseAmount * pricingUnits;
  supplierSubtotal = addIncludedPercent(
    supplierSubtotal,
    serviceChargePercent,
    Boolean(input.supplierPricing.serviceChargeIncluded),
  );
  supplierSubtotal = addIncludedPercent(
    supplierSubtotal,
    salesTaxPercent,
    Boolean(input.supplierPricing.salesTaxIncluded),
  );

  const tourismFeeTotal = calculateStayBasedTourismFeeTotal({
    tourismFeeAmount,
    tourismFeeMode,
    nightCount,
    paxCount,
    roomCount,
  });

  const convertedSubtotal = convertCurrency(supplierSubtotal, costCurrency, quoteCurrency);
  const convertedTourism = convertCurrency(tourismFeeTotal, tourismFeeCurrency, quoteCurrency);
  const calculatedTotalCost = roundMoney(convertedSubtotal.amount + convertedTourism.amount);
  const calculatedTotalSell = roundMoney(calculatedTotalCost * (1 + markupPercent / 100));
  const fallbackTotalCost = roundMoney(safeNumber(input.legacyPricing?.totalCost));
  const fallbackTotalSell = roundMoney(safeNumber(input.legacyPricing?.totalSell, fallbackTotalCost));
  const hasStructuredPricing = calculatedTotalCost > 0 || unitBaseAmount > 0 || tourismFeeAmount > 0;
  const totalCost = hasStructuredPricing ? calculatedTotalCost : fallbackTotalCost;
  const totalSell = hasStructuredPricing || markupPercent > 0 ? calculatedTotalSell : fallbackTotalSell;

  const fxSnapshot =
    convertedSubtotal.fxRate !== null
      ? convertedSubtotal
      : convertedTourism.fxRate !== null
        ? convertedTourism
        : {
            fxRate: null,
            fxFromCurrency: null,
            fxToCurrency: null,
            fxRateDate: null,
          };

  return {
    totalCost,
    totalSell,
    quoteCurrency,
    supplierCostTotal: roundMoney(supplierSubtotal),
    fxRate: fxSnapshot.fxRate,
    fxFromCurrency: fxSnapshot.fxFromCurrency,
    fxToCurrency: fxSnapshot.fxToCurrency,
    fxRateDate: fxSnapshot.fxRateDate,
  };
}
