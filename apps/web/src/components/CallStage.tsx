import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Headphones,
  Ear,
  RefreshCw,
  Radio,
} from 'lucide-react';
import type { Stage } from '@kam/core';
import type { CaptureDiagnostics } from '../audio/capture.js';
import type { ChatMessage } from '../store/useCallStore.js';
import { StageTracker } from './StageTracker.js';
import { Transcript } from './Transcript.js';
import { VoiceCore, type CallState } from './VoiceCore.js';
import { Button, IconButton, cn } from './ui.js';

export type MicHealth =
  | 'off'
  | 'muted'
  | 'starting'
  | 'greeting'
  | 'live'
  | 'hearing'
  | 'silent'
  | 'deaf'
  | 'os-muted';

interface CallStageProps {
  callState: CallState;
  stage: Stage;
  isMuted: boolean;
  mode: 'live' | 'fallback';
  micInfo: CaptureDiagnostics | null;
  micLevel: number;
  levels: number[];
  isHearingUser: boolean;
  warmReady: boolean;
  messages: ChatMessage[];
  openTurnRole: 'user' | 'bot' | null;
  micDevices: MediaDeviceInfo[];
  selectedMicId: string;
  micHealth: MicHealth;
  micScanState: 'idle' | 'scanning';
  micScanSummary: string | null;
  onStart: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onSelectMic: (deviceId: string) => void;
  onReconnectMic: () => void;
  onScanMics: () => void;
  onSendMessage: (text: string) => void;
}

const formatClock = (seconds: number) => {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
};

