import { PrismaService } from '../src/prisma/prisma.service';
import { PromotionsService } from '../src/promotions/promotions.service';
import { QuotePricingService } from '../src/quotes/quote-pricing.service';
import { QuotesService } from '../src/quotes/quotes.service';
import { TransportPricingService } from '../src/transport-pricing/transport-pricing.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    const transportPricingService = new TransportPricingService(prisma);
    const promotionsService = new PromotionsService(prisma);
    const quotePricingService = new QuotePricingService();
    const quotesService = new QuotesService(prisma, transportPricingService, promotionsService, quotePricingService);
    const result = await quotesService.repairAcceptedQuoteVersionLinks();

    console.log(
      JSON.stringify(
        {
          scanned: result.scanned,
          repaired: result.repaired.length,
          failed: result.failed.length,
          repairedQuotes: result.repaired,
          failedQuotes: result.failed,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
