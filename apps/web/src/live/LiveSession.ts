import { AudioCapture, CaptureDiagnostics } from '../audio/capture.js';
import { AudioPlayer } from '../audio/player.js';
import { callServerTool, ToolEvent } from './toolBridge.js';

export type LiveSessionState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error';

export interface LiveSessionCallbacks {
  onStateChange: (state: LiveSessionState) => void;
  onUserTranscript: (text: string, isFinal?: boolean) => void;
  onBotTranscript: (text: string, isFinal?: boolean) => void;
  onToolEvent: (event: ToolEvent) => void;
  onError: (error: string) => void;
  onClose: () => void;
  /** Fired when Gemini finishes a turn (transcript bubble boundary). */
  onTurnComplete?: () => void;
  /** Live microphone health, for the on-screen diagnostics line. */
  onDiagnostics?: (d: LiveDiagnostics) => void;
  /**
   * Fired when the server VAD reports the seller started or stopped speaking.
   * This is the only signal that proves the server can actually hear the mic.
   */
  onVoiceActivity?: (event: { type: 'start' | 'end'; audioOffset?: string }) => void;
}

interface StartOptions {
  language?: string;
  mode?: 'reactive' | 'proactive';
  /** Exact microphone the seller picked; omitted means the system default. */
  micDeviceId?: string;
  /** Disable AEC/NS/AGC; remembered across reconnects within the session. */
  micRelaxed?: boolean;
}

/**
 * Capture diagnostics plus the session-level state needed to tell a silent
 * microphone apart from a gate that is still holding frames.
 */
export interface LiveDiagnostics extends CaptureDiagnostics {
  gateOpen: boolean;
  framesSent: number;
}

/** Consecutive loud frames required before we treat mic input as a user barge-in. */
const BARGE_IN_FRAMES = 4;
/** Scaled volume (see AudioCapture) above which a frame counts as speech. */
const BARGE_IN_VOLUME = 0.25;

/**
 * While Asha delivers the opening greeting her own speaker output leaks back
 * into the microphone. With START_OF_ACTIVITY_INTERRUPTS that truncates her
 * mid-sentence (observed: "Namaste Rajesh ji, main Asha hoon,"). Mic frames are
 * held until the greeting turn completes, but a deliberately loud seller can
 * still break through.
 */
const GREETING_BARGE_FRAMES = 4;
const GREETING_BARGE_VOLUME = 0.34;
/** Upper bound to reach Asha's first audio (connect + generation can be slow). */
const GREETING_MAX_GATE_MS = 15000;
/** Once she is audible, release the gate this long after the last audio chunk. */
const GREETING_TAIL_MS = 6000;
/**
 * Absolute ceiling on the greeting gate. Even if the player reports a stuck
 * source, the seller's microphone must never stay closed for a whole call.
 */
const GREETING_HARD_TIMEOUT_MS = 30000;

/**
 * Back-off schedule for minting the ephemeral token: the first attempt is
 * immediate, the rest wait 0.8s / 2s / 4s.
 *
 * The token endpoint is rate limited, and a transient 429 or a dropped
 * connection must not cost the seller the whole Live call.
 */
const MINT_RETRY_DELAYS_MS = [0, 800, 2000, 4000];

/**
 * A failure to obtain the ephemeral token, carrying enough context for the UI
 * to explain itself instead of showing a generic "could not connect".
 */
export class LiveConnectError extends Error {
  readonly status?: number;
  readonly code?: string;

  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = 'LiveConnectError';
    this.status = status;
    this.code = code;
  }

  /** Transient failures (rate limit, server error, dropped connection) are
   *  worth retrying; a rejected request is not. */
  get retryable(): boolean {
    if (this.status === undefined) return true;
    return this.status === 429 || this.status >= 500;
  }
}

export class LiveSession {
  private ws: WebSocket | null = null;
  private capture: AudioCapture = new AudioCapture();
  private player: AudioPlayer = new AudioPlayer(24000);
  private state: LiveSessionState = 'idle';
  private callbacks: LiveSessionCallbacks;
  private resumptionHandle: string | null = null;
  private retryCount: number = 0;
  private maxRetries: number = 2;
  private activeSellerId: string = 'SD-48213';

