import { describe, it, expect } from 'vitest';
import { defaultProvider } from './provider.js';
import { snapshot, bridge, ruledOut, analyzeSalesDecline } from './analytics.js';

describe('Analytics Engine Reconciliation & Logic', () => {
  it('reconciles headline figures from seller.mock.json exactly', async () => {
    const seller = await defaultProvider.getSeller('SD-48213');

    // Orders sum across 60 SKUs
    const sumOrdersLast = seller.skus.reduce((t, k) => t + k.last.orders, 0);
    const sumOrdersCurr = seller.skus.reduce((t, k) => t + k.current.orders, 0);
    expect(sumOrdersLast).toBe(400);
    expect(sumOrdersCurr).toBe(270);
    expect(sumOrdersLast - sumOrdersCurr).toBe(130);

    // Sales sum across 60 SKUs
    const sumSalesLast = seller.skus.reduce((t, k) => t + k.last.orders * k.price, 0);
    const sumSalesCurr = seller.skus.reduce((t, k) => t + k.current.orders * k.price, 0);
    expect(sumSalesLast).toBe(200000);
    expect(sumSalesCurr).toBe(135000);
    expect(sumSalesLast - sumSalesCurr).toBe(65000);

    // ASP exactly 500
    expect(sumSalesLast / sumOrdersLast).toBe(500);
    expect(sumSalesCurr / sumOrdersCurr).toBe(500);

    // Cancellations
    expect(seller.derived.cancelledOrders.last).toBe(32);
    expect(seller.derived.cancelledOrders.current).toBe(38);
    expect(seller.metrics.last.cancellationRate).toBe(0.08);
    expect(seller.metrics.current.cancellationRate).toBe(0.14);

    // OOS counts
    expect(seller.metrics.last.outOfStock).toBe(5);
    expect(seller.metrics.current.outOfStock).toBe(18);
  });

  it('computes exact mathematical revenue bridge from SKU and assumed data', async () => {
    const seller = await defaultProvider.getSeller('SD-48213');
    const b = bridge(seller);

    expect(b.stockLossRupees).toBe(23085);
    expect(b.stockLossOrders).toBe(51);

    expect(b.adsLossRupees).toBe(18570);
    expect(b.adsLossOrders).toBe(35);

    expect(b.rankLossRupees).toBe(23345);
    expect(b.rankLossOrders).toBe(44);

    expect(b.totalLossRupees).toBe(65000);
    expect(b.totalLossOrders).toBe(130);

    expect(b.top4OosLossRupees).toBe(18078);
    expect(b.top4OosShare).toBe(0.783);
  });

  it('rules out pricing as a root cause when ASP is flat', async () => {
    const seller = await defaultProvider.getSeller('SD-48213');
    const ruled = ruledOut(seller);

    expect(ruled.length).toBe(1);
    expect(ruled[0].id).toBe('pricing');
    expect(ruled[0].evidence).toContain('₹500');
  });

  it('does NOT rule out pricing if ASP had changed (verifying purely data-driven logic)', async () => {
    const seller = await defaultProvider.getSeller('SD-48213');
    const modifiedSeller = JSON.parse(JSON.stringify(seller));
    // Simulate ASP increase of 15%
    modifiedSeller.metrics.current.asp = 575;

    const ruled = ruledOut(modifiedSeller);
    expect(ruled.length).toBe(0); // Pricing is not ruled out!
  });

  it('snapshot flags detect anomalies accurately', async () => {
    const seller = await defaultProvider.getSeller('SD-48213');
    const snap = snapshot(seller);

    expect(snap.flags.priceFlat).toBe(true);
    expect(snap.flags.oosSpike).toBe(true);
    expect(snap.flags.cancelSpike).toBe(true);
    expect(snap.flags.visibilityDrop).toBe(true);

    expect(snap.salesDelta).toBe(-0.325);
    expect(snap.ordersDelta).toBe(-0.325);
    expect(snap.cancelDeltaPts).toBe(6);
  });

  it('generates structured sales decline analysis with causal chain', async () => {
    const seller = await defaultProvider.getSeller('SD-48213');
    const analysis = analyzeSalesDecline(seller);

    expect(analysis.causes.length).toBe(3);
    expect(analysis.causes[0].id).toBe('out_of_stock');
    expect(analysis.causes[0].lossRupees).toBe(23085);
    expect(analysis.causes[1].id).toBe('organic_rank_loss');
    expect(analysis.causes[1].lossRupees).toBe(23345);
    expect(analysis.causes[2].id).toBe('reduced_promotions');
    expect(analysis.causes[2].lossRupees).toBe(18570);

    expect(analysis.ruledOut.length).toBe(1);
    expect(analysis.causalChain).toContain('delayed restocks');
  });
});

