import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AgentController } from './agent/agent.controller';
import { AgentService } from './agent/agent.service';
import { ActivitiesController } from './activities/activities.controller';
import { ActivitiesService } from './activities/activities.service';
import { AdminResetController } from './admin/admin-reset.controller';
import { AdminResetService } from './admin/admin-reset.service';
import { GlobalAuthGuard } from './auth/global-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { AuditService } from './audit/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { BookingsController } from './bookings/bookings.controller';
import { BookingsService } from './bookings/bookings.service';
import { OperationsDashboardController } from './bookings/operations-dashboard.controller';
import { VouchersController } from './bookings/vouchers.controller';
import { OperationalVouchersService } from './operational-documents/operational-vouchers.service';
import { CitiesController } from './cities/cities.controller';
import { CitiesService } from './cities/cities.service';
import { CompaniesController } from './companies/companies.controller';
import { CompaniesService } from './companies/companies.service';
import { ContractChildPolicyController } from './contract-child-policy/contract-child-policy.controller';
import { ContractChildPolicyService } from './contract-child-policy/contract-child-policy.service';
import { ContractMealPlansController } from './contract-meal-plans/contract-meal-plans.controller';
import { ContractMealPlansService } from './contract-meal-plans/contract-meal-plans.service';
import { ContractImportsController } from './contract-imports/contract-imports.controller';
import { ContractImportsService } from './contract-imports/contract-imports.service';
import { ContractOccupancyController } from './contract-occupancy/contract-occupancy.controller';
import { ContractOccupancyService } from './contract-occupancy/contract-occupancy.service';
import { ContractPoliciesController } from './contract-policies/contract-policies.controller';
import { ContractPoliciesService } from './contract-policies/contract-policies.service';
import { ContractSupplementsController } from './contract-supplements/contract-supplements.controller';
import { ContractSupplementsService } from './contract-supplements/contract-supplements.service';
import { ContactsController } from './contacts/contacts.controller';
import { ContactsService } from './contacts/contacts.service';
import { ExcursionTemplatesController } from './excursion-templates/excursion-templates.controller';
import { ExcursionTemplatesService } from './excursion-templates/excursion-templates.service';
import { GalleryController } from './gallery/gallery.controller';
import { GalleryService } from './gallery/gallery.service';
import { DispatchEventsController } from './dispatch-events/dispatch-events.controller';
import { DispatchEventsService } from './dispatch-events/dispatch-events.service';
import { DriversController } from './drivers/drivers.controller';
import { DriversService } from './drivers/drivers.service';
import { ExecutiveController } from './intelligence/executive.controller';
import { ExecutiveService } from './intelligence/executive.service';
import { FinancialIntelligenceService } from './intelligence/financial-intelligence.service';
import { IntelligenceController } from './intelligence/intelligence.controller';
import { IntelligenceService } from './intelligence/intelligence.service';
import { QuoteIntelligenceController } from './intelligence/quote-intelligence.controller';
import { QuoteIntelligenceService } from './intelligence/quote-intelligence.service';
import { RecoveryController, RecoveryMetricsController } from './recovery/recovery.controller';
import { RecoveryService } from './recovery/recovery.service';
import { ResourcesController } from './resources/resources.controller';
import { ResourcesService } from './resources/resources.service';
import { ProductionReadinessController } from './production-readiness/production-readiness.controller';
import { ProductionReadinessService } from './production-readiness/production-readiness.service';
import { RehearsalController } from './simulations/rehearsal.controller';
import { RehearsalScoringService } from './simulations/rehearsal-scoring.service';
import { ScaleSimulationController } from './simulations/scale-simulation.controller';
import { ScaleSimulationService } from './simulations/scale-simulation.service';
import { SimulationsController } from './simulations/simulations.controller';
import { SimulationsService } from './simulations/simulations.service';
import { GuidesController } from './guides/guides.controller';
import { GuidesService } from './guides/guides.service';
import { RestaurantsController } from './restaurants/restaurants.controller';
import { RestaurantsService } from './restaurants/restaurants.service';
import { SeriesController } from './series/series.controller';
import { SeriesService } from './series/series.service';
import { HotelCategoriesController } from './hotel-categories/hotel-categories.controller';
import { HotelCategoriesService } from './hotel-categories/hotel-categories.service';
import { HotelContractsController } from './hotel-contracts/hotel-contracts.controller';
import { HotelContractsService } from './hotel-contracts/hotel-contracts.service';
import { HotelRatesController } from './hotel-rates/hotel-rates.controller';
import { HotelRatesService } from './hotel-rates/hotel-rates.service';
import { HotelsController } from './hotels/hotels.controller';
import { HotelsService } from './hotels/hotels.service';
import { ImportItineraryController } from './import-itinerary/import-itinerary.controller';
import { ImportItineraryService } from './import-itinerary/import-itinerary.service';
import { InvoicesController } from './invoices/invoices.controller';
import { InvoicePortalController } from './invoices/invoice-portal.controller';
import { InvoicesService } from './invoices/invoices.service';
import { ExportsController } from './exports/exports.controller';
import { ExportsService } from './exports/exports.service';
import { ItinerariesController } from './itineraries/itineraries.controller';
import { ItinerariesService } from './itineraries/itineraries.service';
import { LeadsController } from './leads/leads.controller';
import { LeadsService } from './leads/leads.service';
import { PlacesController } from './places/places.controller';
import { PlacesService } from './places/places.service';
import { PackageTemplatesController } from './package-templates/package-templates.controller';
import { PackageTemplatesService } from './package-templates/package-templates.service';
import { PlaceTypesController } from './place-types/place-types.controller';
import { PlaceTypesService } from './place-types/place-types.service';
import { PrismaModule } from './prisma/prisma.module';
import { PromotionsController } from './promotions/promotions.controller';
import { PromotionsService } from './promotions/promotions.service';
import { QuoteBlocksController } from './quote-blocks/quote-blocks.controller';
import { QuoteBlocksService } from './quote-blocks/quote-blocks.service';
import { QuoteEngineController } from './quote-engine/quote-engine.controller';
import { QuoteEngineService } from './quote-engine/quote-engine.service';
import { QuoteItineraryModule } from './quote-itinerary/quote-itinerary.module';
import { QuotesController } from './quotes/quotes.controller';
import { QuotePricingService } from './quotes/quote-pricing.service';
import { ProposalV3Service } from './quotes/proposal-v3.service';
import { QuotesService } from './quotes/quotes.service';
import { PublicProposalsController } from './public-proposals/public-proposals.controller';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { RoutesController } from './routes/routes.controller';
import { RoutesService } from './routes/routes.service';
import { ServicesController } from './services/services.controller';
import { ServicesService } from './services/services.service';
import { SeasonsController } from './seasons/seasons.controller';
import { SeasonsService } from './seasons/seasons.service';
import { SuppliersController } from './suppliers/suppliers.controller';
import { SuppliersService } from './suppliers/suppliers.service';
import { ServiceTypesController } from './service-types/service-types.controller';
import { ServiceTypesService } from './service-types/service-types.service';
import { SupportTextTemplatesController } from './support-text-templates/support-text-templates.controller';
import { SupportTextTemplatesService } from './support-text-templates/support-text-templates.service';
import { TransportPricingController } from './transport-pricing/transport-pricing.controller';
import { TransportPricingService } from './transport-pricing/transport-pricing.service';
import { TransportServiceTypesController } from './transport-service-types/transport-service-types.controller';
import { TransportServiceTypesService } from './transport-service-types/transport-service-types.service';
import { TouringRoutesController } from './touring-routes/touring-routes.controller';
import { TouringRoutesService } from './touring-routes/touring-routes.service';
import { VehicleRatesController } from './vehicle-rates/vehicle-rates.controller';
import { VehicleRatesService } from './vehicle-rates/vehicle-rates.service';
import { VehiclesController } from './vehicles/vehicles.controller';
import { VehiclesService } from './vehicles/vehicles.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { UserInvitationsController } from './users/user-invitations.controller';
import { UserInvitationsService } from './users/user-invitations.service';