  private token: string | null = null;
  private liveModel: string = 'gemini-3.8-live';
  private apiVersion: string = 'v1beta';
  private lastOptions: StartOptions = { language: 'hinglish', mode: 'reactive' };
  private hasGreeted: boolean = false;
  private isMuted: boolean = false;
  private loudFrames: number = 0;
  private pendingToolCalls: number = 0;
  private lastDiagAt: number = 0;
  /** True while Asha owns the opening greeting turn. */
  private greetingGate: boolean = false;
  private greetingLoudFrames: number = 0;
  /** Barge-in on the greeting is only meaningful once she is audible. */
  private greetingAudioStarted: boolean = false;
  /** True after the server says the greeting turn is complete. */
  private greetingTurnCompleted: boolean = false;
  private greetingTimer: ReturnType<typeof setTimeout> | null = null;
  /** Cumulative frames handed to the Live socket (diagnostics only). */
  private framesSent: number = 0;
  /** Epoch ms when the greeting gate last closed; drives the hard timeout. */
  private greetingOpenedAt: number = 0;

  constructor(callbacks: LiveSessionCallbacks) {
    this.callbacks = callbacks;
    // When the last scheduled audio chunk ends, the orb must stop saying
    // "Asha is speaking" even though no new server message arrives. Debounced
    // so a momentary gap between chunks cannot flicker the state.
    this.player.onDrain = () => {
      // The server can finish generating the greeting before its audio has
      // finished playing. Keep the mic closed until the queue actually drains,
      // otherwise her own trailing words are captured as a new seller turn.
      if (this.greetingGate && this.greetingTurnCompleted) {
        this.releaseGreetingGate('player-drained');
      }
      if (this.pendingToolCalls > 0) return;
      if (this.state !== 'speaking') return;
      setTimeout(() => {
        if (this.state === 'speaking' && !this.player.isPlaying()) {
          this.setState('listening');
        }
      }, 250);
    };
  }

  private setState(newState: LiveSessionState) {
    this.state = newState;
    this.callbacks.onStateChange(newState);
  }

  getState(): LiveSessionState {
    return this.state;
  }

  /**
   * Starts the microphone immediately (in parallel with token minting) so that
   * the greeting can be triggered the instant `setupComplete` arrives.
   */
  private async startCapture(deviceId?: string, relaxed = false): Promise<void> {
    if (this.capture.isActive()) return;

    await this.capture.start(
      (pcmBuffer) => {
        if (this.isMuted) return;
        // Asha owns the opening turn: do not let her own echo cut her off.
        if (this.greetingGate) return;
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        this.framesSent++;
        this.ws.send(
          JSON.stringify({
            realtimeInput: {
              // DEPRECATED: `mediaChunks` is silently dropped by gemini-3.8-live.
              // The current Live API expects a single `audio` blob per message.
              audio: {
                mimeType: 'audio/pcm;rate=16000',
                data: this.arrayBufferToBase64(pcmBuffer),
              },
            },
          })
        );
      },
      (volume) => {
        if (this.greetingGate) {
          // You cannot interrupt someone who has not started talking. Any sound
          // between setupComplete and her first audio chunk is room noise, not
          // a deliberate barge-in; releasing the gate there lets noise truncate
          // the greeting before it is even audible.
          if (!this.greetingAudioStarted) return;
          if (volume > GREETING_BARGE_VOLUME) {
            this.greetingLoudFrames++;
          } else {
            this.greetingLoudFrames = 0;
          }
          if (this.greetingLoudFrames >= GREETING_BARGE_FRAMES) {
            this.releaseGreetingGate('deliberate barge-in');
          }
          return;
        }

        // Server-side `serverContent.interrupted` is the primary barge-in
        // signal. This local gate is a fast-path backup only, and requires
        // several consecutive speech frames so room noise cannot cut Asha off.
        if (volume > BARGE_IN_VOLUME) {
          this.loudFrames++;
        } else {
          this.loudFrames = 0;
        }

        if (this.loudFrames >= BARGE_IN_FRAMES && this.state === 'speaking') {
          this.loudFrames = 0;
          this.player.flush();
          this.setState('listening');
        }
      },
      (d) => {
        // ~5 updates/sec is plenty for a level meter and avoids re-render storms.
        const now = performance.now();
        if (now - this.lastDiagAt < 200) return;
        this.lastDiagAt = now;
        this.callbacks.onDiagnostics?.({
          ...d,
          gateOpen: !this.greetingGate,
          framesSent: this.framesSent,
        });
      },
      { deviceId, relaxed }
    );
  }

