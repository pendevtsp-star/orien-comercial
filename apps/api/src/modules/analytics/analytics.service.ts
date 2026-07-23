import { Inject, Injectable } from "@nestjs/common";
import type { TenantContext } from "../../shared/request-context";
import { DatabaseService } from "../database/database.service";

interface SalesForecast {
  period: string;
  predictedAmount: number;
  confidence: number;
  trend: "up" | "down" | "stable";
}

interface ProductRecommendation {
  productId: string;
  productName: string;
  score: number;
  reason: string;
}

interface CustomerSegment {
  segment: string;
  customerCount: number;
  totalValue: number;
  percentage: number;
  characteristics: string[];
}

interface AnomalyDetection {
  id: string;
  type: string;
  severity: "low" | "medium" | "high";
  description: string;
  detectedAt: string;
  value: number;
  expectedRange: { min: number; max: number };
}

interface SalesTrend {
  date: string;
  amount: number;
  quantity: number;
}

@Injectable()
export class AnalyticsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  // Sales Forecasting (Simple Moving Average)
  async getSalesForecast(
    context: TenantContext,
    daysAhead = 30,
  ): Promise<SalesForecast[]> {
    const result = await this.database.tenantQuery<{ date: string; amount: number }>(
      context.tenantId,
      `SELECT DATE(created_at) AS date, SUM(total_amount)::numeric AS amount
       FROM sales
       WHERE tenant_id = $1 AND status = 'sold'
         AND created_at >= CURRENT_DATE - interval '90 days'
       GROUP BY DATE(created_at)
       ORDER BY date`,
      [context.tenantId],
    );

    const historical = result.rows;
    if (historical.length === 0) return [];

    // Simple moving average (7-day)
    const forecasts: SalesForecast[] = [];
    const windowSize = 7;

    for (let i = 0; i < daysAhead; i++) {
      const recentAmounts = historical.slice(-windowSize).map((r) => r.amount);
      const avg = recentAmounts.reduce((a, b) => a + b, 0) / recentAmounts.length;

      // Calculate trend
      const olderAmounts = historical.slice(-windowSize * 2, -windowSize).map((r) => r.amount);
      const olderAvg = olderAmounts.length > 0
        ? olderAmounts.reduce((a, b) => a + b, 0) / olderAmounts.length
        : avg;

      let trend: "up" | "down" | "stable" = "stable";
      if (avg > olderAvg * 1.05) trend = "up";
      else if (avg < olderAvg * 0.95) trend = "down";

      const forecastDate = new Date();
      forecastDate.setDate(forecastDate.getDate() + i + 1);

      forecasts.push({
        period: forecastDate.toISOString().slice(0, 10),
        predictedAmount: Math.round(avg * 100) / 100,
        confidence: Math.min(95, 60 + historical.length),
        trend,
      });

      // Add predicted value to historical for next iteration
      historical.push({ date: forecastDate.toISOString().slice(0, 10), amount: avg });
    }

    return forecasts;
  }

  // Product Recommendations (Co-occurrence analysis)
  async getProductRecommendations(
    context: TenantContext,
    productId: string,
    limit = 5,
  ): Promise<ProductRecommendation[]> {
    const result = await this.database.tenantQuery<{ productName: string; score: number }>(
      context.tenantId,
      `WITH target_products AS (
         SELECT DISTINCT si.product_id
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id AND s.tenant_id = si.tenant_id
         WHERE si.product_id = $2 AND s.status = 'sold'
       ),
       co_occurred AS (
         SELECT si2.product_id, COUNT(DISTINCT si2.sale_id) AS occurrences
         FROM sale_items si2
         JOIN sales s2 ON s2.id = si2.sale_id AND s2.tenant_id = si2.tenant_id
         WHERE si2.sale_id IN (
           SELECT DISTINCT si3.sale_id
           FROM sale_items si3
           WHERE si3.product_id = $2
         )
         AND si2.product_id != $2
         AND s2.status = 'sold'
         GROUP BY si2.product_id
       )
       SELECT p.name AS "productName", co.occurrences::numeric AS score
       FROM co_occurred co
       JOIN products p ON p.id = co.product_id AND p.deleted_at IS NULL
       ORDER BY co.occurrences DESC
       LIMIT $3`,
      [context.tenantId, productId, limit],
    );

    return result.rows.map((row, index) => ({
      productId: "",
      productName: row.productName,
      score: Math.round((row.score / (result.rows[0]?.score || 1)) * 100),
      reason: `Comprado junto em ${row.score} vendas`,
    }));
  }

  // Customer Segmentation (RFM Analysis)
  async getCustomerSegmentation(
    context: TenantContext,
  ): Promise<CustomerSegment[]> {
    const result = await this.database.tenantQuery<{
      segment: string;
      customerCount: number;
      totalValue: number;
    }>(
      context.tenantId,
      `WITH customer_rfm AS (
         SELECT
           c.id,
           COALESCE(MAX(s.created_at), c.created_at) AS last_purchase,
           COUNT(DISTINCT s.id) AS frequency,
           COALESCE(SUM(s.total_amount), 0) AS monetary
         FROM customers c
         LEFT JOIN sales s ON s.customer_id = c.id AND s.tenant_id = c.tenant_id AND s.status = 'sold'
         WHERE c.tenant_id = $1 AND c.deleted_at IS NULL
         GROUP BY c.id, c.created_at
       ),
       segmented AS (
         SELECT
           id,
           CASE
             WHEN last_purchase >= CURRENT_DATE - interval '30 days' AND frequency >= 5 AND monetary >= 1000 THEN 'VIP'
             WHEN last_purchase >= CURRENT_DATE - interval '30 days' AND frequency >= 2 THEN 'Ativo'
             WHEN last_purchase >= CURRENT_DATE - interval '90 days' THEN 'Regular'
             WHEN last_purchase >= CURRENT_DATE - interval '180 days' THEN 'Em Risco'
             ELSE 'Inativo'
           END AS segment,
           monetary
         FROM customer_rfm
       )
       SELECT segment, COUNT(*)::int AS "customerCount", SUM(monetary)::numeric AS "totalValue"
       FROM segmented
       GROUP BY segment
       ORDER BY SUM(monetary) DESC`,
      [context.tenantId],
    );

    const totalCustomers = result.rows.reduce((sum, r) => sum + r.customerCount, 0);
    const totalValue = result.rows.reduce((sum, r) => sum + Number(r.totalValue), 0);

    const segmentCharacteristics: Record<string, string[]> = {
      VIP: ["Última compra recente", "Alta frequência", "Alto valor"],
      Ativo: ["Compras recentes", "Frequência média"],
      Regular: ["Compras nos últimos 90 dias"],
      "Em Risco": ["Sem compra há 90-180 dias"],
      Inativo: ["Sem compra há mais de 180 dias"],
    };

    return result.rows.map((row) => ({
      segment: row.segment,
      customerCount: row.customerCount,
      totalValue: Number(row.totalValue),
      percentage: totalCustomers > 0 ? Math.round((row.customerCount / totalCustomers) * 100) : 0,
      characteristics: segmentCharacteristics[row.segment] ?? [],
    }));
  }

  // Anomaly Detection (Z-score based)
  async detectAnomalies(
    context: TenantContext,
  ): Promise<AnomalyDetection[]> {
    const anomalies: AnomalyDetection[] = [];

    // Check for unusual sales amounts
    const salesResult = await this.database.tenantQuery<{
      id: string;
      amount: number;
      createdAt: string;
    }>(
      context.tenantId,
      `SELECT id, total_amount::numeric AS amount, created_at AS "createdAt"
       FROM sales
       WHERE tenant_id = $1 AND status = 'sold'
         AND created_at >= CURRENT_DATE - interval '30 days'
       ORDER BY created_at DESC`,
      [context.tenantId],
    );

    if (salesResult.rows.length > 10) {
      const amounts = salesResult.rows.map((r) => r.amount);
      const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
      const stdDev = Math.sqrt(
        amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length
      );

      for (const sale of salesResult.rows) {
        const zScore = stdDev > 0 ? (sale.amount - mean) / stdDev : 0;
        if (Math.abs(zScore) > 2) {
          anomalies.push({
            id: sale.id,
            type: "unusual_sale_amount",
            severity: Math.abs(zScore) > 3 ? "high" : "medium",
            description: `Venda de R$ ${sale.amount.toLocaleString("pt-BR")} é ${zScore > 0 ? "maior" : "menor"} que o esperado`,
            detectedAt: sale.createdAt,
            value: sale.amount,
            expectedRange: {
              min: Math.round((mean - 2 * stdDev) * 100) / 100,
              max: Math.round((mean + 2 * stdDev) * 100) / 100,
            },
          });
        }
      }
    }

    // Check for low stock anomalies
    const stockResult = await this.database.tenantQuery<{
      productId: string;
      productName: string;
      quantity: number;
      minStock: number;
    }>(
      context.tenantId,
      `SELECT p.id AS "productId", p.name AS "productName",
              COALESCE(sb.quantity, 0) AS quantity, p.min_stock AS "minStock"
       FROM products p
       LEFT JOIN stock_balances sb ON sb.product_id = p.id AND sb.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1 AND p.deleted_at IS NULL AND p.is_active = true
         AND COALESCE(sb.quantity, 0) < p.min_stock * 0.5`,
      [context.tenantId],
    );

    for (const product of stockResult.rows) {
      anomalies.push({
        id: product.productId,
        type: "critical_stock",
        severity: "high",
        description: `${product.productName} com estoque crítico: ${product.quantity} unidades (mínimo: ${product.minStock})`,
        detectedAt: new Date().toISOString(),
        value: product.quantity,
        expectedRange: { min: product.minStock, max: product.minStock * 3 },
      });
    }

    return anomalies.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  // Sales Trend Analysis
  async getSalesTrend(
    context: TenantContext,
    days = 30,
  ): Promise<SalesTrend[]> {
    const result = await this.database.tenantQuery<{ date: string; amount: number; quantity: number }>(
      context.tenantId,
      `SELECT DATE(s.created_at) AS date,
              SUM(s.total_amount)::numeric AS amount,
              COUNT(DISTINCT s.id)::int AS quantity
       FROM sales s
       WHERE s.tenant_id = $1 AND s.status = 'sold'
         AND s.created_at >= CURRENT_DATE - interval '${days} days'
       GROUP BY DATE(s.created_at)
       ORDER BY date`,
      [context.tenantId],
    );

    return result.rows.map((row) => ({
      date: row.date,
      amount: Number(row.amount),
      quantity: row.quantity,
    }));
  }

  // Get analytics summary
  async getAnalyticsSummary(
    context: TenantContext,
  ): Promise<{
    forecast: SalesForecast[];
    topRecommendations: ProductRecommendation[];
    customerSegments: CustomerSegment[];
    anomalies: AnomalyDetection[];
    salesTrend: SalesTrend[];
  }> {
    const [forecast, segments, anomalies, trend] = await Promise.all([
      this.getSalesForecast(context, 7),
      this.getCustomerSegmentation(context),
      this.detectAnomalies(context),
      this.getSalesTrend(context, 30),
    ]);

    return {
      forecast,
      topRecommendations: [],
      customerSegments: segments,
      anomalies,
      salesTrend: trend,
    };
  }
}
