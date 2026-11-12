import React from 'react';
import { AudioLines, Loader2, Mic, Sparkles, TriangleAlert } from 'lucide-react';
import { cn } from './ui.js';

export type CallState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

interface VoiceCoreProps {
  state: CallState;
  isMuted?: boolean;
  /** Normalised microphone RMS (0..1), used to make the core react to the seller. */
  level?: number;
}

interface Palette {
  from: string;
  to: string;
  glow: string;
  ring: string;
  dot: string;
}

const PALETTES: Record<CallState, Palette> = {
  idle: {
    from: '#475569',
    to: '#1e293b',
    glow: 'rgba(71,85,105,0.35)',
    ring: '#94a3b8',
    dot: 'bg-slate-400',
  },
  connecting: {
    from: '#a78bfa',
    to: '#7c3aed',
    glow: 'rgba(139,92,246,0.45)',
    ring: '#a78bfa',
    dot: 'bg-violet-400',
  },
  listening: {
    from: '#38bdf8',
    to: '#4338ca',
    glow: 'rgba(56,189,248,0.45)',
    ring: '#60a5fa',
    dot: 'bg-sky-400',
  },
  thinking: {
    from: '#fbbf24',
    to: '#ea580c',
    glow: 'rgba(251,191,36,0.45)',
    ring: '#fbbf24',
    dot: 'bg-amber-400',
  },
  speaking: {
    from: '#34d399',
    to: '#0f766e',
    glow: 'rgba(52,211,153,0.5)',
    ring: '#34d399',
    dot: 'bg-emerald-400',
  },
  error: {
    from: '#fb7185',
    to: '#b91c1c',
    glow: 'rgba(244,63,94,0.45)',
    ring: '#fb7185',
    dot: 'bg-rose-400',
  },
};

const LABELS: Record<CallState, string> = {
  idle: 'Ready to start',
  connecting: 'Connecting to Gemini Live',
  listening: 'Listening to you',
  thinking: 'Thinking',
  speaking: 'Asha is speaking',
  error: 'Connection error',
};

const ICONS: Record<CallState, React.ComponentType<{ className?: string }>> = {
  idle: Mic,
  connecting: Loader2,
  listening: AudioLines,
  thinking: Loader2,
  speaking: Sparkles,
  error: TriangleAlert,
};

export const VoiceCore: React.FC<VoiceCoreProps> = ({ state, isMuted = false, level = 0 }) => {
  const palette = isMuted ? PALETTES.idle : PALETTES[state];
  const Icon = ICONS[state];
  const isSpinning = state === 'connecting' || state === 'thinking';
  const isLive = state === 'listening' || state === 'speaking';
  const clamped = Math.max(0, Math.min(1, level));
  const label = isMuted ? 'Muted' : LABELS[state];

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative grid h-60 w-60 place-items-center"
        style={{ color: palette.ring }}
        aria-hidden
      >
        {/* Bubbles only while the mic or the speaker is actually live. */}
        {isLive && !isMuted && (
          <>
            <span className="voice-ring" />
            <span className="voice-ring" style={{ animationDelay: '1.3s' }} />
          </>
        )}

        <div
          className="voice-bars"
          style={
            {
              '--level': clamped,
              opacity: state === 'idle' || isMuted ? 0.22 : 1,
            } as React.CSSProperties
          }
        >
          {Array.from({ length: 36 }).map((_, i) => (
            <span
              key={i}
              className="voice-bar-slot"
              style={{ transform: `rotate(${i * 10}deg)` }}
            >
              <i
                style={{
                  animationDelay: `${(i % 9) * 110}ms`,
                  animationDuration: `${1.15 + (i % 5) * 0.1}s`,
                }}
              />
            </span>
          ))}
        </div>

        <div
          className="absolute inset-8 rounded-full opacity-60 blur-2xl"
          style={{ background: palette.glow }}
        />

        <div
          className="voice-sphere"
          style={
            {
              '--from': palette.from,
              '--to': palette.to,
              '--glow': palette.glow,
              transform: `scale(${1 + clamped * 0.06})`,
            } as React.CSSProperties
          }
        >
          <Icon className={cn('h-7 w-7 text-white/90', isSpinning && 'animate-spin')} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2" role="status" aria-live="polite">
        <span className={cn('h-2 w-2 rounded-full', palette.dot, isLive && 'animate-pulse')} />
        <span className="text-sm font-medium text-stage-text">{label}</span>
      </div>
    </div>
  );
};
