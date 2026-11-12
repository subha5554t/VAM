import React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { SalesDeclineAnalysis, RootCause } from '@kam/core';
import { cn } from './ui.js';

interface LossBridgeProps {
  diagnosis: SalesDeclineAnalysis | null;
}

const CAUSE_STYLE: Record<string, { bar: string; dot: string; label: string }> = {
  out_of_stock: { bar: 'bg-brand', dot: 'bg-brand', label: 'Stock-outs' },
  organic_rank_loss: {
    bar: 'bg-[#31415F]',
    dot: 'bg-[#31415F]',
    label: 'Rank & visibility',
  },
  reduced_promotions: {
    bar: 'bg-[#C9A227]',
    dot: 'bg-[#C9A227]',
    label: 'Ad spend cut',
  },
};

const FALLBACK_COLORS = ['bg-brand', 'bg-[#31415F]', 'bg-[#C9A227]'];

function styleFor(cause: RootCause): { bar: string; dot: string; label: string } {
  return (
    CAUSE_STYLE[cause.id] ?? {
      bar: FALLBACK_COLORS[(cause.rank - 1) % FALLBACK_COLORS.length],
      dot: FALLBACK_COLORS[(cause.rank - 1) % FALLBACK_COLORS.length],
      label: cause.label,
    }
  );
}

/**
 * The rupee bridge from `analyze_sales_decline`: the single most persuasive
 * visual in the dataset. Every figure here is tool output.
 */
export const LossBridge: React.FC<LossBridgeProps> = ({ diagnosis }) => {
  if (!diagnosis) {
    return (
      <div className="border-t border-line px-4 py-3.5">
        <div className="flex items-center justify-between">
          <span className="label">Revenue bridge</span>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" aria-hidden />
        </div>
        <div className="mt-2.5 h-2.5 w-full animate-pulse rounded-full bg-line/80" />
        <p className="mt-2 text-[10px] text-muted">
          Awaiting <span className="font-mono">analyze_sales_decline</span>…
        </p>
      </div>
    );
  }

  const total = diagnosis.bridge.totalLossRupees;
  const pricingRuledOut = diagnosis.ruledOut.some((factor) => factor.id === 'pricing');

  return (
    <div className="border-t border-line px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label">Revenue bridge</span>
        <span className="text-[11px] text-muted">
          <span className="tnum text-[13px] font-semibold text-ink">
            ₹{total.toLocaleString('en-IN')}
          </span>
          /mo lost
        </span>
      </div>

      <div
        className="mt-2.5 flex h-2.5 w-full overflow-hidden rounded-full ring-1 ring-line"
        role="img"
        aria-label={`Monthly revenue loss of ₹${total.toLocaleString('en-IN')} split into ${diagnosis.causes
          .map((cause) => `${cause.label}: ${cause.sharePct}%`)
          .join(', ')}`}
      >
        {diagnosis.causes.map((cause) => {
          const style = styleFor(cause);
          return (
            <span
              key={cause.id}
              className={cn('h-full', style.bar)}
              style={{ width: `${cause.sharePct}%` }}
              title={`${style.label}: ₹${cause.lossRupees.toLocaleString('en-IN')} (${cause.sharePct}%)`}
            />
          );
        })}
      </div>

      <div className="mt-3 space-y-1.5">
        {diagnosis.causes.map((cause) => {
          const style = styleFor(cause);
          return (
            <div key={cause.id} className="flex items-center gap-2 text-[11px]">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', style.dot)} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-ink/80">{style.label}</span>
              <span className="tnum w-10 text-right text-muted">{cause.sharePct}%</span>
              <span className="tnum w-16 text-right font-medium text-ink">
                ₹{cause.lossRupees.toLocaleString('en-IN')}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        {pricingRuledOut ? (
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-emerald-700">
            <CheckCircle2 className="h-3 w-3" aria-hidden />
            Pricing ruled out · ASP flat
          </span>
        ) : (
          <span className="text-[10px] text-muted">Source: deterministic tool output</span>
        )}
      </div>
    </div>
  );
};
