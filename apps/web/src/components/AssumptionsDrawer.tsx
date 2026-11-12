import React, { useEffect, useRef } from 'react';
import { BookOpen, ShieldCheck, X } from 'lucide-react';
import { Button, IconButton } from './ui.js';

interface AssumptionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const ASSUMPTIONS = [
  {
    id: 'A1',
    text: 'Catalogue contains 60 active SKUs; 5 chronic dead listings (0 orders), 13 newly out of stock this month, and 42 in stock.',
  },
  {
    id: 'A2',
    text: 'The 13 newly out-of-stock SKUs generated 72 orders last month (including 4 in the top-10: Cooker KT-101, Tawa KT-118, Containers ST-204, Mop HM-310).',
  },
  {
    id: 'A3',
    text: 'Platform impressions dropped from 1,20,000 to 84,000 (-30%), while page conversion rate stayed flat (0.33% to 0.32%), indicating a traffic problem rather than price resistance.',
  },
  {
    id: 'A4',
    text: 'Cancellations increased from 32 (8%) to 38 (14%). This month: 21 out of stock post-order, 11 late dispatch breaches, and 6 customer-initiated.',
  },
  {
    id: 'A5',
    text: 'Self-ship dispatch SLA breach rate rose from 6% to 15%, causing seller customer rating to fall from 4.2 to 4.0 stars.',
  },
  {
    id: 'A6',
    text: 'Marketplaces typically penalize out-of-stock listings and shipping SLA breaches in algorithmic search ranking; in-stock SKUs experienced a 24% organic order drop due to lower visibility.',
  },
  {
    id: 'A7',
    text: 'Seller reduced monthly ad spend from ₹8,000 to ₹2,500 to conserve cash while awaiting supplier payments, directly losing 35 ad-attributed orders.',
  },
  {
    id: 'A8',
    text: 'Competitor price index remained flat across top categories; supplier restock lead times are 5-7 business days; supplier dues of ~₹1.2 lakh are pending.',
  },
  {
    id: 'A9',
    text: 'SKU prices were held constant between periods so that Average Selling Price (ASP) was mathematically verified at exactly ₹500 in both months.',
  },
];

export const AssumptionsDrawer: React.FC<AssumptionsDrawerProps> = ({ isOpen, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assumptions-title"
    >
      <button
        type="button"
        aria-label="Close assumptions"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 h-full w-full animate-fade-in cursor-default bg-ink/40 backdrop-blur-sm"
      />

      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md animate-slide-in-right flex-col border-l border-line bg-canvas shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-xl bg-brand-soft text-brand-deep">
              <BookOpen className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <h2 id="assumptions-title" className="text-sm font-semibold text-ink">
                Documented assumptions
              </h2>
              <p className="mt-0.5 text-[11px] text-muted">
                {ASSUMPTIONS.length} explicit assumptions · no hidden figures
              </p>
            </div>
          </div>
          <IconButton ref={closeRef} label="Close assumptions" onClick={onClose}>
            <X className="h-4 w-4" aria-hidden />
          </IconButton>
        </header>

        <div className="scroll-thin flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
          <p className="rounded-xl border border-line bg-panel p-3 text-[11px] leading-relaxed text-muted">
            The assignment asks for reasonable assumptions to be stated clearly. These power the
            deterministic analytics in <span className="font-mono text-ink">packages/core</span>;
            every figure Asha speaks is returned by a tool.
          </p>

          {ASSUMPTIONS.map((assumption) => (
            <div key={assumption.id} className="rounded-xl border border-line bg-panel p-3">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-brand-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-brand-deep">
                  {assumption.id}
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted">
                  assumption
                </span>
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-ink/80">{assumption.text}</p>
            </div>
          ))}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-5 py-3.5">
          <span className="inline-flex items-center gap-1.5 text-[10px] text-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
            Mock data only · no PII
          </span>
          <Button size="sm" variant="outline" onClick={onClose}>
            Close
          </Button>
        </footer>
      </aside>
    </div>
  );
};
