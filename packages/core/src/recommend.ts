import { SellerData, ActionItem } from './types.js';
import { bridge } from './analytics.js';

export interface RecommendationSummary {
  actions: ActionItem[];
  totalRecoveryPotentialRupees: number;
  realisticRecoveryRupees: { min: number; max: number };
  totalCapitalRequiredRupees: number;
  cashFlowAdvice: string;
}

export function recommend(
  s: SellerData,
  options?: { cashTight?: boolean }
): RecommendationSummary {
  const b = bridge(s);
  const isCashTight = options?.cashTight ?? true; // Default true based on seller cash-flow note

  // Compute supplier restock costs for top 4
  const restockCosts = Object.values(s.supplierRestock);
  const totalRestockCost = restockCosts.reduce((tot, r) => tot + r.cost, 0); // 27,565

  // Action 1: Restock top 4
  const action1: ActionItem = {
    id: 1,
    title: 'Restock top 4 high-velocity out-of-stock products first',
    how: `Prioritise restock of KT-101 (Cooker), KT-118 (Tawa), ST-204 (Containers), and HM-310 (Mop). Total 6-week cover costs ₹${totalRestockCost.toLocaleString('en-IN')}. ${
      isCashTight
        ? 'Since supplier dues are pending, phase procurement by ROI: order ST-204 (ratio 0.76) and HM-310 (0.68) first, then KT-118 and KT-101.'
        : 'Place orders with your Meerut, Delhi, and Noida suppliers immediately.'
    }`,
    estimatedRecoveryRupees: b.top4OosLossRupees, // ~₹18,078
    timeline: 'Order today; live in catalogue in 5–7 days',
    owner: 'Seller + Suppliers',
  };

  // Action 2: Fix cancellations & dispatch SLA
  const action2: ActionItem = {
    id: 2,
    title: 'Eliminate out-of-stock cancellations & dispatch on time',
    how: 'Daily inventory reconciliation to prevent overselling on dead stock; auto-pause listings when buffer drops below 2 units; add a 24-hour dispatch buffer on self-ship orders to bring dispatch breach rate from 15% back under 6%.',
    estimatedRecoveryRupees: b.rankLossRupees + (s.bridge.netExtra?.rupeesApprox ?? 3000), // ~₹23,345 + ₹3,000 = ₹26,345
    timeline: 'Implement starting today; search rank recovery over 2–4 weeks',
    owner: 'Seller Operations',
  };

  // Action 3: Restart targeted promotions
  const adSpendDiff = (s.assumed.adSpend?.last ?? 8000) - (s.assumed.adSpend?.current ?? 2500); // 5,500
  const action3: ActionItem = {
    id: 3,
    title: 'Restart promotions on recovered best-sellers',
    how: `Once top 4 SKUs are physically back in stock, lift ad spend by ₹${adSpendDiff.toLocaleString('en-IN')} (from ₹2,500 back to ₹8,000/month). Focus ads exclusively on high-converting hero items to rebuild keyword velocity.`,
    estimatedRecoveryRupees: b.adsLossRupees, // ~₹18,570
    timeline: 'Within 7–10 days (after inventory is verified in-stock)',
    owner: 'Seller Marketing',
  };

  const actions: ActionItem[] = [action1, action2, action3];
  const totalRecovery = b.totalLossRupees; // ₹65,000

  return {
    actions,
    totalRecoveryPotentialRupees: totalRecovery,
    realisticRecoveryRupees: {
      min: Math.round(totalRecovery * 0.6), // ₹39,000 (~40k)
      max: Math.round(totalRecovery * 0.74), // ~₹48,000
    },
    totalCapitalRequiredRupees: totalRestockCost + adSpendDiff, // ₹33,065
    cashFlowAdvice:
      'With ~₹1.2 lakh pending supplier dues, avoid restocking all 13 products at once. Deploy ₹33,000 phased capital (₹27,500 stock + ₹5,500 ads) across the top 4 products to regenerate operating cashflow before expanding to secondary catalog items.',
  };
}
