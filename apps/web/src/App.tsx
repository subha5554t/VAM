import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useCallStore } from './store/useCallStore.js';
import { LiveSession, type LiveDiagnostics } from './live/LiveSession.js';
import { callServerTool } from './live/toolBridge.js';
import { pickBestInput, probeInputs } from './audio/capture.js';
import { Header } from './components/Header.js';
import { CallStage, type MicHealth } from './components/CallStage.js';
import { BusinessVitals } from './components/BusinessVitals.js';
import { ActionPlanCard } from './components/ActionPlanCard.js';
import { AssumptionsDrawer } from './components/AssumptionsDrawer.js';
import { AgentTrace } from './components/AgentTrace.js';

/** Tokens may be reused for a new session for 10 minutes; stay comfortably inside. */
const PREWARM_TTL_MS = 9 * 60 * 1000;
/** Minimum gap between two token mints, so a burst of clicks cannot exhaust
 *  the server's rate limit and kill the Live path. */
const MIN_MINT_GAP_MS = 3000;

export function App() {
  const {
    callState,
    conversationStage,
    language,
    mode,
    isMuted,
    isAssumptionsOpen,
    errorMessage,
    messages,
    toolEvents,
    kpis,
    diagnosis,
    actionPlan,
    followup,
    escalation,
    openTurnRole,
    baselineKpis,
    baselineDiagnosis,
    setCallState,
    setMuted,
    setAssumptionsOpen,
    setErrorMessage,
    addMessage,
    addToolEvent,
    finalizeTurn,
    resetCall,
    setBaseline,
  } = useCallStore();

  const liveSessionRef = useRef<LiveSession | null>(null);
  const recognitionRef = useRef<any>(null);
  const fallbackHistoryRef = useRef<Array<{ role: 'user' | 'model'; text: string }>>([]);
  const prewarmRef = useRef<{ payload: any; at: number; language: string } | null>(null);
  const prewarmInFlightRef = useRef(false);
  const lastMintAtRef = useRef(0);
  const [micInfo, setMicInfo] = useState<LiveDiagnostics | null>(null);
  /** True while the server VAD reports the seller is actually speaking. */
  const [isHearingUser, setIsHearingUser] = useState(false);
  /** True when a usable ephemeral token is already waiting for the seller. */
  const [warmReady, setWarmReady] = useState(false);
  /** Last ~10 s of real microphone RMS, drawn as a waveform in the call stage. */
  const [levels, setLevels] = useState<number[]>([]);
  /** Audio inputs exposed by the browser after mic permission is granted. */
  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>(() => {
    try {
      return localStorage.getItem('asha.micDeviceId') || '';
    } catch {
      return '';
    }
  });
  /** Persisted "processing off" preference discovered by a successful scan. */
  const [selectedMicRelaxed, setSelectedMicRelaxed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('asha.micRelaxed') === '1';
    } catch {
      return false;
    }
  });
  const [micScanState, setMicScanState] = useState<'idle' | 'scanning'>('idle');
  const [micScanSummary, setMicScanSummary] = useState<string | null>(null);
  const micScanInFlightRef = useRef(false);
  /** Forces the time-based mic-health check to re-evaluate each second. */
  const [healthTick, setHealthTick] = useState(0);
  const lastLoudAtRef = useRef(0);
  const lastVoiceAtRef = useRef(0);
  const gateOpenRef = useRef(false);
  const gateOpenedAtRef = useRef(0);

  /**
   * Mint a token while the seller is still reading the page. By the time they
   * click "Start Voice Call" the slowest network hop is already done.
   *
   * The token endpoint is rate limited, so this must mint *sparingly*: never
   * twice for a token we already hold, and never twice in quick succession.
   */
  const prewarm = useCallback(
    async (lang: string) => {
      if (prewarmInFlightRef.current) return;

      // A usable token is already waiting — do not burn another one.
      const held = prewarmRef.current;
      if (held && held.language === lang && Date.now() - held.at < PREWARM_TTL_MS) return;

      // Respect a minimum gap between mints.
      if (Date.now() - lastMintAtRef.current < MIN_MINT_GAP_MS) return;

      prewarmInFlightRef.current = true;
      try {
        // A proxied request can come back with an empty body (upstream refused
        // or reset). `res.json()` then throws a bare SyntaxError and the warm
        // token is silently lost, forcing the seller to pay the full mint cost
        // after they click Start. Read the text, validate it, and retry once.
        const fetchToken = async () => {
          const res = await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: lang, mode: 'reactive' }),
          });
          const raw = await res.text();
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}${raw ? `: ${raw.slice(0, 120)}` : ' (empty body)'}`);
          }
          if (!raw) throw new Error('Empty response body from /api/session');
          const parsed = JSON.parse(raw);
          if (!parsed?.ok || !parsed?.token) {
            throw new Error(parsed?.message || parsed?.error || 'Token rejected');
          }
          return parsed;
        };

        let data: any;
        try {
          data = await fetchToken();
        } catch (firstErr) {
          console.warn('[App] Token pre-warm attempt 1 failed, retrying.', firstErr);
          await new Promise((r) => setTimeout(r, 600));
          data = await fetchToken();
        }

        prewarmRef.current = { payload: data, at: Date.now(), language: lang };
        lastMintAtRef.current = Date.now();
        setWarmReady(true);
        console.log('[App] Pre-warmed a live session token.');
      } catch (err) {
        console.warn('[App] Token pre-warm failed (will mint on click).', err);
      } finally {
        prewarmInFlightRef.current = false;
      }
    },
    []
  );

  useEffect(() => {
    if (mode === 'live') void prewarm(language);
    // Re-pre-warm when the seller switches language or mode: the token locks
    // the language, so a stale one cannot be used.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, language]);

  // Background tabs get their timers throttled and a token can expire while the
  // seller is away. Re-arm as soon as the tab is visible again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && mode === 'live') void prewarm(language);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [mode, language, prewarm]);

  // Populate the console from the same deterministic tools the agent uses.
  // The idle screen must never rely on hardcoded dashboard figures.
  useEffect(() => {
    let cancelled = false;
    const loadBaseline = async () => {
      const [snapshot, analysis] = await Promise.all([
        callServerTool('get_seller_snapshot', { sellerId: 'SD-48213' }),
        callServerTool('analyze_sales_decline', { sellerId: 'SD-48213' }),
      ]);
      if (cancelled) return;
      setBaseline(snapshot.ok ? snapshot.data : null, analysis.ok ? analysis.data : null);
    };
    void loadBaseline();
    return () => {
      cancelled = true;
    };
  }, [setBaseline]);

  const refreshMicDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setMicDevices(list.filter((device) => device.kind === 'audioinput'));
    } catch (err) {
      console.warn('[App] Could not enumerate microphones.', err);
    }
  }, []);

  // Device labels are only populated after the origin has mic permission.
  const micPermissionGranted = micInfo?.trackState === 'live';
  useEffect(() => {
    if (micPermissionGranted) void refreshMicDevices();
  }, [micPermissionGranted, refreshMicDevices]);

  // Re-evaluate "silent" / "deaf" health even when the level meter is static.
  useEffect(() => {
    if (callState === 'idle' || callState === 'error') return;
    const timer = window.setInterval(() => setHealthTick((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [callState]);

  const consumePrewarm = (lang: string) => {
    const cached = prewarmRef.current;
    prewarmRef.current = null;
    setWarmReady(false);
    if (!cached) return null;
    if (cached.language !== lang) return null;
    if (Date.now() - cached.at > PREWARM_TTL_MS) return null;
    return cached.payload;
  };

  // Start Call Handler
  const handleStartCall = async (isProactive: boolean = false) => {
    resetCall();
    fallbackHistoryRef.current = [];
    setIsHearingUser(false);
    setLevels([]);
    setMicScanState('idle');
    setMicScanSummary(null);
    lastLoudAtRef.current = 0;
    lastVoiceAtRef.current = 0;
    gateOpenRef.current = false;
    gateOpenedAtRef.current = 0;
    setCallState('connecting');

    if (mode === 'live') {
      try {
        const session = new LiveSession({
          onStateChange: (state) => setCallState(state),
          onUserTranscript: (text) => addMessage('user', text),
          onBotTranscript: (text) => addMessage('bot', text),
          onToolEvent: (event) => addToolEvent(event),
          onTurnComplete: () => finalizeTurn(),
          onDiagnostics: (d) => {
            setMicInfo(d);
            if (d.gateOpen && !gateOpenRef.current) gateOpenedAtRef.current = Date.now();
            gateOpenRef.current = d.gateOpen;
            if (d.rms > 0.01) lastLoudAtRef.current = Date.now();
            const next = Math.max(0, Math.min(1, (d.rms ?? 0) * 8));
            setLevels((prev) => [...prev.slice(-47), next]);
          },
          onVoiceActivity: (e) => {
            if (e.type === 'start') lastVoiceAtRef.current = Date.now();
            setIsHearingUser(e.type === 'start');
          },
          onError: (err) => {
            setErrorMessage(err);
            setCallState('error');
          },
          onClose: () => {
            liveSessionRef.current = null;
            setMicInfo(null);
            setIsHearingUser(false);
            setCallState('idle');
            // Leave a warm token behind for the next attempt.
            void prewarm(language);
          },
        });

        liveSessionRef.current = session;

        // Proactive mode has a different system prompt, so a reactive token
        // cannot be reused.
        const prewarmed = isProactive ? null : consumePrewarm(language);

        await session.start({
          language,
          mode: isProactive ? 'proactive' : 'reactive',
          prewarmed,
          micDeviceId: selectedMicId || undefined,
          micRelaxed: selectedMicRelaxed,
        });
      } catch (err: any) {
        // The reason matters: a rate-limited token, a bad key and a dropped
        // socket are three different problems and the seller must see which.
        console.error('Failed to start Live session, offering fallback:', err);
        const reason = err?.message || String(err);
        const sentence = /[.!?]$/.test(reason) ? reason : `${reason}.`;
        setErrorMessage(`Live connect failed: ${sentence} Switching to Compatibility mode…`);
        handleStartFallback(isProactive);
      }
    } else {
      handleStartFallback(isProactive);
    }
  };

  // Compatibility Mode Fallback Loop
  const handleStartFallback = async (isProactive: boolean) => {
    setCallState('listening');

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setErrorMessage('Web Speech API is not supported in this browser. Please use Google Chrome or Edge.');
      setCallState('error');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
    recognitionRef.current = recognition;

    const speak = (text: string) => {
      if (!('speechSynthesis' in window) || isMuted) {
        setCallState('listening');
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'hi' ? 'hi-IN' : 'en-IN';
      utterance.rate = 1.05;
      utterance.onend = () => setCallState('listening');
      setCallState('speaking');
      window.speechSynthesis.speak(utterance);
    };

    recognition.onresult = async (event: any) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript;
      addMessage('user', transcript);
      fallbackHistoryRef.current.push({ role: 'user', text: transcript });
      setCallState('thinking');

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: fallbackHistoryRef.current,
            language,
          }),
        });

        const data = await res.json();
        if (data.ok && data.reply) {
          addMessage('bot', data.reply);
          fallbackHistoryRef.current.push({ role: 'model', text: data.reply });
          if (Array.isArray(data.toolEvents)) {
            data.toolEvents.forEach((ev: any) => addToolEvent(ev));
          }
          speak(data.reply);
        } else {
          setCallState('listening');
        }
      } catch (e: any) {
        console.error(e);
        setCallState('listening');
      }
    };

    recognition.onerror = (event: any) => {
      // Never die silently: say why the fallback stopped working.
      const reason = event?.error || 'unknown';
      const readable =
        reason === 'not-allowed'
          ? 'microphone permission was denied'
          : reason === 'network'
            ? 'the browser speech service is unreachable'
            : reason === 'audio-capture'
              ? 'no microphone was found'
              : reason;
      console.warn('[App] Web Speech recognition error:', reason);
      // Append: the Live failure reason above must not be lost.
      setErrorMessage(
        (prev) => `${prev ? `${prev} ` : ''}Compatibility mode stopped: ${readable}.`
      );
      setCallState('idle');
    };

    try {
      recognition.start();
      if (isProactive) {
        // No hardcoded figures: the number must come from a tool result.
        const opener =
          'Namaste Rajesh ji, I am Asha, your Snapdeal virtual account manager. I noticed your shop orders dropped sharply this month. Let us review the root causes together.';
        addMessage('bot', opener);
        fallbackHistoryRef.current.push({ role: 'model', text: opener });
        speak(opener);
      }
    } catch {}
  };

  // End Call Handler
  const handleEndCall = () => {
    if (liveSessionRef.current) {
      liveSessionRef.current.stop();
      liveSessionRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setMicInfo(null);
    setIsHearingUser(false);
    setCallState('idle');
    // Re-arm for the next call.
    if (mode === 'live') void prewarm(language);
  };

  // Mute toggle must actually stop the microphone stream, not just the icon.
  const handleToggleMute = () => {
    const next = !isMuted;
    setMuted(next);
    liveSessionRef.current?.setMuted(next);
  };

  // User Send Message (Voice typing or speech text)
  const handleUserSendMessage = async (text: string) => {
    if (mode === 'live' && liveSessionRef.current) {
      liveSessionRef.current.sendTextMessage(text);
    } else {
      addMessage('user', text);
      fallbackHistoryRef.current.push({ role: 'user', text });
      setCallState('thinking');
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: fallbackHistoryRef.current,
            language,
          }),
        });
        const data = await res.json();
        if (data.ok && data.reply) {
          addMessage('bot', data.reply);
          fallbackHistoryRef.current.push({ role: 'model', text: data.reply });
          if (Array.isArray(data.toolEvents)) {
            data.toolEvents.forEach((ev: any) => addToolEvent(ev));
          }
          if ('speechSynthesis' in window && !isMuted) {
            const utterance = new SpeechSynthesisUtterance(data.reply);
            utterance.rate = 1.05;
            utterance.onend = () => setCallState('listening');
            window.speechSynthesis.speak(utterance);
            setCallState('speaking');
          } else {
            setCallState('listening');
          }
        } else {
          setCallState('listening');
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Error sending message');
        setCallState('listening');
      }
    }
  };

  const handleSelectMic = async (
    deviceId: string,
    relaxed: boolean = selectedMicRelaxed,
    preserveSummary = false
  ) => {
    setSelectedMicId(deviceId);
    setSelectedMicRelaxed(relaxed);
    try {
      if (deviceId) localStorage.setItem('asha.micDeviceId', deviceId);
      else localStorage.removeItem('asha.micDeviceId');
      localStorage.setItem('asha.micRelaxed', relaxed ? '1' : '0');
    } catch {}
    if (!preserveSummary) setMicScanSummary(null);

    // Only restart capture while a live call is actually running. An idle
    // selection is just a preference persisted for the next Start.
    const activeCall =
      callState === 'listening' || callState === 'speaking' || callState === 'thinking';
    if (!activeCall || !liveSessionRef.current) return;

    try {
      await liveSessionRef.current.setInputDevice(deviceId, relaxed);
      await refreshMicDevices();
    } catch (err: any) {
      setErrorMessage(`Could not switch microphone: ${err?.message || err}`);
    }
  };

  const handleReconnectMic = async () => {
    if (!liveSessionRef.current) return;
    setSelectedMicRelaxed(true);
    try {
      localStorage.setItem('asha.micRelaxed', '1');
    } catch {}
    setMicScanSummary(null);
    try {
      await liveSessionRef.current.setInputDevice(selectedMicId, true);
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(`Could not reconnect the microphone: ${err?.message || err}`);
    }
  };

  /**
   * Tests the system default plus every enumerated input outside the capture
   * graph. Some Windows endpoints expose a live track but deliver zeros; this
   * finds the input that actually carries signal and switches to it. The Live
   * socket and greeting state are untouched.
   */
  const handleScanMics = async () => {
    if (micScanInFlightRef.current) return;
    micScanInFlightRef.current = true;
    setMicScanState('scanning');
    setMicScanSummary('Speak now — testing each microphone…');

    const session = liveSessionRef.current;
    const inCall =
      callState === 'listening' || callState === 'speaking' || callState === 'thinking';
    if (inCall && session) session.stopCapture();

    try {
      const results = await probeInputs(1200);
      console.table(results);
      const best = pickBestInput(results);

      if (best) {
        setMicScanSummary(
          `Found signal on ${best.label}${best.relaxed ? ' (processing off)' : ''}.`
        );
        await handleSelectMic(best.deviceId, best.relaxed, true);
      } else {
        const unavailable = results.filter((probe) => probe.error).length;
        setMicScanSummary(
          `No signal on any input${unavailable ? ` (${unavailable} unavailable)` : ''}. ` +
            'Check Windows microphone privacy/mute, then scan again while speaking.'
        );
        if (session && liveSessionRef.current === session) {
          await session.setInputDevice(selectedMicId, selectedMicRelaxed);
        }
      }
    } catch (err: any) {
      setMicScanSummary(`Mic scan failed: ${err?.message || err}`);
      if (session && liveSessionRef.current === session) {
        await session.setInputDevice(selectedMicId, selectedMicRelaxed);
      }
    } finally {
      micScanInFlightRef.current = false;
      setMicScanState('idle');
    }
  };

  /**
   * Distinguish three failures that used to look identical:
   * - the gate is still closed (greeting),
   * - the mic is delivering silence (OS mute / wrong device),
   * - audio is reaching us but Gemini is not detecting speech.
   */
  const micHealth = useMemo<MicHealth>(() => {
    void healthTick; // time-based re-evaluation even when `levels` is static
    if (mode !== 'live') return 'off';
    if (callState === 'idle' || callState === 'error' || callState === 'connecting') return 'off';
    if (isMuted) return 'muted';
    if (!micInfo || micInfo.trackState !== 'live') return 'starting';
    if (micInfo.trackMuted) return 'os-muted';
    if (!micInfo.gateOpen) return 'greeting';

    const now = Date.now();
    const recent = levels.slice(-24);
    const flat = recent.length >= 20 && recent.every((value) => value < 0.004);
    const lastLoud = lastLoudAtRef.current;
    const lastVoice = lastVoiceAtRef.current;
    const gateAge = gateOpenedAtRef.current ? now - gateOpenedAtRef.current : 0;

    if (callState === 'listening' && flat && gateAge > 6000 && now - lastLoud > 6000) {
      return 'silent';
    }

    if (
      callState === 'listening' &&
      lastLoud > lastVoice &&
      now - lastLoud < 12000 &&
      now - lastVoice > 12000
    ) {
      return 'deaf';
    }

    if (now - lastVoice < 12000) return 'hearing';
    return 'live';
  }, [mode, callState, isMuted, micInfo, levels, healthTick]);

  const micLevel = micInfo ? Math.min(1, micInfo.rms * 8) : 0;

  return (
    <div className="flex min-h-screen flex-col bg-canvas text-ink">
      <Header onStartProactiveCall={() => handleStartCall(true)} />

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 px-4 py-4 md:px-6 md:py-5">
        {errorMessage && (
          <div
            role="alert"
            className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-800"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="leading-relaxed">{errorMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              aria-label="Dismiss error"
              className="focus-ring -mr-1 grid h-6 w-6 shrink-0 place-items-center rounded-md text-rose-500 hover:bg-rose-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
          <div className="xl:col-span-7">
            <CallStage
              callState={callState}
              stage={conversationStage}
              isMuted={isMuted}
              mode={mode}
              micInfo={micInfo}
              micLevel={micLevel}
              levels={levels}
              isHearingUser={isHearingUser}
              warmReady={warmReady}
              messages={messages}
              openTurnRole={openTurnRole}
              micDevices={micDevices}
              selectedMicId={selectedMicId}
              micHealth={micHealth}
              micScanState={micScanState}
              micScanSummary={micScanSummary}
              onStart={() => handleStartCall(false)}
              onEnd={handleEndCall}
              onToggleMute={handleToggleMute}
              onSelectMic={handleSelectMic}
              onReconnectMic={handleReconnectMic}
              onScanMics={() => void handleScanMics()}
              onSendMessage={handleUserSendMessage}
            />
          </div>

          <aside className="flex flex-col gap-4 xl:col-span-5">
            <BusinessVitals
              kpis={kpis}
              baseline={baselineKpis}
              diagnosis={diagnosis}
              baselineDiagnosis={baselineDiagnosis}
            />
            <ActionPlanCard
              plan={actionPlan}
              followup={followup}
              escalation={escalation}
              kpis={kpis ?? baselineKpis}
            />
          </aside>
        </div>

        <AgentTrace events={toolEvents} />
      </main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex w-full max-w-[1400px] flex-col items-center justify-between gap-1 px-4 py-3 text-[10px] text-muted sm:flex-row md:px-6">
          <span>Asha · Snapdeal Virtual KAM · mock data only</span>
          <span>Gemini Live S2S · Fastify · deterministic tools</span>
        </div>
      </footer>

      <AssumptionsDrawer
        isOpen={isAssumptionsOpen}
        onClose={() => setAssumptionsOpen(false)}
      />
    </div>
  );
}

export default App;