  /**
   * Swaps the microphone without touching the Live socket or the greeting
   * state. Used by the device picker and the "Reconnect mic" recovery action.
   */
  async setInputDevice(deviceId: string, relaxed = false): Promise<void> {
    this.lastOptions.micDeviceId = deviceId || undefined;
    this.lastOptions.micRelaxed = relaxed;
    this.capture.stop();
    this.framesSent = 0;
    this.lastDiagAt = 0;
    await this.startCapture(deviceId || undefined, relaxed);
  }

  /**
   * Closes the microphone without touching the Live socket so the caller can
   * probe every input, then reopen capture on the winner.
   */
  stopCapture(): void {
    this.capture.stop();
    this.framesSent = 0;
    this.lastDiagAt = 0;
  }

  /**
   * Reopens capture with relaxed audio processing. Some Windows arrays report a
   * live track but emit zeros while AEC/NS/AGC are enabled.
   */
  async reconnectMic(relaxed = true): Promise<void> {
    await this.setInputDevice(this.lastOptions.micDeviceId || '', relaxed);
  }

  /**
   * Mints the ephemeral token, retrying transient failures.
   *
   * The endpoint is rate limited (60/min) and Google's mint latency is 1-10s,
   * so a single failed attempt is not a reason to abandon the Live path.
   */
  private async mintToken(resumeHandle?: string): Promise<void> {
    let lastError: LiveConnectError | null = null;

    for (let attempt = 0; attempt < MINT_RETRY_DELAYS_MS.length; attempt++) {
      const waitMs = MINT_RETRY_DELAYS_MS[attempt];
      if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));

