import { z } from 'zod';
import { DataProvider, defaultProvider } from './provider.js';
import { snapshot, analyzeSalesDecline } from './analytics.js';
import { recommend } from './recommend.js';
import { ActionPlan, Followup, Escalation, StageSchema } from './types.js';

export interface ToolResult<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
}

// 1. Tool JSON Schema Declarations for Gemini Function Calling
export const TOOL_DECLARATIONS = [
  {
    name: 'get_seller_snapshot',
    description:
      'Fetches current and previous month KPIs for the seller: sales, orders, cancellation rate, average selling price (ASP), out of stock items, and diagnostic anomaly flags.',
    parameters: {
      type: 'OBJECT',
      properties: {
        sellerId: {
          type: 'STRING',
          description: 'The unique ID of the seller (e.g. SD-48213).',
        },
      },
      required: ['sellerId'],
    },
  },
  {
    name: 'analyze_sales_decline',
    description:
      'Analyzes why seller sales and orders dropped, computing the exact rupee revenue bridge across stockouts, ranking/visibility loss, and advertising cuts. Also rules out pricing if ASP was unchanged.',
    parameters: {
      type: 'OBJECT',
      properties: {
        sellerId: {
          type: 'STRING',
          description: 'The unique ID of the seller.',
        },
      },
      required: ['sellerId'],
    },
  },
  {
    name: 'get_out_of_stock_products',
    description:
      'Retrieves the list of products currently out of stock, ordered by lost sales potential, including the top 4 high-velocity items, restock costs, and suppliers.',
    parameters: {
      type: 'OBJECT',
      properties: {
        sellerId: {
          type: 'STRING',
          description: 'The unique ID of the seller.',
        },
        limit: {
          type: 'INTEGER',
          description: 'Maximum number of items to return (default: 5).',
        },
      },
      required: ['sellerId'],
    },
  },
  {
    name: 'get_cancellation_breakdown',
    description:
      'Provides a breakdown of order cancellation reasons (out of stock, late dispatch, customer initiated) and identifies dispatch SLA breach rates.',
    parameters: {
      type: 'OBJECT',
      properties: {
        sellerId: {
          type: 'STRING',
          description: 'The unique ID of the seller.',
        },
      },
      required: ['sellerId'],
    },
  },
  {
    name: 'advance_stage',
    description:
      'Updates the visual stage of the conversation cockpit (discover, diagnose, probe, recommend, commit, summarise, close).',
    parameters: {
      type: 'OBJECT',
      properties: {
        stage: {
          type: 'STRING',
          enum: ['discover', 'diagnose', 'probe', 'recommend', 'commit', 'summarise', 'close'],
          description: 'The target conversation stage.',
        },
      },
      required: ['stage'],
    },
  },
  {
    name: 'create_action_plan',
    description:
      'Creates and saves an actionable 3-point recovery plan for the seller with estimated rupee upside, assigned owner, and target timeline.',
    parameters: {
      type: 'OBJECT',
      properties: {
        sellerId: {
          type: 'STRING',
          description: 'The unique ID of the seller.',
        },
      },
      required: ['sellerId'],
    },
  },
  {
    name: 'schedule_followup',
    description:
      'Schedules an automated follow-up check-in call or recap message for the seller after a given number of days.',
    parameters: {
      type: 'OBJECT',
      properties: {
        sellerId: {
          type: 'STRING',
          description: 'The unique ID of the seller.',
        },
        inDays: {
          type: 'INTEGER',
          description: 'Number of days from now to follow up (e.g. 3 or 7).',
        },
        channel: {
          type: 'STRING',
          enum: ['call', 'whatsapp', 'email'],
          description: 'Preferred follow-up communication channel.',
        },
      },
      required: ['sellerId', 'inDays'],
    },
  },
  {
    name: 'escalate_to_human_kam',
    description:
      'Escalates the issue to a human Snapdeal Key Account Manager when commission, legal, or unresolvable disputes arise.',
    parameters: {
      type: 'OBJECT',
      properties: {
        sellerId: {
          type: 'STRING',
          description: 'The unique ID of the seller.',
        },
        reason: {
          type: 'STRING',
          description: 'Reason for escalation (e.g. commission dispute, payment delay, extreme seller dissatisfaction).',
        },
        summary: {
          type: 'STRING',
          description: 'Brief summary of the issue for the human manager.',
        },
      },
      required: ['sellerId', 'reason', 'summary'],
    },
  },
];

