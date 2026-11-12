import { z } from 'zod';

export const StageSchema = z.enum([
  'discover',
  'diagnose',
  'probe',
  'recommend',
  'commit',
  'summarise',
  'close',
]);
export type Stage = z.infer<typeof StageSchema>;

export const SellerProfileSchema = z.object({
  id: z.string(),
  name: z.string(),
  business: z.string(),
  city: z.string(),
  state: z.string(),
  category: z.string(),
  onboardedYear: z.number(),
  preferredLanguage: z.string(),
  fulfilment: z.string(),
  pickupPincode: z.string(),
  activeSkus: z.number(),
});
export type SellerProfile = z.infer<typeof SellerProfileSchema>;

export const PeriodMetricsSchema = z.object({
  sales: z.number(),
  orders: z.number(),
  cancellationRate: z.number(),
  asp: z.number(),
  outOfStock: z.number(),
});
export type PeriodMetrics = z.infer<typeof PeriodMetricsSchema>;

export const SkuPerformanceSchema = z.object({
  orders: z.number(),
  cancelled: z.number(),
});

export const SkuStatusSchema = z.enum([
  'in_stock',
  'out_of_stock_new',
  'out_of_stock_chronic',
]);
export type SkuStatus = z.infer<typeof SkuStatusSchema>;

export const SkuSchema = z.object({
  sku: z.string(),
  name: z.string(),
  category: z.string(),
  price: z.number(),
  status: SkuStatusSchema,
  last: SkuPerformanceSchema,
  current: SkuPerformanceSchema,
  oosSinceDay: z.number().optional(),
  oosSince: z.string().optional(),
  note: z.string().optional(),
  lostRupees: z.number(),
  lastRank: z.number(),
});
export type SKU = z.infer<typeof SkuSchema>;

export const CancellationRecordSchema = z.object({
  orderId: z.string(),
  sku: z.string(),
  reason: z.string(),
  day: z.number(),
});
export type CancellationRecord = z.infer<typeof CancellationRecordSchema>;

export const SupplierRestockItemSchema = z.object({
  supplier: z.string(),
  unitCost: z.number(),
  suggestedQty: z.number(),
  cost: z.number(),
});
export type SupplierRestockItem = z.infer<typeof SupplierRestockItemSchema>;

export const PortfolioSellerSchema = z.object({
  sellerId: z.string(),
  business: z.string(),
  salesDeltaPct: z.number(),
  ordersDeltaPct: z.number(),
  cancelNow: z.number(),
  oosNow: z.number(),
  anomalyScore: z.number(),
});
export type PortfolioSeller = z.infer<typeof PortfolioSellerSchema>;

export const BridgeSchema = z.object({
  grossOrders: z.object({
    stockOutsNewlyOOS: z.number(),
    reducedPromotions: z.number(),
    organicRankLoss: z.number(),
    total: z.number(),
  }),
  grossRupees: z.object({
    stockOutsNewlyOOS: z.number(),
    reducedPromotions: z.number(),
    organicRankLoss: z.number(),
    total: z.number(),
  }),
  netExtra: z.object({
    cancellationIncreaseOrders: z.number(),
    rupeesApprox: z.number(),
  }),
  top4ShareOfStockOutLoss: z.number(),
  top4Rupees: z.number(),
  notes: z.array(z.string()),
});
export type BridgeData = z.infer<typeof BridgeSchema>;

export const SellerDataSchema = z.object({
  meta: z.record(z.any()),
  seller: SellerProfileSchema,
  metrics: z.object({
    last: PeriodMetricsSchema,
    current: PeriodMetricsSchema,
  }),
  derived: z.object({
    netOrders: z.object({ last: z.number(), current: z.number() }),
    netSales: z.object({ last: z.number(), current: z.number() }),
    cancelledOrders: z.object({ last: z.number(), current: z.number() }),
  }),
  assumed: z.record(z.any()),
  ordersDaily: z.object({
    last: z.array(z.number()),
    current: z.array(z.number()),
    ordersWeekly: z.object({
      last: z.array(z.number()),
      current: z.array(z.number()),
    }).optional(),
  }),
  cancellationReasons: z.object({
    last: z.record(z.number()),
    current: z.record(z.number()),
  }),
  bridge: BridgeSchema,
  supplierRestock: z.record(SupplierRestockItemSchema),
  reviews: z.record(z.any()),
  portfolio: z.array(PortfolioSellerSchema),
  assumptionsList: z.array(z.string()),
  skus: z.array(SkuSchema),
  cancellationRecords: z.object({
    last: z.array(CancellationRecordSchema),
    current: z.array(CancellationRecordSchema),
  }),
});
export type SellerData = z.infer<typeof SellerDataSchema>;

export const ActionItemSchema = z.object({
  id: z.number(),
  title: z.string(),
  how: z.string(),
  estimatedRecoveryRupees: z.number(),
  timeline: z.string(),
  owner: z.string(),
});
export type ActionItem = z.infer<typeof ActionItemSchema>;

export const ActionPlanSchema = z.object({
  planId: z.string(),
  sellerId: z.string(),
  createdAt: z.string(),
  actions: z.array(ActionItemSchema),
});
export type ActionPlan = z.infer<typeof ActionPlanSchema>;

export const FollowupSchema = z.object({
  followupId: z.string(),
  sellerId: z.string(),
  inDays: z.number(),
  channel: z.string(),
  scheduledDate: z.string(),
});
export type Followup = z.infer<typeof FollowupSchema>;

export const EscalationSchema = z.object({
  ticketId: z.string(),
  sellerId: z.string(),
  reason: z.string(),
  summary: z.string(),
  createdAt: z.string(),
});
export type Escalation = z.infer<typeof EscalationSchema>;

