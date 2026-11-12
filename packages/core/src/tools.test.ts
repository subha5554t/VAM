import { describe, it, expect } from 'vitest';
import { executeTool, TOOL_DECLARATIONS } from './tools.js';

describe('Tool Declarations & Handlers', () => {
  const sellerId = 'SD-48213';

  it('exposes exactly 8 tool declarations with valid schemas', () => {
    expect(TOOL_DECLARATIONS.length).toBe(8);
    const names = TOOL_DECLARATIONS.map(t => t.name);
    expect(names).toEqual([
      'get_seller_snapshot',
      'analyze_sales_decline',
      'get_out_of_stock_products',
      'get_cancellation_breakdown',
      'advance_stage',
      'create_action_plan',
      'schedule_followup',
      'escalate_to_human_kam',
    ]);
  });

  it('executes get_seller_snapshot correctly', async () => {
    const res = await executeTool('get_seller_snapshot', { sellerId });
    expect(res.ok).toBe(true);
    expect(res.data?.metrics?.current?.sales).toBe(135000);
    expect(res.data?.deltas?.salesPct).toBe(-32.5);
    expect(res.data?.impressions?.current).toBe(84000);
    expect(res.data?.impressions?.deltaPct).toBe(-30);
    expect(res.data?.flags?.priceFlat).toBe(true);
  });

  it('executes analyze_sales_decline correctly', async () => {
    const res = await executeTool('analyze_sales_decline', { sellerId });
    expect(res.ok).toBe(true);
    expect(res.data?.causes?.length).toBe(3);
    expect(res.data?.bridge?.totalLossRupees).toBe(65000);
    expect(res.data?.ruledOut?.[0]?.id).toBe('pricing');
  });

  it('executes get_out_of_stock_products with limits', async () => {
    const res = await executeTool('get_out_of_stock_products', { sellerId, limit: 3 });
    expect(res.ok).toBe(true);
    expect(res.data?.topItems?.length).toBe(3);
    expect(res.data?.totalOutOfStock).toBe(18);
    expect(res.data?.topItems[0].sku).toBe('KT-101');
  });

  it('executes get_cancellation_breakdown accurately', async () => {
    const res = await executeTool('get_cancellation_breakdown', { sellerId });
    expect(res.ok).toBe(true);
    expect(res.data?.reasonsBreakdown?.sellerStockUnavailable).toBe(21);
    expect(res.data?.cancellationRateCurrent).toBe(0.14);
  });

  it('executes advance_stage correctly and rejects invalid stage', async () => {
    const res = await executeTool('advance_stage', { stage: 'diagnose' });
    expect(res.ok).toBe(true);
    expect(res.data?.currentStage).toBe('diagnose');

    const invalid = await executeTool('advance_stage', { stage: 'invalid_stage' });
    expect(invalid.ok).toBe(false);
  });

  it('executes create_action_plan and returns 3 actions', async () => {
    const res = await executeTool('create_action_plan', { sellerId });
    expect(res.ok).toBe(true);
    expect(res.data?.actions?.length).toBe(3);
    expect(res.data?.planId).toContain('PLAN-SD-48213');
  });

  it('executes schedule_followup with channel and days', async () => {
    const res = await executeTool('schedule_followup', { sellerId, inDays: 3, channel: 'whatsapp' });
    expect(res.ok).toBe(true);
    expect(res.data?.inDays).toBe(3);
    expect(res.data?.channel).toBe('whatsapp');
  });

  it('executes escalate_to_human_kam and returns ticket ID', async () => {
    const res = await executeTool('escalate_to_human_kam', {
      sellerId,
      reason: 'Commission policy dispute',
      summary: 'Seller is requesting review of 18% category commission rate.',
    });
    expect(res.ok).toBe(true);
    expect(res.data?.ticketId).toContain('ESC-');
    expect(res.data?.status).toBe('ESCALATED');
  });

  it('safely handles unknown tool names', async () => {
    const res = await executeTool('non_existent_tool', { sellerId });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('Unknown tool');
  });

  it('rejects invalid inputs safely', async () => {
    const res = await executeTool('get_seller_snapshot', {});
    expect(res.ok).toBe(false);
    expect(res.error).toBeDefined();
  });
});