      const t0 = performance.now();
      try {
        const sessionRes = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            language: this.lastOptions.language || 'hinglish',
            mode: this.lastOptions.mode || 'reactive',
            ...(resumeHandle ? { resumeHandle } : {}),
          }),
        });

        const sessionData = await sessionRes.json();

        if (sessionData?.ok !== true || !sessionData?.token) {
          const status = typeof sessionRes.status === 'number' ? sessionRes.status : undefined;
          const code: string | undefined = sessionData?.error;
          const message =
            sessionData?.message ||
            sessionData?.error ||
            `Failed to obtain session token${status ? ` (HTTP ${status})` : ''}`;
          throw new LiveConnectError(message, status, code);
        }

        this.token = sessionData.token;
        this.apiVersion = sessionData.apiVersion || 'v1beta';
        this.liveModel = sessionData.model || 'gemini-3.8-live';

        console.log(
          `[LiveSession] token minted in ${Math.round(performance.now() - t0)}ms (attempt ${attempt + 1})`
        );

        // The backend pre-computes the diagnosis with the real tool handlers, so
        // the Cockpit + Activity Feed are populated before Asha says a word.
        for (const ev of sessionData.toolEvents || []) {
          this.callbacks.onToolEvent({ type: 'tool', ...ev });
        }

        return;
      } catch (err: any) {
        lastError =
          err instanceof LiveConnectError
            ? err
            : new LiveConnectError(
                err?.message || 'Network error while minting the session token',
                undefined,
                'NETWORK_ERROR'
              );

        if (!lastError.retryable) break;

        console.warn(
          `[LiveSession] token mint attempt ${attempt + 1} failed: ${lastError.message} — retrying`
        );
      }
    }

    throw lastError ?? new LiveConnectError('Failed to obtain session token');
  }

  private applySessionData(sessionData: any): void {
    this.token = sessionData.token;
    this.apiVersion = sessionData.apiVersion || 'v1beta';
    this.liveModel = sessionData.model || 'gemini-3.8-live';
    for (const ev of sessionData.toolEvents || []) {
      this.callbacks.onToolEvent({ type: 'tool', ...ev });
    }
  }

  async start(options: StartOptions & { prewarmed?: any } = {}): Promise<void> {
    this.lastOptions = { ...this.lastOptions, ...options };
    this.setState('connecting');

    this.hasGreeted = false;
    this.greetingGate = false;
    this.greetingLoudFrames = 0;
    this.greetingAudioStarted = false;
    this.greetingTurnCompleted = false;
    this.greetingOpenedAt = 0;
    this.framesSent = 0;
    if (this.greetingTimer) {
      clearTimeout(this.greetingTimer);
      this.greetingTimer = null;
    }

    // Fire-and-forget: mic init must not block the greeting.
    this.startCapture(this.lastOptions.micDeviceId, this.lastOptions.micRelaxed).catch((micErr: any) => {
      console.error('[LiveSession] Microphone access error:', micErr);
      this.callbacks.onError(
        'Microphone permission denied or device error. Please allow microphone access in your browser.'
      );
    });

    try {
      if (options.prewarmed?.token) {
        console.log('[LiveSession] Using pre-warmed ephemeral token.');
        this.applySessionData(options.prewarmed);
      } else {
        await this.mintToken();
      }

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${this.apiVersion}.GenerativeService.BidiGenerateContentConstrained?access_token=${this.token}`;

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.retryCount = 0;
        console.log('[LiveSession] WebSocket open. Sending setup handshake for model:', this.liveModel);
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          // Only the model is sent here: every other field is locked by the
          // server-minted token and would be ignored anyway.
          this.ws.send(JSON.stringify({ setup: { model: `models/${this.liveModel}` } }));
        }
      };

      this.ws.onmessage = async (event: MessageEvent) => {
        let msg: any;
        if (event.data instanceof Blob) {
          msg = JSON.parse(await event.data.text());
        } else {
          msg = JSON.parse(event.data);
        }

        this.handleMessage(msg);
      };

      this.ws.onerror = (err) => {
        console.error('LiveSession WebSocket error:', err);
        this.callbacks.onError('WebSocket connection error.');
      };

      this.ws.onclose = (event) => {
        console.warn(
          `[LiveSession] WebSocket closed (code=${event?.code}, reason=${event?.reason || 'none'})`
        );
        this.cleanup();
        this.callbacks.onClose();
        this.setState('idle');
      };
    } catch (err: any) {
      this.cleanup();
      this.setState('error');
      this.callbacks.onError(err.message || 'Failed to start Live session');
      throw err;
    }
  }

  private handleMessage(msg: any): void {
    // 1. Setup complete -> greet immediately.
    if (msg.setupComplete) {
      console.log('[LiveSession] setupComplete. Mic active:', this.capture.isActive());
      this.setState('listening');
      this.sendGreeting();
      return;
    }

    // 2. Server-side barge-in.
    if (msg.serverContent?.interrupted) {
      this.releaseGreetingGate('interrupted');
      this.player.flush();
      this.setState('listening');
    }

    // 3. Model audio + any inline text.
    if (msg.serverContent?.modelTurn?.parts) {
      for (const part of msg.serverContent.modelTurn.parts) {
        if (part.inlineData?.data) {
          if (this.greetingGate) {
            // She is audible: the gate may now be released by a real barge-in,
            // and the watchdog moves from "first audio" to "last audio".
            this.greetingAudioStarted = true;
            this.armGreetingTimer(GREETING_TAIL_MS);
          }
          this.setState('speaking');
          this.player.enqueue(part.inlineData.data);
        }
        if (part.text) {
          this.callbacks.onBotTranscript(part.text);
        }
      }
    }

    // 4. Transcripts.
    if (msg.voiceActivity?.type) {
      const type =
        msg.voiceActivity.type === 'ACTIVITY_START'
          ? 'start'
          : msg.voiceActivity.type === 'ACTIVITY_END'
            ? 'end'
            : null;
      if (type) {
        this.callbacks.onVoiceActivity?.({
          type,
          audioOffset: msg.voiceActivity.audioOffset,
        });
      }
    }

    if (msg.serverContent?.inputTranscription?.text) {
      this.callbacks.onUserTranscript(msg.serverContent.inputTranscription.text);
    }
    if (msg.serverContent?.outputTranscription?.text) {
      this.callbacks.onBotTranscript(msg.serverContent.outputTranscription.text);
    }

    // 5. Turn finished.
    if (msg.serverContent?.turnComplete) {
      if (this.greetingGate) {
        this.greetingTurnCompleted = true;
        if (!this.player.isPlaying()) {
          this.releaseGreetingGate('turnComplete');
        } else {
          console.log(
            '[LiveSession] Greeting turn complete; waiting for playback to drain before opening the mic.'
          );
        }
      }
      this.callbacks.onTurnComplete?.();
      setTimeout(() => {
        if (this.pendingToolCalls > 0) return;
        if (!this.player.isPlaying()) this.setState('listening');
      }, 300);
    }

    // 6. Tool calls.
    if (msg.toolCall?.functionCalls) {
      void this.handleToolCalls(msg.toolCall.functionCalls);
    }

    // 7. Session resumption handle (used for reconnects).
    if (msg.sessionResumptionUpdate?.newHandle) {
      this.resumptionHandle = msg.sessionResumptionUpdate.newHandle;
    }

    // 8. Server is about to drop the connection.
    if (msg.goAway) {
      console.log('[LiveSession] goAway received, reconnecting with resumption handle.');
      void this.reconnect();
    }
  }

  private async handleToolCalls(functionCalls: any[]): Promise<void> {
    this.pendingToolCalls += functionCalls.length;
    this.setState('thinking');
    const responses: any[] = [];

    try {
      for (const fc of functionCalls) {
        const t0 = performance.now();
        const args = { ...(fc.args || {}) };
        if (!args.sellerId && fc.name !== 'advance_stage') {
          args.sellerId = this.activeSellerId;
        }

        const toolResult = await callServerTool(fc.name, args);
        const durationMs = Math.round(performance.now() - t0);

        this.callbacks.onToolEvent({
          type: 'tool',
          name: fc.name,
          args,
          result: toolResult.data || { error: toolResult.error },
          ms: durationMs,
        });

        responses.push({
          id: fc.id,
          name: fc.name,
          response: { result: toolResult.data || { error: toolResult.error } },
        });
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ toolResponse: { functionResponses: responses } }));
      }
    } finally {
      this.pendingToolCalls -= functionCalls.length;
    }
  }

  private sendGreeting(): void {
    if (this.hasGreeted) return;
    this.hasGreeted = true;

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Hold the microphone until Asha finishes her opening turn. Without this,
    // her own voice (or room tone) triggers START_OF_ACTIVITY_INTERRUPTS and
    // cuts the greeting in half.
    this.greetingGate = true;
    this.greetingLoudFrames = 0;
    this.greetingAudioStarted = false;
    this.greetingTurnCompleted = false;
    this.greetingOpenedAt = Date.now();
    this.armGreetingTimer(GREETING_MAX_GATE_MS);

    // The system prompt carries VERIFIED FACTS, so this trigger only has to
    // say "start" — it must never inject numbers of its own.
    const greetingPrompt =
      this.lastOptions.mode === 'proactive'
        ? 'Call connected. Open now with your prepared proactive greeting, in character as Asha. Do not call any tool first.'
        : 'Call connected. Open now with your grounded greeting from VERIFIED FACTS, then ask exactly ONE question about the cause. Do not call any tool first.';

    this.ws.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: greetingPrompt }] }],
          turnComplete: true,
        },
      })
    );
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /** Tells Gemini the current audio stream has ended (flushes its VAD buffer). */
  private sendAudioStreamEnd(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
    }
  }

  /**
   * Opens the microphone path again after Asha's opening turn. Safe to call any
   * number of times: the log line fires only on the transition.
   */
  private releaseGreetingGate(reason: string): void {
    if (!this.greetingGate) {
      // Log every reason: a late `turnComplete` after the watchdog already
      // fired is useful evidence, not a second state transition.
      console.log(`[LiveSession] Greeting gate already open (${reason}).`);
      return;
    }
    this.greetingGate = false;
    this.greetingLoudFrames = 0;
    this.greetingAudioStarted = false;
    this.greetingTurnCompleted = false;
    this.greetingOpenedAt = 0;
    if (this.greetingTimer) {
      clearTimeout(this.greetingTimer);
      this.greetingTimer = null;
    }
    console.log(`[LiveSession] Greeting gate released (${reason}); mic streaming live.`);
  }

  /** (Re)arms the greeting watchdog. Called on every greeting audio chunk. */
  private armGreetingTimer(ms: number): void {
    if (this.greetingTimer) clearTimeout(this.greetingTimer);
    this.greetingTimer = setTimeout(() => {
      // Absolute safety net: a stuck player source must not leave the seller
      // talking into a closed gate for the rest of the call.
      if (
        this.greetingOpenedAt > 0 &&
        Date.now() - this.greetingOpenedAt >= GREETING_HARD_TIMEOUT_MS
      ) {
        console.warn('[LiveSession] Greeting gate hard timeout — forcing the mic open.');
        this.player.flush();
        this.releaseGreetingGate('hard-timeout');
        return;
      }
      // Audio is generated faster than it plays. The gate must stay closed
      // while buffered speech is still audible, otherwise the seller's next
      // words land on top of Asha and barge her in mid-sentence.
      if (this.player.isPlaying()) {
        this.armGreetingTimer(1000);
        return;
      }
      this.releaseGreetingGate('silence-watchdog');
    }, ms);
  }

  /** Mutes/unmutes the microphone end of the call (both locally and upstream). */
  setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.loudFrames = 0;
    this.player.setMute(muted);
    if (muted) this.sendAudioStreamEnd();
  }

  private async reconnect(): Promise<void> {
    if (this.retryCount >= this.maxRetries) {
      this.callbacks.onError('Live connection lost. Please start a new call.');
      this.setState('error');
      return;
    }
    this.retryCount++;
    const handle = this.resumptionHandle;

    // Tear down only the socket; keep the microphone running.
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    this.player.flush();

    try {
      await this.mintToken(handle || undefined);
      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.${this.apiVersion}.GenerativeService.BidiGenerateContentConstrained?access_token=${this.token}`;
      const ws = new WebSocket(wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ setup: { model: `models/${this.liveModel}` } }));
        }
      };
      ws.onmessage = async (event: MessageEvent) => {
        const msg = event.data instanceof Blob ? JSON.parse(await event.data.text()) : JSON.parse(event.data);
        this.handleMessage(msg);
      };
      ws.onerror = () => this.callbacks.onError('WebSocket reconnection error.');
      ws.onclose = () => {
        this.callbacks.onClose();
        this.setState('idle');
      };
    } catch (err: any) {
      console.error('[LiveSession] reconnect failed:', err);
      this.setState('error');
      this.callbacks.onError('Could not resume the live session.');
    }
  }

  sendTextMessage(text: string): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.callbacks.onUserTranscript(text);
      this.setState('thinking');
      this.ws.send(
        JSON.stringify({
          clientContent: {
            turns: [{ role: 'user', parts: [{ text }] }],
            turnComplete: true,
          },
        })
      );
    }
  }

  stop(): void {
    this.sendAudioStreamEnd();
    this.cleanup();
    this.setState('idle');
  }

  private cleanup(): void {
    this.capture.stop();
    this.player.destroy();
    this.greetingGate = false;
    this.greetingTurnCompleted = false;
    if (this.greetingTimer) {
      clearTimeout(this.greetingTimer);
      this.greetingTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.close();
      } catch {}
      this.ws = null;
    }
  }
}