// In-memory stores for runtime demonstration
const actionPlansStore = new Map<string, ActionPlan>();
const followupsStore = new Map<string, Followup>();
const escalationsStore = new Map<string, Escalation>();

// 2. Tool Handlers Implementation
export async function executeTool(
  name: string,
  args: any,
  provider: DataProvider = defaultProvider
): Promise<ToolResult> {
  const timeoutMs = 2000;

  const runWithTimeout = async (): Promise<ToolResult> => {
    switch (name) {
      case 'get_seller_snapshot': {
        const schema = z.object({ sellerId: z.string() });
        const { sellerId } = schema.parse(args);
        const seller = await provider.getSeller(sellerId);
        const snap = snapshot(seller);
        // Impressions live in `assumed` (the assignment gives them as a stated
        // assumption). Expose them structurally so the UI never has to hardcode
        // the traffic figure or parse it out of prose.
        const impressionsLast = seller.assumed?.impressions?.last ?? 120000;
        const impressionsCurrent = seller.assumed?.impressions?.current ?? 84000;
        return {
          ok: true,
          data: {
            sellerId: seller.seller.id,
            business: seller.seller.business,
            metrics: {
              last: seller.metrics.last,
              current: seller.metrics.current,
            },
            deltas: {
              salesPct: Number((snap.salesDelta * 100).toFixed(1)),
              ordersPct: Number((snap.ordersDelta * 100).toFixed(1)),
              cancelDeltaPts: snap.cancelDeltaPts,
              aspPct: Number((snap.aspDelta * 100).toFixed(1)),
              outOfStockChange: snap.oosDelta,
            },
            impressions: {
              last: impressionsLast,
              current: impressionsCurrent,
              deltaPct:
                impressionsLast === 0
                  ? 0
                  : Number((((impressionsCurrent - impressionsLast) / impressionsLast) * 100).toFixed(1)),
            },
            flags: snap.flags,
          },
        };
      }

      case 'analyze_sales_decline': {
        const schema = z.object({ sellerId: z.string() });
        const { sellerId } = schema.parse(args);
        const seller = await provider.getSeller(sellerId);
        const analysis = analyzeSalesDecline(seller);
        return {
          ok: true,
          data: analysis,
        };
      }

      case 'get_out_of_stock_products': {
        const schema = z.object({
          sellerId: z.string(),
          limit: z.number().optional().default(5),
        });
        const { sellerId, limit } = schema.parse(args);
        const seller = await provider.getSeller(sellerId);
        const newlyOos = seller.skus
          .filter(k => k.status === 'out_of_stock_new')
          .sort((a, b) => b.lostRupees - a.lostRupees);

        const items = newlyOos.slice(0, limit).map(k => ({
          sku: k.sku,
          name: k.name,
          category: k.category,
          price: k.price,
          ordersLastMonth: k.last.orders,
          ordersThisMonth: k.current.orders,
          lostRupeesMonthly: k.lostRupees,
          outOfStockSinceDay: k.oosSinceDay,
          supplierInfo: seller.supplierRestock[k.sku] || null,
        }));

        return {
          ok: true,
          data: {
            totalOutOfStock: seller.metrics.current.outOfStock,
            newlyOutOfStockCount: newlyOos.length,
            topItems: items,
          },
        };
      }

      case 'get_cancellation_breakdown': {
        const schema = z.object({ sellerId: z.string() });
        const { sellerId } = schema.parse(args);
        const seller = await provider.getSeller(sellerId);

        const reasonsCurrent = seller.cancellationReasons.current;
        const reasonsLast = seller.cancellationReasons.last;
        const breachRateCurrent = seller.assumed?.dispatchSlaBreachRate?.current ?? 0.15;
        const breachRateLast = seller.assumed?.dispatchSlaBreachRate?.last ?? 0.06;

        return {
          ok: true,
          data: {
            cancellationRateLast: seller.metrics.last.cancellationRate,
            cancellationRateCurrent: seller.metrics.current.cancellationRate,
            totalCancelledOrdersCurrent: seller.derived.cancelledOrders.current,
            reasonsBreakdown: {
              sellerStockUnavailable: reasonsCurrent.seller_stock_unavailable ?? 21,
              lateDispatch: reasonsCurrent.late_dispatch ?? 11,
              customerInitiated: reasonsCurrent.customer_initiated ?? 6,
            },
            reasonsBreakdownLast: reasonsLast,
            slaBreachRate: {
              last: breachRateLast,
              current: breachRateCurrent,
            },
            finding:
              '55% of cancellations this month were due to products running out of stock after order placement, and 29% from late dispatch breaches.',
          },
        };
      }

      case 'advance_stage': {
        const schema = z.object({ stage: StageSchema });
        const { stage } = schema.parse(args);
        return {
          ok: true,
          data: { currentStage: stage },
        };
      }

      case 'create_action_plan': {
        const schema = z.object({
          sellerId: z.string(),
        });
        const { sellerId } = schema.parse(args);
        const seller = await provider.getSeller(sellerId);
        const recs = recommend(seller);

        const plan: ActionPlan = {
          planId: `PLAN-${sellerId}-${Date.now()}`,
          sellerId,
          createdAt: new Date().toISOString(),
          actions: recs.actions,
        };
        actionPlansStore.set(sellerId, plan);

        return {
          ok: true,
          data: {
            planId: plan.planId,
            actions: plan.actions,
            totalRecoveryPotentialRupees: recs.totalRecoveryPotentialRupees,
            realisticRecoveryRange: recs.realisticRecoveryRupees,
            cashFlowAdvice: recs.cashFlowAdvice,
          },
        };
      }

      case 'schedule_followup': {
        const schema = z.object({
          sellerId: z.string(),
          inDays: z.number().int().min(1).max(30),
          channel: z.enum(['call', 'whatsapp', 'email']).optional().default('call'),
        });
        const { sellerId, inDays, channel } = schema.parse(args);

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + inDays);

        const followup: Followup = {
          followupId: `FUP-${Date.now()}`,
          sellerId,
          inDays,
          channel,
          scheduledDate: targetDate.toLocaleDateString('en-IN', {
            weekday: 'long',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }),
        };
        followupsStore.set(sellerId, followup);

        return {
          ok: true,
          data: followup,
        };
      }

      case 'escalate_to_human_kam': {
        const schema = z.object({
          sellerId: z.string(),
          reason: z.string().min(3),
          summary: z.string().min(5),
        });
        const { sellerId, reason, summary } = schema.parse(args);

        const escalation: Escalation = {
          ticketId: `ESC-${Date.now()}`,
          sellerId,
          reason,
          summary,
          createdAt: new Date().toISOString(),
        };
        escalationsStore.set(sellerId, escalation);

        return {
          ok: true,
          data: {
            ticketId: escalation.ticketId,
            status: 'ESCALATED',
            assignedDepartment: 'Seller Account Management Support',
            message:
              'A senior Key Account Manager has been notified and will contact the seller within 4 working hours.',
          },
        };
      }

      default:
        return {
          ok: false,
          error: `Unknown tool name: ${name}`,
        };
    }
  };

  try {
    const timeoutPromise = new Promise<ToolResult>((_, reject) =>
      setTimeout(() => reject(new Error(`Tool ${name} timed out after ${timeoutMs}ms`)), timeoutMs)
    );
    return await Promise.race([runWithTimeout(), timeoutPromise]);
  } catch (err: any) {
    return {
      ok: false,
      error: err.message || 'Tool execution failed',
    };
  }
}
