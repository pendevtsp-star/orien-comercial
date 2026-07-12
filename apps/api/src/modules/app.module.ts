import { Module } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import { AuthModule } from "../modules/auth/auth.module";
import { AlertsModule } from "../modules/alerts/alerts.module";
import { BranchesModule } from "../modules/branches/branches.module";
import { CashRegistersModule } from "../modules/cash-registers/cash-registers.module";
import { ConfigModule } from "../modules/config/config.module";
import { CacheModule } from "../modules/cache/cache.module";
import { CustomersModule } from "../modules/customers/customers.module";
import { DashboardModule } from "../modules/dashboard/dashboard.module";
import { DatabaseModule } from "../modules/database/database.module";
import { FinancialModule } from "../modules/financial/financial.module";
import { ImportsModule } from "../modules/imports/imports.module";
import { ProductsModule } from "../modules/products/products.module";
import { PreferencesModule } from "../modules/preferences/preferences.module";
import { OperationsModule } from "../modules/operations/operations.module";
import { PurchasesModule } from "../modules/purchases/purchases.module";
import { SalesModule } from "../modules/sales/sales.module";
import { StockModule } from "../modules/stock/stock.module";
import { SubscriptionsModule } from "../modules/subscriptions/subscriptions.module";
import { SuppliersModule } from "../modules/suppliers/suppliers.module";
import { TenantsModule } from "../modules/tenants/tenants.module";
import { ReportsModule } from "../modules/reports/reports.module";
import { PlatformModule } from "../modules/platform/platform.module";
import { IntegrationsModule } from "../modules/integrations/integrations.module";
import { LoyaltyModule } from "../modules/loyalty/loyalty.module";
import { TrialLifecycleModule } from "../modules/trials/trial-lifecycle.module";
import { TasksModule } from "../modules/tasks/tasks.module";

@Module({
  imports: [
    ConfigModule,
    CacheModule,
    DatabaseModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    AuthModule,
    AlertsModule,
    TenantsModule,
    BranchesModule,
    CashRegistersModule,
    ProductsModule,
    PreferencesModule,
    OperationsModule,
    PurchasesModule,
    CustomersModule,
    StockModule,
    SuppliersModule,
    SalesModule,
    FinancialModule,
    ImportsModule,
    SubscriptionsModule,
    DashboardModule,
    ReportsModule,
    PlatformModule,
    IntegrationsModule,
    LoyaltyModule,
    TrialLifecycleModule,
    TasksModule,
  ],
})
export class AppModule {}