@Module({
  imports: [PrismaModule, QuoteItineraryModule],
  controllers: [
    AppController,
    AdminResetController,
    AgentController,
    ActivitiesController,
    AuthController,
    BookingsController,
    OperationsDashboardController,
    PackageTemplatesController,
    VouchersController,
    CitiesController,
    ContractChildPolicyController,
    ContractImportsController,
    ContractMealPlansController,
    ContractOccupancyController,
    ContractPoliciesController,
    ContractSupplementsController,
    GalleryController,
    DispatchEventsController,
    DriversController,
    ExecutiveController,
    GuidesController,
    IntelligenceController,
    RecoveryController,
    RecoveryMetricsController,
    ProductionReadinessController,
    QuoteIntelligenceController,
    RehearsalController,
    ResourcesController,
    ScaleSimulationController,
    SimulationsController,
    RestaurantsController,
    SeriesController,
    HotelCategoriesController,
    LeadsController,
    PlacesController,
    PlaceTypesController,
    PromotionsController,
    CompaniesController,
    ContactsController,
    HotelsController,
    HotelContractsController,
    HotelRatesController,
    ImportItineraryController,
    InvoicesController,
    InvoicePortalController,
    ExportsController,
    ExcursionTemplatesController,
    QuoteBlocksController,
    QuoteEngineController,
    QuotesController,
    PublicProposalsController,
    ReportsController,
    RoutesController,
    SeasonsController,
    ItinerariesController,
    ServicesController,
    SuppliersController,
    ServiceTypesController,
    SupportTextTemplatesController,
    VehiclesController,
    TransportServiceTypesController,
    TouringRoutesController,
    VehicleRatesController,
    TransportPricingController,
    UsersController,
    UserInvitationsController,
  ],
  providers: [
    AppService,
    AdminResetService,
    AgentService,
    ActivitiesService,
    AuditService,
    AuthService,
    {
      provide: APP_GUARD,
      useClass: GlobalAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    BookingsService,
    OperationalVouchersService,
    PackageTemplatesService,
    CitiesService,
    ContractChildPolicyService,
    ContractImportsService,
    ContractMealPlansService,
    ContractOccupancyService,
    ContractPoliciesService,
    ContractSupplementsService,
    GalleryService,
    DispatchEventsService,
    DriversService,
    ExecutiveService,
    FinancialIntelligenceService,
    GuidesService,
    IntelligenceService,
    RecoveryService,
    ProductionReadinessService,
    QuoteIntelligenceService,
    RehearsalScoringService,
    ResourcesService,
    ScaleSimulationService,
    SimulationsService,
    RestaurantsService,
    SeriesService,
    HotelCategoriesService,
    LeadsService,
    PlacesService,
    PlaceTypesService,
    PromotionsService,
    CompaniesService,
    ContactsService,
    HotelsService,
    HotelContractsService,
    HotelRatesService,
    ImportItineraryService,
    InvoicesService,
    ExportsService,
    ExcursionTemplatesService,
    QuoteBlocksService,
    QuoteEngineService,
    ProposalV3Service,
    QuotePricingService,
    QuotesService,
    ReportsService,
    RoutesService,
    SeasonsService,
    ItinerariesService,
    ServicesService,
    SuppliersService,
    ServiceTypesService,
    SupportTextTemplatesService,
    VehiclesService,
    TransportServiceTypesService,
    TouringRoutesService,
    VehicleRatesService,
    TransportPricingService,
    UsersService,
    UserInvitationsService,
  ],
})
export class AppModule {}
