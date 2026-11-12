import React from 'react';
import { Check } from 'lucide-react';
import { Stage } from '@kam/core';
import { cn } from './ui.js';

interface StageTrackerProps {
  currentStage: Stage;
}

const STAGES: { id: Stage; label: string }[] = [
  { id: 'discover', label: 'Understand' },
  { id: 'diagnose', label: 'Diagnose' },
  { id: 'probe', label: 'Deep dive' },
  { id: 'recommend', label: 'Recommend' },
  { id: 'commit', label: 'Action plan' },
  { id: 'summarise', label: 'Summary' },
];

const STAGE_ORDER: Stage[] = [
  'discover',
  'diagnose',
  'probe',
  'recommend',
  'commit',
  'summarise',
  'close',
];

export const StageTracker: React.FC<StageTrackerProps> = ({ currentStage }) => {
  const currentIndex = STAGE_ORDER.indexOf(currentStage);

  return (
    <div
      data-testid="stage-tracker"
      data-stage={currentStage}
      className="scroll-thin-dark flex w-full items-center gap-1 overflow-x-auto pb-0.5 xl:w-auto"
      aria-label={`Conversation stage: ${currentStage}`}
    >
      {STAGES.map((stage, index) => {
        const stepIndex = STAGE_ORDER.indexOf(stage.id);
        const isDone = currentIndex > stepIndex;
        const isCurrent =
          currentIndex === stepIndex || (stage.id === 'summarise' && currentStage === 'close');

        return (
          <div key={stage.id} className="flex shrink-0 items-center gap-1.5">
            <span
              className={cn(
                'grid h-5 w-5 place-items-center rounded-full text-[10px] font-semibold transition-colors',
                isCurrent
                  ? 'bg-brand text-white shadow-sm shadow-brand/30'
                  : isDone
                    ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25'
                    : 'bg-white/[0.04] text-stage-muted ring-1 ring-white/10'
              )}
            >
              {isDone ? <Check className="h-3 w-3" /> : index + 1}
            </span>
            <span
              className={cn(
                'whitespace-nowrap text-[11px] transition-colors',
                isCurrent ? 'inline' : 'hidden sm:inline',
                isCurrent
                  ? 'font-semibold text-stage-text'
                  : isDone
                    ? 'text-stage-text/70'
                    : 'text-stage-muted'
              )}
            >
              {stage.label}
            </span>
            {index < STAGES.length - 1 && (
              <span
                className={cn(
                  'mx-1 h-px w-3',
                  isDone ? 'bg-emerald-400/40' : 'bg-white/10'
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};
