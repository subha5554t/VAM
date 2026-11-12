import { describe, it, expect, beforeEach } from 'vitest';
import { useCallStore } from './useCallStore.js';

const event = (name: string, result: unknown) => ({
  type: 'tool' as const,
  name,
  args: { sellerId: 'SD-48213' },
  result,
  ms: 1,
});

describe('addToolEvent -> cockpit state', () => {
  beforeEach(() => {
    useCallStore.getState().resetCall();
  });

  it('locks the 3 tool-derived actions into the plan card', () => {
    useCallStore.getState().addToolEvent(
      event('create_action_plan', {
        planId: 'PLAN-SD-48213-1',
        actions: [
          {
            id: 1,
            title: 'Restock top 4 high-velocity out-of-stock products first',
            how: 'Reorder KT-101, KT-118, ST-204, HM-310.',
            estimatedRecoveryRupees: 18078,
            owner: 'Seller + Suppliers',
            timeline: 'Order today; live in catalogue in 5-7 days',
          },
          {
            id: 2,
            title: 'Eliminate out-of-stock cancellations & dispatch on time',
            how: 'Pause listings when stock is below 2 units.',
            estimatedRecoveryRupees: 26345,
            owner: 'Seller Operations',
            timeline: 'Implement starting today',
          },
          {
            id: 3,
            title: 'Restart promotions on recovered best-sellers',
            how: 'Raise ad spend once stock lands.',
            estimatedRecoveryRupees: 18570,
            owner: 'Seller Marketing',
            timeline: 'Within 7-10 days',
          },
        ],
      })
    );

    const plan = useCallStore.getState().actionPlan;
    expect(plan?.actions).toHaveLength(3);
    expect(plan?.actions.map((a) => a.estimatedRecoveryRupees)).toEqual([18078, 26345, 18570]);
    expect(plan?.actions.every((a) => a.owner && a.timeline)).toBe(true);
  });

  it('advances the stage from the tool result, not the model text', () => {
    useCallStore.getState().addToolEvent(event('advance_stage', { currentStage: 'recommend' }));
    expect(useCallStore.getState().conversationStage).toBe('recommend');
  });

  it('fills the KPI snapshot from get_seller_snapshot', () => {
    useCallStore.getState().addToolEvent(
      event('get_seller_snapshot', {
        metrics: {
          last: { sales: 200000, orders: 400, cancellationRate: 0.08, asp: 500, outOfStock: 5 },
          current: { sales: 135000, orders: 270, cancellationRate: 0.14, asp: 500, outOfStock: 18 },
        },
        deltas: {
          salesPct: -32.5,
          ordersPct: -32.5,
          cancelDeltaPts: 6,
          aspPct: 0,
          outOfStockChange: 13,
        },
        impressions: { last: 120000, current: 84000, deltaPct: -30 },
        flags: { priceFlat: true, oosSpike: true, cancelSpike: true, visibilityDrop: true },
      })
    );

    const kpis = useCallStore.getState().kpis;
    expect(kpis?.salesCurrent).toBe(135000);
    expect(kpis?.ordersCurrent).toBe(270);
    expect(kpis?.outOfStockChange).toBe(13);
    expect(kpis?.impressionsCurrent).toBe(84000);
  });

  it('captures the rupee bridge from analyze_sales_decline', () => {
    useCallStore.getState().addToolEvent(
      event('analyze_sales_decline', {
        causes: [
          {
            id: 'out_of_stock',
            rank: 1,
            label: 'Newly out-of-stock products',
            sharePct: 35.5,
            lossRupees: 23085,
            lossOrders: 72,
            evidence: 'tool evidence',
          },
        ],
        ruledOut: [{ id: 'pricing', label: 'Pricing / ASP', evidence: 'ASP flat' }],
        bridge: {
          stockLossRupees: 23085,
          stockLossOrders: 72,
          adsLossRupees: 18570,
          adsLossOrders: 35,
          rankLossRupees: 23345,
          rankLossOrders: 44,
          totalLossRupees: 65000,
          totalLossOrders: 151,
          top4OosLossRupees: 18000,
          top4OosShare: 0.78,
        },
        causalChain: 'cash-flow squeeze -> stock-outs -> visibility loss',
      })
    );

    const diagnosis = useCallStore.getState().diagnosis;
    expect(diagnosis?.bridge.totalLossRupees).toBe(65000);
    expect(diagnosis?.causes[0].lossRupees).toBe(23085);
    expect(diagnosis?.ruledOut[0].id).toBe('pricing');
  });

  it('keeps a tool-derived baseline after resetCall', () => {
    useCallStore.getState().setBaseline(
      {
        metrics: {
          last: { sales: 200000, orders: 400, cancellationRate: 0.08, asp: 500, outOfStock: 5 },
          current: { sales: 135000, orders: 270, cancellationRate: 0.14, asp: 500, outOfStock: 18 },
        },
        deltas: {
          salesPct: -32.5,
          ordersPct: -32.5,
          cancelDeltaPts: 6,
          aspPct: 0,
          outOfStockChange: 13,
        },
        impressions: { last: 120000, current: 84000, deltaPct: -30 },
        flags: { priceFlat: true, oosSpike: true, cancelSpike: true, visibilityDrop: true },
      },
      null
    );

    useCallStore.getState().resetCall();
    expect(useCallStore.getState().baselineKpis?.salesCurrent).toBe(135000);
    expect(useCallStore.getState().kpis).toBeNull();
  });
});
