import React from 'react';
import {
  CalendarClock,
  Clock,
  Download,
  ShieldAlert,
  Target,
  User,
} from 'lucide-react';
import { ActionPlan, Followup, Escalation } from '@kam/core';
import type { KpiSnapshot } from '../store/useCallStore.js';
import { cn } from './ui.js';

interface ActionPlanCardProps {
  plan: ActionPlan | null;
  followup: Followup | null;
  escalation: Escalation | null;
  kpis?: KpiSnapshot | null;
}

export const ActionPlanCard: React.FC<ActionPlanCardProps> = ({
  plan,
  followup,
  escalation,
  kpis,
}) => {
  const downloadSummary = () => {
    // Everything below is rendered from live tool results. No figures are
    // hardcoded — the exported note must match what Asha actually said.
    const lines: string[] = [];

    lines.push('# Snapdeal Virtual KAM — Post-Call Summary');
    lines.push(`Seller: ${plan?.sellerId || 'SD-48213'}`);
    lines.push(`Date: ${new Date().toLocaleDateString('en-IN')}`);
    lines.push('');

    lines.push('## Business Diagnosis (deterministic tool output)');
    if (kpis) {
      lines.push(
        `- Sales: ₹${kpis.salesLast.toLocaleString('en-IN')} → ₹${kpis.salesCurrent.toLocaleString('en-IN')} (${kpis.salesDeltaPct}%)`
      );
      lines.push(
        `- Orders: ${kpis.ordersLast.toLocaleString('en-IN')} → ${kpis.ordersCurrent.toLocaleString('en-IN')} (${kpis.ordersDeltaPct}%)`
      );
      lines.push(
        `- Out-of-stock SKUs: ${kpis.outOfStock} (${kpis.outOfStockChange >= 0 ? '+' : ''}${kpis.outOfStockChange})`
      );
      lines.push(
        `- Cancellation rate: ${kpis.cancellationRate}% (${kpis.cancellationDeltaPts >= 0 ? '+' : ''}${kpis.cancellationDeltaPts} pts)`
      );
      lines.push(`- ASP: ₹${kpis.asp.toLocaleString('en-IN')} (unchanged ⇒ pricing ruled out)`);
      if (kpis.impressionsCurrent > 0) {
        lines.push(
          `- Impressions: ${kpis.impressionsLast.toLocaleString('en-IN')} → ${kpis.impressionsCurrent.toLocaleString('en-IN')} (${kpis.impressionsDeltaPct}%)`
        );
      }
    } else {
      lines.push('- KPI snapshot was not loaded during this call.');
    }
    lines.push('');

    lines.push('## 3 Prioritised Action Recommendations');
    if (plan?.actions?.length) {
      plan.actions.forEach((action) => {
        lines.push(
          `${action.id}. ${action.title}\n   - ${action.how}\n   - Recovery potential: up to ₹${action.estimatedRecoveryRupees.toLocaleString('en-IN')}/month\n   - Owner: ${action.owner}\n   - Timeline: ${action.timeline}`
        );
      });
      const total = plan.actions.reduce((sum, action) => sum + action.estimatedRecoveryRupees, 0);
      lines.push('');
      lines.push(`Total Potential Monthly Recovery: up to ₹${total.toLocaleString('en-IN')}/month`);
    } else {
      lines.push('- No action plan was finalised during this call.');
    }
    lines.push('');

    lines.push('## Scheduled Next Steps');
    lines.push(
      followup
        ? `- Next check-in scheduled for: ${followup.scheduledDate} via ${followup.channel.toUpperCase()}`
        : '- Self-monitored recovery plan'
    );

    if (escalation) {
      lines.push('');
      lines.push('## Human KAM Escalation Ticket');
      lines.push(`Ticket ID: ${escalation.ticketId}`);
      lines.push(`Reason: ${escalation.reason}`);
      lines.push(`Summary: ${escalation.summary}`);
    }

    const content = lines.join('\n');

    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Snapdeal-KAM-Summary-${plan?.sellerId || 'SD-48213'}-${Date.now()}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const total = plan?.actions?.reduce((sum, action) => sum + action.estimatedRecoveryRupees, 0) ?? 0;

  return (
    <section
      data-testid="action-plan"
      data-action-count={plan?.actions?.length ?? 0}
      className="panel overflow-hidden"
    >
      <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-brand" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold leading-tight text-ink">Recovery plan</h2>
            <p className="text-[10px] text-muted">3 prioritised actions · tool-grounded</p>
          </div>
        </div>
        <button
          onClick={downloadSummary}
          disabled={!plan}
          title="Download the post-call summary as Markdown"
          className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[11px] font-semibold text-ink transition-colors hover:border-ink/20 hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Download</span>
        </button>
      </header>

      {escalation && (
        <div className="mx-3 mt-3 rounded-xl border border-violet-200 bg-violet-50 p-2.5 text-[11px] text-violet-800">
          <div className="flex items-center gap-1.5 font-semibold">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden />
            Escalated to a human KAM · #{escalation.ticketId}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-violet-700">
            {escalation.reason}. A dedicated manager will call within 4 working hours.
          </p>
        </div>
      )}

      {plan ? (
        <div className="space-y-2 p-3">
          {plan.actions.map((action, index) => (
            <article
              key={action.id}
              data-testid="action-item"
              data-recovery={action.estimatedRecoveryRupees}
              className="animate-slide-up rounded-xl border border-line bg-panel p-3 transition-colors hover:border-brand/30"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[10px] font-bold',
                    index === 0
                      ? 'bg-brand text-white shadow-sm shadow-brand/25'
                      : 'bg-canvas text-muted ring-1 ring-line'
                  )}
                >
                  {String(index + 1).padStart(2, '0')}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-[13px] font-semibold leading-snug text-ink">
                      {action.title}
                    </h3>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      +₹{action.estimatedRecoveryRupees.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">
                    {action.how}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
                    <span className="inline-flex items-center gap-1">
                      <User className="h-3 w-3" aria-hidden />
                      {action.owner}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" aria-hidden />
                      {action.timeline}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          ))}

          <div className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2.5 ring-1 ring-line">
            <span className="text-[11px] font-medium text-muted">Total potential recovery</span>
            <span className="tnum text-sm font-bold text-ink">
              up to ₹{total.toLocaleString('en-IN')}
              <span className="text-[10px] font-medium text-muted">/mo</span>
            </span>
          </div>

          {followup && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[10px] text-blue-800">
              <span className="inline-flex items-center gap-1.5">
                <CalendarClock className="h-3 w-3" aria-hidden />
                Follow-up {followup.scheduledDate}
              </span>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 font-mono text-[9px] uppercase">
                {followup.channel}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2 p-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="flex items-center gap-2.5 rounded-xl border border-dashed border-line p-3"
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-canvas text-[10px] font-bold text-muted ring-1 ring-line">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="flex-1">
                <div className="h-2 w-2/3 rounded-full bg-line/80" />
                <div className="mt-1.5 h-2 w-1/3 rounded-full bg-line/50" />
              </div>
            </div>
          ))}
          <p className="px-1 pt-1 text-center text-[10px] leading-relaxed text-muted">
            Asha fills these from{' '}
            <code className="rounded bg-canvas px-1 py-0.5 font-mono text-[9px]">
              create_action_plan
            </code>{' '}
            when you agree on the fix.
          </p>
        </div>
      )}
    </section>
  );
};