export const CallStage: React.FC<CallStageProps> = ({
  callState,
  stage,
  isMuted,
  mode,
  micInfo,
  micLevel,
  levels,
  isHearingUser,
  warmReady,
  messages,
  openTurnRole,
  micDevices,
  selectedMicId,
  micHealth,
  micScanState,
  micScanSummary,
  onStart,
  onEnd,
  onToggleMute,
  onSelectMic,
  onReconnectMic,
  onScanMics,
  onSendMessage,
}) => {
  const isActive = callState !== 'idle' && callState !== 'error';
  const hasEnded = callState === 'idle' && messages.length > 0;
  const showHearBadge =
    callState === 'listening' || callState === 'speaking' || callState === 'thinking';

  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (callState === 'connecting') setElapsed(0);
  }, [callState]);

  useEffect(() => {
    if (!isActive) return;
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [isActive]);

  const bars = useMemo(() => {
    const recent = levels.slice(-36).map((value) => Math.max(0.04, Math.min(1, value)));
    return [...Array(Math.max(0, 36 - recent.length)).fill(0.04), ...recent];
  }, [levels]);

  const status =
    callState === 'error'
      ? 'Connection error'
      : callState === 'idle'
        ? hasEnded
          ? 'Call ended'
          : 'Ready'
        : callState === 'connecting'
          ? 'Connecting'
          : 'Live call';

  const statusTone =
    callState === 'error'
      ? 'bg-rose-400'
      : callState === 'listening' || callState === 'speaking' || callState === 'thinking'
        ? 'bg-emerald-400'
        : callState === 'connecting'
          ? 'bg-amber-400'
          : 'bg-slate-500';

  return (
    <section className="panel-dark flex h-full flex-col overflow-hidden">
      {/* Stage header: state, elapsed clock, 6-step workflow rail. */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-stage-line px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              statusTone,
              isActive && 'animate-pulse'
            )}
          />
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stage-muted">
            {status}
          </span>
          <span className="tnum text-[11px] text-stage-muted">{formatClock(elapsed)}</span>
        </div>
        <StageTracker currentStage={stage} />
      </header>

      <div className="grid min-h-0 flex-1 md:grid-cols-[280px_1fr]">
        {/* Voice column */}
        <div className="flex flex-col items-center gap-3 border-b border-stage-line px-4 py-5 md:border-b-0 md:border-r">
          <VoiceCore state={callState} isMuted={isMuted} level={micLevel} />

          {showHearBadge && (
            <div
              data-testid="hear-badge"
              className={cn(
                'flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition-colors',
                isHearingUser
                  ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
                  : 'border-white/10 bg-white/[0.03] text-stage-muted'
              )}
            >
              {isHearingUser ? (
                <Ear className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <Mic className="h-3.5 w-3.5" aria-hidden />
              )}
              <span>
                {isHearingUser
                  ? 'I can hear you — go ahead'
                  : callState === 'speaking'
                    ? 'Asha is speaking — talk to interrupt'
                    : 'Listening… speak anytime'}
              </span>
            </div>
          )}

          {/* Microphone device + last ~7s of real RMS. Proof, not decoration. */}
          <div className="w-full">
            <div className="flex items-center justify-between gap-2 text-[10px] text-stage-muted">
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <Mic className="h-3 w-3 shrink-0" aria-hidden />
                {mode === 'live' ? (
                  <select
                    aria-label="Microphone input"
                    data-testid="mic-device-select"
                    title={micInfo?.deviceLabel || 'System default microphone'}
                    value={selectedMicId}
                    onChange={(event) => onSelectMic(event.target.value)}
                    disabled={micScanState === 'scanning'}
                    className="min-w-0 max-w-full flex-1 cursor-pointer truncate bg-transparent text-[10px] text-stage-muted outline-none focus-visible:ring-1 focus-visible:ring-white/30 disabled:cursor-wait disabled:opacity-60"
                  >
                    <option value="">
                      System default
                      {micInfo?.deviceLabel ? ` · ${micInfo.deviceLabel}` : ''}
                    </option>
                    {micDevices.map((device, index) => (
                      <option key={device.deviceId || index} value={device.deviceId}>
                        {device.label || `Microphone ${index + 1}`}
                      </option>
                    ))}
                    {selectedMicId &&
                      !micDevices.some((device) => device.deviceId === selectedMicId) && (
                        <option value={selectedMicId}>Saved microphone</option>
                      )}
                  </select>
                ) : (
                  <span className="truncate">
                    {micInfo?.deviceLabel ||
                      (callState === 'idle' ? 'Microphone idle' : 'Starting microphone…')}
                  </span>
                )}
              </span>
              <span
                className={cn(
                  'shrink-0 font-medium',
                  micInfo?.trackMuted
                    ? 'text-amber-300'
                    : !isMuted && micInfo?.trackState === 'live'
                      ? 'text-emerald-300'
                      : 'text-stage-muted'
                )}
              >
                {isMuted
                  ? 'Muted'
                  : micInfo?.trackMuted
                    ? 'OS muted'
                    : micInfo?.trackState
                      ? `Mic ${micInfo.trackState}`
                      : 'Mic idle'}
              </span>
            </div>
            <div className="mt-1.5 flex h-6 items-end gap-[2px]" aria-hidden>
              {bars.map((value, index) => (
                <span
                  key={index}
                  className={cn(
                    'flex-1 rounded-full transition-[height] duration-100',
                    isMuted ? 'bg-amber-400/40' : 'bg-emerald-400/70'
                  )}
                  style={{ height: `${Math.max(8, Math.min(100, value * 100))}%` }}
                />
              ))}
            </div>

            {mode === 'live' &&
              (micHealth === 'silent' ||
                micHealth === 'deaf' ||
                micHealth === 'os-muted') && (
                <div
                  data-testid="mic-health"
                  role="status"
                  aria-live="polite"
                  className="mt-2 rounded-lg border border-amber-400/25 bg-amber-400/10 px-2.5 py-2 text-[10px] text-amber-200"
                >
                  <div className="flex items-start gap-1.5">
                    <MicOff className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {micHealth === 'silent'
                          ? 'No mic input detected'
                          : micHealth === 'deaf'
                            ? 'Asha is not detecting speech'
                            : 'Microphone muted by Windows'}
                      </p>
                      <p className="mt-0.5 leading-relaxed text-amber-200/75">
                        {micHealth === 'silent'
                          ? "If you're speaking, check the mute key or scan every input."
                          : micHealth === 'deaf'
                            ? 'Your audio is reaching the app. Reconnect the mic or switch input.'
                            : 'Unmute it in Windows Sound settings, or pick another input.'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={onReconnectMic}
                          disabled={micScanState === 'scanning'}
                          className="focus-ring inline-flex items-center gap-1 rounded-md border border-amber-300/30 px-2 py-1 font-medium text-amber-100 transition-colors hover:bg-amber-300/10 disabled:cursor-wait disabled:opacity-70"
                        >
                          <RefreshCw className="h-3 w-3" aria-hidden />
                          Reconnect mic
                        </button>
                        <button
                          type="button"
                          onClick={onScanMics}
                          disabled={micScanState === 'scanning'}
                          title="Test every microphone and switch to one that carries signal"
                          className="focus-ring inline-flex items-center gap-1 rounded-md border border-amber-300/30 px-2 py-1 font-medium text-amber-100 transition-colors hover:bg-amber-300/10 disabled:cursor-wait disabled:opacity-70"
                        >
                          {micScanState === 'scanning' ? (
                            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                          ) : (
                            <Radio className="h-3 w-3" aria-hidden />
                          )}
                          {micScanState === 'scanning' ? 'Scanning…' : 'Scan inputs'}
                        </button>
                      </div>
                      {micScanSummary && (
                        <p
                          className="mt-1.5 truncate text-[9px] leading-relaxed text-amber-200/60"
                          title={micScanSummary}
                        >
                          {micScanSummary}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
          </div>

          <div className="mt-auto w-full space-y-2 pt-1">
            {callState === 'idle' || callState === 'error' ? (
              <Button size="lg" className="w-full" onClick={onStart}>
                <Phone className="h-4 w-4" />
                Start Voice Call
              </Button>
            ) : callState === 'connecting' ? (
              <Button size="lg" variant="dark" className="w-full" disabled>
                <Loader2 className="h-4 w-4 animate-spin" />
                Opening voice channel…
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button size="md" variant="danger" className="flex-1" onClick={onEnd}>
                  <PhoneOff className="h-4 w-4" />
                  End call
                </Button>
                <IconButton
                  tone="dark"
                  label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  onClick={onToggleMute}
                  aria-pressed={isMuted}
                  className={isMuted ? 'border-amber-400/30 text-amber-300' : undefined}
                >
                  {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </IconButton>
              </div>
            )}

            {mode === 'live' && (callState === 'idle' || callState === 'error') && (
              <p
                className={cn(
                  'flex items-center justify-center gap-1.5 text-center text-[10px]',
                  warmReady ? 'text-emerald-300' : 'text-stage-muted'
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    warmReady ? 'bg-emerald-400' : 'animate-pulse bg-stage-muted'
                  )}
                />
                {warmReady
                  ? 'Voice session ready — click Start to speak'
                  : 'Preparing a secure voice session…'}
              </p>
            )}

            <p className="flex items-center justify-center gap-1.5 text-center text-[10px] text-stage-muted">
              <Headphones className="h-3 w-3" aria-hidden />
              Headphones recommended for clean barge-in
            </p>
          </div>
        </div>

        <Transcript
          messages={messages}
          isCallActive={isActive}
          openTurnRole={openTurnRole}
          onSendMessage={onSendMessage}
        />
      </div>
    </section>
  );
};
