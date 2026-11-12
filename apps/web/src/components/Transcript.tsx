import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, AudioLines, Keyboard } from 'lucide-react';
import type { ChatMessage } from '../store/useCallStore.js';
import { cn } from './ui.js';

interface TranscriptProps {
  messages: ChatMessage[];
  isCallActive?: boolean;
  /** Which role is still streaming, so we can show a caret on that bubble. */
  openTurnRole?: 'user' | 'bot' | null;
  onSendMessage?: (text: string) => void;
}

export const Transcript: React.FC<TranscriptProps> = ({
  messages,
  isCallActive = false,
  openTurnRole = null,
  onSendMessage,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [inputText, setInputText] = useState('');

  // Only follow new text when the reader is already at the bottom. Scrolling up
  // during a long summary must not yank them back down.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !pinnedRef.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, openTurnRole]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 56;
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!inputText.trim() || !onSendMessage) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <section className="flex min-h-[430px] flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-stage-line px-4 py-3">
        <div className="flex items-center gap-2">
          <AudioLines className="h-4 w-4 text-stage-muted" />
          <h2 className="text-xs font-semibold text-stage-text">Live transcript</h2>
        </div>
        <span className="chip bg-white/[0.05] text-stage-muted ring-1 ring-white/10">
          Gemini Live
        </span>
      </header>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="transcript"
        className="scroll-thin-dark flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/[0.05] ring-1 ring-white/10">
              <AudioLines className="h-6 w-6 text-stage-muted" />
            </div>
            <p className="mt-3 text-sm font-medium text-stage-text">The conversation appears here</p>
            <p className="mt-1 max-w-[270px] text-[11px] leading-relaxed text-stage-muted">
              Start the call and speak naturally in Hinglish, Hindi or English. Typing stays
              available below as a debug aid.
            </p>
          </div>
        ) : (
          messages.map((message, index) => {
            const isUser = message.role === 'user';
            const isSystem = message.role === 'system';
            const isStreaming =
              !isSystem &&
              openTurnRole === message.role &&
              index === messages.length - 1;

            if (isSystem) {
              return (
                <div
                  key={message.id}
                  data-testid="transcript-message"
                  data-role={message.role}
                  className="flex flex-col items-center"
                >
                  <div className="rounded-full bg-white/[0.04] px-3 py-1 text-[10px] text-stage-muted">
                    {message.text}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={message.id}
                data-testid="transcript-message"
                data-role={message.role}
                className={cn('flex flex-col gap-1', isUser ? 'items-end' : 'items-start')}
              >
                <div
                  className={cn(
                    'flex items-center gap-1.5 px-1 text-[10px] text-stage-muted',
                    isUser && 'flex-row-reverse'
                  )}
                >
                  <span
                    className={cn(
                      'grid h-5 w-5 place-items-center rounded-full text-[9px] font-bold',
                      isUser
                        ? 'bg-brand/20 text-brand-soft ring-1 ring-brand/30'
                        : 'bg-white/10 text-stage-text ring-1 ring-white/10'
                    )}
                  >
                    {isUser ? 'R' : 'A'}
                  </span>
                  <span className="font-medium text-stage-text/80">{isUser ? 'You' : 'Asha'}</span>
                  <span aria-hidden>·</span>
                  <span className="tnum">{message.timestamp}</span>
                </div>

                {/* Intentionally the LAST element child: the browser E2E reads
                    each message via `el.lastElementChild.textContent`. */}
                <div
                  className={cn(
                    'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                    isUser
                      ? 'rounded-tr-sm bg-brand/20 text-white ring-1 ring-brand/30'
                      : 'rounded-tl-sm bg-white/[0.06] text-stage-text ring-1 ring-white/10',
                    isStreaming && 'caret'
                  )}
                >
                  {message.text}
                </div>
              </div>
            );
          })
        )}
      </div>

      {isCallActive && onSendMessage && (
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 border-t border-stage-line px-3 py-2.5"
        >
          <Keyboard className="h-4 w-4 shrink-0 text-stage-muted" aria-hidden />
          <input
            type="text"
            value={inputText}
            onChange={(event) => setInputText(event.target.value)}
            placeholder="Type instead — debug aid only…"
            aria-label="Type a message as a debug aid"
            className="min-w-0 flex-1 bg-transparent text-xs text-stage-text placeholder:text-stage-muted focus:outline-none"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            aria-label="Send typed message"
            className="grid h-7 w-7 place-items-center rounded-lg bg-white/10 text-stage-text transition-colors hover:bg-white/15 disabled:opacity-30"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
        </form>
      )}
    </section>
  );
};
