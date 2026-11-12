import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  PhoneIncoming,
  SlidersHorizontal,
  Store,
} from 'lucide-react';
import { useCallStore } from '../store/useCallStore.js';
import { Chip, LiveDot, cn } from './ui.js';

interface HeaderProps {
  onStartProactiveCall: () => void;
}

const LANGUAGES: { id: 'hinglish' | 'en' | 'hi'; label: string }[] = [
  { id: 'hinglish', label: 'Hinglish' },
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'हिंदी' },
];

export const Header: React.FC<HeaderProps> = ({ onStartProactiveCall }) => {
  const { language, setLanguage, mode, setMode, setAssumptionsOpen, callState } = useCallStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const live = callState !== 'idle' && callState !== 'error';
  const statusTone = callState === 'error' ? 'bad' : live ? 'ok' : 'neutral';

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-canvas/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-3 px-4 md:px-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand text-sm font-bold text-white shadow-sm shadow-brand/25">
            S
          </div>
          <div className="leading-tight">
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-semibold tracking-tight text-ink">Asha</span>
              <span className="hidden text-[11px] font-medium text-muted sm:inline">Virtual KAM</span>
            </div>
            <div className="text-[10px] text-muted">Snapdeal seller console · mock data</div>
          </div>
        </div>

        {/* Seller identity */}
        <div className="ml-1 hidden items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 lg:flex">
          <Store className="h-3.5 w-3.5 text-muted" aria-hidden />
          <span className="text-[11px] font-medium text-ink">Sharma Home Essentials</span>
          <span className="font-mono text-[10px] text-muted">SD-48213</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Chip tone={statusTone}>
            <LiveDot active={live} tone={callState === 'error' ? 'bad' : live ? 'ok' : 'idle'} />
            <span className="hidden sm:inline">{callState === 'error' ? 'Error' : live ? 'Live' : 'Idle'}</span>
          </Chip>

          <button
            type="button"
            onClick={onStartProactiveCall}
            disabled={callState !== 'idle'}
            title="Simulate a proactive outbound call from Asha detecting a sales anomaly"
            className="focus-ring hidden h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[11px] font-semibold text-ink transition-colors hover:border-amber-300 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-40 md:inline-flex"
          >
            <PhoneIncoming className="h-3.5 w-3.5 text-amber-600" aria-hidden />
            <span className="hidden xl:inline">Proactive demo</span>
          </button>

          <button
            type="button"
            onClick={() => setAssumptionsOpen(true)}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-panel px-2.5 text-[11px] font-semibold text-ink transition-colors hover:border-ink/20 hover:bg-canvas"
          >
            <BookOpen className="h-3.5 w-3.5 text-muted" aria-hidden />
            <span className="hidden xl:inline">Assumptions</span>
          </button>

          {/* Demo controls: language + engine. Secondary by design. */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Demo controls"
              title="Demo controls"
              onClick={() => setMenuOpen((open) => !open)}
              className={cn(
                'focus-ring grid h-8 w-8 place-items-center rounded-lg border transition-colors',
                menuOpen
                  ? 'border-brand/30 bg-brand-soft text-brand-deep'
                  : 'border-line bg-panel text-muted hover:border-ink/20 hover:text-ink'
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="panel absolute right-0 top-10 z-50 w-64 animate-fade-in p-3"
              >
                <div className="label">Language</div>
                <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-canvas p-1 ring-1 ring-line">
                  {LANGUAGES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={language === option.id}
                      onClick={() => {
                        setLanguage(option.id);
                        setMenuOpen(false);
                      }}
                      className={cn(
                        'rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
                        language === option.id
                          ? 'bg-panel text-ink shadow-sm ring-1 ring-line'
                          : 'text-muted hover:text-ink'
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="label mt-3">Voice engine</div>
                <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-lg bg-canvas p-1 ring-1 ring-line">
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === 'live'}
                    onClick={() => {
                      setMode('live');
                      setMenuOpen(false);
                    }}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
                      mode === 'live'
                        ? 'bg-panel text-ink shadow-sm ring-1 ring-line'
                        : 'text-muted hover:text-ink'
                    )}
                  >
                    Gemini Live
                  </button>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === 'fallback'}
                    onClick={() => {
                      setMode('fallback');
                      setMenuOpen(false);
                    }}
                    className={cn(
                      'rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors',
                      mode === 'fallback'
                        ? 'bg-panel text-ink shadow-sm ring-1 ring-line'
                        : 'text-muted hover:text-ink'
                    )}
                  >
                    Compatibility
                  </button>
                </div>

                <p className="mt-2.5 text-[10px] leading-relaxed text-muted">
                  Live uses Gemini speech-to-speech over a server-minted ephemeral token.
                  Compatibility falls back to Web Speech + text LLM + TTS.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
