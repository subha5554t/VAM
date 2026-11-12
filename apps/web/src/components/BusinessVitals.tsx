import React from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Database,
  Gauge,
  Loader2,
  Radio,
} from 'lucide-react';
import type { SalesDeclineAnalysis } from '@kam/core';
import type { KpiSnapshot } from '../store/useCallStore.js';
import { LossBridge } from './LossBridge.js';
import { Chip, Skeleton, cn } from './ui.js';

interface BusinessVitalsProps {
  kpis: KpiSnapshot | null;
  baseline: KpiSnapshot | null;
  diagnosis: SalesDeclineAnalysis | null;
  baselineDiagnosis: SalesDeclineAnalysis | null;
}

const inr = (value: number) => `₹${value.toLocaleString('en-IN')}`;
const signed = (value: number, suffix = '%') =>
  `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value)}${suffix}`;

type Tone = 'bad' | 'warn' | 'ok' | 'muted';

const TONE: Record<Tone, string> = {
  bad: 'text-rose-600',
  warn: 'text-amber-700',
  ok: 'text-emerald-700',
  muted: 'text-muted',
};

const Stat: React.FC<{
  label: string;
  value: string;
  delta?: string;
  tone?: Tone;
  note: string;
  icon?: 'up' | 'down' | 'check';
}> = ({ label, value, delta, tone = 'muted', note, icon }) => (
  <div className="bg-panel px-3.5 py-3">
    <div className="label">{label}</div>
    <div className="mt-1.5 flex items-baseline gap-1.5">
      <span className="text-[21px] font-semibold leading-none tracking-tight text-ink tnum">
        {value}
      </span>
      {delta && (
        <span className={cn('inline-flex items-center gap-0.5 text-[10px] font-semibold', TONE[tone])}>
          {icon === 'down' && <ArrowDownRight className="h-3 w-3" aria-hidden />}
          {icon === 'up' && <ArrowUpRight className="h-3 w-3" aria-hidden />}
          {icon === 'check' && <Check className="h-3 w-3" aria-hidden />}
          {delta}
        </span>
      )}
    </div>
    <div className="mt-1 truncate text-[10px] text-muted">{note}</div>
  </div>
);

export const BusinessVitals: React.FC<BusinessVitalsProps> = ({
  kpis,
  baseline,
  diagnosis,
  baselineDiagnosis,
}) => {
  const data = kpis ?? baseline;
  const isLive = Boolean(kpis);
  const bridge = diagnosis ?? baselineDiagnosis;

  return (
    <section className="panel overflow-hidden" aria-label="Seller business vitals">
      <header className="flex items-center justify-between gap-2 px-4 pb-3 pt-3.5">
        <div className="flex items-center gap-2">
          <Gauge className="h-4 w-4 text-brand" aria-hidden />
          <h2 className="text-sm font-semibold text-ink">Business vitals</h2>
        </div>
        {isLive ? (
          <Chip tone="ok">
            <Radio className="h-3 w-3" aria-hidden />
            Live from tools
          </Chip>
        ) : baseline ? (
          <Chip tone="neutral">
            <Database className="h-3 w-3" aria-hidden />
            Baseline · mock
          </Chip>
        ) : (
          <Chip tone="neutral">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Loading
          </Chip>
        )}
      </header>

      {data ? (
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
          <Stat
            label="Sales"
            value={inr(data.salesCurrent)}
            delta={signed(data.salesDeltaPct)}
            tone="bad"
            icon="down"
            note={`was ${inr(data.salesLast)}`}
          />
          <Stat
            label="Orders"
            value={data.ordersCurrent.toLocaleString('en-IN')}
            delta={signed(data.ordersDeltaPct)}
            tone="bad"
            icon="down"
            note={`was ${data.ordersLast.toLocaleString('en-IN')}`}
          />
          <Stat
            label="Out of stock"
            value={`${data.outOfStock} SKUs`}
            delta={signed(data.outOfStockChange, '')}
            tone="warn"
            icon="up"
            note={`was ${data.outOfStock - data.outOfStockChange}`}
          />
          <Stat
            label="Cancellations"
            value={`${Math.round(data.cancellationRate * 100)}%`}
            delta={`+${data.cancellationDeltaPts} pts`}
            tone="bad"
            icon="up"
            note={`was ${Math.round(data.cancellationRate * 100) - data.cancellationDeltaPts}%`}
          />
          <Stat
            label="Avg. price"
            value={inr(data.asp)}
            delta={data.flags.priceFlat ? 'Flat' : 'Changed'}
            tone={data.flags.priceFlat ? 'ok' : 'warn'}
            icon="check"
            note={data.flags.priceFlat ? 'pricing ruled out' : 'price moved'}
          />
          {data.impressionsCurrent > 0 && (
            <Stat
              label="Impressions"
              value={data.impressionsCurrent.toLocaleString('en-IN')}
              delta={signed(data.impressionsDeltaPct)}
              tone="bad"
              icon="down"
              note={`was ${data.impressionsLast.toLocaleString('en-IN')}`}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="bg-panel px-3.5 py-3">
              <Skeleton className="h-2 w-14" />
              <Skeleton className="mt-2 h-5 w-20" />
              <Skeleton className="mt-2 h-2 w-16" />
            </div>
          ))}
        </div>
      )}

      <LossBridge diagnosis={bridge} />
    </section>
  );
};
