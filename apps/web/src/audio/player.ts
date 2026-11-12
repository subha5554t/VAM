/**
 * AudioPlayer: handles 24 kHz PCM audio chunk playback from Gemini Live API.
 * Implements seamless gapless scheduling and instant queue flushing on barge-in / interruption.
 */
export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private activeSources: Set<AudioBufferSourceNode> = new Set();
  private sampleRate: number = 24000;
  private isMuted: boolean = false;
  private gainNode: GainNode | null = null;
  private destroyed: boolean = false;
  /** Fired when the last scheduled chunk finishes (never on flush/destroy). */
  onDrain?: () => void;

  constructor(sampleRate: number = 24000) {
    this.sampleRate = sampleRate;
  }

  private initContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.sampleRate,
      });
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = this.isMuted ? 0 : 1;
      this.nextStartTime = 0;
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  /**
   * Enqueues base64-encoded or raw Int16 PCM audio chunk received from Gemini Live
   */
  enqueue(data: string | ArrayBuffer): void {
    // Late chunks arriving after the call ended must never resurrect audio.
    if (this.destroyed) return;
    const ctx = this.initContext();

    let int16Data: Int16Array;
    if (typeof data === 'string') {
      const binaryString = atob(data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      int16Data = new Int16Array(bytes.buffer);
    } else {
      int16Data = new Int16Array(data);
    }

    if (int16Data.length === 0) return;

    // Convert Int16 [-32768, 32767] to Float32 [-1, 1]
    const float32Data = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / 32768;
    }

    // Create AudioBuffer
    const audioBuffer = ctx.createBuffer(1, float32Data.length, this.sampleRate);
    audioBuffer.getChannelData(0).set(float32Data);

    // Schedule playback gaplessly
    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;

    if (this.gainNode) {
      sourceNode.connect(this.gainNode);
    } else {
      sourceNode.connect(ctx.destination);
    }

    const currentTime = ctx.currentTime;
    const startTime = Math.max(currentTime, this.nextStartTime);
    sourceNode.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;

    this.activeSources.add(sourceNode);
    sourceNode.onended = () => {
      this.activeSources.delete(sourceNode);
      // Tell the session the orb can go back to "listening". onended is nulled
      // before stop() in flush(), so a barge-in never fires this.
      if (this.activeSources.size === 0 && !this.destroyed) this.onDrain?.();
    };
  }

  /**
   * BARGE-IN: Stops all currently scheduled audio immediately when user interrupts.
   */
  flush(): void {
    for (const source of this.activeSources) {
      try {
        source.onended = null;
        source.stop();
        source.disconnect();
      } catch {}
    }
    this.activeSources.clear();
    // Reset the schedule cursor so the next chunk starts immediately rather
    // than after a stale future timestamp.
    this.nextStartTime = this.audioContext ? this.audioContext.currentTime : 0;
  }

  setMute(mute: boolean): void {
    this.isMuted = mute;
    if (this.gainNode) {
      this.gainNode.gain.value = mute ? 0 : 1;
    }
  }

  isPlaying(): boolean {
    return this.activeSources.size > 0;
  }

  destroy(): void {
    this.destroyed = true;
    this.flush();
    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }
    this.nextStartTime = 0;
  }
}

