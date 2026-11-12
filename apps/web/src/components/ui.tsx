import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names without Tailwind conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'dark';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white shadow-sm hover:bg-brand-deep',
  outline: 'border border-line bg-panel text-ink hover:border-ink/25 hover:bg-canvas',
  ghost: 'text-muted hover:bg-ink/[0.05] hover:text-ink',
  danger: 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100',
  dark: 'border border-white/10 bg-white/[0.06] text-stage-text hover:bg-white/[0.12]',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[11px]',
  md: 'h-10 px-4 text-[13px]',
  lg: 'h-11 px-5 text-sm',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', type = 'button', ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(BUTTON_BASE, BUTTON_VARIANTS[variant], BUTTON_SIZES[size], className)}
      {...props}
    />
  );
});

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: 'light' | 'dark';
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className, label, tone = 'light', type = 'button', children, ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-grid h-9 w-9 place-items-center rounded-xl transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'light'
          ? 'border border-line bg-panel text-muted hover:border-ink/20 hover:text-ink'
          : 'border border-white/10 bg-white/[0.04] text-stage-muted hover:bg-white/[0.1] hover:text-stage-text',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
});

type ChipTone = 'neutral' | 'brand' | 'ok' | 'warn' | 'bad' | 'dark' | 'live';

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: 'bg-canvas text-muted ring-1 ring-line',
  brand: 'bg-brand-soft text-brand-deep ring-1 ring-brand/20',
  ok: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  bad: 'bg-rose-50 text-rose-700 ring-1 ring-rose-200',
  dark: 'bg-white/[0.06] text-stage-muted ring-1 ring-white/10',
  live: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30',
};

export const Chip: React.FC<{
  tone?: ChipTone;
  className?: string;
  children: React.ReactNode;
}> = ({ tone = 'neutral', className, children }) => (
  <span className={cn('chip', CHIP_TONES[tone], className)}>{children}</span>
);

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <span
    aria-hidden
    className={cn('relative block overflow-hidden rounded-md bg-line/70', className)}
  >
    <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/70 to-transparent" />
  </span>
);

export const LiveDot: React.FC<{ active?: boolean; tone?: 'ok' | 'warn' | 'bad' | 'idle' }> = ({
  active = true,
  tone = 'ok',
}) => {
  const color =
    tone === 'ok'
      ? 'bg-emerald-500'
      : tone === 'warn'
        ? 'bg-amber-500'
        : tone === 'bad'
          ? 'bg-rose-500'
          : 'bg-slate-400';
  return (
    <span className="relative inline-flex h-2 w-2" aria-hidden>
      {active && (
        <span className={cn('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', color)} />
      )}
      <span className={cn('relative inline-flex h-2 w-2 rounded-full', color)} />
    </span>
  );
};
