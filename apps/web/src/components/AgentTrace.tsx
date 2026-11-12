import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, Zap } from 'lucide-react';
import type { ToolEvent } from '../live/toolBridge.js';
import { cn } from './ui.js';

interface AgentTraceProps {
  events: ToolEvent[];
}

const LABELS: Record<string, string> = {
  get_seller_snapshot: 'Seller snapshot',
  analyze_sales_decline: 'Decline analysis',
  get_out_of_stock_products: 'Stock-out list',
  get_cancellation_breakdown: 'Cancellations',
  advance_stage: 'Stage update',
  create_action_plan: 'Action plan',
  schedule_followup: 'Follow-up',
  escalate_to_human_kam: 'Escalation',
};

const humanize = (name: string) =>
  LABELS[name] ?? name.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

/**
 * Compact evidence strip: every deterministic tool call, in order. Raw args
 * are one click away, but the resting state stays seller-readable.
 */
export const AgentTrace: React.FC<AgentTraceProps> = ({ events }) => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const ordered = [...events].reverse();

  return (
    <section className="panel px-3 py-2" aria-label="Agent tool trace" data-testid="agent-trace">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-brand" aria-hidden />
          <span className="text-[11px] font-semibold text-ink">Agent trace</span>
          <span className="rounded-full bg-canvas px-1.5 py-0.5 text-[9px] font-semibold text-muted ring-1 ring-line">
            {events.length}
          </span>
        </div>

        <div className="scroll-thin flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-0.5">
          {ordered.length === 0 ? (
            <span className="text-[10px] text-muted">
              No tool calls yet — every number Asha speaks will come from here.
            </span>
          ) : (
            ordered.map((event, index) => (
              <button
                key={`${event.name}-${index}`}
                type="button"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                aria-expanded={openIndex === index}
                className={cn(
                  'focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-colors',
                  openIndex === index
                    ? 'border-brand/30 bg-brand-soft text-brand-deep'
                    : 'border-line bg-panel text-ink/70 hover:border-brand/30 hover:text-ink'
                )}
                title={`Click to inspect ${event.name} args and result`}
              >
                <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden />
                {humanize(event.name)}
                <span className="tnum text-muted">{event.ms}ms</span>
                <ChevronDown
                  className={cn(
                    'h-3 w-3 text-muted transition-transform',
                    openIndex === index && 'rotate-180'
                  )}
                  aria-hidden
                />
              </button>
            ))
          )}
        </div>
      </div>

      {openIndex !== null && ordered[openIndex] && (
        <pre className="scroll-thin mt-2 max-h-32 overflow-auto rounded-lg bg-canvas p-2.5 text-[10px] leading-relaxed text-muted ring-1 ring-line">
          {JSON.stringify(
            { args: ordered[openIndex].args, result: ordered[openIndex].result },
            null,
            2
          )}
        </pre>
      )}
    </section>
  );
};
