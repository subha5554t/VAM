import { describe, it, expect } from 'vitest';
import { defaultProvider } from './provider.js';
import { recommend } from './recommend.js';

describe('Recommendation Engine', () => {
  it('generates exactly 3 prioritised actions', async () => {
    const seller = await defaultProvider.getSeller('SD-48213');
    const recs = recommend(seller);

    expect(recs.actions.length).toBe(3);
    expect(recs.actions.map(a => a.id)).toEqual([1, 2, 3]);
  });

  it('names the top 4 out-of-stock SKUs and specifies estimated impact', async () => {
    const seller = await defaultProvider.getSeller('SD-48213');
    const recs = recommend(seller);

    const action1 = recs.actions[0];
    expect(action1.how).toContain('KT-101');
    expect(action1.how).toContain('KT-118');
    expect(action1.how).toContain('ST-204');
    expect(action1.how).toContain('HM-310');
    expect(action1.estimatedRecoveryRupees).toBe(18078);
    expect(action1.timeline).toContain('5–7 days');
  });

  it('provides cash-flow aware advice for supplier dues', async () => {
    const seller = await defaultProvider.getSeller('SD-48213');
    const recsTight = recommend(seller, { cashTight: true });

    expect(recsTight.cashFlowAdvice).toContain('1.2 lakh');
    expect(recsTight.actions[0].how).toContain('phase procurement by ROI');
    expect(recsTight.totalCapitalRequiredRupees).toBe(27565 + 5500);
  });

  it('reconciles recovery potential with realistic range (40k - 48k)', async () => {
    const seller = await defaultProvider.getSeller('SD-48213');
    const recs = recommend(seller);

    expect(recs.totalRecoveryPotentialRupees).toBe(65000);
    expect(recs.realisticRecoveryRupees.min).toBeGreaterThanOrEqual(38000);
    expect(recs.realisticRecoveryRupees.max).toBeLessThanOrEqual(50000);
  });
});

